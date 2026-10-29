// Trusted operator process. No browser, localhost server or Vercel session required.
// node lib/intel/sales-runner.mjs [--adopt] [--once]
import { readFile, mkdir, stat, rename, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd(), true);
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const read = name => readFile(new URL(name,import.meta.url),'utf8');
const normalize = compile(await read('./normalize.ts'));
const core = compile((await read('./sales-core.ts')).replace("'./normalize'",JSON.stringify(normalize)));
const batch = compile((await read('./sales-batch.ts')).replace("'./normalize'",JSON.stringify(normalize)).replace("'./sales-core'",JSON.stringify(core)));
const shared = compile((await read('./server.ts')).replace("import 'server-only';",'')
    .replace("import { createClient } from '@/lib/supabase/server';",'const createClient = () => { throw new Error("CLI has no browser session"); };')
    .replace("import { createAdminClient } from '@/lib/supabase/admin';",'const createAdminClient = () => { throw new Error("CLI context supplied explicitly"); };')
    .replace("'./normalize'",JSON.stringify(normalize)));
const sales = compile((await read('./sales-server.ts')).replace("import 'server-only';",'')
    .replace("'./server'",JSON.stringify(shared)).replace("'./normalize'",JSON.stringify(normalize)).replace("'./sales-core'",JSON.stringify(core)).replace("'./sales-batch'",JSON.stringify(batch)));
const worker = compile((await read('./sales-worker.ts')).replace("'./normalize'",JSON.stringify(normalize)).replace("'./sales-server'",JSON.stringify(sales)));
const { salesWorkerTick } = await import(worker);
if (!process.env.FACTO_BACKEND_SECRET || !process.env.BSALE_TOKEN || !process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('Faltan las credenciales del servidor de Facto.');
// Bound every network operation, including Supabase, so a stalled socket can retry.
const boundedFetch = (input, init = {}) => fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal,AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.FACTO_BACKEND_SECRET,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
const organization = await db.from('organizations').select('id').eq('slug','facto-compartido').single();
if (organization.error) throw new Error(organization.error.message);
const ctx = { db, orgId: Number(organization.data.id), canEdit: true };
const logPath = resolve('private/intel-sales-worker.log');
await mkdir(resolve('private'),{recursive:true});
async function log(event) {
    if ((await stat(logPath).catch(()=>null))?.size > 2_000_000) await rename(logPath,`${logPath}.previous`).catch(()=>{});
    const line=JSON.stringify({at:new Date().toISOString(),...event});
    await appendFile(logPath,line+'\n'); console.log(line);
}
if (process.argv.includes('--adopt')) {
    const current = await db.from('intel_sync_runs').select('*').eq('organization_id',ctx.orgId).eq('kind','sales').eq('status','running').maybeSingle();
    if(current.error)throw new Error(current.error.message);
    if(current.data){
        const r=current.data;
        const enabled=await db.from('intel_sync_runs').update({config:{...r.config,background:true}}).eq('id',r.id).eq('config',JSON.stringify(r.config));
        if(enabled.error)throw new Error(enabled.error.message);
    }
}
await log({state:'started',pid:process.pid});
let stopped=false, count=0;
process.on('SIGINT',()=>{stopped=true;}); process.on('SIGTERM',()=>{stopped=true;});
do {
    let wait=100;
    try {
        const result=await salesWorkerTick(ctx);
        if(count++%10===0 || ['retrying','attention','completed'].includes(result.state)) await log(result);
        if(['idle','waiting'].includes(result.state)) wait=5000;
    } catch {
        // No raw database/source errors or customer data in logs.
        await log({state:'connection_retry',retryInSeconds:15}); wait=15000;
    }
    if(process.argv.includes('--once')) break;
    if(!stopped) await new Promise(done=>setTimeout(done,wait));
} while(!stopped);
