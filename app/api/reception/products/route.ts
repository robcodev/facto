import { z } from 'zod';
import { action, actionSchema, context, findParents, load, metadata } from '@/lib/reception-products/server';
import { ImportError } from '@/lib/reception-products/core';
export const runtime = 'nodejs';
export const maxDuration = 90;
const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
    return Response.json({ error: error instanceof z.ZodError ? 'Revisa los campos de la importación.' : error instanceof ImportError ? error.message : 'No pudimos completar la importación.' }, { status: error instanceof ImportError ? error.status : error instanceof z.ZodError ? 422 : 500, headers });
}
export async function GET(request: Request) {
    try {
        const ctx = await context(), query = new URL(request.url).searchParams;
        if (query.has('id')) return Response.json({ project: await load(ctx, query.get('id')!) }, { headers });
        if (query.has('parents')) return Response.json({ parents: await findParents(query.get('parents')!) }, { headers });
        return Response.json(await metadata(ctx), { headers });
    } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
    try {
        const ctx = await context(), text = await request.text();
        if (Buffer.byteLength(text,'utf8') > 4 * 1024 * 1024) throw new ImportError('La revisión supera 4 MB. Reduce los textos demasiado largos antes de guardar.', 413);
        let body: unknown; try { body = JSON.parse(text); } catch { throw new ImportError('La solicitud no contiene JSON válido.'); }
        return Response.json({ project: await action(ctx, actionSchema.parse(body)) }, { headers });
    } catch (error) { return failure(error); }
}
