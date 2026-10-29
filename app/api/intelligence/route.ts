import { z } from 'zod';
import { marketingContext, MarketingError } from '@/lib/marketing/server';
import { productHealth } from '@/lib/intelligence/server';
export const runtime='nodejs';
export const maxDuration=120;
const filters=z.object({days:z.enum(['14','28','56']).default('14').transform(Number),q:z.string().max(120).default(''),brand:z.string().max(160).default(''),stock:z.enum(['all','positive','zero','unknown']).default('all'),signal:z.enum(['','distributed','concentrated','no_stock','search_interest','growth','receipt','no_movement']).default(''),page:z.coerce.number().int().min(0).max(1000).default(0),productId:z.string().regex(/^\d+$/).optional(),fresh:z.enum(['0','1']).default('0').transform(v=>v==='1')});
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 try{const ctx=await marketingContext();const input=filters.parse(Object.fromEntries(new URL(request.url).searchParams));return Response.json(await productHealth(ctx,input),{headers});}
 catch(e){const status=e instanceof MarketingError?e.status:e instanceof z.ZodError?422:503;return Response.json({error:e instanceof z.ZodError?'Revisa los filtros seleccionados.':e instanceof Error?e.message:'No pudimos consultar la salud de productos.'},{status,headers});}
}
