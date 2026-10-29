import { z } from 'zod';
import { context, errorResponse } from '@/lib/intel/server';
import { initialSalesCursor, validDay } from '@/lib/intel/sales-core';
import { publicSalesRun, syncSalesPage } from '@/lib/intel/sales-server';

export const runtime = 'nodejs';
export const maxDuration = 60;
const day = z.string().refine(validDay, 'Fecha inválida');
const noStore = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
    try {
        const ctx = await context();
        const q = new URL(request.url).searchParams;
        if (q.get('progress') === '1') {
            const runs = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind','sales').order('started_at',{ascending:false}).limit(20);
            if (runs.error) throw runs.error;
            return Response.json({ runs: runs.data.map(publicSalesRun) }, { headers: noStore });
        }
        const page = z.coerce.number().int().min(0).max(100000).parse(q.get('page') ?? 0);
        if (q.get('clients') === '1') {
            let clients = ctx.db.from('intel_records').select('external_id,name,data,observed_at', { count: 'exact' }).eq('organization_id', ctx.orgId).eq('resource', 'sales_clients');
            if (q.get('search')) clients = clients.ilike('name', `%${z.string().max(100).parse(q.get('search')).replace(/[%_]/g, '')}%`);
            const response = await clients.order('id').range(page * 50, page * 50 + 49);
            if (response.error) throw response.error;
            return Response.json({ clients: response.data, total: response.count }, { headers: noStore });
        }
        if (q.has('documentId')) {
            const id = z.string().regex(/^\d+$/).parse(q.get('documentId'));
            const doc = await ctx.db.from('intel_records').select('*').eq('organization_id', ctx.orgId).eq('resource', 'sales_documents').eq('external_id', id).single();
            if (doc.error) throw doc.error;
            if (String(doc.data.data.documentTypeId) === '38') return Response.json({ error: 'Las preventas están excluidas de Intel.' }, { status: 404, headers: noStore });
            const children = await ctx.db.from('intel_records').select('*', { count: 'exact' }).eq('organization_id', ctx.orgId).eq('data->>documentId', id).eq('run_id', doc.data.run_id).order('id').range(page * 100, page * 100 + 99);
            if (children.error) throw children.error;
            return Response.json({ document: doc.data, children: children.data, total: children.count, page }, { headers: noStore });
        }
        let query = ctx.db.from('intel_records').select('id,external_id,data,observed_at', { count: 'exact' }).eq('organization_id', ctx.orgId).eq('resource', 'sales_documents').or('data->>documentTypeId.is.null,data->>documentTypeId.neq.38');
        if (q.get('client')) query = query.eq('data->>clientId', z.string().regex(/^\d+$/).parse(q.get('client')));
        if (q.get('from')) query = query.gte('data->>emissionDay', day.parse(q.get('from')));
        if (q.get('to')) query = query.lte('data->>emissionDay', day.parse(q.get('to')));
        if (q.get('seller')) query = query.contains('data', { sellers: [{ id: z.string().regex(/^\d+$/).parse(q.get('seller')) }] });
        if (q.get('office')) query = query.eq('data->>officeId', z.string().regex(/^\d+$/).parse(q.get('office')));
        const [documents, runs, masters] = await Promise.all([
            query.order('id', { ascending: false }).range(page * 50, page * 50 + 49),
            ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'sales').order('started_at', { ascending: false }).limit(20),
            ctx.db.from('intel_records').select('resource,external_id,name').eq('organization_id', ctx.orgId).in('resource', ['sales_users', 'sales_offices']).order('id').limit(1000),
        ]);
        if (documents.error) throw documents.error;
        if (runs.error) throw runs.error;
        if (masters.error) throw masters.error;
        return Response.json({ documents: documents.data, total: documents.count, runs: runs.data.map(publicSalesRun), masters: masters.data, canEdit: ctx.canEdit }, { headers: noStore });
    } catch (error) {
        if (error instanceof z.ZodError) return Response.json({ error: 'Filtros inválidos.' }, { status: 400 });
        return errorResponse(error);
    }
}
export async function POST(request: Request) {
    try {
        const ctx = await context();
        const input = z.discriminatedUnion('action', [
            z.object({ action: z.literal('start'), from: day, to: day }),
            z.object({ action: z.literal('step'), runId: z.string().uuid() }),
            z.object({ action: z.literal('cancel'), runId: z.string().uuid() }),
            z.object({ action: z.literal('pause'), runId: z.string().uuid() }),
            z.object({ action: z.literal('resume'), runId: z.string().uuid() }),
        ]).parse(await request.json());
        if (input.action === 'step') {
            const existing = await ctx.db.from('intel_sync_runs').select('config').eq('organization_id',ctx.orgId).eq('id',input.runId).single();
            if (existing.error) throw existing.error;
            if (existing.data.config.background === true) return Response.json({error:'La importación continúa en segundo plano. Puedes cerrar esta pestaña.'},{status:409,headers:noStore});
            return Response.json({ run: await syncSalesPage(ctx, input.runId) }, { headers: noStore });
        }
        if (input.action === 'pause' || input.action === 'resume') {
            const current = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id',ctx.orgId).eq('kind','sales').eq('id',input.runId).eq('status','running').single();
            if (current.error) throw current.error;
            const r=current.data, enabled=input.action==='resume';
            // Keep an existing lease until the current batch finishes, including on pause.
            const config={...r.config,background:enabled,worker:{...r.config.worker,
                state:enabled?'waiting':'paused',retryAt:null,failures:0}};
            const updated=await ctx.db.from('intel_sync_runs').update({config}).eq('organization_id',ctx.orgId).eq('id',r.id)
                .eq('config',JSON.stringify(r.config)).select('*').maybeSingle();
            if(updated.error)throw updated.error;
            if(!updated.data)return Response.json({error:'El avance cambió. Intenta de nuevo.'},{status:409});
            return Response.json({run:publicSalesRun(updated.data)},{headers:noStore});
        }
        if (input.action === 'cancel') {
            const result = await ctx.db.from('intel_sync_runs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('organization_id', ctx.orgId).eq('kind', 'sales').eq('id', input.runId).eq('status', 'running');
            if (result.error) throw result.error;
            return Response.json({ ok: true });
        }
        if (input.from > input.to || Date.parse(input.to) - Date.parse(input.from) > 3 * 366 * 86400000 || input.to >= new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }))
            return Response.json({ error: 'Selecciona hasta tres años y termina como máximo ayer, para importar días cerrados.' }, { status: 400 });
        const current = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'sales').eq('status', 'running').maybeSingle();
        if (current.error) throw current.error;
        if (current.data) return Response.json({ run: publicSalesRun(current.data) });
        const result = await ctx.db.from('intel_sync_runs').insert({ organization_id: ctx.orgId, kind: 'sales', config: { from: input.from, to: input.to, schemaVersion: 1, background: true }, cursor: initialSalesCursor(input.from, input.to) }).select('*').single();
        if (result.error) {
            if (result.error.code === '23505') {
                const concurrent = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'sales').eq('status', 'running').single();
                if (concurrent.data) return Response.json({ run: publicSalesRun(concurrent.data) });
            }
            throw result.error;
        }
        return Response.json({ run: publicSalesRun(result.data) }, { headers: noStore });
    } catch (error) {
        if (error instanceof z.ZodError) return Response.json({ error: 'Solicitud o fechas inválidas.' }, { status: 400 });
        return errorResponse(error);
    }
}
