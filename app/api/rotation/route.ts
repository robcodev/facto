import { z } from 'zod';
import { marketingContext, MarketingError } from '@/lib/marketing/server';
import { inventoryView } from '@/lib/rotation/server';
export const runtime = 'nodejs';
export const maxDuration = 180;
const filters = z.object({ days: z.enum(['30', '90', '365']).default('90').transform(Number), threshold: z.coerce.number().int().min(1).max(3650).default(90), q: z.string().max(120).default(''), brand: z.string().max(160).default(''), category: z.string().max(160).default(''), signal: z.enum(['', 'no_sales', 'old', 'excess', 'lagging']).default(''), positive: z.enum(['0', '1']).default('1').transform(v => v === '1'), segment: z.enum(['all', 'web', 'other', 'full']).default('all'), sort: z.enum(['priority', 'stock', 'days', 'sales', 'coverage', 'value', 'age']).default('priority'), direction: z.enum(['asc', 'desc']).default('desc'), group: z.enum(['0', '1']).default('0').transform(v => v === '1'), page: z.coerce.number().int().min(0).max(100000).default(0), variantId: z.string().regex(/^\d+$/).optional() });
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try { const ctx = await marketingContext(); return Response.json(await inventoryView(ctx, filters.parse(Object.fromEntries(new URL(request.url).searchParams))), { headers }); }
  catch (e) { return Response.json({ error: e instanceof z.ZodError ? 'Revisa los filtros seleccionados.' : e instanceof Error ? e.message : 'No pudimos leer Intel.' }, { status: e instanceof MarketingError ? e.status : e instanceof z.ZodError ? 422 : 503, headers }); }
}
