// SELECT/GET verification of the one-off completion. No importer/source writes.
import { readFile,writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd(),true);
const state=JSON.parse(await readFile(new URL('../../private/intel-completion-state.json',import.meta.url),'utf8'));
const recentAudit=JSON.parse(await readFile(new URL('../../private/intel-recent-audit.json',import.meta.url),'utf8').catch(()=>'null'));
if(state.phase!=='done')throw new Error(`Completion still active: ${state.phase}`);
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.FACTO_BACKEND_SECRET,{auth:{persistSession:false}});
const unwrap=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const org=unwrap(await db.from('organizations').select('id').eq('slug','facto-compartido').single()).id;
async function rows(resource,fields='id,external_id,product_id,data,run_id'){
 const all=[];let last='';for(;;){const page=unwrap(await db.from('intel_records').select(fields).eq('organization_id',org).eq('source','bsale').eq('resource',resource).gt('external_id',last).order('external_id').limit(1000));all.push(...page);if(page.length<1000)return all;last=page.at(-1).external_id;}
}
const runs=unwrap(await db.from('intel_sync_runs').select('id,kind,status,config,cursor,last_error,completed_at').eq('organization_id',org).in('id',[state.salesRun,state.inventoryRun,state.gapsRun,state.snapshotRun,state.referencesRun]));
const parents=(await rows('sales_documents')).filter(r=>String(r.data.documentTypeId)!=='38');
const parentMap=new Map(parents.map(r=>[r.external_id,r]));
const variants=await rows('variants','id,external_id,product_id'),variantIds=new Set(variants.map(r=>r.external_id));
const products=await rows('products','id,external_id'),productIds=new Set(products.map(r=>r.external_id));
const clients=await rows('sales_clients','id,external_id'),clientIds=new Set(clients.map(r=>r.external_id));
const missing={variants:new Set(),products:new Set(),clients:new Set()};
const variantsWithoutParentId=variants.filter(r=>!r.product_id).map(r=>r.external_id);
const salesLines=await rows('sales_details','id,external_id,run_id,variantId:data->>variantId,documentId:data->>documentId');
for(const row of salesLines)if(parentMap.get(row.documentId)?.run_id===row.run_id&&row.variantId&&!variantIds.has(row.variantId))missing.variants.add(row.variantId);
for(const resource of ['inventory_receptions_details','inventory_consumptions_details','inventory_stock'])for(const row of await rows(resource,'id,external_id,variantId:data->>variantId'))if(row.variantId&&!variantIds.has(row.variantId))missing.variants.add(row.variantId);
variants.forEach(r=>{if(r.product_id&&!productIds.has(r.product_id))missing.products.add(r.product_id);});
parents.forEach(r=>{if(r.data.clientId&&!clientIds.has(String(r.data.clientId)))missing.clients.add(String(r.data.clientId));});
const unavailable=await rows('historical_reference_checks');
const documented=new Set(unavailable.map(r=>`${r.data.resource==='sales_clients'?'clients':r.data.resource}:${r.data.id}`));
const unexplained=Object.fromEntries(Object.entries(missing).map(([k,ids])=>[k,[...ids].filter(id=>!documented.has(`${k}:${id}`))]));
const windows=await rows('sales_windows'),sorted=windows.map(r=>r.data).sort((a,b)=>a.from.localeCompare(b.from));
const coverageGaps=[];for(let i=1;i<sorted.length;i++){const expected=new Date(Date.parse(sorted[i-1].to)+86400000).toISOString().slice(0,10);if(sorted[i].from!==expected)coverageGaps.push({previousEnd:sorted[i-1].to,nextStart:sorted[i].from});}
const recent=parents.filter(r=>r.data.emissionDay>=state.from&&r.data.emissionDay<=state.to);
const recentMap=new Map(recent.map(r=>[r.external_id,r.run_id]));
const recentLines=salesLines.filter(r=>recentMap.get(r.documentId)===r.run_id);
const incomplete=parents.filter(r=>r.data.complete!==true).length;
const versionResult=await db.from('intel_record_versions').select('id',{head:true,count:'exact'}).eq('organization_id',org);
if(versionResult.error)throw versionResult.error;
const report={checkedAt:new Date().toISOString(),period:{from:sorted[0]?.from,to:sorted.at(-1)?.to},coverageGaps,
 allRequestedRunsComplete:runs.length===5&&runs.every(r=>r.status==='completed'),recentSourceVerified:recentAudit?.runId===state.salesRun&&recentAudit?.passed===true,
 runs:runs.map(r=>({id:r.id,kind:r.kind,purpose:r.config.purpose,mode:r.config.mode,status:r.status,lastError:r.last_error,completedAt:r.completed_at,stockRows:r.cursor.stockRows,completedMovements:r.cursor.completedMovements})),
 counts:{products:products.length,variants:variants.length,clients:clients.length,nonPresaleDocuments:parents.length,recentDocuments:recent.length,recentLines:recentLines.length,incompleteDocuments:incomplete,fullRowCopies:versionResult.count},
 missingReferences:Object.fromEntries(Object.entries(missing).map(([k,v])=>[k,v.size])),variantsWithoutParentId,unexplainedMissingReferences:unexplained,
 unavailable:unavailable.map(r=>({resource:r.data.resource,id:r.data.id,status:r.data.httpStatus})),
 recentWindow:windows.find(r=>r.data.from===state.from&&r.data.to===state.to)?.data,
 snapshot: runs.find(r=>r.id===state.snapshotRun)?.cursor,
 movementChecks:(await rows('inventory_checks')).filter(r=>r.run_id===state.gapsRun||r.run_id===state.inventoryRun).map(r=>r.data)};
report.passed=report.allRequestedRunsComplete&&report.recentSourceVerified&&coverageGaps.length===0&&incomplete===0&&variantsWithoutParentId.length===0&&Object.values(unexplained).every(a=>a.length===0)&&versionResult.count===0;
await writeFile(new URL('../../private/intel-completion-verification.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
