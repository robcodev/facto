import { z } from 'zod';
import { QuoteError } from '@/lib/quotations/core';
import { action, actionSchema, attach, context, list, load } from '@/lib/quotations/server';
export const runtime = 'nodejs';
export const maxDuration = 150;
const headers = { 'Cache-Control': 'private, no-store' };
function error(e: unknown) {
  return Response.json({ error: e instanceof z.ZodError ? 'Revisa los campos enviados.' : e instanceof QuoteError ? e.message : 'No pudimos completar la operación. El trabajo guardado se conserva.' }, { status: e instanceof QuoteError ? e.status : e instanceof z.ZodError || e instanceof SyntaxError ? 422 : 503, headers });
}
export async function GET(request: Request) {
  try { const ctx = await context(), id = new URL(request.url).searchParams.get('id'); return Response.json(id ? { project: await load(ctx, id) } : { projects: await list(ctx) }, { headers }); } catch (e) { return error(e); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new QuoteError('Origen no permitido.', 403);
    if (Number(request.headers.get('content-length')) > 2200000) throw new QuoteError('Solicitud demasiado grande.', 413);
    const ctx = await context();
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const form = await request.formData(), file = form.get('file'); if (!(file instanceof File)) throw new QuoteError('Falta el archivo.');
      return Response.json({ project: await attach(ctx, String(form.get('id')), z.coerce.number().int().nonnegative().parse(form.get('version')), file) }, { headers });
    }
    const text = await request.text(); if (text.length > 150000) throw new QuoteError('El texto es demasiado largo.', 413);
    return Response.json({ project: await action(ctx, actionSchema.parse(JSON.parse(text))) }, { headers });
  } catch (e) { return error(e); }
}
