import 'server-only';
import { createHash } from 'node:crypto';
import { bsale, type IntelContext } from './server';
import { object, type SourceRow } from './normalize';
import { sourcePage } from './sales-core';
import { inventoryRecord, stockObservation, movementHeader, movementDetail, type InventoryCursor } from './inventory-core';

export async function inventoryRun(ctx: IntelContext, id: string) {
    const result = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'inventory').eq('id', id).single();
    if (result.error) throw result.error;
    return result.data;
}
export function publicInventoryRun(run: SourceRow) {
    const c = object(run.cursor);
    return { id: run.id, status: run.status, config: run.config, last_error: run.last_error, updated_at: run.updated_at,
        progress: { phase: c.phase, source: c.source, offset: c.offset, expected: c.expected, stockRows: c.stockRows, completedMovements: c.completedMovements } };
}
export async function syncInventoryPage(ctx: IntelContext, id: string) {
    const run = await inventoryRun(ctx, id);
    if (run.status !== 'running') return publicInventoryRun(run);
    if (['movement_gaps','completion_snapshot'].includes(String(run.config?.purpose))) throw new Error('La actualización de inventario continúa en el proceso independiente.');
    const c = structuredClone(run.cursor) as InventoryCursor;
    let batch: ReturnType<typeof inventoryRecord>[] = [];
    try {
        if (c.phase === 'stocks' || c.phase === 'list') {
            const stock = c.phase === 'stocks';
            const path = stock ? '/v1/stocks.json' : `/v1/stocks/${c.source}.json`;
            const limit = stock ? 50 : 10;
            const page = sourcePage(await bsale(`${path}?limit=${limit}&offset=${c.offset}${stock ? '' : '&expand=[details]'}`), c.offset, limit);
            if (page.count === null) throw new Error('Bsale no informó el total de inventario.');
            if (c.expected !== null && c.expected !== page.count) throw new Error('Cambió el total de la fuente. Cierra esta ejecución e inicia una nueva captura; se conserva lo importado.');
            c.expected = page.count; c.offset += page.items.length; c.listEnd = page.end;
            if (stock) {
                const observedAt = new Date().toISOString();
                batch = page.items.map(raw => stockObservation(raw, run.id, observedAt));
                c.stockRows += page.items.length;
                if (page.end) { c.phase = 'check'; c.checkingStock = true; }
            } else {
                c.queue = [];
                for (const parent of page.items) {
                    const expanded = object(parent.details);
                    if (Array.isArray(expanded.items) && expanded.count != null && Number(expanded.offset ?? 0) === 0 && Number(expanded.count) === expanded.items.length && expanded.items.length <= 50) {
                        const children = sourcePage(expanded, 0).items.map(raw => movementDetail(c.source, parent, raw));
                        if (new Set(children.map(row => row.external_id)).size !== children.length) throw new Error('Detalles expandidos duplicados.');
                        const header = movementHeader(c.source, parent);
                        header.data.complete = true;
                        batch.push(...children, header);
                        c.completedMovements++;
                    } else c.queue.push(parent);
                }
                c.phase = c.queue.length ? 'details' : page.end ? 'check' : 'list';
                c.childOffset = 0; c.detailCount = 0; delete c.detailExpected;
            }
        } else if (c.phase === 'details') {
            const parent = c.queue[0];
            const header = movementHeader(c.source, parent);
            const page = sourcePage(await bsale(`/v1/stocks/${c.source}/${header.external_id}/details.json?limit=50&offset=${c.childOffset}`), c.childOffset);
            if (page.count === null) throw new Error('Detalle de inventario sin total.');
            if (c.detailExpected != null && c.detailExpected !== page.count) throw new Error('Cambió la cantidad de detalles del movimiento.');
            c.detailExpected = page.count;
            batch = page.items.map(raw => movementDetail(c.source, parent, raw));
            c.childOffset += page.items.length; c.detailCount += page.items.length;
            if (page.end) {
                // Verify unique IDs, including earlier pages, before marking complete.
                const ids = new Set(batch.map(row => row.external_id));
                for (let offset = 0; ; offset += 500) {
                    const saved = await ctx.db.from('intel_records').select('external_id').eq('organization_id', ctx.orgId).like('resource', 'inventory_%').eq('run_id', run.id)
                        .eq('resource', `inventory_${c.source}_details`).eq('data->>movementId', header.external_id).order('id').range(offset, offset + 499);
                    if (saved.error) throw saved.error;
                    saved.data.forEach(row => ids.add(row.external_id));
                    if (saved.data.length < 500) break;
                }
                if (ids.size !== page.count) throw new Error('Detalles duplicados o faltantes. Movimiento no completado.');
                header.data.complete = true; batch.push(header); c.completedMovements++;
                c.queue.shift(); c.childOffset = 0; c.detailCount = 0; delete c.detailExpected;
                c.phase = c.queue.length ? 'details' : c.listEnd ? 'check' : 'list';
            }
        } else if (c.phase === 'check') {
            const stock = c.checkingStock === true;
            const resource = stock ? 'inventory_stock' : `inventory_${c.source}`;
            const count = await ctx.db.from('intel_records').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.orgId).like('resource', 'inventory_%').eq('run_id', id).eq('resource', resource);
            if (count.error) throw count.error;
            if (count.count !== c.expected) throw new Error('Los IDs únicos guardados no coinciden con Bsale.');
            const data = { resource, sourceCount: c.expected, importedCount: count.count, checkedAt: new Date().toISOString(), verification: 'count_only' };
            batch = [inventoryRecord('inventory_checks', data, data, `${id}:${resource}`)];
            c.checkingStock = false;
            if (stock && run.config.mode === 'snapshot') c.phase = 'done';
            else if (stock) { c.phase = 'list'; c.offset = 0; c.expected = null; }
            else if (c.source === 'receptions') { c.source = 'consumptions'; c.phase = 'list'; c.offset = 0; c.expected = null; }
            else c.phase = 'done';
        } else throw new Error('Etapa de inventario inválida.');
        const records = batch.map(row => ({ ...row, content_hash: createHash('sha256').update(JSON.stringify({ raw: row.raw, data: row.data })).digest('hex') }));
        const commit = await ctx.db.rpc('intel_commit_inventory_page', { p_org: ctx.orgId, p_run: id, p_revision: run.stage, p_rows: records, p_cursor: c, p_done: c.phase === 'done' });
        if (commit.error) throw commit.error;
        return publicInventoryRun(await inventoryRun(ctx, id));
    } catch (cause) {
        await ctx.db.from('intel_sync_runs').update({ last_error: cause instanceof Error ? cause.message : 'Error importando inventario.', updated_at: new Date().toISOString() }).eq('organization_id', ctx.orgId).eq('kind', 'inventory').eq('id', id).eq('stage', run.stage);
        throw cause;
    }
}
