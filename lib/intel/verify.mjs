// Run: node lib/intel/verify.mjs <absolute path to @electric-sql/pglite/dist/index.js>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create table public.organizations(id bigint primary key);
insert into public.organizations values(1),(2);`);
await db.exec(await readFile(new URL('../../supabase/migrations/20261015175055_create_intel_catalog.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/20261026151115_intel_current_records_only.sql', import.meta.url), 'utf8'));
const source = await readFile(new URL('./normalize.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { normalize, safeUrl } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const web = normalize('web', { id: 4, productId: 1071, link: 'product/cana', urlImg: 'https://images.example/a.png', pictures: [{ id: 1, href: 'https://images.example/b.png', legendImage: 'SKU-1' }], descriptions: [{ html: '<p>Ficha</p>' }] }, 1, 2, 'https://www.dmultisport.cl/');
assert.equal(web.data.url, 'https://www.dmultisport.cl/product/cana');
assert.equal(web.data.images.length, 2);
assert.equal(web.raw.descriptions[0].html, '<p>Ficha</p>');
assert.equal(safeUrl('javascript:alert(1)'), null);
assert.throws(() => normalize('stocks', { id: 1, variant: { id: 5 } }, 1, 2, ''), /cantidad/);
const stock = { ...normalize('stocks', { id: 1, variant: { id: 5 }, quantityAvailable: 0 }, 1, 2, ''), content_hash: 'zero' };
async function start() { return (await db.query('insert into public.intel_sync_runs(organization_id,office_id,price_list_id) values(1,1,2) returning id')).rows[0].id; }
async function commit(run, page, org = 1) { return (await db.query('select public.intel_commit_page($1,$2,0,0,$3,10,0,true) as applied', [org, run, JSON.stringify(page)])).rows[0].applied; }
const run = await start();
assert.equal(await commit(run, [stock], 2), false, 'wrong organization cannot advance checkpoint');
assert.equal(await commit(run, [stock]), true);
assert.equal(await commit(run, [stock]), false, 'replaying committed page is harmless');
assert.equal((await db.query('select count(*)::int n from public.intel_records')).rows[0].n, 1);
assert.equal((await db.query('select available::float n from public.intel_stock_daily')).rows[0].n, 0);
await db.exec("insert into public.intel_category_settings(organization_id,category_id,included,editorial_name) values(1,'27',false,'Pesca')");
const second = await start();
await commit(second, [stock]);
assert.equal((await db.query('select count(*)::int n from public.intel_record_versions')).rows[0].n, 0, 'insert and unchanged data do not add versions');
const third = await start();
await commit(third, [{ ...stock, data: { ...stock.data, available: 8 }, content_hash: 'eight' }]);
assert.equal((await db.query('select count(*)::int n from public.intel_record_versions')).rows[0].n, 0, 'changed data updates only the current record');
assert.equal((await db.query('select count(*)::int n from public.intel_stock_daily')).rows[0].n, 1, 'one capture per Chilean day');
assert.equal((await db.query('select available::float n from public.intel_stock_daily')).rows[0].n, 8);
assert.equal((await db.query('select included from public.intel_category_settings')).rows[0].included, false);
const fourth = await start();
await assert.rejects(() => commit(fourth, [{ ...stock, data: { ...stock.data, available: 'invalid' }, content_hash: 'bad' }]));
assert.equal((await db.query('select stage from public.intel_sync_runs where id=$1', [fourth])).rows[0].stage, 0, 'failure keeps checkpoint');
assert.equal((await db.query('select content_hash from public.intel_records')).rows[0].content_hash, 'eight', 'failure rolls back the whole page');
await db.exec('set role anon');
await assert.rejects(() => db.query('select * from public.intel_records'), /permission denied/);
await db.exec('reset role');
await db.exec(await readFile(new URL('../../supabase/migrations/20261015182904_intel_sales_history.sql', import.meta.url), 'utf8'));
const normalizeUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
const coreSource = (await readFile(new URL('./sales-core.ts', import.meta.url), 'utf8')).replace("'./normalize'", JSON.stringify(normalizeUrl));
const coreJS = ts.transpileModule(coreSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const coreUrl = `data:text/javascript;base64,${Buffer.from(coreJS).toString('base64')}`;
const batchSource=(await readFile(new URL('./sales-batch.ts',import.meta.url),'utf8')).replace("'./normalize'",JSON.stringify(normalizeUrl)).replace("'./sales-core'",JSON.stringify(coreUrl));
const batchJS=ts.transpileModule(batchSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const batchUrl=`data:text/javascript;base64,${Buffer.from(batchJS).toString('base64')}`;
const { salesRecord, initialSalesCursor, sourcePage, windowEnd } = await import(coreUrl);
assert.equal(windowEnd('2024-02-15', '2024-03-31'), '2024-02-29');
assert.equal(windowEnd('2024-02-15', '2024-02-20'), '2024-02-20');
assert.throws(() => initialSalesCursor('2024-02-30', '2024-03-01'));
assert.throws(() => sourcePage({ items: [], count: 51 }, 50));
assert.equal(sourcePage({ items: [{id:1}], count: 51 }, 50).end, true);
const sale = salesRecord('sales_documents', { id: 99, emissionDate: Date.parse('2024-02-01')/1000, totalAmount: 119, netAmount: 100, userId: 5, salesId: 123, document_type: { id: 38, isSalesNote: 1 } });
assert.equal(sale.data.emissionDay, '2024-02-01', 'emission date must not shift to previous day in Chile');
assert.equal(sale.data.channel, null, 'salesId is not a channel');
assert.equal(sale.data.issuerId, '5');
assert.equal(sale.data.complete, false);
assert.equal(salesRecord('sales_details', { id: 1, quantity: 0, totalAmount: 0 }, '99').data.total, 0);

// Exercise the actual resumable server against isolated PostgreSQL and a paginated source.
const documents = [1, 2, 3].map(id => ({ id, emissionDate: Date.parse('2024-02-01') / 1000, number: id, totalAmount: 119, document_type: { id: id === 3 ? 38 : 1, name: id === 3 ? 'Preventa' : 'Boleta', isSalesNote: id === 3 ? 1 : 0 }, client: {id: 10}, user: { id: 9 } }));
let failOnce = true, expandRelations = false, expandedLists = false;
const fakeBsale = async path => {
    const u = new URL(path, 'https://api.bsale.io');
    const offset = Number(u.searchParams.get('offset') || 0);
    if (u.pathname === '/v1/clients.json') return { items: [{id:10,firstName:'Cliente',lastName:'Prueba'}],count:1 };
    if (['/v1/users.json','/v1/offices.json','/v1/document_types.json'].includes(u.pathname)) return { items: [{id:1,name:'Master'}],count:1 };
    if (u.pathname === '/v1/documents.json') return { items: expandedLists ? documents.map(doc=>({...doc,
        details:{count:51,items:Array.from({length:51},(_,i)=>({id:i+1,quantity:1,totalAmount:119,variant:{id:4,code:'OLD-SKU'}}))},
        sellers:{count:2,items:[{id:7,firstName:'Daniela'},{id:8,firstName:'Otro vendedor'}]},
        references:{count:0,items:[]},document_taxes:{count:0,items:[]},attributes:{count:0,items:[]},payments:[]
    })) : documents.map(({id})=>({id})), count:3 };
    const match = u.pathname.match(/^\/v1\/documents\/(\d+)(?:\/(\w+))?\.json$/);
    assert.ok(match, path);
    if (!match[2]) {
        assert.equal(expandedLists,false,'complete list batches never re-fetch individual headers');
        const doc = documents[Number(match[1])-1];
        if (!expandRelations) return doc;
        return { ...doc, details: {count:51,offset:0,items:[{id:1}]},
            sellers:{count:2,offset:0,items:[{id:7,firstName:'Daniela'}, {id:8,firstName:'Otro vendedor'}]},
            references:{count:0,items:[]},document_taxes:{count:0,items:[]},attributes:{count:0,items:[]},payments:[] };
    }
    if (match[2] === 'details') {
        if (offset === 50 && failOnce) { failOnce=false; throw new Error('simulated source timeout'); }
        const lines = Array.from({ length: 51 }, (_,i)=>({id:i+1, quantity:1, totalAmount:119, variant:{id:4, code:'OLD-SKU'}}));
        return { items:lines.slice(offset,offset+50),count:51 };
    }
    if (match[2] === 'sellers') return { items: [{id:7,firstName:'Daniela'}, {id:8,firstName:'Otro vendedor'}],count:2 };
    return { items:[],count:0 };
};
function table(name) {
    const filters = []; let update; let head = false;
    const q = {
        select(_s, options) { head=!!options?.head;return q; },
        eq(key,value) { filters.push([key,'=',value]);return q; },
        gte(key,value) { filters.push([key,'>=',value]);return q; },
        lte(key,value) { filters.push([key,'<=',value]);return q; },
        update(value) { update=value;return q; },
        async single() { const r = await execute(); return {data:r.rows[0],error:null}; },
        then(resolve,reject) { return execute().then(r=>({ data:r.rows,count:head?Number(r.rows[0].count):null,error:null })).then(resolve,reject); },
    };
    async function execute() {
        const args=[];
        const where=filters.map(([key,op,value])=>{args.push(value); const k=key.includes('->>')?`data->>'${key.split('->>')[1]}'`:key;return `${k} ${op} $${args.length}`;}).join(' and ');
        if(update) { const changes=Object.entries(update).map(([k,v])=>{args.push(v);return `${k}=$${args.length}`;}).join(',');return db.query(`update public.${name} set ${changes} where ${where} returning *`,args); }
        return db.query(`select ${head?'count(*)':'*'} from public.${name} where ${where}`,args);
    }
    return q;
}
const fakeDb = { from: table, async rpc(_name,p) { try { const r=await db.query('select public.intel_commit_sales_page($1,$2,$3,$4,$5,$6) applied',[p.p_org,p.p_run,p.p_revision,JSON.stringify(p.p_rows),JSON.stringify(p.p_cursor),p.p_done]);return {data:r.rows[0].applied,error:null}; } catch(error) {return {error};} } };
globalThis.intelTestHooks={bsale:fakeBsale};
const serverSource=(await readFile(new URL('./sales-server.ts',import.meta.url),'utf8')).replace("import 'server-only';",'').replace(/import \{ bsale, type IntelContext \} from '\.\/server';/, 'const { bsale } = globalThis.intelTestHooks; type IntelContext = any;').replace("'./normalize'",JSON.stringify(normalizeUrl)).replace("'./sales-core'",JSON.stringify(coreUrl)).replace("'./sales-batch'",JSON.stringify(batchUrl));
const serverJS=ts.transpileModule(serverSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {syncSalesPage}=await import(`data:text/javascript;base64,${Buffer.from(serverJS).toString('base64')}`);
const saleRun=(await db.query("insert into public.intel_sync_runs(organization_id,kind,cursor) values(1,'sales',$1) returning id",[JSON.stringify(initialSalesCursor('2024-02-01','2024-02-29'))])).rows[0].id;
const ctx={db:fakeDb,orgId:1};
let completed=false, failures=0;
for(let i=0;i<60;i++) {
    try { const r=await syncSalesPage(ctx,saleRun);if(r.status==='completed'){completed=true;break;} }
    catch(error) {assert.match(error.message,/simulated source timeout/);failures++;}
}
assert.equal(completed,true); assert.equal(failures,1);
assert.equal((await db.query("select count(*)::int n from intel_records where resource='sales_details'")).rows[0].n,102,'all 51 lines of both documents preserved');
const saved=(await db.query("select data from intel_records where resource='sales_documents' order by id")).rows;
assert.equal(saved.length,2); assert.ok(saved.every(r=>r.data.complete));
assert.ok(saved.every(r=>r.data.clientId === '10'));
assert.equal((await db.query("select count(*)::int n from intel_records where resource='sales_clients' and external_id='10'")).rows[0].n,1);
assert.equal((await db.query("select count(*)::int n from intel_records where resource='sales_excluded'")).rows[0].n,1);
assert.equal((await db.query("select count(*)::int n from intel_records where resource='sales_documents' and external_id='3'")).rows[0].n,0,'presale contents are not persisted');
assert.equal(saved[0].data.sellers.length,2,'all sellers, not just issuer');
assert.equal((await db.query("select data->>'importedCount' n from intel_records where resource='sales_windows'")).rows[0].n,'2');
assert.equal((await db.query('select intel_commit_sales_page(1,$1,0,\'[]\',\'{}\',false) applied',[saleRun])).rows[0].applied,false,'stale/replayed step cannot change checkpoint');
expandRelations = true;
const repeatRun=(await db.query("insert into public.intel_sync_runs(organization_id,kind,cursor) values(1,'sales',$1) returning id",[JSON.stringify(initialSalesCursor('2024-02-01','2024-02-29'))])).rows[0].id;
assert.equal((await db.query('select intel_commit_sales_page(2,$1,0,\'[]\',\'{}\',false) applied',[repeatRun])).rows[0].applied,false,'cross-company sales RPC cannot advance a run');
completed=false;
for(let i=0;i<40;i++) { const r=await syncSalesPage(ctx,repeatRun);if(r.status==='completed'){completed=true;break;} }
assert.equal(completed,true,'expanded collections plus paginated overflow finish');
assert.equal((await db.query("select count(*)::int n from intel_records where resource='sales_details'")).rows[0].n,102,'reimport does not duplicate details');
assert.equal((await db.query("select count(*)::int n from intel_records where resource='sales_documents' and run_id=$1 and data->>'complete'='true'",[repeatRun])).rows[0].n,2);
await db.exec('set role anon');
await assert.rejects(()=>db.query('select intel_commit_sales_page(1,$1,0,\'[]\',\'{}\',false)',[saleRun]),/permission denied/);
await db.exec('reset role');
expandedLists=true;
const batchRun=(await db.query("insert into public.intel_sync_runs(organization_id,kind,cursor) values(1,'sales',$1) returning id",[JSON.stringify(initialSalesCursor('2024-02-01','2024-02-29'))])).rows[0].id;
completed=false;
for(let i=0;i<15;i++){const r=await syncSalesPage(ctx,batchRun);if(r.status==='completed'){completed=true;break;}}
assert.equal(completed,true,'batch import finishes with count reconciliation');
assert.equal((await db.query("select count(*)::int n from intel_records where resource='sales_documents' and run_id=$1 and data->>'complete'='true'",[batchRun])).rows[0].n,2);
assert.equal((await db.query("select count(*)::int n from intel_records where resource='sales_details' and run_id=$1",[batchRun])).rows[0].n,102,'batch preserves every detail and updates without duplication');
delete globalThis.intelTestHooks;
assert.equal((await db.query('select count(*)::int n from public.intel_record_versions')).rows[0].n, 0, 'sales imports and reimports never create full-row copies');
console.log('Sales: two documents, 51 lines each, multiple sellers, timeout resume, monthly count, dates, missing channel and restricted RPC passed.');
console.log('Intel: normalization, links, images, replay, org isolation, revisions, daily stock, preferences, rollback and anonymous access passed.');
await db.close();
