// Run: node lib/intel/verify-storage.mjs <path to @electric-sql/pglite/dist/index.js>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create table organizations(id bigint primary key,slug text unique);
insert into organizations values(1,'facto-compartido'),(2,'other-company');`);
const migration = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
for (const name of ['20261015175055_create_intel_catalog.sql', '20261015182904_intel_sales_history.sql', '20261020141204_intel_inventory_history.sql']) {
    await db.exec(await migration(name));
}
const run = (await db.query("insert into intel_sync_runs(organization_id,kind) values(1,'catalog') returning id")).rows[0].id;
const row = { resource: 'products', external_id: '1', name: 'Before', data: { value: 1 }, raw: { id: 1, value: 1 }, content_hash: 'before' };
await db.query('select intel_commit_page(1,$1,0,0,$2,1,0,false)', [run, JSON.stringify([row])]);
const historyBefore = (await db.query('select * from intel_record_versions')).rows;
const recordsBefore = (await db.query('select * from intel_records')).rows;
const runsBefore = (await db.query('select * from intel_sync_runs')).rows;
assert.equal(historyBefore.length, 1);
const sql = await migration('20261026151115_intel_current_records_only.sql');
await db.exec(sql);
await db.exec(sql); // Safe to apply again; no data cleanup is hidden in this migration.
assert.deepEqual((await db.query('select * from intel_record_versions')).rows, historyBefore);
assert.deepEqual((await db.query('select * from intel_records')).rows, recordsBefore);
assert.deepEqual((await db.query('select * from intel_sync_runs')).rows, runsBefore);
const updated = { ...row, name: 'After', data: { value: 2 }, raw: { id: 1, value: 2 }, content_hash: 'after' };
await db.query('select intel_commit_page(1,$1,1,0,$2,2,0,true)', [run, JSON.stringify([updated])]);
assert.deepEqual((await db.query('select * from intel_record_versions')).rows, historyBefore, 'old history is untouched; no new versions');
assert.equal((await db.query('select content_hash from intel_records')).rows[0].content_hash, 'after');
assert.equal((await db.query('select processed from intel_sync_runs')).rows[0].processed, 2);
assert.equal((await db.query('select status from intel_sync_runs')).rows[0].status, 'completed');
const acl = (await db.query(`select prosecdef, proconfig,
has_function_privilege('anon',oid,'execute') anon,
has_function_privilege('authenticated',oid,'execute') authenticated,
has_function_privilege('service_role',oid,'execute') service
from pg_proc where proname='intel_commit_page'`)).rows[0];
assert.equal(acl.prosecdef, false);
assert.equal(acl.anon, false);
assert.equal(acl.authenticated, false);
assert.equal(acl.service, true);
assert.ok(acl.proconfig.some(setting => setting.startsWith('search_path=')));
console.log('Storage migration passed: preserves existing records/history/checkpoints, resumes an in-flight run, is repeatable, stops new copies and keeps restricted invoker permissions.');
const cleanup = await readFile(new URL('../../supabase/maintenance/intel_storage_cleanup_after_approval.sql', import.meta.url), 'utf8');
await assert.rejects(() => db.exec(cleanup), /unique\/unverified/, 'different source data blocks cleanup');
await db.exec('rollback');
assert.deepEqual((await db.query('select * from intel_record_versions')).rows, historyBefore);
await db.query('update intel_records set data=$1,raw=$2', [JSON.stringify(row.data),JSON.stringify(row.raw)]);
await db.exec(`insert into intel_record_versions(organization_id,record_id,run_id,data,raw,content_hash)
 select 2,id,run_id,data,raw,content_hash from intel_records`);
await assert.rejects(() => db.exec(cleanup), /another organization/);
await db.exec('rollback');
await db.exec('delete from intel_record_versions where organization_id=2');
// A missing field must not turn a cleanup guard into SQL NULL and bypass it.
await db.exec("update intel_record_versions set data='{}'");
await assert.rejects(() => db.exec(cleanup), /unique\/unverified/);
await db.exec('rollback');
await db.exec(`update intel_records set resource='sales_documents',data='{"complete":true,"sellers":[{"id":7}],"total":119}';
update intel_record_versions set data='{"complete":false,"sellers":[],"total":119}';
insert into intel_record_versions(organization_id,record_id,run_id,data,raw,content_hash)
 select organization_id,id,run_id,data,raw,content_hash from intel_records;`);
const protectedRecords = (await db.query('select * from intel_records')).rows;
const protectedRuns = (await db.query('select * from intel_sync_runs')).rows;
await db.exec(cleanup);
assert.equal((await db.query('select count(*)::int n from intel_record_versions')).rows[0].n,0);
assert.deepEqual((await db.query('select * from intel_records')).rows, protectedRecords);
assert.deepEqual((await db.query('select * from intel_sync_runs')).rows, protectedRuns);
console.log('Manual cleanup guards passed: rejects changed source, other tenants and unverified fields; only verified exact/intermediate copies removed; originals and cursors untouched.');
await db.close();
