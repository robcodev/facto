// Full imported-range audit: SELECT/GET only; aggregate report contains no customer data.
// node lib/intel/audit-complete.mjs
import { writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { reconcileHeaders, sumAmounts, moneyFields, moneyEqual, amount, compareSummary } from './audit-core.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
if(!process.env.FACTO_BACKEND_SECRET||!process.env.BSALE_TOKEN)throw new Error('Missing server credentials');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.FACTO_BACKEND_SECRET,{auth:{persistSession:false},global:{fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(60_000)})}});
const unwrap=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const org=unwrap(await db.from('organizations').select('id').eq('slug','facto-compartido').single()).id;
const run=unwrap(await db.from('intel_sync_runs').select('*').eq('organization_id',org).eq('kind','sales').order('started_at',{ascending:false}).limit(1).single());
if(run.status!=='completed')throw new Error('The latest import must be complete before auditing its full range');
const from=run.config.from,to=run.config.to;
const base=(resource,fields='id,external_id,product_id,data,run_id')=>db.from('intel_records').select(fields).eq('organization_id',org).eq('resource',resource);
// Match the existing unique index (organization, source, resource, external_id).
async function pages(make){let last='';const all=[];for(;;){const page=unwrap(await make().eq('source','bsale').gt('external_id',last).order('external_id').limit(500));all.push(...page);if(page.length<500)return all;last=page.at(-1).external_id;}}
async function remote(path){for(let i=0;i<3;i++){
 try{const r=await fetch(`https://api.bsale.io${path}`,{headers:{access_token:process.env.BSALE_TOKEN},signal:AbortSignal.timeout(20000)});
 if(!r.ok){if([429,500,502,503,504].includes(r.status)&&i<2){await new Promise(done=>setTimeout(done,1000*(i+1)));continue;}throw new Error(`Bsale HTTP ${r.status}`);}return await r.json();
 }catch(e){if(i===2||!/(fetch failed|timeout|abort)/i.test(`${e.name} ${e.message}`))throw e;await new Promise(done=>setTimeout(done,1000*(i+1)));}
}}
async function sourcePages(path){let offset=0,expected;const all=[];for(;;){const body=await remote(`${path}${path.includes('?')?'&':'?'}limit=50&offset=${offset}`);
 if(!Array.isArray(body.items)||!Number.isInteger(body.count)||body.count<0)throw new Error('Invalid source pagination');
 if(expected!==undefined&&body.count!==expected)throw new Error('Source count changed');expected=body.count;
 if(!body.items.length&&offset<expected)throw new Error('Early empty source page');all.push(...body.items);offset+=body.items.length;
 if(offset>=expected){if(offset!==expected||new Set(all.map(r=>String(r.id))).size!==expected)throw new Error('Duplicate or extra source rows');return all;}
}}
console.log('Reading stored headers, lines and reference IDs (no raw payload download)...');
const readers=[
 ()=>pages(()=>base('sales_documents')),()=>pages(()=>base('sales_details')),()=>pages(()=>base('sales_clients','id,external_id')),
 ()=>pages(()=>base('variants','id,external_id,product_id')),()=>pages(()=>base('products','id,external_id')),
 ()=>pages(()=>base('sales_document_types')),()=>pages(()=>base('sales_excluded','id,external_id,data')),()=>pages(()=>base('sales_windows')),
 ()=>db.from('intel_sync_runs').select('id,kind,status,last_error,completed_at').eq('organization_id',org).order('started_at').then(unwrap)
];
const values=[];let readIndex=0;
await Promise.all(Array.from({length:2},async()=>{while(readIndex<readers.length){const i=readIndex++;values[i]=await readers[i]();console.log(`Local resource ${i+1}/${readers.length}: ${values[i].length} rows`);}}));
const [documents,lines,clients,variants,products,masters,excluded,windows,runs]=values;
const relevant=documents.filter(r=>r.data.emissionDay>=from&&r.data.emissionDay<=to);
const eligible=relevant.filter(r=>String(r.data.documentTypeId)!=='38');
const parentMap=new Map(eligible.map(r=>[r.external_id,r])),allParents=new Map(documents.map(r=>[r.external_id,r]));
const currentLines=lines.filter(r=>parentMap.get(r.data.documentId)?.run_id===r.run_id);
const byParent=new Map();for(const line of currentLines){const id=line.data.documentId;if(!byParent.has(id))byParent.set(id,[]);byParent.get(id).push(line);}
const clientIds=new Set(clients.map(r=>r.external_id)),variantMap=new Map(variants.map(r=>[r.external_id,r])),productIds=new Set(products.map(r=>r.external_id));
const missingVariants=new Set(currentLines.filter(r=>r.data.variantId&&!variantMap.has(String(r.data.variantId))).map(r=>String(r.data.variantId)));
const missingClients=new Set(eligible.filter(r=>r.data.clientId&&!clientIds.has(String(r.data.clientId))).map(r=>String(r.data.clientId)));
const difference=eligible.flatMap(r=>{const rows=byParent.get(r.external_id)||[];if(!rows.length)return [];
 if(rows.some(row=>amount(row.data.total)===null))return [{documentId:r.external_id,reason:'missing_line_total'}];
 const total=rows.reduce((n,row)=>n+Number(row.data.total),0);return moneyEqual(total,r.data.total)?[]:[{documentId:r.external_id,typeId:r.data.documentTypeId,difference:Math.round((total-Number(r.data.total))*100)/100}];});
const types=new Map(masters.map(r=>[r.external_id,r.data]));
const report={startedAt:new Date().toISOString(),readOnly:true,period:{from,to},run:{status:run.status,completedAt:run.completed_at,completedDocuments:run.cursor.completedDocuments,completedWindows:run.cursor.completedWindows,lastError:run.last_error},
 coverage:{storedHeaders:relevant.length,nonPresaleHeaders:eligible.length,incompleteNonPresale:eligible.filter(r=>r.data.complete!==true).length,legacyPresales:relevant.length-eligible.length,excludedMarkers:excluded.filter(r=>r.data.emissionDay>=from&&r.data.emissionDay<=to).length,storedWindows:windows.length},
 lines:{current:currentLines.length,staleRowsForNonPresale:lines.filter(r=>parentMap.has(r.data.documentId)&&parentMap.get(r.data.documentId).run_id!==r.run_id).length,orphanRows:lines.filter(r=>!allParents.has(r.data.documentId)).length,
 documentsWithoutLines:eligible.filter(r=>!byParent.has(r.external_id)).map(r=>r.external_id),headerVsLines:difference,
 missingQuantity:currentLines.filter(r=>amount(r.data.quantity)===null).length,missingNet:currentLines.filter(r=>amount(r.data.net)===null).length,missingDiscount:currentLines.filter(r=>amount(r.data.netDiscount)===null).length,noVariant:currentLines.filter(r=>!r.data.variantId).length},
 links:{missingVariants:missingVariants.size,linesWithMissingVariants:currentLines.filter(r=>missingVariants.has(String(r.data.variantId))).length,missingProductParents:variants.filter(r=>!productIds.has(r.product_id)).length,
 missingClients:missingClients.size,documentsWithMissingClients:eligible.filter(r=>missingClients.has(String(r.data.clientId))).length,documentsWithoutClient:eligible.filter(r=>!r.data.clientId).length,documentsWithoutSeller:eligible.filter(r=>!r.data.sellers?.length).length,documentsWithoutExplicitChannel:eligible.filter(r=>!r.data.channel).length},
 runs,months:[],liveLineSamples:[],referenceSamples:[]};
const intervals=[];for(let start=from;start<=to;){const d=new Date(start),end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);const last=end<to?end:to;intervals.push({from:start,to:last});start=new Date(Date.parse(last)+86400000).toISOString().slice(0,10);}
let next=0;
async function auditMonth(){while(next<intervals.length){const period=intervals[next++],begin=Date.parse(period.from)/1000,end=Date.parse(period.to)/1000+86399;
 const source=await sourcePages(`/v1/documents.json?emissiondaterange=[${begin},${end}]`),local=relevant.filter(r=>r.data.emissionDay>=period.from&&r.data.emissionDay<=period.to);
 const reconciliation=reconcileHeaders(source,local,new Set(excluded.map(r=>r.external_id)));
 const byType=[...new Set(source.map(r=>String(r.document_type?.id)))].filter(id=>id!=='38').map(typeId=>({typeId,name:types.get(typeId)?.name,
 source:sumAmounts(source.filter(r=>String(r.document_type?.id)===typeId),(r,f)=>r[moneyFields[f]]),stored:sumAmounts(local.filter(r=>String(r.data.documentTypeId)===typeId),(r,f)=>r.data[f])}));
 const summary=await remote(`/v1/documents/summary.json?emissiondaterange=[${begin},${end}]`);
 if(!Array.isArray(summary))throw new Error('Invalid official summary');
 const result={...period,reconciliation,byType,officialSummary:compareSummary(summary,byType)};report.months.push(result);
 console.log(JSON.stringify({period:period.from,source:source.length,compared:reconciliation.compared,matches:reconciliation.matches,differences:reconciliation.differences.length,summaryMatches:result.officialSummary.every(r=>r.matches)}));
}}
// Two source lanes; no calls or writes to the importer itself.
await Promise.all([auditMonth(),auditMonth()]);report.months.sort((a,b)=>a.from.localeCompare(b.from));
const samples=new Map();for(const r of eligible){const old=samples.get(r.data.documentTypeId);if(!old||(byParent.get(r.external_id)?.length??0)>(byParent.get(old.external_id)?.length??0))samples.set(r.data.documentTypeId,r);}
for(const row of samples.values()){
 const remoteLines=await sourcePages(`/v1/documents/${row.external_id}/details.json`),saved=byParent.get(row.external_id)||[],savedMap=new Map(saved.map(r=>[r.external_id.split(':')[1],r]));
 const different=remoteLines.filter(r=>{const d=savedMap.get(String(r.id))?.data;return !d||['quantity','netUnitValue','totalUnitValue','netDiscount','totalDiscount'].some(f=>amount(d[f])!==null||amount(r[f])!==null?!moneyEqual(d[f],r[f]):false)||['net','tax','total'].some(f=>!moneyEqual(d[f],r[moneyFields[f]]))||String(d.variantId)!==String(r.variant?.id??null);});
 report.liveLineSamples.push({typeId:row.data.documentTypeId,documentId:row.external_id,sourceLines:remoteLines.length,storedLines:saved.length,mismatchedLines:different.length});
}
for(const [resource,ids] of [['variants',[...missingVariants].slice(0,5)],['clients',[...missingClients].slice(0,5)]])for(const id of ids){
 const r=await fetch(`https://api.bsale.io/v1/${resource}/${id}.json`,{headers:{access_token:process.env.BSALE_TOKEN},signal:AbortSignal.timeout(20000)});
 report.referenceSamples.push({resource,status:r.status});
}
const finalRun=unwrap(await db.from('intel_sync_runs').select('stage,updated_at,status').eq('id',run.id).single());
report.importChangedDuringAudit=finalRun.stage!==run.stage||finalRun.updated_at!==run.updated_at||finalRun.status!==run.status;
report.summary={allWindowsCovered:intervals.length===run.cursor.completedWindows&&report.months.length===intervals.length,sourceCount:report.months.reduce((n,r)=>n+r.reconciliation.sourceCount,0),
 missingDocuments:report.months.reduce((n,r)=>n+r.reconciliation.missing.length,0),extraDocuments:report.months.reduce((n,r)=>n+r.reconciliation.extra.length,0),headerDifferences:report.months.reduce((n,r)=>n+r.reconciliation.differences.length,0),
 allHeadersMatch:report.months.every(r=>r.reconciliation.matches),allReturnedSummariesMatch:report.months.every(r=>r.officialSummary.every(g=>g.matches)),liveLineSamplesMatch:report.liveLineSamples.every(r=>r.mismatchedLines===0&&r.sourceLines===r.storedLines)};
report.finishedAt=new Date().toISOString();report.limitations=['Only sampled lines compared live; all stored eligible line totals checked.','Legacy presales retained, excluded from non-presale metrics.','No revenue-sign/cancellation or historic-margin certification.','Current API may differ after original import.'];
await writeFile(new URL('../../private/intel-full-audit-20261027.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({summary:report.summary,coverage:report.coverage,lines:report.lines,links:report.links,samples:report.liveLineSamples,importChanged:report.importChangedDuringAudit,finishedAt:report.finishedAt},null,2));
