import { randomUUID } from 'node:crypto';
import { object, type SourceRow } from './normalize';
import type { IntelContext } from './server';
import { syncSalesPage } from './sales-server';

export function retryableSalesError(error: unknown) {
    if (/^(08|53)/.test(String(object(error).code ?? '')) || ['40001','40P01','57014'].includes(String(object(error).code ?? ''))) return true;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(object(error).message ?? error);
    return /429|500|502|503|504|fetch failed|timeout|timed out|abort|network|ECONN|ENOTFOUND|EAI_AGAIN|connection|conexi[oó]n|temporar/i.test(message);
}
export const salesRetryDelay = (failures: number) => Math.min(120_000, 5_000 * 2 ** Math.min(5, Math.max(0, failures - 1)));

export async function salesWorkerTick(ctx: IntelContext) {
    const response = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'sales').eq('status', 'running').maybeSingle();
    if (response.error) throw response.error;
    const run = response.data;
    if (!run || object(run.config).background !== true) return { state: 'idle' };
    const previous = object(object(run.config).worker), now = Date.now();
    if (Number(previous.leaseUntil ?? 0) > now || Number(previous.retryAt ?? 0) > now) return { state: 'waiting' };
    const token = randomUUID();
    const config = { ...run.config, worker: { ...previous, token, leaseUntil: now + 120_000, heartbeatAt: new Date(now).toISOString(), state: 'running', retryAt: null } };
    // Optimistic claim also protects against two different computers running workers.
    const claim = await ctx.db.from('intel_sync_runs').update({ config }).eq('id', run.id).eq('organization_id', ctx.orgId)
        .eq('status', 'running').eq('stage', run.stage).eq('config', JSON.stringify(run.config)).select('*').maybeSingle();
    if (claim.error) throw claim.error;
    if (!claim.data) return { state: 'waiting' };
    let outcome: SourceRow;
    try {
        const result = await syncSalesPage(ctx, run.id);
        outcome = { state: result.status === 'completed' ? 'completed' : 'running', failures: 0, retryAt: null, lastSuccessAt: new Date().toISOString() };
    } catch (error) {
        const failures = Number(previous.failures ?? 0) + 1, temporary = retryableSalesError(error);
        outcome = { state: temporary ? 'retrying' : 'attention', failures, retryAt: temporary ? Date.now() + salesRetryDelay(failures) : null };
    }
    const fresh = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('id', run.id).single();
    if (fresh.error) throw fresh.error;
    // A pause/cancel must win over a late heartbeat or retry update.
    if (object(object(fresh.data.config).worker).token === token) {
        const nextConfig = { ...fresh.data.config, ...(outcome.state === 'attention' ? { background: false } : {}),
            worker: { ...config.worker, ...outcome, token: null, leaseUntil: 0, heartbeatAt: new Date().toISOString() } };
        const saved = await ctx.db.from('intel_sync_runs').update({ config: nextConfig }).eq('id', run.id).eq('organization_id', ctx.orgId)
            .eq('config', JSON.stringify(fresh.data.config)).select('id').maybeSingle();
        if (saved.error) throw saved.error;
    }
    return { ...outcome, runId: run.id };
}
