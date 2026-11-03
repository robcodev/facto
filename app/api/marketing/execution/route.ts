import { z } from 'zod';
import { marketingContext, marketingError, MarketingError, currentPeriod } from '@/lib/marketing/server';
import { savePreparation, recordExecution, workflowForCalendar } from '@/lib/marketing/execution-server';
import { addResult, resultSchema } from '@/lib/marketing/storage';
import { chileDay } from '@/lib/marketing/execution-core';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = {'Cache-Control':'private, no-store'};
export async function GET(request: Request) {
  try {
    const p=new URL(request.url).searchParams, period=currentPeriod();
    return Response.json(await workflowForCalendar(await marketingContext(),z.uuid().parse(p.get('calendarId')),p.get('from')??period.from,p.get('to')??period.to),{headers});
  } catch(e) {return marketingError(e);}
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin')!==new URL(request.url).origin) throw new MarketingError('Origen no permitido.',403);
    const body=await request.text();
    if (body.length>20000) throw new MarketingError('Solicitud demasiado grande.',413);
    const p=JSON.parse(body),ctx=await marketingContext();
    if(p.action==='preparation')return Response.json(await savePreparation(ctx,p),{headers});
    if(p.action==='publication')return Response.json(await recordExecution(ctx,p),{headers});
    if(p.action==='result'){
      const result=resultSchema.parse(p),pub=await ctx.db.from('marketing_publications').select('published_at,calendar_entry_id').eq('organization_id',ctx.orgId).eq('id',result.publicationId).maybeSingle();
      if(pub.error||!pub.data?.calendar_entry_id)throw new MarketingError('Publicación del calendario no encontrada.',404);
      if(result.to>chileDay(new Date().toISOString())||result.to<chileDay(pub.data.published_at))throw new MarketingError('El período debe incluir días transcurridos desde la publicación.');
      if([result.impressions,result.reach,result.clicks,result.purchases,result.revenue,result.spend].every(v=>v===null))throw new MarketingError('Indica al menos un resultado observado.');
      return Response.json(await addResult(ctx,result),{headers});
    }
    throw new MarketingError('Acción inválida.');
  } catch(e) {return marketingError(e instanceof SyntaxError?new MarketingError('Solicitud inválida.',422):e);}
}
