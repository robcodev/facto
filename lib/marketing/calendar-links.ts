import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { scan,type SourceRow } from '../intelligence/history-server';
import { exclusion } from './calendar-core';
import { calendarVerifiedLinks } from './calendar-web-server';
import { verifyProductLink,catalogue } from './product-links-server';
type Context={db:SupabaseClient;orgId:number;userId:string};
export async function expandCalendarLinks(ctx:Context,after:string){
 const [r,products,types,existing,catalogRows]=await Promise.all([ctx.db.from('intel_records').select('external_id,product_id,url:data->>url,name').eq('organization_id',ctx.orgId).eq('source','bsale').eq('resource','web').gt('external_id',after).order('external_id').limit(12),scan(ctx,'products','name,category_id,state:data->state',20000) as Promise<(SourceRow&{category_id?:string|null})[]>,scan(ctx,'types','name',2000),calendarVerifiedLinks(ctx),catalogue(ctx)]);
 if(r.error)throw Error('No pudimos leer las páginas pendientes ('+r.error.code+').');const productMap=new Map(products.map(p=>[p.external_id,p])),typeMap=new Map(types.map(t=>[t.external_id,{id:t.external_id,name:t.name??''}]));
 let verified=0,skipped=0;const failed:{name:string;reason:string}[]=[];
 for(let start=0;start<(r.data?.length??0);start+=3){await Promise.all((r.data??[]).slice(start,start+3).map(async row=>{const p=productMap.get(row.product_id??'');if(!p||String(p.state)!=='0'||!row.url||exclusion({name:p.name??'',typeId:p.category_id??null},typeMap.get(p.category_id??''))){skipped++;return;}if(existing.some(l=>l.product_id===p.external_id&&(l.verification.canonicalUrl===row.url||l.verification.aliases?.includes(row.url)))){skipped++;return;}try{await verifyProductLink(ctx,{productId:p.external_id,url:row.url},catalogRows);verified++;}catch(e){failed.push({name:p.name??p.external_id,reason:e instanceof Error?e.message:'No se pudo verificar la identidad.'});}}));}
 return {verified,skipped,failed,done:(r.data?.length??0)<12,cursor:r.data?.at(-1)?.external_id??after,scanned:r.data?.length??0};
}

