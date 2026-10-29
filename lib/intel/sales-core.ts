import { identifier, object, rows, type SourceRow } from './normalize';

export const salesRelations = ['details', 'sellers', 'references', 'payments', 'document_taxes', 'attributes'] as const;
export const salesMasters = ['document_types', 'users', 'offices'] as const;
// Confirmed for Facto's Bsale company; do not exclude every isSalesNote type.
export const excludedSalesTypeIds = ['38'];
export function isPreSale(raw: SourceRow) {
    return excludedSalesTypeIds.includes(String(object(raw.document_type).id ?? ''));
}
export type SalesCursor = {
    phase: 'masters' | 'list' | 'document' | 'relations' | 'finish_document' | 'finish_window' | 'done';
    master: number; offset: number; from: string; to: string; end: string;
    queue: string[]; listEnd: boolean; expected: number | null;
    documentId?: string; relation?: number; childOffset?: number; sellers?: SourceRow[]; pendingRelations?: number[];
    completedDocuments: number; completedWindows: number;
    clientsComplete?: boolean; clientsOffset?: number; clientsExpected?: number;
};
export function validDay(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function dayAfter(day: string) { return new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10); }
export function windowEnd(from: string, end: string) {
    const d = new Date(`${from}T00:00:00Z`);
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return monthEnd < end ? monthEnd : end;
}
export function initialSalesCursor(from: string, end: string): SalesCursor {
    if (!validDay(from) || !validDay(end) || from > end) throw new Error('Periodo de importación inválido.');
    return { phase: 'masters', master: 0, offset: 0, from, to: windowEnd(from, end), end, queue: [], listEnd: false, expected: null, completedDocuments: 0, completedWindows: 0 };
}
export function sourcePage(body: SourceRow, offset: number, limit = 50) {
    if (!Array.isArray(body.items)) throw new Error('Bsale devolvió una colección sin items. No avanzamos el lote.');
    const items = rows(body.items);
    const count = body.count == null ? null : Number(body.count);
    if (count !== null && (!Number.isInteger(count) || count < 0)) throw new Error('Cantidad de registros de Bsale inválida.');
    if (!items.length && count !== null && offset < count) throw new Error('Página vacía antes de terminar. Reanuda la importación.');
    return { items, count, end: count !== null ? offset + items.length >= count : items.length < limit };
}
function amount(value: unknown): number | null {
    if (value == null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('Bsale devolvió un importe o cantidad inválidos.');
    return number;
}
export function salesRecord(resource: string, raw: SourceRow, documentId?: string, position = 0) {
    const id = identifier(raw.id);
    if (!id && !documentId) throw new Error('Registro de ventas sin identificador.');
    const variant = object(raw.variant), product = object(raw.product);
    const data: SourceRow = { documentId: documentId ?? null };
    if (resource === 'sales_documents') {
        const emission = amount(raw.emissionDate);
        if (emission === null || !Number.isFinite(new Date(emission * 1000).getTime())) throw new Error('Documento sin fecha de emisión válida.');
        const type = object(raw.document_type);
        Object.assign(data, {
            // Bsale emissionDate is a calendar date, NOT a Chilean instant (see API docs).
            emissionDay: new Date(emission * 1000).toISOString().slice(0, 10), emissionDate: emission,
            generationDate: raw.generationDate ?? null, expirationDate: raw.expirationDate ?? null,
            number: raw.number ?? null, documentTypeId: identifier(type.id), documentType: type.name ?? null,
            codeSii: type.codeSii ?? null, isCreditNote: type.isCreditNote ?? null, isSalesNote: type.isSalesNote ?? null,
            state: raw.state ?? null, commercialState: raw.commercialState ?? null,
            cancellationStatus: raw.cancellationStatus ?? null, cancellationDate: raw.cancellationDate ?? null,
            clientId: identifier(object(raw.client).id), officeId: identifier(object(raw.office).id), officeName: object(raw.office).name ?? null,
            issuerId: identifier(raw.userId ?? object(raw.user).id), issuerName: [object(raw.user).firstName, object(raw.user).lastName].filter(Boolean).join(' ') || null,
            salesId: raw.salesId ?? null,
            // A salesId is NOT evidence of a web/physical channel. Preserve without inferring.
            channel: raw.channel ?? raw.salesChannel ?? null,
            currency: raw.coin ?? null, priceList: raw.priceList ?? null,
            net: amount(raw.netAmount), tax: amount(raw.taxAmount), exempt: amount(raw.exemptAmount), total: amount(raw.totalAmount),
            complete: false, sellers: [],
        });
    } else if (resource === 'sales_clients') {
        Object.assign(data, { clientId: id, firstName: raw.firstName ?? null, lastName: raw.lastName ?? null,
            company: raw.company ?? null, code: raw.code ?? null, email: raw.email ?? null, phone: raw.phone ?? null,
            city: raw.city ?? null, municipality: raw.municipality ?? null, address: raw.address ?? null,
            state: raw.state ?? null, companyOrPerson: raw.companyOrPerson ?? null });
    } else if (resource === 'sales_details') {
        Object.assign(data, { variantId: identifier(variant.id), sku: variant.code ?? null, variantName: variant.description ?? null,
            productName: product.name ?? null, quantity: amount(raw.quantity), netUnitValue: amount(raw.netUnitValue), totalUnitValue: amount(raw.totalUnitValue),
            net: amount(raw.netAmount), tax: amount(raw.taxAmount), total: amount(raw.totalAmount), netDiscount: amount(raw.netDiscount),
            totalDiscount: amount(raw.totalDiscount), discountPercentage: amount(raw.discountPercentage), relatedDetailId: raw.relatedDetailId ?? null });
    } else Object.assign(data, raw, { documentId: documentId ?? null });
    return { resource, external_id: documentId ? `${documentId}:${id ?? 'no-id'}:${position}` : id!, name: String(raw.name ?? raw.number ?? [raw.firstName, raw.lastName].filter(Boolean).join(' ')),
        product_id: identifier(product.id), category_id: null, data, raw };
}
