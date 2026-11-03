import 'server-only';
import { z } from 'zod';
import { marketingContext, MarketingError } from './server';
import { campaignMembers, type BannerCampaign } from './calendar-campaigns';
import { executionSchema, taskSchema, tracking } from './execution-core';
import { GOOGLE_MARKETING } from './google-config';
import { matchCampaign, type WebRow } from './google';

type Context = Awaited<ReturnType<typeof marketingContext>>;
function checked(error: {code?: string} | null) {
  if (!error) return;
  if (error.code === '40001') throw new MarketingError('El trabajo cambió en otra sesión. Actualiza antes de guardar.', 409);
  if (error.code === '23505') throw new MarketingError('Esta pieza ya tiene una publicación registrada en ese canal. Actualiza el registro; para una nueva pieza crea otra propuesta.',409);
  if (['42P01','PGRST205','PGRST202','42703'].includes(error.code ?? '')) throw new MarketingError('Falta activar el registro de preparación y publicaciones en la base de datos.', 503);
  throw new MarketingError('No pudimos guardar o consultar el registro de contenido.', 503);
}
async function batched<T>(ids:string[],query:(part:string[])=>PromiseLike<{data:T[]|null;error:{code?:string}|null}>){const data:T[]=[];for(let n=0;n<ids.length;n+=100){const r=await query(ids.slice(n,n+100));checked(r.error);data.push(...(r.data??[]));}return {data,error:null};}
export async function savePreparation(ctx: Context, raw: unknown) {
  const p = taskSchema.parse(raw);
  if (p.stage === 'ready' && (!p.owner || !p.assetUrl)) throw new MarketingError('Para marcar listo indica responsable y enlace a la pieza final.');
  const result = await ctx.db.rpc('marketing_record_execution', {p_org:ctx.orgId,p_actor:ctx.userId,p_entry:p.entryId,p_version:p.expectedVersion,p_task:p,p_publication:null});
  checked(result.error);
  return {message:'Preparación guardada. Todavía no cuenta como publicación.'};
}
export async function recordExecution(ctx: Context, raw: unknown) {
  const p = executionSchema.parse(raw);
  const result = await ctx.db.from('marketing_calendar_entries').select('id,calendar_id,title,format,product_id,status,evidence').eq('organization_id',ctx.orgId).eq('id',p.entryId).maybeSingle();
  checked(result.error);
  const e = result.data;
  if (!e) throw new MarketingError('Contenido no encontrado.',404);
  if (!e.product_id || e.status === 'skipped') throw new MarketingError('Revisa la propuesta antes de registrar una publicación.');
  const group = e.evidence.group as BannerCampaign | undefined;
  const members = campaignMembers(e.evidence, e.product_id);
  const selected = members.filter(m => p.productIds.includes(m.id));
  if (selected.length !== p.productIds.length || e.format === 'banner' && selected.length < 2) throw new MarketingError('Selecciona los productos que aparecen realmente; el banner requiere al menos dos de su selección.');
  if (e.format === 'banner' && (!group || !['web'].includes(p.channel))) throw new MarketingError('El banner se registra en el canal web y conserva su colección.');
  const destination = new URL(p.destinationUrl);
  if (!['dmultisport.cl','www.dmultisport.cl'].includes(destination.hostname) || destination.port) throw new MarketingError('El destino debe ser una página de Multisport.');
  if (e.format === 'banner' && !/^\/(brand|collection)\/[^/]+\/?$/.test(destination.pathname)) throw new MarketingError('El banner debe dirigir a una marca o colección, no a un producto.');
  const t = tracking(p.entryId,p.channel,p.destinationUrl,p.channel === 'web' || p.channel === 'blog');
  const snapshot = {title:e.title,format:e.format,calendarId:e.calendar_id,members:selected,editorial:e.evidence.editorial??null,campaignKey:group?.key??null,campaignLabel:group?.name??null};
  if (Buffer.byteLength(JSON.stringify(snapshot))>32768) throw new MarketingError('La selección supera el tamaño permitido.');
  const r = await ctx.db.rpc('marketing_record_execution',{p_org:ctx.orgId,p_actor:ctx.userId,p_entry:p.entryId,p_version:p.expectedVersion,p_task:null,p_publication:{...p,...t,snapshot}});
  checked(r.error);
  return {id:r.data,trackingUrl:t.url,internal:t.internal,message:'Publicación registrada con su fecha real. La rotación ya puede considerarla.'};
}
export async function workflowForCalendar(ctx: Context, id: string, from: string, to: string) {
  z.uuid().parse(id);z.iso.date().parse(from);z.iso.date().parse(to);
  if (from>to || Date.parse(to)-Date.parse(from)>90*86400000) throw new MarketingError('Selecciona hasta 91 días para medir.');
  const entries = await ctx.db.from('marketing_calendar_entries').select('id').eq('organization_id',ctx.orgId).eq('calendar_id',id).limit(321);
  checked(entries.error);
  const ids = (entries.data??[]).map(e=>e.id);
  if (ids.length>320) throw new MarketingError('El calendario supera el límite de lectura.');
  if (!ids.length) return {tasks:[],publications:[],events:[],results:[],report:null};
  const [tasks,pubs,events,reports] = await Promise.all([
    batched(ids,part=>ctx.db.from('marketing_entry_workflow').select('entry_id,stage,owner,asset_url,notes,version,updated_at').eq('organization_id',ctx.orgId).in('entry_id',part)),
    batched(ids,part=>ctx.db.from('marketing_publications').select('id,calendar_entry_id,channel,destination_url,publication_url,published_at,asset_url,active_until,execution_notes,content_snapshot,utm_source,utm_medium,utm_campaign,utm_content').eq('organization_id',ctx.orgId).in('calendar_entry_id',part).order('published_at',{ascending:false}).limit(1001)),
    batched(ids,part=>ctx.db.from('marketing_workflow_events').select('id,entry_id,kind,detail,occurred_at').eq('organization_id',ctx.orgId).in('entry_id',part).order('id',{ascending:false}).limit(100)),
    ctx.db.from('intel_web_reports').select('id,rows,metadata,observed_at,period_from,period_to').eq('organization_id',ctx.orgId).eq('source','ga4').eq('property_id',GOOGLE_MARKETING.ga4PropertyId).eq('report_kind','campaign').eq('period_from',from).eq('period_to',to).maybeSingle(),
  ]);
  for (const r of [tasks,pubs,events,reports]) checked(r.error);
  if ((pubs.data?.length??0)>1000) throw new MarketingError('El calendario supera 1.000 publicaciones; no se mostrará un registro parcial.');
  const publicationIds=(pubs.data??[]).map(p=>p.id);
  const results=publicationIds.length?await batched(publicationIds,part=>ctx.db.from('marketing_results').select('id,publication_id,period_from,period_to,source,impressions,reach,clicks,purchases,revenue,currency,attribution_basis,notes,observed_at').eq('organization_id',ctx.orgId).in('publication_id',part).eq('period_from',from).eq('period_to',to).limit(1001)):{data:[],error:null};
  checked(results.error);
  if ((results.data?.length??0)>1000) throw new MarketingError('Hay demasiados resultados para este período.');
  const report=reports.data;
  return {tasks:tasks.data??[],events:events.data.sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,100),results:results.data??[],report:report?{id:report.id,from,to,observedAt:report.observed_at,metadata:report.metadata}:null,
    publications:(pubs.data??[]).sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id)).map(p=>({...p,trackingUrl:tracking(p.calendar_entry_id,p.channel as 'web',p.destination_url,['web','blog'].includes(p.channel)).url,ga4:report&&!['web','blog'].includes(p.channel)?matchCampaign(report.rows as WebRow[],p):null}))};
}
