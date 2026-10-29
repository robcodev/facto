import { z } from 'zod';
import { context, errorResponse, syncPage } from '@/lib/intel/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
    try {
        const ctx = await context();
        const input = z.union([z.object({ runId: z.string().uuid() }), z.object({ scope: z.literal('catalog') }), z.object({ officeId: z.number().int().positive(), priceListId: z.number().int().nonnegative() })]).parse(await request.json());
        if ('runId' in input) return Response.json({ run: await syncPage(ctx, input.runId) });
        const { data: current, error: currentError } = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'catalog').eq('status', 'running').maybeSingle();
        if (currentError) throw currentError;
        if (current) return Response.json({ run: current });
        const { data: run, error } = await ctx.db.from('intel_sync_runs').insert({ organization_id: ctx.orgId, kind: 'catalog', office_id: null, price_list_id: null, config: { scope: 'catalog' } }).select('*').single();
        if (error) {
            if (error.code === '23505') {
                const { data: concurrent } = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'catalog').eq('status', 'running').single();
                if (concurrent) return Response.json({ run: concurrent });
            }
            throw error;
        }
        return Response.json({ run });
    } catch (error) { if (error instanceof z.ZodError) return Response.json({ error: 'Solicitud de catálogo no válida.' }, { status: 400 }); return errorResponse(error); }
}
