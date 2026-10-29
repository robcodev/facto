// Local, trusted operator entry point. Uses the same importer as the signed-in UI.
// node lib/intel/inventory-runner.mjs snapshot|history [maxSteps]
// No credentials, raw records or customer data are printed.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd(), true);
const mode = process.argv[2], maxSteps = Number(process.argv[3] ?? 10);
if (!['snapshot','history'].includes(mode) || !Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 500) throw new Error('Use snapshot|history and 1–500 steps.');
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const read = name => readFile(new URL(name,import.meta.url),'utf8');
const normalize = compile(await read('./normalize.ts'));
const core = compile((await read('./inventory-core.ts')).replace("'./normalize'",JSON.stringify(normalize)));
const sales = compile((await read('./sales-core.ts')).replace("'./normalize'",JSON.stringify(normalize)));
const shared = compile((await read('./server.ts')).replace("import 'server-only';",'')
    .replace("import { createClient } from '@/lib/supabase/server';",'const createClient = () => { throw new Error("CLI does not use browser auth"); };')
    .replace("import { createAdminClient } from '@/lib/supabase/admin';",'const createAdminClient = () => { throw new Error("CLI context supplied explicitly"); };')
    .replace("'./normalize'",JSON.stringify(normalize)));
const server = compile((await read('./inventory-server.ts')).replace("import 'server-only';",'')
    .replace("'./server'",JSON.stringify(shared)).replace("'./normalize'",JSON.stringify(normalize)).replace("'./sales-core'",JSON.stringify(sales)).replace("'./inventory-core'",JSON.stringify(core)));
const {syncInventoryPage} = await import(server);
const {initialInventoryCursor} = await import(core);
const key = process.env.FACTO_BACKEND_SECRET;
if (!key) throw new Error('Missing server key.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false}});
const org = await db.from('organizations').select('id').eq('slug','facto-compartido').single();
if(org.error)throw new Error(org.error.message);
const ctx={db,orgId:Number(org.data.id)};
let result=await db.from('intel_sync_runs').select('*').eq('organization_id',ctx.orgId).eq('kind','inventory').eq('status','running').maybeSingle();
if(result.error)throw new Error(result.error.message);
if(result.data&&result.data.config.mode!==mode)throw new Error('An inventory import with another mode is running. Resume it in Intel.');
if(!result.data)result=await db.from('intel_sync_runs').insert({organization_id:ctx.orgId,kind:'inventory',config:{mode,schemaVersion:1},cursor:initialInventoryCursor()}).select('*').single();
if(result.error)throw new Error(result.error.message);
for(let i=0;i<maxSteps;i++){
    const run=await syncInventoryPage(ctx,result.data.id);
    if(i%10===0||run.status==='completed')console.log(JSON.stringify(run));
    if(run.status!=='running')break;
}
