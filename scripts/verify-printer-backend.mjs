import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url);
function load(file, dependencies) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const m = { exports: {} };
    new Function('require', 'exports', 'module', js)(name => name in dependencies ? dependencies[name] : nativeRequire(name), m.exports, m);
    return m.exports;
}
const { bsaleResourceUrl } = load('../lib/picking/bsale-url.ts', {});
assert.equal(bsaleResourceUrl('/v2/token/checkout/fixture.json'), 'https://api.bsale.io/v2/token/checkout/fixture.json');
assert.equal(bsaleResourceUrl('https://api.bsale.io/v2/token/checkout/fixture.json'), 'https://api.bsale.io/v2/token/checkout/fixture.json');
assert.equal(bsaleResourceUrl('/cart/12/detail.json'), 'https://api.bsale.io/v1/cart/12/detail.json');
assert.equal(bsaleResourceUrl('/v1/variants/12.json'), 'https://api.bsale.io/v1/variants/12.json');
assert.equal(bsaleResourceUrl('https://api.bsale.io/v1/variants/12.json'), 'https://api.bsale.io/v1/variants/12.json');
for (const url of ['http://api.bsale.io/v1/products.json', '//evil.test/v1/products.json', 'https://api.bsale.io.evil.test/v1/x', 'https://api.bsale.io@evil.test/v1/x', 'https://user:pass@api.bsale.io/v1/x', 'https://api.bsale.io:444/v1/x', 'https://api.bsale.io/v3/x', 'https://api.bsale.io/v1/x#secret', '/v1/../../other', '\\evil.test']) assert.throws(() => bsaleResourceUrl(url));

const names = ['NEXT_PUBLIC_SUPABASE_URL', 'FACTO_BACKEND_SECRET', 'FACTO_BACKEND', 'SUPABASE_SECRET_KEY', 'BSALE_TOKEN'];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
try {
    let supplied;
    const admin = load('../lib/supabase/admin.ts', { 'server-only': {}, '@supabase/supabase-js': { createClient: (...args) => { supplied = args; return { fixture: true }; } } });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
    for (const name of names.slice(1)) delete process.env[name];
    assert.throws(() => admin.createAdminClient(), /FACTO_BACKEND_SECRET, FACTO_BACKEND/);
    process.env.FACTO_BACKEND = 'production-fixture';
    admin.createAdminClient(); assert.equal(supplied[1], 'production-fixture');
    process.env.FACTO_BACKEND_SECRET = '  local-fixture  ';
    admin.createAdminClient(); assert.equal(supplied[1], 'local-fixture');
    process.env.FACTO_BACKEND_SECRET = ' ';
    admin.createAdminClient(); assert.equal(supplied[1], 'production-fixture');
    delete process.env.FACTO_BACKEND;
    process.env.SUPABASE_SECRET_KEY = 'alternative-fixture';
    admin.createAdminClient(); assert.equal(supplied[1], 'alternative-fixture');
    assert.deepEqual(supplied[2].auth, { persistSession: false, autoRefreshToken: false });
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.throws(() => admin.createAdminClient(), /NEXT_PUBLIC_SUPABASE_URL/);

    const calls = [], writes = [];
    process.env.BSALE_TOKEN = 'bsale-fixture';
    globalThis.fetch = async (url, options) => {
        assert.equal(options.headers.access_token, 'bsale-fixture');
        assert.equal(options.redirect, 'error');
        assert.ok(!options.method || options.method === 'GET');
        calls.push(url);
        const responses = {
            'https://api.bsale.io/v2/token/checkout/fixture.json': { code: 200, data: [{ id: 1, cartId: 2, documentNumber: 100, payProcess: 'success', orderStatus: 2, createAt: 1793630000 }] },
            'https://api.bsale.io/v1/cart/2/detail.json': { data: [{ id: 3, idVarianteProducto: 4, sku: 'FIXTURE', itemName: 'Prueba', quantity: 2 }] },
            'https://api.bsale.io/v1/variants/4.json': { id: 4, barCode: '123456' },
        };
        assert.ok(responses[url], 'Unexpected Bsale resource');
        return Response.json(responses[url]);
    };
    const db = { from(table) { return {
        select() { return this; },
        eq(key, value) { assert.equal(table, 'organizations'); assert.equal(key, 'slug'); assert.equal(value, 'facto-compartido'); return this; },
        single() { return Promise.resolve({ data: { id: table === 'organizations' ? 1 : 5 }, error: null }); },
        upsert(value, options) { writes.push({ table, value, options }); return this; },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
    }; } };
    const service = load('../lib/picking/service.ts', { 'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => db }, './bsale-url': { bsaleResourceUrl } });
    const result = await service.importCheckout('/v2/token/checkout/fixture.json');
    assert.equal(result.queued, true); assert.equal(result.checkoutId, 1); assert.equal(result.itemCount, 1);
    assert.equal(calls.length, 3);
    assert.equal(writes.find(w => w.table === 'web_order_items').value[0].barcode, '123456');
    assert.deepEqual(writes.find(w => w.table === 'print_jobs'), { table: 'print_jobs', value: { organization_id: 1, order_id: 5 }, options: { onConflict: 'order_id', ignoreDuplicates: true } });
    console.log('PASS: production/local backend aliases, credential priority, missing configuration, Bsale v1/v2 resources, external URL rejection and webhook-to-queue fixture. No real network calls or database writes.');
} finally {
    globalThis.fetch = originalFetch;
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
}
