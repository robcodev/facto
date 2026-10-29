import { z } from 'zod';
import { marketingContext,MarketingError } from '@/lib/marketing/server';
import { basketHistory } from '@/lib/intelligence/history-server';
import { historyView } from '@/lib/intelligence/history-query';
export const runtime='nodejs';
export const maxDuration=300;
const filters=z.object({q:z.string().trim().max(160).default(''),min:z.coerce.number().int().min(1).max(10000).default(10),lift:z.coerce.number().min(0).max(10000).default(0),active:z.enum(['0','1']).default('1').transform(v=>v==='1'),repeated:z.enum(['0','1']).default('0').transform(v=>v==='1'),compact:z.enum(['0','1']).default('1').transform(v=>v==='1'),sort:z.enum(['frequency','association','recent']).default('frequency'),page:z.coerce.number().int().min(0).max(50000).default(0),fresh:z.enum(['0','1']).default('0').transform(v=>v==='1')});
export async function GET(request:Request){const headers={'Cache-Control':'private, no-store'};try{const input=filters.parse(Object.fromEntries(new URL(request.url).searchParams)),ctx=await marketingContext();return Response.json(historyView(await basketHistory(ctx,input.fresh),input),{headers});}catch(e){return Response.json({error:e instanceof z.ZodError?'Revisa los filtros históricos.':e instanceof Error?e.message:'No pudimos analizar el historial.'},{status:e instanceof MarketingError?e.status:e instanceof z.ZodError?422:503,headers});}}
