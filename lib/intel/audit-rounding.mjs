// Read-only follow-up for every stored header/line difference in the full audit.
import { readFile, writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { amount, moneyEqual } from './audit-core.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const path=new URL('../../private/intel-full-audit-20261027.json',import.meta.url);
const report=JSON.parse(await readFile(path,'utf8'));
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.FACTO_BACKEND_SECRET,{auth:{persistSession:false}});
const org=(await db.from('organizations').select('id').eq('slug','facto-compartido').single()).data.id;
const ids=report.lines.headerVsLines.map(r=>r.documentId);
const saved=await db.from('intel_records').select('external_id,data,run_id').eq('organization_id',org).eq('resource','sales_details')
    .like('resource','sales_%').in('data->>documentId',ids).limit(1000);
if(saved.error)throw new Error(saved.error.message);
if(saved.data.length>=1000)throw new Error('Local sample truncated');
async function get(path){const r=await fetch(`https://api.bsale.io${path}`,{headers:{access_token:process.env.BSALE_TOKEN},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`Bsale HTTP ${r.status}`);return r.json();}
let next=0;const checks=[];
await Promise.all(Array.from({length:3},async()=>{while(next<ids.length){const id=ids[next++],raw=await get(`/v1/documents/${id}.json?expand=[details]`);
 let remote=raw.details?.items;
 if(!Array.isArray(remote)||raw.details.count==null||raw.details.count!==remote.length){remote=[];for(let offset=0;;){const p=await get(`/v1/documents/${id}/details.json?limit=50&offset=${offset}`);if(!Array.isArray(p.items)||!Number.isInteger(p.count))throw new Error('Invalid detail pagination');remote.push(...p.items);offset+=p.items.length;if(offset>=p.count)break;if(!p.items.length)throw new Error('Early empty detail page');}}
 const local=saved.data.filter(r=>r.data.documentId===id),map=new Map(local.map(r=>[r.external_id.split(':')[1],r.data]));
 const matches=remote.length===local.length&&remote.every(r=>{const d=map.get(String(r.id));return d&&Object.entries({quantity:'quantity',net:'netAmount',tax:'taxAmount',total:'totalAmount',netDiscount:'netDiscount',totalDiscount:'totalDiscount',netUnitValue:'netUnitValue',totalUnitValue:'totalUnitValue'}).every(([k,v])=>(amount(d[k])===null&&amount(r[v])===null)||moneyEqual(d[k],r[v]))&&String(d.variantId)===String(r.variant?.id??null);});
 const difference=Math.round((remote.reduce((n,r)=>n+Number(r.totalAmount),0)-Number(raw.totalAmount))*100)/100;
 checks.push({documentId:id,linesMatchSource:matches,sourceLineVsHeaderDifference:difference,sameDifferenceAsStored:difference===report.lines.headerVsLines.find(r=>r.documentId===id).difference});
}}));
report.roundingFollowUp={checkedAt:new Date().toISOString(),checkedDocuments:checks.length,allLinesMatchSource:checks.every(r=>r.linesMatchSource),allDifferencesAlsoExistInBsale:checks.every(r=>r.sameDifferenceAsStored),checks};
await writeFile(path,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report.roundingFollowUp,checks:undefined}));
