import assert from 'node:assert/strict';
import { reconcileHeaders, moneyEqual, sumAmounts, compareSummary } from './audit-core.mjs';
const raw = { id: 1, document_type: { id: 1 }, client: { id: 2 }, office: { id: 1 }, state: 0,
    emissionDate: 1738368000, netAmount: 100, taxAmount: 19, exemptAmount: 0, totalAmount: 119 };
const row = { external_id: '1', data: { complete: true, documentTypeId: '1', clientId: '2', officeId: '1', state: 0,
    emissionDay: '2025-02-01', net: 100, tax: 19, exempt: 0, total: 119 } };
assert.equal(reconcileHeaders([raw], [row]).matches, true);
assert.equal(reconcileHeaders([raw, raw], [row]).matches, false);
assert.deepEqual(reconcileHeaders([raw], []).missing, ['1']);
assert.equal(reconcileHeaders([raw], [{ ...row, data: { ...row.data, complete: false } }]).matches, false);
assert.deepEqual(reconcileHeaders([raw], [{ ...row, data: { ...row.data, total: 118 } }]).differences[0].fields, ['total']);
assert.equal(moneyEqual(null, 0), false);
assert.equal(moneyEqual('', 0), false);
assert.equal(moneyEqual(0, 0), true);
const presale = { ...raw, id: 2, document_type: { id: 38 } };
assert.equal(reconcileHeaders([presale], [], new Set(['2'])).matches, true);
assert.equal(reconcileHeaders([presale], []).matches, false);
assert.equal(sumAmounts([{ net: null, total: 0, tax: 0, exempt: 0 }], (r, f) => r[f]).missingAmounts, 1);
const summary = [{ documentTypeName: 'Boleta', count: 2, totalNetAmount: 100, totalTaxAmount: 19, totalExemptAmount: 0, totalAmount: 119 }];
const type = { name: 'Boleta', stored: { count: 2, net: 100, tax: 19, exempt: 0, total: 119, missingAmounts: 0 } };
assert.equal(compareSummary(summary, [type])[0].matches, true);
assert.equal(compareSummary(summary, [type, type])[0].matches, false);
assert.equal(compareSummary(summary, [])[0].matches, false);
console.log('Audit helpers: OK (missing values, duplicate IDs, presale exclusions and monetary differences).');
