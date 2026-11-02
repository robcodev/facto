// Compare read models with a Git revision. No writes to Bsale or Supabase.
// node scripts/benchmark-intel-reads.mjs [--live] [--baseline=HEAD]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import env from '@next/env';
import { createClient } from '@supabase/supabase-js';
const requireFromProject = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const revision = process.argv.find(a => a.startsWith('--baseline='))?.slice(11) || 'HEAD';
assert.match(revision, /^[\w./-]+$/);
function source(file, baseline) {
  return baseline ? execFileSync('git', ['show', `${revision}:${file}`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, file), 'utf8');
}
function load(file, baseline) {
  const m = { exports: {} };
  const js = ts.transpileModule(source(file, baseline), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'module', 'require', js)(m.exports, m, requireFromProject);
  return m.exports;
}
function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => !['checkedAt', 'recordIds'].includes(k)).map(k => [k, comparable(value[k])]));
  return value;
}
async function rotation() {
  const input = {
    products: [{ external_id: '1', run_id: 'r', name: 'Fixture' }],
    variants: Array.from({ length: 18503 }, (_, i) => ({ external_id: String(i + 1), run_id: 'r', product_id: '1', sku: String(i + 1) })),
    types: [], brands: [], web: [], documents: [], details: [], receptions: [], receiptLines: [], consumptions: [], consumptionLines: [], stock: [],
    windows: [2025, 2026].map(year => ({ external_id: String(year), run_id: 'r', from: `${year}-01-01`, to: `${year}-12-31`, reconciliation: 'document_count_only', importedCount: 0, sourceCount: 0 })), closed: '2026-10-30',
  };
  const before = load('lib/rotation/core.ts', true), after = load('lib/rotation/core.ts', false);
  let start = performance.now(); const original = before.buildDataset(input), beforeMs = performance.now() - start;
  start = performance.now(); const optimized = after.buildDataset(input), afterMs = performance.now() - start;
  assert.ok(JSON.stringify(comparable(original)) === JSON.stringify(comparable(optimized)), 'Rotation results changed');
  console.log(JSON.stringify({ test: 'rotation-coverage-fixture', variants: input.variants.length, beforeMs: Math.round(beforeMs), afterMs: Math.round(afterMs), sameResults: true }));
}
async function live() {
  env.loadEnvConfig(root, true);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.FACTO_BACKEND_SECRET;
  assert.ok(url && secret, 'Missing backend connection');
  const origin = new URL(url).origin;
  const nativeFetch = globalThis.fetch;
  let metrics;
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const request = new Request(input, init), target = new URL(request.url);
    assert.ok(['GET', 'HEAD'].includes(request.method), 'Benchmark forbids writes');
    assert.equal(target.origin, origin);
    assert.ok(['/rest/v1/intel_records', '/rest/v1/intel_sync_runs'].includes(target.pathname));
    const response = await nativeFetch(request);
    metrics.requests++;
    metrics.bytes += (await response.clone().arrayBuffer()).byteLength;
    if (!response.ok) metrics.errors++;
    return response;
  } } });
  const before = load('lib/marketing/reader.ts', true), after = load('lib/marketing/reader.ts', false);
  for (const commercial of [false, true]) {
    const outputs = [], measurements = [];
    for (const reader of [before, after]) {
      metrics = { requests: 0, bytes: 0, errors: 0 };
      const start = performance.now();
      outputs.push(await reader.readOpportunities(db, 1, '2026-10-01', '2026-10-14', commercial, commercial, commercial));
      measurements.push({ ...metrics, ms: Math.round(performance.now() - start) });
    }
    const a = comparable(outputs[0]), b = comparable(outputs[1]);
    const differences = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    assert.ok(differences.length === 0, 'Read-model results differ in: ' + differences.join(', '));
    console.log(JSON.stringify({ test: commercial ? 'marketing-commercial-live' : 'marketing-opportunities-live', before: measurements[0], after: measurements[1], sameResults: true, evidenceOrderIgnored: true }));
  }
  metrics = { requests: 0, bytes: 0, errors: 0 };
  const started = performance.now();
  const result = await db.from('intel_records').select('id,resource', { count: 'exact' }).eq('organization_id', 1).like('resource', 'sales_%').eq('data->>documentId', '94569').eq('run_id', 'edd45b55-3390-4a12-8224-36cff61c720b').order('id').range(0, 99);
  if (result.error) throw new Error(result.error.message);
  assert.ok(result.data.every(r => r.resource.startsWith('sales_')));
  console.log(JSON.stringify({ test: 'indexed-document-children-live', ms: Math.round(performance.now() - started), count: result.count, rows: result.data.length }));
}
(async () => { if (process.argv.includes('--live')) await live(); else await rotation(); })().catch(error => { console.error(error.message); process.exitCode = 1; });
