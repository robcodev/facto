import { z } from 'zod';
import { context, dashboard, productDetail, errorResponse } from '@/lib/intel/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
    try {
        const ctx = await context();
        const params = new URL(request.url).searchParams;
        const product = params.get('product');
        if (product !== null && !/^\d+$/.test(product)) return Response.json({ error: 'Producto inválido.' }, { status: 400 });
        return Response.json(product ? await productDetail(ctx, product) : await dashboard(ctx, params), { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
    try {
        const ctx = await context();
        const settings = z.object({ category_id: z.string().regex(/^\d+$/), included: z.boolean(), editorial_name: z.string().trim().max(160), parent_name: z.string().trim().max(160), responsible: z.string().trim().max(160), priority: z.number().int().min(1).max(3) }).parse(await request.json());
        const { data: category } = await ctx.db.from('intel_records').select('id').eq('organization_id', ctx.orgId).eq('resource', 'types').eq('external_id', settings.category_id).maybeSingle();
        if (!category) return Response.json({ error: 'La categoría no existe en Intel.' }, { status: 400 });
        const { error } = await ctx.db.from('intel_category_settings').upsert({ ...settings, organization_id: ctx.orgId, updated_at: new Date().toISOString() });
        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) { if (error instanceof z.ZodError) return Response.json({ error: 'Revisa los datos de la categoría.' }, { status: 400 }); return errorResponse(error); }
}
