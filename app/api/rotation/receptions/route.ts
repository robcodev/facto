import { z } from 'zod';
import { marketingContext, MarketingError } from '@/lib/marketing/server';
import { liveReceptions } from '@/lib/rotation/receptions';
export const runtime = 'nodejs';
export const maxDuration = 180;
const input = z.object({ variantId:z.string().regex(/^\d+$/), page:z.coerce.number().int().min(0).max(10000).default(0) });
export async function GET(request: Request) {
  const headers = {'Cache-Control':'private, no-store'};
  try {
    const ctx = await marketingContext(), args = input.parse(Object.fromEntries(new URL(request.url).searchParams));
    const variant = await ctx.db.from('intel_records').select('external_id').eq('organization_id',ctx.orgId).eq('source','bsale').eq('resource','variants').eq('external_id',args.variantId).maybeSingle();
    if(variant.error) throw Error('No pudimos comprobar la variante en Intel.');
    if(!variant.data) throw new MarketingError('Variante no encontrada en esta empresa.',404);
    return Response.json(await liveReceptions(args.variantId,args.page),{headers});
  } catch(e) {return Response.json({error:e instanceof z.ZodError?'Revisa la variante solicitada.':e instanceof Error?e.message:'No pudimos consultar las recepciones en Bsale.'},{status:e instanceof MarketingError?e.status:e instanceof z.ZodError?422:503,headers});}
}
