import { validDate, type Invoice } from './core';

export type ReceiptLine = { id: string; variantId: string; sku: string; name: string; quantity: number | null; unitCost: number | null; net: number | null };
export type Receipt = {
    id: string; date: string | null; office: string; document: string; folio: string;
    match: 'declared' | 'candidate' | 'mismatch'; matchReason: string;
    source: 'Bsale' | 'Intel'; observedAt: string; complete: boolean;
    lines: ReceiptLine[]; net: number | null; comparison: 'matches' | 'differs' | 'unknown'; difference: number | null;
};
export type ReceptionReport = { checkedAt: string; invoiceNet: number | null; currency: string; receipts: Receipt[]; searchComplete: boolean; warnings: string[] };
export type Row = Record<string, unknown>;
export const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
export function folioKey(value: unknown) { const s = String(value ?? '').trim(); return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : ''; }
const rutKey = (value: unknown) => String(value ?? '').replace(/[.\s-]/g, '').toUpperCase();
const number = (value: unknown): number | null => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export function receiptMatch(invoice: Invoice, raw: Row): { match: Receipt['match']; reason: string } | null {
    const doc = String(raw.document || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (!doc.includes('FACTURA') || !folioKey(raw.documentNumber) || folioKey(raw.documentNumber) !== folioKey(invoice.folio)) return null;
    const marker = String(raw.note || '').match(/FACTO_INVOICE=(\{[^\n]{1,1024}?\})/);
    if (marker) {
        try {
            const link = object(JSON.parse(marker[1]));
            if ((link.bsaleId && String(link.bsaleId) !== invoice.id) || (link.rut && rutKey(link.rut) !== rutKey(invoice.rut)) || (link.type && String(link.type) !== invoice.type) || (link.folio && folioKey(link.folio) !== folioKey(invoice.folio))) return { match: 'mismatch', reason: 'El vínculo declarado identifica otra factura o proveedor.' };
            if (String(link.bsaleId || '') === invoice.id || (rutKey(link.rut) === rutKey(invoice.rut) && String(link.type) === invoice.type && folioKey(link.folio) === folioKey(invoice.folio))) {
                if (link.rut && rutKey(link.rut) !== rutKey(invoice.rut)) return { match: 'mismatch', reason: 'El vínculo declarado corresponde a otro proveedor.' };
                return { match: 'declared', reason: 'La recepción declara el vínculo con esta factura.' };
            }
            return { match: 'mismatch', reason: 'La recepción declara un vínculo con otra factura.' };
        } catch { /* An invalid note is not evidence of a link. */ }
    }
    return { match: 'candidate', reason: 'Coincide el folio y el tipo factura. La recepción no identifica al proveedor; vínculo por confirmar.' };
}
export function receiptLine(raw: Row): ReceiptLine {
    const quantity = number(raw.quantity), cost = number(raw.cost), variant = object(raw.variant);
    const validQuantity = quantity !== null && quantity > 0 ? quantity : null;
    const validCost = cost !== null && cost >= 0 ? cost : null;
    return { id: String(raw.id || ''), variantId: String(variant.id || ''), sku: '', name: String(variant.description || ''), quantity: validQuantity, unitCost: validCost, net: validQuantity !== null && validCost !== null ? validQuantity * validCost : null };
}
export function buildReceipt(invoice: Invoice, invoiceNet: number | null, raw: Row, details: Row[], complete: boolean, source: Receipt['source'], observedAt: string): Receipt | null {
    const match = receiptMatch(invoice, raw); if (!match) return null;
    const lines = details.map(receiptLine);
    const unique = new Set(lines.map(l => l.id));
    complete = complete && lines.length > 0 && unique.size === lines.length && lines.every(l => !!l.id);
    const net = complete && lines.every(l => l.net !== null) ? lines.reduce((sum, l) => sum + l.net!, 0) : null;
    const difference = net !== null && invoiceNet !== null && invoice.currency === 'CLP' && match.match !== 'mismatch' ? net - invoiceNet : null;
    const rawDate = String(raw.rawAdmissionDate || '').slice(0, 10);
    const timestamp = number(raw.admissionDate);
    const fallbackDate = timestamp !== null && timestamp > 0 && Number.isFinite(new Date(timestamp * 1000).getTime()) ? new Date(timestamp * 1000).toISOString().slice(0, 10) : null;
    return { id: String(raw.id), date: validDate(rawDate) ? rawDate : fallbackDate, office: String(object(raw.office).name || object(raw.office).id || 'Sin sucursal informada'), document: String(raw.document), folio: String(raw.documentNumber), match: match.match, matchReason: match.reason, source, observedAt, complete, lines, net, comparison: difference === null ? 'unknown' : Math.abs(difference) < 0.5 ? 'matches' : 'differs', difference };
}
