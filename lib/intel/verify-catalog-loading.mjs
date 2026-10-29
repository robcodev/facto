// Read-only integration checks against the configured Intel store.
// Prints counts/timings only; never credentials, client data or payloads.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd(), true);
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const normalize = compile(await readFile(new URL('./normalize.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('./server.ts', import.meta.url), 'utf8'))
    .replace("import 'server-only';", '')
    .replace("import { createClient } from '@/lib/supabase/server';", 'const createClient = () => { throw new Error("Not used"); };')
    .replace("import { createAdminClient } from '@/lib/supabase/admin';", 'const createAdminClient = () => { throw new Error("Not used"); };')
    .replace("'./normalize'", JSON.stringify(normalize));
const { dashboard, allRecords, productDetail } = await import(compile(source));
assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.FACTO_BACKEND_SECRET, 'Server configuration required');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.FACTO_BACKEND_SECRET, { auth: { persistSession: false } });
const { data: org, error } = await db.from('organizations').select('id').eq('slug', 'facto-compartido').single();
if (error) throw new Error(error.message);
const ctx = { db, orgId: Number(org.id), canEdit: true };
const report = {};
async function measure(label, fn) {
    const start = performance.now(); const value = await fn();
    report[label] = { ms: Math.round(performance.now() - start), bytes: Buffer.byteLength(JSON.stringify(value)) };
    return value;
}
const first = await measure('firstPageCold', () => dashboard(ctx));
const second = await measure('secondPageWarm', () => dashboard(ctx, new URLSearchParams({ page: '1' })));
const products = data => data.records.filter(row => row.resource === 'products');
assert.ok(products(first).length <= 50);
assert.ok(products(second).length <= 50);
assert.equal(new Set([...products(first), ...products(second)].map(row => row.external_id)).size, products(first).length + products(second).length);
assert.ok(first.records.every(row => !('raw' in row)));
assert.ok(first.records.filter(row => row.resource === 'web').every(row => !('description' in row.data) && !('images' in row.data)));
const baseline = await measure('previousFullRead', () => allRecords(ctx));
const originalProducts = baseline.filter(row => row.resource === 'products');
assert.equal(first.counts.products, originalProducts.length);
assert.equal(first.counts.variants, baseline.filter(row => row.resource === 'variants').length);
assert.equal(first.counts.web, baseline.filter(row => row.resource === 'web').length);
assert.deepEqual(products(first).map(row => row.external_id), originalProducts.slice(0, 50).map(row => row.external_id));
const latest = first.runs.find(run => run.status === 'completed' && run.config?.scope !== 'catalog');
const settings = new Map(first.settings.map(row => [row.category_id, row]));
const variantGroups = new Map();
const quantities = new Map(baseline.filter(row => row.resource === 'stocks' && row.run_id === latest?.id).map(row => [String(row.data.variantId), Number(row.data.available)]));
for (const variant of baseline.filter(row => row.resource === 'variants')) {
    const group = variantGroups.get(variant.product_id) ?? []; group.push(variant); variantGroups.set(variant.product_id, group);
}
const exampleSku = baseline.find(row => row.resource === 'variants' && row.data.sku)?.data.sku;
const category = originalProducts.find(row => row.category_id)?.category_id;
for (const params of [{ search: String(exampleSku ?? '') }, { active: '1' }, { stock: '1' }, { included: '1' }, { category: String(category ?? '') }, { search: '___no_intel_matches___' }, { page: '999999' }]) {
    const found = await dashboard(ctx, new URLSearchParams(params));
    const expected = originalProducts.filter(product => {
        const children = variantGroups.get(product.external_id) ?? [];
        const values = children.filter(row => Number(row.data.state) === 0).map(row => quantities.get(row.external_id));
        const available = values.length && values.every(value => value !== undefined) ? values.reduce((sum, value) => sum + value, 0) : null;
        const text = `${product.name} ${product.external_id} ${children.map(row => `${row.data.sku} ${row.name}`).join(' ')}`.toLocaleLowerCase('es');
        return text.includes((params.search ?? '').toLocaleLowerCase('es')) && (!params.category || product.category_id === params.category)
            && (!params.active || Number(product.data.state) === 0) && (!params.stock || (available ?? 0) > 0)
            && (!params.included || settings.get(product.category_id)?.included !== false);
    });
    assert.equal(found.total, expected.length, `filter ${Object.keys(params)}`);
    assert.deepEqual(products(found).map(row => row.external_id), expected.slice(found.page * 50, found.page * 50 + 50).map(row => row.external_id));
}
const example = baseline.find(row => row.resource === 'web' && originalProducts.some(product => product.external_id === row.product_id));
if (example) {
    const detail = await measure('productDetail', () => productDetail(ctx, example.product_id));
    const web = detail.records.find(row => row.resource === 'web' && row.external_id === example.external_id);
    assert.deepEqual(web.data, example.data, 'Full web descriptions/images remain available');
    assert.ok(detail.records.every(row => !('raw' in row)));
}
report.counts = first.counts;
report.checks = 'page boundaries, totals, SKU, category, active, included, stock, empty results, page clamp and full web detail passed';
console.log(JSON.stringify(report, null, 2));
