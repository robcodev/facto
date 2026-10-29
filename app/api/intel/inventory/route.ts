import { z } from 'zod';
import { context, errorResponse, bsale } from '@/lib/intel/server';
import { initialInventoryCursor, inventoryDiagnostic, stockObservation } from '@/lib/intel/inventory-core';
import { inventoryRun, publicInventoryRun, syncInventoryPage } from '@/lib/intel/inventory-server';
import { object, type SourceRow } from '@/lib/intel/normalize';
import { sourcePage } from '@/lib/intel/sales-core';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
    try {
        const ctx = await context();
        const q = new URL(request.url).searchParams;
        const runs = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'inventory').order('started_at', { ascending: false }).limit(20);
        if (runs.error) throw runs.error;
        const runId = q.get('runId') ? z.string().uuid().parse(q.get('runId')) : runs.data[0]?.id;
        if (!runId) return Response.json({ runs: [], records: [], total: 0 }, { headers });
        await inventoryRun(ctx, runId);
        const resource = z.enum(['inventory_stock','inventory_receptions','inventory_consumptions','inventory_receptions_details','inventory_consumptions_details','inventory_checks']).parse(q.get('resource') || 'inventory_stock');
        const page = z.coerce.number().int().min(0).max(100000).parse(q.get('page') || 0);
        let query = ctx.db.from('intel_records').select('id,external_id,data,observed_at', { count: 'exact' }).eq('organization_id', ctx.orgId).like('resource', 'inventory_%').eq('run_id', runId).eq('resource', resource);
        if (q.get('variant')) query = query.eq('data->>variantId', z.string().regex(/^\d+$/).parse(q.get('variant')));
        if (q.get('office')) query = query.eq('data->>officeId', z.string().regex(/^\d+$/).parse(q.get('office')));
        const records = await query.order('id').range(page * 50, page * 50 + 49);
        if (records.error) throw records.error;
        return Response.json({ runs: runs.data.map(publicInventoryRun), records: records.data, total: records.count, runId }, { headers });
    } catch (error) { return error instanceof z.ZodError ? Response.json({ error: 'Filtros inválidos.' }, { status: 400 }) : errorResponse(error); }
}
export async function POST(request: Request) {
    try {
        const ctx = await context();
        const input = z.discriminatedUnion('action', [
            z.object({ action: z.literal('start'), mode: z.enum(['history','snapshot']) }),
            z.object({ action: z.literal('step'), runId: z.string().uuid() }),
            z.object({ action: z.literal('cancel'), runId: z.string().uuid() }),
            z.object({ action: z.literal('diagnostic'), runId: z.string().uuid(), variantId: z.string().regex(/^\d+$/), officeId: z.string().regex(/^\d+$/) }),
        ]).parse(await request.json());
        if (input.action === 'step') return Response.json({ run: await syncInventoryPage(ctx, input.runId) }, { headers });
        if (input.action === 'cancel') {
            const result = await ctx.db.from('intel_sync_runs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('organization_id', ctx.orgId).eq('kind', 'inventory').eq('id', input.runId).eq('status','running');
            if (result.error) throw result.error;
            return Response.json({ ok: true }, { headers });
        }
        if (input.action === 'diagnostic') {
            const run = await inventoryRun(ctx, input.runId);
            const details: SourceRow[] = [];
            for (let offset = 0; ; offset += 500) {
                const result = await ctx.db.from('intel_records').select('data').eq('organization_id', ctx.orgId).like('resource', 'inventory_%').eq('run_id', input.runId)
                    .in('resource', ['inventory_receptions_details','inventory_consumptions_details']).eq('data->>variantId', input.variantId).eq('data->>officeId', input.officeId).order('id').range(offset, offset + 499);
                if (result.error) throw result.error;
                details.push(...result.data.map(row => object(row.data)));
                if (result.data.length < 500) break;
            }
            const live = sourcePage(await bsale(`/v1/stocks.json?variantid=${input.variantId}&officeid=${input.officeId}&limit=50&offset=0`),0);
            const matches = live.items.filter(row => String(object(row.variant).id) === input.variantId && String(object(row.office).id) === input.officeId);
            const current = matches.length === 1 ? stockObservation(matches[0], 'diagnostic', new Date().toISOString()).data : null;
            const captured = await ctx.db.from('intel_records').select('data').eq('organization_id', ctx.orgId).like('resource', 'inventory_%').eq('run_id', input.runId)
                .eq('resource', 'inventory_stock').eq('data->>variantId', input.variantId).eq('data->>officeId', input.officeId).limit(2);
            if (captured.error) throw captured.error;
            return Response.json({ ...inventoryDiagnostic(details, current, captured.data.length === 1 ? object(captured.data[0].data) : null), importStatus: run.status, sampleRows: details.length }, { headers });
        }
        const current = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id',ctx.orgId).eq('kind','inventory').eq('status','running').maybeSingle();
        if (current.error) throw current.error;
        if (current.data) return Response.json({ run: publicInventoryRun(current.data) }, { headers });
        const result = await ctx.db.from('intel_sync_runs').insert({ organization_id:ctx.orgId, kind:'inventory', config:{ mode:input.mode, schemaVersion:1 }, cursor:initialInventoryCursor() }).select('*').single();
        if (result.error) {
            if (result.error.code === '23505') {
                const concurrent = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id',ctx.orgId).eq('kind','inventory').eq('status','running').single();
                if (concurrent.data) return Response.json({ run:publicInventoryRun(concurrent.data) },{ headers });
            }
            throw result.error;
        }
        return Response.json({ run:publicInventoryRun(result.data) },{ headers });
    } catch (error) { return error instanceof z.ZodError ? Response.json({ error:'Solicitud inválida.' },{ status:400 }) : errorResponse(error); }
}
