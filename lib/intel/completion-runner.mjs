// Trusted, resumable one-off completion of the authorized Intel imports.
// GET Bsale + writes to Facto's existing Intel tables only. No source mutations.
import { readFile,writeFile,mkdir,appendFile,stat,rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd(),true);
const compile=s=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
const normal=compile(await read('./normalize.ts'));
const salesCore=compile((await read('./sales-core.ts')).replace("'./normalize'",JSON.stringify(normal)));
const inventoryCore=compile((await read('./inventory-core.ts')).replace("'./normalize'",JSON.stringify(normal)));
const shared=compile((await read('./server.ts')).replace("import 'server-only';",'')
 .replace("import { createClient } from '@/lib/supabase/server';",'const createClient=()=>{throw new Error("No browser session in operator job")};')
 .replace("import { createAdminClient } from '@/lib/supabase/admin';",'const createAdminClient=()=>{throw new Error("Operator context supplied")};')
 .replace("'./normalize'",JSON.stringify(normal)));
const inventoryServer=compile((await read('./inventory-server.ts')).replace("import 'server-only';",'').replace("'./server'",JSON.stringify(shared)).replace("'./normalize'",JSON.stringify(normal)).replace("'./sales-core'",JSON.stringify(salesCore)).replace("'./inventory-core'",JSON.stringify(inventoryCore)));
const {normalize}=await import(normal);
const {initialSalesCursor,salesRecord}=await import(salesCore);
const {syncInventoryPage}=await import(inventoryServer);
const {initialInventoryCursor,movementHeader,movementDetail,inventoryRecord,stockObservation}=await import(inventoryCore);
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.FACTO_BACKEND_SECRET,token=process.env.BSALE_TOKEN;
if(!url||!key||!token)throw new Error('Missing Facto server credentials');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o={})=>fetch(u,{...o,signal:AbortSignal.timeout(60000)})}});
const unwrap=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const org=unwrap(await db.from('organizations').select('id').eq('slug','facto-compartido').single()).id;
const ctx={db,orgId:org,canEdit:true};
const statePath=resolve('private/intel-completion-state.json'),logPath=resolve('private/intel-completion.log');
await mkdir(resolve('private'),{recursive:true});
let state=JSON.parse(await readFile(statePath,'utf8').catch(()=>'null'));
if(!state){state={version:1,organizationId:org,from:'2026-10-15',to:new Date(Date.parse(new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'}))-86400000).toISOString().slice(0,10),phase:'sales',startedAt:new Date().toISOString()};}
if(state.organizationId!==org)throw new Error('Completion checkpoint belongs to another organization');
async function save(){state.updatedAt=new Date().toISOString();await writeFile(`${statePath}.tmp`,JSON.stringify(state,null,2));await rename(`${statePath}.tmp`,statePath);}
async function log(event){if((await stat(logPath).catch(()=>null))?.size>2000000)await rename(logPath,`${logPath}.previous`).catch(()=>{});const line=JSON.stringify({at:new Date().toISOString(),...event});await appendFile(logPath,line+'\n');console.log(line);}
const temporary=e=>/429|500|502|503|504|fetch failed|timeout|abort|connection|network|EAI_AGAIN|ECONN/i.test(e.message||String(e));
async function source(path,allowMissing=false){for(let i=0;;i++){try{const r=await fetch(`https://api.bsale.io${path}`,{headers:{access_token:token},signal:AbortSignal.timeout(20000)});
 if(allowMissing&&[404,410].includes(r.status))return {missing:r.status};
 if(!r.ok)throw new Error(`Bsale HTTP ${r.status}`);return {raw:await r.json()};
 }catch(e){if(!temporary(e)||i>=4)throw e;await new Promise(r=>setTimeout(r,Math.min(30000,1000*2**i)));}}}
async function many(items,work){const output=new Array(items.length);let next=0;const settled=await Promise.allSettled(Array.from({length:Math.min(3,items.length)},async()=>{while(next<items.length){const i=next++;output[i]=await work(items[i]);}}));const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;return output;}
async function records(resource,fields='id,external_id,product_id,data,run_id'){
 const all=[];let last='';for(;;){const rows=unwrap(await db.from('intel_records').select(fields).eq('organization_id',org).eq('source','bsale').eq('resource',resource).gt('external_id',last).order('external_id').limit(1000));all.push(...rows);if(rows.length<1000)return all;last=rows.at(-1).external_id;}
}
async function runById(id){return unwrap(await db.from('intel_sync_runs').select('*').eq('organization_id',org).eq('id',id).single());}
async function startRun(kind,config,cursor){const active=unwrap(await db.from('intel_sync_runs').select('*').eq('organization_id',org).eq('kind',kind).eq('status','running').maybeSingle());if(active){if(config.purpose&&active.config.purpose===config.purpose)return active;throw new Error(`An unrelated ${kind} import is active`);}return unwrap(await db.from('intel_sync_runs').insert({organization_id:org,kind,config,cursor}).select('*').single());}
const hashed=rows=>rows.map(r=>({...r,content_hash:createHash('sha256').update(JSON.stringify({raw:r.raw,data:r.data})).digest('hex')}));
async function commit(run,rows,cursor,done=false){const result=await db.rpc(run.kind==='catalog'?'intel_commit_page':'intel_commit_inventory_page',run.kind==='catalog'?{
 p_org:org,p_run:run.id,p_stage:run.stage,p_offset:run.page_offset,p_rows:hashed(rows),p_next_stage:run.stage+1,p_next_offset:0,p_done:done
 }:{p_org:org,p_run:run.id,p_revision:run.stage,p_rows:hashed(rows),p_cursor:cursor,p_done:done});
 if(result.error)throw new Error(result.error.message);if(result.data!==true)throw new Error('Checkpoint changed concurrently');
 if(run.kind==='catalog'){const saved=await db.from('intel_sync_runs').update({cursor}).eq('id',run.id).eq('organization_id',org).eq('stage',run.stage+1);if(saved.error)throw new Error(saved.error.message);}
}
async function inventoryUntilDone(id){let steps=0;for(;;){const r=await syncInventoryPage(ctx,id);if(++steps%10===0||r.status!=='running')await log({phase:state.phase,inventory:r.progress,status:r.status});if(r.status==='completed')return;if(r.status!=='running')throw new Error('Inventory import is no longer running');}}

await save();await log({state:'started',phase:state.phase,pid:process.pid,cutoff:state.to});
let failures=0;
while(state.phase!=='done'){
 try{
 if(state.phase==='sales'){
  if(!state.salesRun){const current=unwrap(await db.from('intel_sync_runs').select('*').eq('organization_id',org).eq('kind','sales').eq('status','running').maybeSingle());
   if(current&&(current.config.from!==state.from||current.config.to!==state.to))throw new Error('Another sales range is active');
   const run=current||await startRun('sales',{from:state.from,to:state.to,background:true,schemaVersion:1},initialSalesCursor(state.from,state.to));state.salesRun=run.id;await save();}
  const run=await runById(state.salesRun);if(run.status==='completed'){state.phase='inventory';await save();await log({phase:state.phase,salesCompleted:true});continue;}
  if(run.last_error&&run.config.worker?.state==='attention')throw new Error('Sales import needs review before continuing');
  // Sales and inventory have independent checkpoints and can run concurrently.
  state.phase='inventory';await save();continue;
 }
 if(state.phase==='inventory'){
  if(!state.inventoryRun){const r=unwrap(await db.from('intel_sync_runs').select('*').eq('organization_id',org).eq('kind','inventory').eq('status','running').maybeSingle());
   if(!r||r.config.mode!=='history')throw new Error('Expected the existing history checkpoint');state.inventoryRun=r.id;await save();}
  await inventoryUntilDone(state.inventoryRun);state.phase='movement_gaps';await save();continue;
 }
 if(state.phase==='movement_gaps'){
  if(!state.gapsRun){const r=await startRun('inventory',{mode:'history',purpose:'movement_gaps',schemaVersion:1},{source:'receptions',offset:0,expected:null,seen:[],added:0});state.gapsRun=r.id;await save();}
  let run=await runById(state.gapsRun);const knownBySource=new Map();
  while(run.status==='running'){
   const c=structuredClone(run.cursor),resource=`inventory_${c.source}`;
   if(!knownBySource.has(c.source))knownBySource.set(c.source,new Set((await records(resource,'id,external_id,data')).filter(r=>r.data.complete===true).map(r=>r.external_id)));
   const known=knownBySource.get(c.source);
   const page={items:[],count:c.expected};let changed=false;
   for(let n=0;n<10;n++){
    const {raw:p}=await source(`/v1/stocks/${c.source}.json?limit=50&offset=${c.offset}`);
    if(!Array.isArray(p.items)||!Number.isInteger(p.count))throw new Error('Invalid movement list');
    if(c.expected!==null&&c.expected!==p.count){changed=true;break;}
    c.expected=p.count;page.count=p.count;page.items.push(...p.items);c.offset+=p.items.length;
    if(c.offset>=p.count)break;if(!p.items.length)throw new Error('Early empty movement list page');
   }
   if(changed){c.offset=0;c.expected=null;c.seen=[];await commit(run,[],c);run=await runById(run.id);await log({phase:'movement_gaps',state:'source_changed_restarting_scan'});continue;}
   const seen=new Set(c.seen);page.items.forEach(r=>seen.add(String(r.id)));c.seen=[...seen];
   const missing=page.items.filter(r=>!known.has(String(r.id)));
   const collected=await many(missing,async raw=>{const header=movementHeader(c.source,raw),children=[];for(let offset=0;;){const {raw:p}=await source(`/v1/stocks/${c.source}/${header.external_id}/details.json?limit=50&offset=${offset}`);
    if(!Array.isArray(p.items)||!Number.isInteger(p.count))throw new Error('Invalid movement details');children.push(...p.items.map(x=>movementDetail(c.source,raw,x)));offset+=p.items.length;if(offset>=p.count){if(offset!==p.count||new Set(children.map(x=>x.external_id)).size!==p.count)throw new Error('Duplicate movement details');break;}if(!p.items.length)throw new Error('Early empty movement detail page');}
    header.data.complete=true;return [...children,header];});
   c.added+=missing.length;const rows=collected.flat();let done=false;
   if(c.offset>=page.count){if(c.offset!==page.count||seen.size!==page.count)throw new Error('Movement scan count mismatch');
    const check={resource,sourceCount:page.count,importedCount:page.count,newHeaders:c.added,verification:'source_ids_present',checkedAt:new Date().toISOString()};rows.push(inventoryRecord('inventory_checks',check,check,`${run.id}:${resource}`));
    if(c.source==='receptions'){c.source='consumptions';c.offset=0;c.expected=null;c.seen=[];c.added=0;}else done=true;}
   await commit(run,rows,c,done);missing.forEach(r=>known.add(String(r.id)));if(c.offset%500===0||done)await log({phase:'movement_gaps',source:c.source,offset:c.offset,added:c.added,done});run=await runById(run.id);
  }
  if(run.status!=='completed')throw new Error('Movement gap scan was interrupted');
  state.phase='snapshot';await save();continue;
 }
 if(state.phase==='snapshot'){
  if(!state.snapshotRun){const r=await startRun('inventory',{mode:'snapshot',purpose:'completion_snapshot',schemaVersion:1},initialInventoryCursor());state.snapshotRun=r.id;await save();}
  try{
   let run=await runById(state.snapshotRun);
   while(run.status==='running'){
    const c=structuredClone(run.cursor),expected=c.expected??(await source('/v1/stocks.json?limit=1')).raw.count;
    if(!Number.isInteger(expected)||expected<0)throw new Error('Invalid stock source count');
    if(c.phase==='check'){
     const count=await db.from('intel_records').select('id',{head:true,count:'exact'}).eq('organization_id',org).like('resource','inventory_%').eq('resource','inventory_stock').eq('run_id',run.id);if(count.error)throw new Error(count.error.message);
     if(count.count!==expected)throw new Error('Stock source IDs changed');
     const data={resource:'inventory_stock',sourceCount:expected,importedCount:count.count,verification:'unique_id_count',checkedAt:new Date().toISOString()};c.phase='done';c.checkingStock=false;
     await commit(run,[inventoryRecord('inventory_checks',data,data,`${run.id}:inventory_stock`)],c,true);run=await runById(run.id);continue;
    }
    const offsets=[];for(let i=c.offset;i<Math.min(expected,c.offset+500);i+=50)offsets.push(i);
    const pages=await many(offsets,async offset=>{const {raw:p}=await source(`/v1/stocks.json?limit=50&offset=${offset}`);if(p.count!==expected)throw new Error('Stock source count changed');if(!Array.isArray(p.items)||(!p.items.length&&offset<expected))throw new Error('Early empty stock page');return p.items;});
    const items=pages.flat(),now=new Date().toISOString(),rows=items.map(raw=>stockObservation(raw,run.id,now));
    c.expected=expected;c.offset+=items.length;c.stockRows+=items.length;c.phase='stocks';
    const done=c.offset>=expected;
    if(done){if(c.offset!==expected)throw new Error('Stock source IDs changed');c.phase='check';c.checkingStock=true;}
    await commit(run,rows,c,false);await log({phase:'snapshot',offset:c.offset,expected,done:false});run=await runById(run.id);
   }
   if(run.status!=='completed')throw new Error('Stock snapshot was interrupted');
  }catch(error){
   if(!/Stock source (count|IDs) changed|Cambió el total de la fuente/.test(error.message))throw error;
   unwrap(await db.from('intel_sync_runs').update({status:'cancelled',last_error:'Stock changed during this partial capture; superseded by a fresh capture.'}).eq('id',state.snapshotRun).eq('organization_id',org).eq('status','running'));
   state.snapshotRestarts=(state.snapshotRestarts||0)+1;delete state.snapshotRun;await save();
   if(state.snapshotRestarts>5)throw new Error('Stock keeps changing; complete a capture during a quieter window');
   await log({phase:'snapshot',state:'restarting_changed_capture',attempt:state.snapshotRestarts});continue;
  }
  delete state.lastError;state.phase='references';await save();continue;
 }
 if(state.phase==='references'){
  const sales=await runById(state.salesRun);
  if(sales.status!=='completed'){
   if(sales.status!=='running')throw new Error('Recent sales import was interrupted');
   if(sales.last_error&&sales.config.worker?.state==='attention')throw new Error('Sales import needs review before completing references');
   await new Promise(r=>setTimeout(r,5000));continue;
  }
  if(!state.referencesRun){const r=await startRun('catalog',{scope:'catalog',purpose:'historical_references',schemaVersion:1},{phase:'variants',targets:null,offset:0,unavailable:[]});state.referencesRun=r.id;await save();}
  let run=await runById(state.referencesRun);
  while(run.status==='running'){
   const c=structuredClone(run.cursor);let targets=c.targets;
   if(!targets){
    if(c.phase==='variants'){const existing=new Set((await records('variants','id,external_id')).map(r=>r.external_id)),parents=new Map((await records('sales_documents','id,external_id,run_id,documentTypeId:data->>documentTypeId')).filter(r=>r.documentTypeId!=='38').map(r=>[r.external_id,r]));const referenced=new Set();
     for(const resource of ['sales_details','inventory_receptions_details','inventory_consumptions_details','inventory_stock'])for(const r of await records(resource,'id,external_id,run_id,variantId:data->>variantId,documentId:data->>documentId')){
      if(resource==='sales_details'&&parents.get(r.documentId)?.run_id!==r.run_id)continue;if(r.variantId)referenced.add(String(r.variantId));}
     targets=[...referenced].filter(id=>!existing.has(id));
    }else if(c.phase==='products'){const existing=new Set((await records('products','id,external_id')).map(r=>r.external_id));targets=[...new Set((await records('variants','id,external_id,product_id')).map(r=>r.product_id).filter(Boolean))].filter(id=>!existing.has(id));
    }else{const existing=new Set((await records('sales_clients','id,external_id')).map(r=>r.external_id));targets=[...new Set((await records('sales_documents','id,external_id,documentTypeId:data->>documentTypeId,clientId:data->>clientId')).filter(r=>r.documentTypeId!=='38').map(r=>r.clientId).filter(Boolean))].filter(id=>!existing.has(id));}
    c.targets=targets;c.offset=0;
   }
   const chunk=targets.slice(c.offset,c.offset+25),resource=c.phase==='clients'?'sales_clients':c.phase;
   const rows=(await many(chunk,async id=>{const path=c.phase==='products'?`/v1/products/${id}.json?expand=[product_type,brand]`:`/v1/${c.phase}/${id}.json`;const response=await source(path,true);
    if(response.missing){c.unavailable.push({resource,id,status:response.missing});const data={resource,id,httpStatus:response.missing,checkedAt:new Date().toISOString()};return {resource:'historical_reference_checks',external_id:`${resource}:${id}`,name:'',product_id:null,category_id:null,data,raw:data};}
    if(String(response.raw.id)!==id)throw new Error('Source returned another reference ID');return resource==='sales_clients'?salesRecord(resource,response.raw):normalize(resource,response.raw,1,0,process.env.INTEL_STORE_URL||'https://www.dmultisport.cl/');
   }));
   c.offset+=chunk.length;let done=false;
   if(c.offset>=targets.length){state[`${c.phase}Requested`]=targets.length;if(c.phase==='variants')c.phase='products';else if(c.phase==='products')c.phase='clients';else done=true;c.targets=null;c.offset=0;}
   await commit(run,rows,c,done);await save();await log({phase:'references',resource,processed:Math.min((run.cursor.offset||0)+chunk.length,targets.length),total:targets.length,unavailable:c.unavailable.length,done});run=await runById(run.id);
  }
  if(run.status!=='completed')throw new Error('Historical recovery was interrupted');
  delete state.lastError;state.unavailable=run.cursor.unavailable;state.phase='done';state.completedAt=new Date().toISOString();await save();await log({state:'completed',cutoff:state.to,unavailable:state.unavailable.length});continue;
 }
 failures=0;
 }catch(error){
  state.lastError=String(error.message).slice(0,300);await save();await log({state:temporary(error)?'retrying':'attention',phase:state.phase,message:state.lastError});
  if(!temporary(error))throw error;
  await new Promise(r=>setTimeout(r,Math.min(120000,5000*2**Math.min(5,failures++))));
 }
}
