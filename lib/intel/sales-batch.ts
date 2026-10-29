import { identifier, object, type SourceRow } from './normalize';
import { isPreSale, salesRecord, salesRelations, sourcePage, type SalesCursor } from './sales-core';

type RecordRow = ReturnType<typeof salesRecord>;
// Bounded concurrency; a failed fetch aborts the page before its checkpoint moves.
export async function prepareSalesBatch(items: SourceRow[], cursor: SalesCursor, load: (path: string) => Promise<SourceRow>) {
    const results: { records: RecordRow[]; fallback?: string; completed: number }[] = new Array(items.length);
    let next = 0;
    async function consume() {
        while (next < items.length) {
            const index = next++, raw = items[index], id = identifier(raw.id);
            if (!id) throw new Error('Documento sin ID.');
            // Old/minimal source responses still use the resumable document path.
            if (raw.emissionDate == null || !identifier(object(raw.document_type).id)) {
                results[index] = { records: [], fallback: id, completed: 0 }; continue;
            }
            const day = new Date(Number(raw.emissionDate) * 1000).toISOString().slice(0, 10);
            if (day < cursor.from || day > cursor.to) throw new Error('Documento fuera del periodo solicitado.');
            if (isPreSale(raw)) {
                results[index] = { records: [salesRecord('sales_excluded', { id, emissionDay: day, reason: 'preventa' })], completed: 0 }; continue;
            }
            const records: RecordRow[] = [], header = salesRecord('sales_documents', raw);
            let incomplete = false;
            for (const relation of salesRelations) {
                if (relation === 'payments') continue;
                const expanded = object(raw[relation]);
                if (!Array.isArray(expanded.items) || expanded.count == null || Number(expanded.offset ?? 0) !== 0 || Number(expanded.count) !== expanded.items.length) {
                    incomplete = true; break;
                }
                const page = sourcePage(expanded, 0);
                records.push(...page.items.map((child, i) => salesRecord(`sales_${relation}`, child, id, i)));
                if (relation === 'sellers') header.data.sellers = page.items.map(child => ({ id: identifier(child.id), name: [child.firstName, child.lastName].filter(Boolean).join(' ') }));
            }
            if (incomplete) { results[index] = { records: [], fallback: id, completed: 0 }; continue; }
            // Bare payment arrays are not evidence of complete pagination.
            const expandedPayments = object(raw.payments);
            const payments = Array.isArray(expandedPayments.items) && expandedPayments.count != null && Number(expandedPayments.offset ?? 0) === 0 && Number(expandedPayments.count) === expandedPayments.items.length
                ? expandedPayments : await load(`/v1/documents/${id}/payments.json?limit=50&offset=0`);
            const page = sourcePage(payments, 0);
            if (!page.end) { results[index] = { records: [], fallback: id, completed: 0 }; continue; }
            records.push(...page.items.map((child, i) => salesRecord('sales_payments', child, id, i)));
            header.data.complete = true;
            results[index] = { records: [header, ...records], completed: 1 };
        }
    }
    // Await all in-flight requests even on failure: do not leave overlapping retries.
    const settled = await Promise.allSettled(Array.from({ length: Math.min(3, items.length) }, consume));
    const failed = settled.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    return { records: results.flatMap(result => result.records), queue: results.flatMap(result => result.fallback ? [result.fallback] : []), completed: results.reduce((n, result) => n + result.completed, 0) };
}
