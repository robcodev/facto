// Verify the recent sales range while historical reference recovery continues.
import { readFile,writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { reconcileHeaders,moneyEqual } from './audit-core.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const state=JSON.parse(await readFile(new URL('../../private/intel-completion-state.json',import.meta.url),'utf8'));
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.FACTO_BACKEND_SECRET,{auth:{persistSession:false}});
const unwrap=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const org=unwrap(await db.from('organizations').select('id').eq('slug','facto-compartido').single()).id;
const run=unwrap(await db.from('intel_sync_runs').select('status,updated_at').eq('organization_id',org).eq('id',state.salesRun).single());
if(run.status!=='completed')throw new Error('Recent import has not completed');
const local=[];for(let i=0;;i+=500){const p=unwrap(await db.from('intel_records').select('external_id,data,run_id').eq('organization_id',org).eq('source','bsale').eq('resource','sales_documents').gte('data->>emissionDay',state.from).lte('data->>emissionDay',state.to).order('id').range(i,i+499));local.push(...p);if(p.length<500)break;}
const excluded=new Set();
const source=[];let expected;for(let offset=0;;){const a=Date.parse(state.from)/1000,b=Date.parse(state.to)/1000+86399;
 const r=await fetch(`https://api.bsale.io/v1/documents.json?emissiondaterange=[${a},${b}]&limit=50&offset=${offset}`,{headers:{access_token:process.env.BSALE_TOKEN},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`Bsale HTTP ${r.status}`);const p=await r.json();
 if(!Array.isArray(p.items)||!Number.isInteger(p.count)||(expected!=null&&expected!==p.count))throw new Error('Invalid/changing source count');expected=p.count;source.push(...p.items);offset+=p.items.length;if(offset>=expected){if(offset!==expected)throw new Error('Source pagination overrun');break;}if(!p.items.length)throw new Error('Empty source page');
}
const expectedPresales=source.filter(r=>String(r.document_type?.id)==='38').map(r=>String(r.id));
for(let i=0;i<expectedPresales.length;i+=100){const p=unwrap(await db.from('intel_records').select('external_id').eq('organization_id',org).eq('source','bsale').eq('resource','sales_excluded').eq('run_id',state.salesRun).in('external_id',expectedPresales.slice(i,i+100)));p.forEach(r=>excluded.add(r.external_id));}
// Use the existing identity index, not an expensive JSON-parent filter + id sort.
// Transfer only the fields needed for this check; keep only the target run in RAM.
const lines=[];let last='';for(;;){const page=unwrap(await db.from('intel_records').select('external_id,run_id,documentId:data->>documentId,total:data->total').eq('organization_id',org).eq('source','bsale').eq('resource','sales_details').gt('external_id',last).order('external_id').limit(1000));
 lines.push(...page.filter(r=>r.run_id===state.salesRun).map(r=>({...r,data:{documentId:r.documentId,total:r.total}})));if(page.length<1000)break;last=page.at(-1).external_id;}
const parents=new Map(local.map(r=>[r.external_id,r]));const current=lines.filter(r=>parents.get(r.data.documentId)?.run_id===r.run_id);const grouped=new Map();for(const r of current){const a=grouped.get(r.data.documentId)||[];a.push(r);grouped.set(r.data.documentId,a);}
const lineDifferences=local.filter(r=>grouped.has(r.external_id)&&!moneyEqual(grouped.get(r.external_id).reduce((n,x)=>n+Number(x.data.total),0),r.data.total)).map(r=>r.external_id);
const report={checkedAt:new Date().toISOString(),runId:state.salesRun,period:{from:state.from,to:state.to},reconciliation:reconcileHeaders(source,local,excluded),lines:current.length,documentsWithoutLines:local.filter(r=>!grouped.has(r.external_id)).length,lineTotalDifferences:lineDifferences};
report.passed=report.reconciliation.matches&&report.documentsWithoutLines===0&&lineDifferences.length===0;
await writeFile(new URL('../../private/intel-recent-audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
