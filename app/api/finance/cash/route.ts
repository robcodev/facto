import { z } from 'zod';
import { filtersSchema, mutationSchema } from '@/lib/finance/cash-core';
import { cashContext, cashError, CashError, entries, mutate, report } from '@/lib/finance/cash-server';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
    try {
        const ctx = await cashContext(), params = new URL(request.url).searchParams;
        if (params.has('withdrawalId')) return Response.json(await entries(ctx, z.uuid().parse(params.get('withdrawalId')), z.coerce.number().int().min(0).max(5000).parse(params.get('page') || 0)), { headers });
        return Response.json(await report(ctx, filtersSchema.parse(Object.fromEntries(params))), { headers });
    } catch (error) { return cashError(error); }
}
export async function POST(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) throw new CashError('Origen no permitido.', 403);
        const ctx = await cashContext();
        if (!request.headers.get('content-type')?.includes('application/json')) throw new CashError('Envía los datos en formato JSON.', 415);
        const body = await request.text();
        if (body.length > 8000) throw new CashError('Solicitud demasiado grande.', 413);
        let parsed: unknown; try { parsed = JSON.parse(body); } catch { throw new CashError('No pudimos leer los datos enviados.', 400); }
        return Response.json(await mutate(ctx, mutationSchema.parse(parsed)), { headers });
    } catch (error) { return cashError(error); }
}
