import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url);
const source = readFileSync(new URL('../app/api/process-invoice/route.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(google) {
    const m = { exports: {} };
    new Function('require', 'module', 'exports', js)(name => name === '@google/genai' ? google : name === 'next/server' ? { NextResponse: { json: Response.json.bind(Response) } } : nativeRequire(name), m, m.exports);
    return m.exports;
}
function request(files = [new File(['%PDF-fixture'], 'invoice.pdf', { type: 'application/pdf' })], signal, mode) {
    const data = new FormData();
    data.set('documentType', 'FACTURA');
    if (mode) data.set('mode', mode);
    for (const file of files) data.append('files', file);
    return new Request('https://example.test/api/process-invoice', { method: 'POST', body: data, signal });
}
async function fixtures() {
    const { Type, ThinkingLevel } = nativeRequire('@google/genai');
    class ApiError extends Error { constructor(status) { super('Provider fixture'); this.status = status; } }
    let outputs = [], calls = [], clients = [];
    class GoogleGenAI {
        constructor(options) { clients.push(options); }
        models = { generateContent: async input => { calls.push(input); const next = outputs.shift(); assert.ok(next, 'Unexpected extra model request'); return next(input); } };
    }
    const route = load({ ApiError, GoogleGenAI, Type, ThinkingLevel });
    const oldKey = process.env.GEMINI_API_KEY, oldNow = Date.now;
    const oldInfo = console.info, oldError = console.error;
    const ok = (extra = {}) => ({ text: JSON.stringify({ documentNumber: 'F-123', invoiceItems: [{ code: '000123', quantity: 3, totalNet: 29999 }, { code: 'ZERO', quantity: 1, totalNet: 0 }] }), ...extra });
    const reset = list => { outputs = list; calls = []; clients = []; };
    console.info = () => {}; console.error = () => {};
    try {
        process.env.GEMINI_API_KEY = 'fixture-only';
        reset([() => ok()]);
        let response = await route.POST(request()), body = await response.json();
        assert.equal(response.status, 200); assert.equal(body.documentNumber, '123');
        assert.equal(body.invoiceItems[0].code, '000123'); assert.equal(body.invoiceItems[0].netUnitValue, 29999 / 3);
        assert.equal(body.invoiceItems[1].netUnitValue, 0);
        assert.equal(calls.length, 1); assert.equal(calls[0].config.thinkingConfig.thinkingLevel, ThinkingLevel.LOW);
        assert.ok(calls[0].config.abortSignal instanceof AbortSignal);
        assert.equal(clients[0].httpOptions.retryOptions.attempts, 1);
        assert.ok(clients[0].httpOptions.timeout > 36000);
        assert.ok(clients[0].httpOptions.timeout < route.maxDuration * 1000);
        assert.deepEqual(calls[0].config.responseSchema.properties.invoiceItems.items.required, ['code', 'quantity', 'totalNet']);
        reset([() => ({ text: JSON.stringify({ documentNumber: '456', hasMoreItems: false, invoiceItems: [
            { code: '0007', productName: 'Modelo', variantName: 'M', quantity: 2, totalNet: 10000, salePrice: 10000, salePriceIncludesVat: false },
            { code: '', productName: 'Modelo', variantName: 'L', quantity: null, netUnitValue: null, salePrice: null },
            { code: '0009', productName: 'Otro', variantName: '', quantity: 1, totalNet: 0, salePrice: 5000, salePriceIncludesVat: null },
        ] }) })]);
        response = await route.POST(request(undefined, undefined, 'catalog')); body = await response.json();
        assert.equal(response.status, 200); assert.equal(body.catalogItems.length, 3);
        assert.equal(body.catalogItems[0].code, '0007'); assert.equal(body.catalogItems[0].cost, 5000); assert.equal(body.catalogItems[0].priceGross, 11900);
        assert.equal(body.catalogItems[1].cost, null); assert.equal(body.catalogItems[1].quantity, null); assert.equal(body.catalogItems[1].priceGross, null);
        assert.equal(body.catalogItems[2].cost, 0); assert.equal(body.catalogItems[2].priceGross, null, 'Unknown IVA must remain for manual review');
        reset([() => ({ text: JSON.stringify({ hasMoreItems: true, invoiceItems: [{ code: 'x' }] }) })]);
        response = await route.POST(request(undefined, undefined, 'catalog')); assert.equal(response.status, 422);
        reset([() => { throw new ApiError(504); }, () => ok()]);
        response = await route.POST(request()); assert.equal(response.status, 200); assert.equal(calls.length, 2);
        assert.equal(calls[1].model, 'gemini-3.7-flash');
        reset([() => { throw new ApiError(403); }]);
        response = await route.POST(request()); assert.equal(response.status, 403); assert.equal(calls.length, 1);
        reset([() => ok({ candidates: [{ finishReason: 'MAX_TOKENS' }] })]);
        response = await route.POST(request()); assert.equal(response.status, 422); assert.equal(calls.length, 1);
        reset([() => ({ text: '{invalid' })]);
        response = await route.POST(request()); assert.equal(response.status, 422); assert.equal(calls.length, 1);
        reset([() => ({ text: JSON.stringify({ invoiceItems: [{ code: 'NULL', quantity: 1, totalNet: null }] }) })]);
        response = await route.POST(request()); assert.equal(response.status, 422);
        reset([() => ({ text: JSON.stringify({ invoiceItems: [{ code: 'BAD', quantity: 0, totalNet: 12 }] }) })]);
        response = await route.POST(request()); assert.equal(response.status, 422);
        reset([]);
        response = await route.POST(request([])); assert.equal(response.status, 400);
        response = await route.POST(request([new File(['x'], 'x.exe', { type: 'application/octet-stream' })])); assert.equal(response.status, 415);
        response = await route.POST(request([new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' })])); assert.equal(response.status, 413);
        response = await route.POST(request(Array.from({ length: 11 }, () => new File(['x'], 'x.pdf', { type: 'application/pdf' })))); assert.equal(response.status, 400);
        assert.equal(calls.length, 0);
        delete process.env.GEMINI_API_KEY;
        response = await route.POST(request()); assert.equal(response.status, 503); assert.equal(calls.length, 0);
        process.env.GEMINI_API_KEY = 'fixture-only';
        const controller = new AbortController(); controller.abort();
        response = await route.POST(request(undefined, controller.signal)); assert.equal(response.status, 504); assert.equal(calls.length, 0);
        let clock = oldNow(); Date.now = () => clock;
        reset([() => { clock += 110000; throw new ApiError(503); }]);
        response = await route.POST(request()); assert.equal(response.status, 503); assert.equal(calls.length, 1, 'No fallback starts after the total budget');
    } finally {
        Date.now = oldNow; console.info = oldInfo; console.error = oldError;
        if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
    }
    console.log('PASS: PDF upload, net-unit math, zero costs, low thinking, bounded attempts, total deadline, cancellation, partial/invalid output, permissions, missing key, file type/count/size. No real AI calls or stock writes.');
}
async function live() {
    const env = nativeRequire('@next/env'); env.loadEnvConfig(process.cwd(), true);
    assert.ok(process.env.GEMINI_API_KEY, 'Missing Gemini key');
    const { PDFDocument, StandardFonts } = nativeRequire('pdf-lib');
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const line of ['SKU 000123 | Cantidad 3 | Total neto linea CLP 29999', 'SKU TEST456 | Cantidad 2 | Total neto linea CLP 10000']) {
        const page = pdf.addPage([595, 842]);
        page.drawText('FACTURA DE PRUEBA - FOLIO 123', { x: 40, y: 790, size: 16, font });
        page.drawText(line, { x: 40, y: 735, size: 12, font });
    }
    const route = load(nativeRequire('@google/genai')), start = performance.now();
    const response = await route.POST(request([new File([await pdf.save()], 'synthetic-two-pages.pdf', { type: 'application/pdf' })]));
    const result = await response.json();
    if (!response.ok) throw new Error(`Synthetic PDF failed (${response.status}): ${result.error}`);
    assert.equal(result.documentNumber, '123'); assert.equal(result.invoiceItems.length, 2);
    assert.equal(result.invoiceItems.find(item => item.code === '000123')?.netUnitValue, 29999 / 3);
    assert.equal(result.invoiceItems.find(item => item.code === 'TEST456')?.netUnitValue, 5000);
    console.log(JSON.stringify({ test: 'synthetic-two-page-pdf', status: response.status, pages: 2, items: result.invoiceItems.length, elapsedMs: Math.round(performance.now() - start), amountsVerified: true }));
}
async function liveCatalog() {
    nativeRequire('@next/env').loadEnvConfig(process.cwd(), true);
    const { PDFDocument, StandardFonts } = nativeRequire('pdf-lib');
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const line of [
        'SKU 000123 | GUANTE MAR AZUL talla M | Cantidad 2 | Costo unitario neto CLP 1000 | Precio venta IVA incluido CLP 2990',
        'SKU 000124 | GUANTE MAR AZUL talla L | Cantidad 3 | Sin costo ni precio de venta indicado',
    ]) {
        const page = pdf.addPage([842, 595]);
        page.drawText('DOCUMENTO DE PRUEBA - FOLIO 456', { x: 30, y: 550, size: 16, font });
        page.drawText(line, { x: 30, y: 500, size: 10, font });
    }
    const route = load(nativeRequire('@google/genai')), start = performance.now();
    const response = await route.POST(request([new File([await pdf.save()], 'catalog-fixture.pdf', { type: 'application/pdf' })], undefined, 'catalog'));
    const body = await response.json();
    assert.equal(response.status, 200, body.error); assert.equal(body.catalogItems.length, 2);
    const first = body.catalogItems.find(r => r.code === '000123'), second = body.catalogItems.find(r => r.code === '000124');
    assert.equal(first.quantity, 2); assert.equal(first.cost, 1000); assert.equal(first.priceGross, 2990);
    assert.equal(second.quantity, 3); assert.equal(second.cost, null); assert.equal(second.priceGross, null);
    assert.equal(first.productName, second.productName); assert.notEqual(first.variantName, second.variantName);
    console.log(JSON.stringify({ test: 'live-catalog-synthetic-two-page-pdf', pages: 2, variants: 2, groupingVerified: true, missingAmountsPreserved: true, elapsedMs: Math.round(performance.now() - start), bsaleWrites: 0 }));
}
if (process.argv.includes('--live-catalog')) await liveCatalog(); else if (process.argv.includes('--live')) await live(); else await fixtures();
