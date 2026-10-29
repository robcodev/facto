import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role; create table organizations(id bigint primary key); insert into organizations values(1),(2);');
for (const file of ['20261015175055_create_intel_catalog.sql','20261015182904_intel_sales_history.sql','20261020141204_intel_inventory_history.sql','20261026151115_intel_current_records_only.sql']) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const normalize = compile(await readFile(new URL('./normalize.ts',import.meta.url),'utf8'));
const core = compile((await readFile(new URL('./inventory-core.ts',import.meta.url),'utf8')).replace("'./normalize'",JSON.stringify(normalize)));
const sales = compile((await readFile(new URL('./sales-core.ts',import.meta.url),'utf8')).replace("'./normalize'",JSON.stringify(normalize)));
const {initialInventoryCursor, stockObservation, movementDetail, inventoryDiagnostic} = await import(core);
const stock = {id:1,quantity:3,quantityReserved:1,quantityAvailable:2,variant:{id:5},office:{id:1}};
assert.throws(()=>stockObservation({...stock,quantityAvailable:null},'x','now'),/ausente/);
assert.equal(stockObservation({...stock,quantityAvailable:0},'x','now').data.available,0);
const parent={id:7,admissionDate:1704067200,consumptionDate:1704067200,office:{id:1},updateStock:1};
assert.equal(movementDetail('receptions',parent,{id:1,variant:{id:5},quantity:2,cost:0}).data.cost,0);
assert.equal(inventoryDiagnostic([],null).reconstructedPhysical,null);
function table(name) {
    const filters=[]; let update, head=false, range, order;
    const q={
        select(_s,o){head=!!o?.head;return q;},eq(k,v){filters.push([k,v]);return q;},
        like(k,v){assert.equal(k,'resource');assert.equal(v,'inventory_%');return q;},
        update(v){update=v;return q;},order(k){order=k;return q;},range(a,b){range=[a,b];return q;},
        single:async()=>{const r=await execute();return {data:r.rows[0],error:null};},
        then(resolve,reject){return execute().then(r=>({data:r.rows,count:head?Number(r.rows[0].count):null,error:null})).then(resolve,reject);},
    };
    async function execute(){
        const args=[];
        const where=filters.map(([k,v])=>{args.push(v);return `${k.includes('->>')?`data->>'${k.split('->>')[1]}'`:k}=$${args.length}`;}).join(' and ')||'true';
        if(update){const changes=Object.entries(update).map(([k,v])=>{args.push(v);return `${k}=$${args.length}`;}).join(',');return db.query(`update ${name} set ${changes} where ${where} returning *`,args);}
        return db.query(`select ${head?'count(*)':'*'} from ${name} where ${where}${order?` order by ${order}`:''}${range?` limit ${range[1]-range[0]+1} offset ${range[0]}`:''}`,args);
    }
    return q;
}
let fail=true, expanded=false;
const paths=[];
const bsale=async path=>{
    paths.push(path);
    const url=new URL(path,'https://api.bsale.io');
    const offset=Number(url.searchParams.get('offset'));
    if(url.pathname==='/v1/stocks.json')return {count:1,items:[stock]};
    if(url.pathname.endsWith('/receptions.json'))return {count:1,items:[expanded?{...parent,details:{count:1,offset:0,items:[{id:1,variant:{id:5},quantity:1,cost:4}]}}:parent]};
    if(url.pathname.endsWith('/consumptions.json'))return {count:0,items:[]};
    if(url.pathname.endsWith('/details.json')){
        if(offset===50&&fail){fail=false;throw new Error('timeout-test');}
        return {count:51,items:Array.from({length:51},(_,i)=>({id:i+1,variant:{id:5},quantity:1,cost:4,variantStock:10})).slice(offset,offset+50)};
    }
    throw new Error(path);
};
const fakeDb={from:table,async rpc(_name,p){return {data:(await db.query('select intel_commit_inventory_page($1,$2,$3,$4,$5,$6) applied',[p.p_org,p.p_run,p.p_revision,JSON.stringify(p.p_rows),JSON.stringify(p.p_cursor),p.p_done])).rows[0].applied,error:null};}};
globalThis.inventoryHooks={bsale};
const server=compile((await readFile(new URL('./inventory-server.ts',import.meta.url),'utf8')).replace("import 'server-only';",'')
    .replace(/import \{ bsale, type IntelContext \} from '\.\/server';/,'const {bsale}=globalThis.inventoryHooks; type IntelContext=any;')
    .replace("'./normalize'",JSON.stringify(normalize)).replace("'./sales-core'",JSON.stringify(sales)).replace("'./inventory-core'",JSON.stringify(core)));
const {syncInventoryPage}=await import(server);
async function start(mode){return (await db.query("insert into intel_sync_runs(organization_id,kind,config,cursor) values(1,'inventory',$1,$2) returning id",[JSON.stringify({mode}),JSON.stringify(initialInventoryCursor())])).rows[0].id;}
const run=await start('history');let completed=false,errors=0;
for(let i=0;i<20;i++){try{const r=await syncInventoryPage({db:fakeDb,orgId:1},run);if(r.status==='completed'){completed=true;break;}}catch(e){assert.match(e.message,/timeout-test/);errors++;}}
assert.ok(completed);assert.equal(errors,1);
assert.equal((await db.query("select count(*)::int n from intel_records where resource='inventory_receptions_details'")).rows[0].n,51);
assert.equal((await db.query("select count(*)::int n from intel_records where resource='inventory_checks'")).rows[0].n,3,'stock and both movement sources verified, including empty source');
assert.equal((await db.query("select intel_commit_inventory_page(1,$1,0,'[]','{}',false) applied",[run])).rows[0].applied,false);
const snapshot=await start('snapshot');const before=paths.length;
for(let i=0;i<5;i++){const r=await syncInventoryPage({db:fakeDb,orgId:1},snapshot);if(r.status==='completed')break;}
assert.equal(paths.length-before,1,'snapshot never imports movement history');
expanded=true;
const expandedRun=await start('history'), expandedBefore=paths.length;
for(let i=0;i<8;i++){const r=await syncInventoryPage({db:fakeDb,orgId:1},expandedRun);if(r.status==='completed')break;}
assert.ok(paths.slice(expandedBefore).every(path=>!path.includes('/details.json')),'complete expansions avoid extra requests');
assert.equal((await db.query("select count(*)::int n from intel_records where resource='inventory_receptions_details' and run_id=$1",[expandedRun])).rows[0].n,1,'only current-run details are displayed after a changed source');
assert.equal((await db.query("select count(*)::int n from intel_records where resource='inventory_stock'")).rows[0].n,3,'snapshots never overwrite earlier observations');
assert.equal((await db.query('select count(*)::int n from intel_record_versions')).rows[0].n,0,'stock and movement history need no duplicate full-row versions');
assert.equal((await db.query("select intel_commit_inventory_page(2,$1,0,'[]','{}',false) applied",[snapshot])).rows[0].applied,false);
await db.exec('set role anon');
await assert.rejects(()=>db.query("select intel_commit_inventory_page(1,$1,0,'[]','{}',false)",[run]),/permission denied/);
await db.exec('reset role');
console.log('Inventory passed: migrations, 51 lines, timeout/resume, empty source, counts, snapshots, zero/missing costs, replay and tenant/anonymous isolation.');
delete globalThis.inventoryHooks;
await db.close();
