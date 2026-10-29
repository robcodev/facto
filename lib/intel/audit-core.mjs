// Read-only reconciliation helpers. A matching mirror is not an accounting sign-off.
export const moneyFields = { net: 'netAmount', tax: 'taxAmount', exempt: 'exemptAmount', total: 'totalAmount' };
export function amount(value) {
    return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
}
export function moneyEqual(left, right) {
    const a = amount(left), b = amount(right);
    return a !== null && b !== null && Math.abs(a - b) < 0.01;
}
const id = value => value == null ? null : String(value);
export function reconcileHeaders(source, stored, excludedIds = new Set()) {
    const saved = new Map(stored.map(row => [row.external_id, row]));
    const sourceIds = new Set(source.map(row => String(row.id)));
    const result = { sourceCount: source.length, duplicateSourceIds: source.length - sourceIds.size,
        storedCount: stored.length, missing: [], extra: [], excludedPresales: 0, legacyPresales: 0,
        incomplete: [], differences: [], compared: 0 };
    for (const raw of source) {
        const key = String(raw.id), row = saved.get(key);
        if (String(raw.document_type?.id) === '38') {
            if (row) result.legacyPresales++;
            else if (excludedIds.has(key)) result.excludedPresales++;
            else result.missing.push(key);
            continue;
        }
        if (!row) { result.missing.push(key); continue; }
        result.compared++;
        if (row.data.complete !== true) result.incomplete.push(key);
        const fields = [];
        for (const [local, remote] of Object.entries(moneyFields)) {
            if (!moneyEqual(row.data[local], raw[remote])) fields.push(local);
        }
        const expected = { documentTypeId: id(raw.document_type?.id), clientId: id(raw.client?.id),
            officeId: id(raw.office?.id), state: id(raw.state),
            emissionDay: new Date(Number(raw.emissionDate) * 1000).toISOString().slice(0, 10) };
        for (const [field, value] of Object.entries(expected)) if (id(row.data[field]) !== value) fields.push(field);
        if (fields.length) result.differences.push({ id: key, fields });
    }
    result.extra = stored.filter(row => !sourceIds.has(row.external_id)).map(row => row.external_id);
    result.matches = !result.duplicateSourceIds && !result.missing.length && !result.extra.length && !result.incomplete.length && !result.differences.length;
    return result;
}
export function sumAmounts(rows, read) {
    const result = { count: rows.length, net: 0, tax: 0, exempt: 0, total: 0, missingAmounts: 0 };
    for (const row of rows) for (const field of Object.keys(moneyFields)) {
        const value = amount(read(row, field));
        if (value === null) result.missingAmounts++;
        else result[field] += value;
    }
    for (const field of Object.keys(moneyFields)) result[field] = Math.round(result[field] * 100) / 100;
    return result;
}
export function compareSummary(summary, byType) {
    const groups = new Map();
    for (const row of summary) {
        const key = row.documentTypeName;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    const fields = { net: 'totalNetAmount', tax: 'totalTaxAmount', exempt: 'totalExemptAmount', total: 'totalAmount' };
    return [...groups].map(([name, rows]) => {
        const totals = sumAmounts(rows, (r, field) => r[fields[field]]);
        totals.count = rows.reduce((sum, r) => sum + Number(r.count), 0);
        const candidates = byType.filter(r => r.name === name);
        const stored = candidates.length === 1 ? candidates[0].stored : null;
        return { name, summary: totals, stored, matches: Boolean(stored && !totals.missingAmounts && !stored.missingAmounts
            && totals.count === stored.count && Object.keys(fields).every(f => moneyEqual(totals[f], stored[f]))) };
    });
}
