import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function compile(file, overrides = {}) {
    const js = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const m = { exports: {} }; new Function('require', 'module', 'exports', js)(name => name in overrides ? overrides[name] : require(name), m, m.exports); return m.exports;
}
const core = compile('lib/reception-products/core.ts');
const server = compile('lib/reception-products/server.ts', { 'server-only': {}, './core': core, '@/lib/supabase/server': {}, '@/lib/supabase/admin': {} });
const clone = structuredClone;
const user = crypto.randomUUID();
function database() {
    const rows = new Map();
    class Query {
        filters = []; patch; addition;
        select() { return this; }
        eq(key, value) { this.filters.push(r => r[key] === value); return this; }
        or() { this.filters.push(r => !r.lease_until || Date.parse(r.lease_until) < Date.now()); return this; }
        update(patch) { this.patch = clone(patch); return this; }
        insert(row) { this.addition = clone(row); return this; }
        async maybeSingle() {
            if (this.addition) { const row = { id: crypto.randomUUID(), version: 0, lease_token: null, lease_until: null, updated_at: new Date().toISOString(), ...this.addition }; rows.set(row.id, row); return { data: clone(row), error: null }; }
            const row = [...rows.values()].find(r => this.filters.every(f => f(r)));
            if (row && this.patch) Object.assign(row, clone(this.patch));
            return { data: row ? clone(row) : null, error: null };
        }
        single() { return this.maybeSingle(); }
        then(resolve, reject) { return this.maybeSingle().then(resolve, reject); }
    }
    return { rows, from: name => { assert.equal(name, 'reception_product_imports'); return new Query(); } };
}
function bsaleFixture({ existing = false, uncertainReceipt = false, uncertainVariant = false, inactiveParent = false, invalidPrice = false } = {}) {
    existing ||= inactiveParent;
    const calls = [], products = new Map(existing ? [[20, { id: 20, name: 'Original', state: inactiveParent ? 1 : 0, classification: 0, stockControl: 1, product_type: { id: 7 } }]] : []);
    const variants = new Map(existing ? [['000123', { id: 31, code: '000123', description: 'Azul', state: 0, product: { id: 20 } }]] : []);
    let gross = 0, receipt, variantThrown = false;
    return { calls, async fetch(url, init) {
        const u = new URL(url), path = u.pathname.replace('/v1', ''), method = init.method, body = init.body ? JSON.parse(init.body) : null;
        calls.push({ method, path, body });
        let data;
        if (path === '/variants.json' && method === 'GET') { const v = variants.get(u.searchParams.get('code')); data = { count: v ? 1 : 0, items: v ? [v] : [] }; }
        else if (path === '/products.json' && method === 'GET') data = { count: 0, items: [] };
        else if (path === '/products.json' && method === 'POST') { data = { id: 20, ...body, state: 0, product_type: { id: 7 } }; products.set(20, data); }
        else if (path === '/products/20.json') data = products.get(20);
        else if (path === '/variants.json' && method === 'POST') { data = { id: 31, ...body, state: 0, product: { id: body.productId } }; variants.set(body.code, data); if (uncertainVariant && !variantThrown) { variantThrown = true; throw new Error('fixture connection lost after commit'); } }
        else if (path === '/product_types/7.json') data = { id: 7, state: 0 };
        else if (path === '/price_lists/4.json') data = { id: 4, state: 0, coin: { isoCode: 'CLP' } };
        else if (path === '/products/20/product_taxes.json') data = { count: 1, items: [{ tax: { id: 1 } }] };
        else if (path === '/taxes/1.json') data = { id: 1, percentage: 19 };
        else if (path === '/price_lists/4/details.json') data = { count: 1, items: [{ id: 900, variant: { id: 31 }, variantValueWithTaxes: invalidPrice ? undefined : gross }] };
        else if (path === '/price_lists/4/details/900.json' && method === 'PUT') { gross = body.variantValue * 1.19; data = { id: 900 }; }
        else if (path === '/offices/1.json') data = { id: 1, state: 0 };
        else if (path === '/stocks/receptions.json' && method === 'POST') { receipt = { id: 99, ...body, office: { id: body.officeId } }; data = { id: 99 }; if (uncertainReceipt) throw new Error('fixture disconnected after stock write'); }
        else if (path === '/stocks/receptions/99.json') data = receipt;
        else if (path === '/stocks/receptions/98.json') data = { ...receipt, note: 'Wrong import' };
        else if (path === '/stocks/receptions/99/details.json') data = { count: 1, items: receipt.details.map(r => ({ ...r, variant: { id: 31 } })) };
        else throw new Error('Unexpected fixture request ' + method + ' ' + path);
        return Response.json(data);
    } };
}
async function scenario(options = {}) {
    const db = database(), ctx = { db, orgId: 1, userId: user }, fixture = bsaleFixture(options);
    globalThis.fetch = fixture.fetch; let p;
    async function invoke(action, extra = {}) { p = await server.action(ctx, server.actionSchema.parse({ action, ...(p ? { id: p.id, version: p.version } : {}), ...extra })); return p.document; }
    await invoke('create', { items: [{ code: '000123', productName: 'Modelo', variantName: 'Azul', quantity: 2, cost: 1000, priceGross: 11900 }], number: '123' });
    const edited = clone(p.document); edited.officeId = 1; edited.priceListId = 4; edited.groups[0].typeId = 7;
    await invoke('save', { document: edited }); await invoke('check'); await invoke('step'); assert.equal(p.document.phase, 'review');
    if (options.inactiveParent) { assert.equal(p.document.rows[0].active, false); await invoke('start'); assert.ok(p.document.lastError); assert.equal(fixture.calls.filter(c => c.method !== 'GET').length, 0); return; }
    // A cost correction after SKU validation must not force another full lookup.
    const corrected = clone(p.document); corrected.rows[0].cost = 1100; await invoke('save', { document: corrected }); assert.equal(p.document.phase, 'review');
    await invoke('start');
    for (let i = 0; i < 15 && p.document.phase !== 'ready'; i++) {
        await invoke('step');
        if (p.document.pending?.kind === 'variant') { assert.ok(options.uncertainVariant); await invoke('step'); }
        if (p.document.pending?.kind === 'price') {
            assert.ok(options.invalidPrice); assert.equal(p.document.rows[0].priceSaved, false); await invoke('step'); assert.equal(p.document.pending.kind, 'price'); return;
        }
        assert.equal(p.document.lastError, null);
    }
    assert.equal(p.document.phase, 'ready');
    const mutations = fixture.calls.filter(c => c.method !== 'GET');
    if (options.existing) assert.equal(mutations.length, 0, 'Existing products and prices are never changed');
    else {
        assert.equal(mutations.filter(c => c.path === '/variants.json').length, 1);
        const price = mutations.find(c => c.method === 'PUT'); assert.equal(price.path, '/price_lists/4/details/900.json'); assert.equal(price.body.variantValue, 10000);
    }
    const staleVersion = p.version;
    await invoke('receive');
    if (options.uncertainReceipt) {
        assert.equal(p.document.pending.kind, 'receipt');
        await invoke('retry'); assert.equal(p.document.pending.kind, 'receipt');
        await invoke('resolve_receipt', { receiptId: 98 }); assert.equal(p.document.pending.kind, 'receipt', 'A wrong receipt cannot clear the original write intent');
        await invoke('receive'); assert.equal(p.document.pending.kind, 'receipt');
        await invoke('resolve_receipt', { receiptId: 99 });
    }
    assert.equal(p.document.receiptId, 99); assert.equal(p.document.phase, 'received');
    await invoke('receive'); assert.equal(fixture.calls.filter(c => c.method === 'POST' && c.path === '/stocks/receptions.json').length, 1, 'Receipt retry cannot duplicate stock');
    const payload = fixture.calls.find(c => c.method === 'POST' && c.path === '/stocks/receptions.json').body;
    assert.deepEqual(payload.details, [{ code: '000123', quantity: 2, cost: 1100 }]); assert.ok(payload.note.includes(p.id));
    await assert.rejects(server.action(ctx, { action: 'receive', id: p.id, version: staleVersion }), /último avance/);
    await assert.rejects(server.load({ ...ctx, userId: crypto.randomUUID() }, p.id), /no encontrada/);
    await assert.rejects(server.load({ ...ctx, orgId: 2 }, p.id), /no encontrada/);
    db.rows.get(p.id).lease_until = new Date(Date.now() + 60000).toISOString(); db.rows.get(p.id).lease_token = crypto.randomUUID();
    await assert.rejects(server.action(ctx, { action: 'receive', id: p.id, version: p.version }), /otra solicitud/);
}
const oldFetch = globalThis.fetch, oldToken = process.env.BSALE_TOKEN;
try {
    process.env.BSALE_TOKEN = 'fixture-only';
    const d = core.newDocument([{ code: '0001', productName: ' Modelo ', variantName: 'M', quantity: null, cost: null, priceGross: null }, { code: 'abc', productName: 'MODELO', variantName: 'L', quantity: 1, cost: 0, priceGross: null }]);
    assert.equal(d.groups.length, 1); assert.equal(d.rows[0].code, '0001'); assert.equal(d.rows[0].cost, null); assert.equal(d.rows[1].cost, 0);
    assert.ok(core.problems(d).some(x => x.includes('cantidad'))); d.rows[1].code = '0001'; assert.ok(core.problems(d).some(x => x.includes('repetido')));
    await scenario(); await scenario({ existing: true }); await scenario({ inactiveParent: true }); await scenario({ uncertainVariant: true }); await scenario({ uncertainReceipt: true }); await scenario({ invalidPrice: true });
    console.log('PASS: reviewed grouping, missing amounts, leading-zero SKU, inactive parent, existing prices preserved, net/gross conversion with exact price-detail ID, durable uncertain writes, stock idempotency, lease/version conflicts and user/company isolation. All Bsale/DB calls simulated.');
} finally { globalThis.fetch = oldFetch; if (oldToken === undefined) delete process.env.BSALE_TOKEN; else process.env.BSALE_TOKEN = oldToken; }
