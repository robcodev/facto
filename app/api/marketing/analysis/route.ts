import { ANALYSIS_PROMPT } from '@/lib/marketing/analysis-core';
import { z } from 'zod';
import { marketingContext,marketingError,MarketingError,periodSchema } from '@/lib/marketing/server';
import { analyzeOpportunities } from '@/lib/marketing/analysis-server';
export const runtime='nodejs';
export const maxDuration=240;
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){try{if(request.headers.get('origin')!==new URL(request.url).origin)throw new MarketingError('Origen no permitido.',403);const body=await request.text();if(body.length>1000)throw new MarketingError('Solicitud demasiado grande.',413);const ctx=await marketingContext();return Response.json(await analyzeOpportunities(ctx,periodSchema.parse(JSON.parse(body))),{headers});}catch(e){return marketingError(e);}}
export async function GET(request:Request){try{const ctx=await marketingContext();const params=new URL(request.url).searchParams;const id=params.get('id');let query=ctx.db.from('marketing_analyses').select('id,created_at,snapshot,result').eq('organization_id',ctx.orgId).eq('prompt_version',ANALYSIS_PROMPT);if(id)query=query.eq('id',z.uuid().parse(id));else{const p=periodSchema.parse({from:params.get('from'),to:params.get('to')});query=query.eq('period_from',p.from).eq('period_to',p.to);}const r=await query.order('created_at',{ascending:false}).limit(1).maybeSingle();if(r.error||!r.data)throw new MarketingError('No hay análisis guardado para este período.',404);return Response.json({...r.data,createdAt:r.data.created_at,saved:true,warning:''},{headers});}catch(e){return marketingError(e);}}
