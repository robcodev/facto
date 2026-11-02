import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url);
const doc = { organization_id: 1, resource: 'sales_documents', external_id: '10', run_id: 'current', data: { documentTypeId: '1' } };
const records = [doc,
  { id: 1, organization_id: 1, resource: 'sales_details', run_id: 'current', data: { documentId: '10' } },
  { id: 2, organization_id: 1, resource: 'sales_payments', run_id: 'current', data: { documentId: '10' } },
  { id: 3, organization_id: 2, resource: 'sales_details', run_id: 'current', data: { documentId: '10' } },
  { id: 4, organization_id: 1, resource: 'sales_details', run_id: 'old', data: { documentId: '10' } },
  { id: 5, organization_id: 1, resource: 'inventory_receptions', run_id: 'current', data: { documentId: '10' } },
  { id: 6, organization_id: 1, resource: 'sales_details', run_id: 'current', data: { documentId: '11' } },
];
let authenticated = true, queries = 0;
const context = async () => {
  if (!authenticated) throw new Error('Debes iniciar sesión.');
  return { orgId: 1, db: { from(table) {
    assert.equal(table, 'intel_records'); queries++;
    const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => String(key === 'data->>documentId' ? row.data.documentId : row[key]) === String(value)); return query; },
      like(key, pattern) { assert.equal(key, 'resource'); assert.equal(pattern, 'sales_%'); filters.push(row => row.resource.startsWith('sales_')); return query; },
      order() { return query; },
      single() { const data = records.find(row => filters.every(f => f(row))); return Promise.resolve({ data, error: data ? null : new Error('Missing') }); },
      range(from, to) { const data = records.filter(row => filters.every(f => f(row))); return Promise.resolve({ data: data.slice(from, to + 1), count: data.length, error: null }); },
    };
    return query;
  } } };
};
const source = await readFile(new URL('../../app/api/intel/sales/route.ts', import.meta.url), 'utf8');
const m = { exports: {} };
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('require', 'exports', 'module', js)(name => {
  if (name === '@/lib/intel/server') return { context, errorResponse: () => Response.json({ error: 'Sin acceso' }, { status: 401 }) };
  if (name === '@/lib/intel/sales-core') return { validDay: () => true };
  if (name === '@/lib/intel/sales-server') return {};
  return nativeRequire(name);
}, m.exports, m);
const get = page => m.exports.GET(new Request('https://example.test/api/intel/sales?documentId=10&page=' + page));
let response = await get(0), result = await response.json();
assert.equal(response.status, 200);
assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
assert.deepEqual(result.children.map(row => row.id), [1, 2]);
assert.equal(result.total, 2);
result = await (await get(1)).json();
assert.equal(result.total, 2); assert.deepEqual(result.children, []);
doc.data.documentTypeId = '38'; queries = 0;
assert.equal((await get(0)).status, 404); assert.equal(queries, 1);
authenticated = false; queries = 0;
assert.equal((await get(0)).status, 401); assert.equal(queries, 0);
console.log('PASS: indexed sales scope, company/run/parent isolation, pagination, exact child count, excluded presales and authentication.');
