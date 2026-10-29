import { analyzeSales } from './sales-analysis';
import { publicInsights, productInsights } from './insights';
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readOpportunities } from '../marketing/reader';
import { ANALYSIS_PROMPT, type AnalysisResult } from '../marketing/analysis-core';
import { GOOGLE_MARKETING } from '../marketing/google-config';
import { summarizeWeb, type WebRow } from '../marketing/google';
import { buildHealth, filterHealth, latestCoveredEnd, type ProductPage } from './core';

type Context={db:SupabaseClient;orgId:number};
type IndexRow={id:number;external_id:string;product_id:string|null;name:string;observed_at:string;state?:unknown;brandId?:string|null;brandName?:string|null;sku?:string;url?:string;variantId?:string;officeId?:string;available?:unknown;from?:string;to?:string;reconciliation?:unknown;importedCount?:unknown;sourceCount?:unknown;excludedCount?:unknown};
const numeric=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
async function records(ctx:Context,resource:string,projection:string,cap:number,runId?:string){
 const result:IndexRow[]=[];
 for(let offset=0;offset<cap;offset+=1000){
  let q=ctx.db.from('intel_records').select('id,external_id,product_id,name,observed_at,'+projection).eq('organization_id',ctx.orgId).eq('resource',resource).eq('source','bsale').order(resource.startsWith('inventory_')?'id':'external_id').range(offset,offset+999);
  if(resource.startsWith('inventory_'))q=q.like('resource','inventory_%');
  if(resource.startsWith('sales_'))q=q.like('resource','sales_%');
  if(runId)q=q.eq('run_id',runId);
  const r=await q;if(r.error)throw new Error('No pudimos leer '+resource+' en Intel.',{cause:r.error});
  const page=r.data as unknown as IndexRow[];result.push(...page);if(page.length<1000)return result;
 }
 throw new Error('La lectura de '+resource+' alcanzó el límite del módulo. No se mostrará una muestra como si fuera completa.');
}
const day=(time:number)=>new Date(time).toISOString().slice(0,10);
function closedThrough(){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return day(Date.parse(today)-86400000);}
async function webPages(ctx:Context,products:IndexRow[],web:IndexRow[],from:string,to:string,notes:string[]):Promise<Record<string,ProductPage>>{
 const [reportResult,links]=await Promise.all([
  ctx.db.from('intel_web_reports').select('id,source,property_id,report_kind,rows,metadata,observed_at').eq('organization_id',ctx.orgId).eq('period_from',from).eq('period_to',to).order('observed_at',{ascending:false}).limit(6),
  (async()=>{const all:{product_id:string;source:string;property_id:string;external_key:string;verified_at:string;verification:{method?:string;bsaleProductId?:string;httpStatus?:number;canonicalUrl?:string;aliases?:string[]}}[]=[];for(let offset=0;offset<5000;offset+=500){const r=await ctx.db.from('marketing_product_links').select('product_id,source,property_id,external_key,verified_at,verification').eq('organization_id',ctx.orgId).order('source').order('property_id').order('external_key').range(offset,offset+499);if(r.error)throw new Error('No pudimos leer las correspondencias web.',{cause:r.error});all.push(...r.data);if(r.data.length<500)return all;}throw new Error('Las correspondencias web exceden el límite del módulo.');})().catch(()=>{notes.push('Las correspondencias web no pudieron comprobarse; las señales quedan pendientes.');return [];}),
 ]);
 if(reportResult.error)notes.push('No se pudieron leer los reportes de Google guardados; su evidencia queda pendiente.');
 const reports=(reportResult.data??[]).filter(r=>(r.source==='ga4'&&r.property_id===GOOGLE_MARKETING.ga4PropertyId&&r.report_kind==='landing')||(r.source==='search_console'&&r.property_id===GOOGLE_MARKETING.searchConsoleSite&&r.report_kind==='search_page'));
 const verified=links.filter(l=>l.verification?.method==='store_product_identity_v1'&&l.verification.bsaleProductId===l.product_id&&l.verification.httpStatus===200&&((l.source==='ga4'&&l.property_id===GOOGLE_MARKETING.ga4PropertyId)||(l.source==='search_console'&&l.property_id===GOOGLE_MARKETING.searchConsoleSite)));
 const webByProduct=new Map<string,IndexRow>();for(const row of web){if(!row.product_id)continue;const old=webByProduct.get(row.product_id);if(!old||row.observed_at>old.observed_at)webByProduct.set(row.product_id,row);}
 return Object.fromEntries(products.map(p=>{
  const raw=webByProduct.get(p.external_id)?.url;const url=typeof raw==='string'&&/^https:\/\/(www\.)?dmultisport\.cl\/product\//.test(raw)?raw:null;
  const matches=verified.filter(l=>l.product_id===p.external_id&&url&&(l.verification.canonicalUrl===url||l.verification.aliases?.includes(url)));
  return [p.external_id,{url,verified:matches.length>0,checkedAt:matches.map(l=>l.verified_at).sort().at(-1)??null,evidence:reports.flatMap(report=>{
   const keys=new Set(matches.filter(l=>l.source===report.source&&l.property_id===report.property_id).map(l=>l.external_key));
   const rows=(report.rows as WebRow[]).filter(r=>keys.has(r.dimensions[report.source==='ga4'?'landingPage':'page']));if(!rows.length)return [];
   const metrics=summarizeWeb({source:report.source,rows});
   return [{source:report.source,reportId:report.id,observedAt:report.observed_at,metrics:report.source==='ga4'?{sessions:metrics.sessions}:metrics,partial:report.metadata?.truncated===true,timeZone:typeof report.metadata?.timeZone==='string'?report.metadata.timeZone:null}];
  })}];
 }));
}
async function loadHealth(ctx:Context,days:number){
 const [products,variants,brands,web,windows,runs,declaredBrands]=await Promise.all([
  records(ctx,'products','state:data->state,brandId:data->>brandId,brandName:data->>brandName',10000),
  records(ctx,'variants','state:data->state,sku:data->>sku',20000),
  records(ctx,'brands','state:data->state',2000),
  records(ctx,'web','url:data->>url',10000),
  records(ctx,'sales_windows','from:data->>from,to:data->>to,reconciliation:data->>reconciliation,importedCount:data->importedCount,sourceCount:data->sourceCount,excludedCount:data->excludedCount',5000),
  ctx.db.from('intel_sync_runs').select('id,status,cursor').eq('organization_id',ctx.orgId).eq('kind','inventory').neq('status','cancelled').order('started_at',{ascending:false}).limit(5),
  ctx.db.from('commercial_brand_names').select('brand_id,name,source,basis').eq('organization_id',ctx.orgId).limit(1000),
 ]);
 if(runs.error)throw new Error('No pudimos leer las capturas de stock.',{cause:runs.error});
 const to=latestCoveredEnd(windows.filter((w):w is IndexRow&{from:string;to:string}=>!!w.from&&!!w.to).map(w=>({from:w.from,to:w.to,reconciliation:w.reconciliation,importedCount:w.importedCount,sourceCount:w.sourceCount,excludedCount:w.excludedCount})),closedThrough());
 if(!to)throw new Error('Intel no tiene un corte de ventas verificado. Completa la importación antes de analizar productos.');
 const from=day(Date.parse(to)-(days-1)*86400000),previousTo=day(Date.parse(from)-86400000),previousFrom=day(Date.parse(from)-days*86400000);
 const run=runs.data?.find(r=>Number(r.cursor?.stockRows)>0&&['list','details','check','done'].includes(r.cursor?.phase)&&![true,1,'1','true'].includes(r.cursor?.checkingStock));
 const notes:string[]=[];
 const [current,previous,stock]=await Promise.all([
  readOpportunities(ctx.db,ctx.orgId,from,to,true,true,true),
  readOpportunities(ctx.db,ctx.orgId,previousFrom,previousTo,true).catch(()=>{notes.push('La comparación anterior no pudo comprobarse; se conserva desconocida.');return null;}),
  run?records(ctx,'inventory_stock','variantId:data->>variantId,officeId:data->>officeId,available:data->available',30000,run.id):Promise.resolve([]),
 ]);
 const active=products.filter(p=>String(p.state)==='0');
 const activeIds=new Set(active.map(p=>p.external_id));
 const pages=await webPages(ctx,active,web,from,to,notes),brandNames=new Map([...brands.map(b=>[b.external_id,b.name] as [string,string]),...(declaredBrands.data??[]).map(b=>[b.brand_id,b.name] as [string,string])]);
 const checkedAt=new Date().toISOString();
 if(active.some(p=>p.brandId&&!p.brandName&&!brandNames.has(p.brandId)))notes.push('Hay nombres de marca pendientes. Se agrupan por el ID de Bsale; los nombres ingresados por el equipo se conservan como declaraciones manuales.');
 const health=buildHealth({products:active.map(p=>({id:p.external_id,name:p.name,brand:p.brandName||brandNames.get(p.brandId??'')||(p.brandId?'Marca ID '+p.brandId:null),brandId:p.brandId??null,observedAt:p.observed_at})),variants:variants.filter(v=>v.product_id&&activeIds.has(v.product_id)).map(v=>({id:v.external_id,productId:v.product_id!,name:v.name,sku:v.sku??'',active:String(v.state)==='0',observedAt:v.observed_at})),stock:stock.map(s=>({variantId:s.variantId??'',officeId:s.officeId??'',available:numeric(s.available),observedAt:s.observed_at})),current,previous,pages,checkedAt});
 const analysis=analyzeSales(current.commercial??{covered:false,documents:[],receiptCosts:[]});
 const labels=Object.fromEntries(products.map(p=>[p.external_id,{name:p.name,active:String(p.state)==='0'}]));
 const brandChoices=[...new Set(active.map(p=>p.brandId).filter((id):id is string=>!!id))].sort().map(id=>({id,name:brandNames.get(id)??null}));
 return {products:health,analysis,labels,brandChoices,checkedAt,period:{from,to,previousFrom,previousTo,days},coverage:{...current.coverage,stockRunId:run?.id??null},notices:[...notes,...(current.notices??[]),'Stock observado; no permite reconstruir quiebres históricos. Las ventas son unidades brutas, sin descontar devoluciones.','Se utilizan reportes de Google ya guardados del mismo intervalo. Si faltan, la señal web queda pendiente.'],stockRunId:run?.id??null};
}
type Dataset=Awaited<ReturnType<typeof loadHealth>>;
const cache=new Map<string,{expires:number;value:Promise<Dataset>}>();
async function dataset(ctx:Context,days:number,fresh:boolean){
 const key=ctx.orgId+':'+days,old=cache.get(key);if(!fresh&&old&&old.expires>Date.now())return old.value;
 if(cache.size>=4)cache.delete(cache.keys().next().value!);
 const entry={expires:Date.now()+30000,value:loadHealth(ctx,days)};cache.set(key,entry);
 try{const result=await entry.value;entry.expires=Date.now()+60000;return result;}catch(e){if(cache.get(key)===entry)cache.delete(key);throw e;}
}
export async function productHealth(ctx:Context,input:{days:number;q:string;brand:string;stock:string;signal:string;page:number;productId?:string;fresh:boolean}){
 const data=await dataset(ctx,input.days,input.fresh);
 if(input.productId){
  const product=data.products.find(p=>p.id===input.productId);if(!product)throw new Error('Producto activo no encontrado en Intel.');
  const r=await ctx.db.from('marketing_analyses').select('id,created_at,result').eq('organization_id',ctx.orgId).eq('period_from',data.period.from).eq('period_to',data.period.to).eq('prompt_version',ANALYSIS_PROMPT).order('created_at',{ascending:false}).limit(5);
  const analyses=(r.data??[]) as {id:string;created_at:string;result:AnalysisResult}[];
  const saved=analyses.find(a=>Array.isArray(a.result?.recommendations)&&a.result.recommendations.some(r=>r.productId===product.id));
  const recommendation=saved?.result.recommendations.find(r=>r.productId===product.id);
  const {products,analysis,labels,...meta}=data;void products;
  return {...meta,product,productAnalysis:productInsights(product,analysis,labels),ai:recommendation?{analysisId:saved!.id,createdAt:saved!.created_at,recommendation}:null,aiNotice:r.error?'No se pudo consultar el análisis de IA guardado.':''};
 }
 const filtered=filterHealth(data.products,input),page=Math.min(input.page,Math.max(0,Math.ceil(filtered.length/25)-1));
 const {products,analysis,labels,...meta}=data;
 return {...meta,insights:publicInsights(products,analysis,labels,data.period.days),total:filtered.length,catalogTotal:products.length,page,hasMore:(page+1)*25<filtered.length,brands:[...new Set(products.map(p=>p.brand).filter((b):b is string=>!!b))].sort((a,b)=>a.localeCompare(b,'es')),counts:{distributed:products.filter(p=>p.signals.some(s=>s.code==='distributed')).length,concentrated:products.filter(p=>p.signals.some(s=>s.code==='concentrated')).length,web:products.filter(p=>p.page.evidence.some(e=>e.source==='search_console'&&(e.metrics.clicks??0)>0)).length},rows:filtered.slice(page*25,page*25+25).map(p=>{const {variants,...rest}=p;return {...rest,variantCount:variants.filter(v=>v.active).length};})};
}
