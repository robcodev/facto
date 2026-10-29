// Trusted local operator only: node lib/intel/audit-runner.mjs YYYY-MM
// GET/SELECT only. No import, database writes, Bsale mutations or personal data output.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { reconcileHeaders, sumAmounts, moneyFields, moneyEqual, amount, compareSummary } from './audit-core.mjs';
nextEnv.loadEnvConfig(process.cwd(), true);
const month = process.argv[2];
if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw new Error('Use YYYY-MM.');
const from = `${month}-01`, start = Date.parse(from) / 1000;
const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
const end = next.getTime() / 1000 - 1, to = new Date(end * 1000).toISOString().slice(0, 10);
if (end * 1000 >= Date.now()) throw new Error('Choose a closed month.');
if (!process.env.FACTO_BACKEND_SECRET || !process.env.BSALE_TOKEN) throw new Error('Missing server credentials.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.FACTO_BACKEND_SECRET, { auth: { persistSession: false } });
const unwrap = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const org = unwrap(await db.from('organizations').select('id').eq('slug', 'facto-compartido').single()).id;
const base = resource => db.from('intel_records').select('id,external_id,product_id,category_id,data,run_id,observed_at').eq('organization_id', org).eq('resource', resource);
async function pages(make) {
    const all = []; let last = 0;
    for (;;) {
        const rows = unwrap(await make().gt('id', last).order('id').limit(500));
        all.push(...rows);
        if (rows.length < 500) return all;
        last = rows.at(-1).id;
    }
}
async function bsale(path) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(`https://api.bsale.io${path}`, { headers: { access_token: process.env.BSALE_TOKEN }, signal: AbortSignal.timeout(20000) });
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); continue;
        }
        if (!response.ok) throw new Error(`Bsale HTTP ${response.status} at ${path.split('?')[0]}`);
        return response.json();
    }
}
async function remotePages(path, progress = false) {
    const all = []; let expected;
    for (let offset = 0; ; ) {
        const body = await bsale(`${path}${path.includes('?') ? '&' : '?'}limit=50&offset=${offset}`);
        if (!Array.isArray(body.items) || !Number.isInteger(body.count) || body.count < 0) throw new Error('Invalid source page.');
        if (expected !== undefined && expected !== body.count) throw new Error('Source count changed during audit.');
        expected = body.count; all.push(...body.items); offset += body.items.length;
        if (progress && (offset % 500 === 0 || offset === expected)) console.error(`Source headers: ${offset}/${expected}`);
        if (offset >= expected) {
            if (offset !== expected || new Set(all.map(r => String(r.id))).size !== expected) throw new Error('Source pagination has duplicates or extra rows.');
            return all;
        }
        if (!body.items.length) throw new Error('Source page stopped early.');
    }
}
console.error('Reading stored catalogue, client IDs and sales headers...');
const report = { startedAt: new Date().toISOString(), period: { from, to }, readOnly: true, scope: 'mirror_audit_not_accounting_signoff' };
const runs = unwrap(await db.from('intel_sync_runs').select('id,kind,status,config,cursor,updated_at,last_error').eq('organization_id', org).order('started_at', { ascending: false }).limit(10));
report.runs = runs.map(r => ({ id: r.id, kind: r.kind, status: r.status, config: r.config, updatedAt: r.updated_at, lastError: r.last_error,
    progress: { phase: r.cursor.phase, from: r.cursor.from, to: r.cursor.to, completedDocuments: r.cursor.completedDocuments, completedWindows: r.cursor.completedWindows, clientsComplete: r.cursor.clientsComplete } }));
const documents = await pages(() => base('sales_documents'));
const clients = new Set((await pages(() => db.from('intel_records').select('id,external_id').eq('organization_id', org).eq('resource', 'sales_clients'))).map(r => r.external_id));
const variants = await pages(() => base('variants'));
const products = await pages(() => base('products'));
const productIds = new Set(products.map(r => r.external_id));
const variantMap = new Map(variants.map(r => [r.external_id, r]));
const masters = await pages(() => base('sales_document_types'));
const types = new Map(masters.map(r => [r.external_id, r.data]));
const excluded = await pages(() => base('sales_excluded'));
report.windows = (await pages(() => base('sales_windows'))).map(r => r.data);
report.catalogue = { products: products.length, variants: variants.length, clients: clients.size,
    variantsMissingParent: variants.filter(r => !productIds.has(r.product_id)).length };
for (const resource of ['web', 'collections', 'sales_details', 'inventory_stock', 'inventory_receptions', 'inventory_consumptions']) {
    const query = await db.from('intel_records').select('id', { head: true, count: 'exact' }).eq('organization_id', org).eq('resource', resource);
    unwrap(query); report.catalogue[resource] = query.count;
}
report.catalogueChecks = (await pages(() => base('catalog_checks'))).map(r => r.data);
const eligible = documents.filter(r => String(r.data.documentTypeId) !== '38');
const completed = eligible.filter(r => r.data.complete === true);
report.salesCoverage = { storedHeaders: documents.length, legacyPresales: documents.length - eligible.length,
    excludedPresaleMarkers: excluded.length, nonPresaleHeaders: eligible.length, completeNonPresaleHeaders: completed.length,
    incompleteNonPresaleHeaders: eligible.length - completed.length,
    earliest: completed.map(r => r.data.emissionDay).sort()[0], latest: completed.map(r => r.data.emissionDay).sort().at(-1),
    missingClientId: completed.filter(r => !r.data.clientId).length,
    clientIdNotInMirror: completed.filter(r => r.data.clientId && !clients.has(String(r.data.clientId))).length,
    missingSeller: completed.filter(r => !r.data.sellers?.length).length,
    missingExplicitChannel: completed.filter(r => !r.data.channel).length };
const salesRun = runs.find(r => r.kind === 'sales');
if (salesRun?.config.from && salesRun.config.to) {
    const a = Date.parse(salesRun.config.from) / 1000, b = Date.parse(salesRun.config.to) / 1000 + 86399;
    report.salesCoverage.sourceDocumentsInRequestedRange = (await bsale(`/v1/documents.json?emissiondaterange=[${a},${b}]&limit=1`)).count;
}
const local = documents.filter(r => r.data.emissionDay >= from && r.data.emissionDay <= to);
const source = await remotePages(`/v1/documents.json?emissiondaterange=[${start},${end}]`, true);
report.reconciliation = reconcileHeaders(source, local, new Set(excluded.map(r => r.external_id)));
report.byDocumentType = [...new Set(source.map(r => String(r.document_type?.id)))].map(typeId => {
    const src = source.filter(r => String(r.document_type?.id) === typeId), saved = local.filter(r => String(r.data.documentTypeId) === typeId);
    const type = types.get(typeId);
    return { typeId, name: type?.name, codeSii: type?.codeSii, isCreditNote: type?.isCreditNote,
        source: sumAmounts(src, (r, f) => r[moneyFields[f]]), stored: sumAmounts(saved, (r, f) => r.data[f]),
        states: Object.fromEntries([...new Set(src.map(r => String(r.state)))].map(state => [state, src.filter(r => String(r.state) === state).length])) };
});
// This endpoint returns an aggregate array (not the documents pagination envelope).
// Repeated offset requests can repeat that whole array: never concatenate them.
const summary = await bsale(`/v1/documents/summary.json?emissiondaterange=[${start},${end}]`);
if (!Array.isArray(summary)) throw new Error('Unexpected official summary format.');
report.officialSummary = { rowsReceived: summary.length, groups: compareSummary(summary, report.byDocumentType),
    scope: 'Only types returned by Bsale summary; absence of credit/debit notes is not proof they do not exist.' };
console.error('Checking stored lines and catalogue links for the closed month...');
const selected = local.filter(r => String(r.data.documentTypeId) !== '38');
const lineRows = [];
for (let i = 0; i < selected.length; i += 100) {
    const ids = selected.slice(i, i + 100).map(r => r.external_id);
    lineRows.push(...await pages(() => base('sales_details').like('resource', 'sales_%').in('data->>documentId', ids)));
}
const parents = new Map(selected.map(r => [r.external_id, r]));
const currentLines = lineRows.filter(r => parents.get(r.data.documentId)?.run_id === r.run_id);
const byParent = new Map();
for (const row of currentLines) { const key = row.data.documentId; if (!byParent.has(key)) byParent.set(key, []); byParent.get(key).push(row); }
report.monthLines = { total: currentLines.length, staleRunRows: lineRows.length - currentLines.length,
    documentsWithoutLines: selected.filter(r => !byParent.has(r.external_id)).map(r => r.external_id),
    noVariantId: currentLines.filter(r => !r.data.variantId).length,
    variantNotInMirror: currentLines.filter(r => r.data.variantId && !variantMap.has(String(r.data.variantId))).length,
    distinctMissingVariants: new Set(currentLines.filter(r => r.data.variantId && !variantMap.has(String(r.data.variantId))).map(r => r.data.variantId)).size,
    missingParentProduct: currentLines.filter(r => r.data.variantId && variantMap.has(String(r.data.variantId)) && !productIds.has(variantMap.get(String(r.data.variantId)).product_id)).length,
    missingQuantity: currentLines.filter(r => amount(r.data.quantity) === null).length,
    missingNet: currentLines.filter(r => amount(r.data.net) === null).length,
    missingDiscount: currentLines.filter(r => amount(r.data.netDiscount) === null).length };
report.monthLines.headerVsLineDifferences = selected.flatMap(r => {
    const lines = byParent.get(r.external_id) ?? [];
    const total = lines.reduce((s, row) => s + (amount(row.data.total) ?? 0), 0);
    return lines.length && !moneyEqual(total, r.data.total) ? [{ id: r.external_id, typeId: r.data.documentTypeId, difference: Math.round((total - Number(r.data.total)) * 100) / 100 }] : [];
});
// Sample each fiscal type, including the document with most lines. Full month header checks above are exhaustive.
const samples = new Map();
for (const r of selected) if ([33, 34, 39, 41, 56, 61].includes(Number(types.get(String(r.data.documentTypeId))?.codeSii))) {
    const old = samples.get(r.data.documentTypeId);
    if (!old || (byParent.get(r.external_id)?.length ?? 0) > (byParent.get(old.external_id)?.length ?? 0)) samples.set(r.data.documentTypeId, r);
}
report.liveLineSamples = [];
for (const row of samples.values()) {
    const remote = await remotePages(`/v1/documents/${row.external_id}/details.json`);
    const saved = byParent.get(row.external_id) ?? [];
    const savedMap = new Map(saved.map(r => [r.external_id.split(':')[1], r]));
    const mismatches = remote.filter(r => {
        const d = savedMap.get(String(r.id))?.data;
        return !d || ['quantity', 'netUnitValue', 'totalUnitValue', 'netDiscount', 'totalDiscount'].some(f => !moneyEqual(d[f], r[f]))
            || ['net', 'tax', 'total'].some(f => !moneyEqual(d[f], r[moneyFields[f]])) || String(d.variantId) !== String(r.variant?.id ?? null);
    });
    report.liveLineSamples.push({ documentId: row.external_id, typeId: row.data.documentTypeId, sourceLines: remote.length, storedLines: saved.length, mismatchedLines: mismatches.length });
}
report.finishedAt = new Date().toISOString();
report.limitations = ['Read during live imports; not a transaction-wide snapshot.', 'No tax/accounting sign-off: document-type signs, cancellations, currencies and duplicates need business rules.',
    'All non-presale monthly headers compared; only selected documents had live line-by-line checks.', 'Presales retained from old imports are counted separately, never treated as revenue.', 'No historic margin or historic available-stock assertion.'];
console.log(JSON.stringify(report, null, 2));
