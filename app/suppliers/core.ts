export type PaymentChoice = { method: '' | 'Cheque' | 'Transferencia' | 'Efectivo' | 'Otro'; cheque: string };
export type PaidRecord = PaymentChoice & { paidAt: string; updatedAt: string; actor: string; revision: number; total: number; currency: string };
export function isPaid(invoice: Invoice, payment?: PaidRecord) { return !!payment?.paidAt && payment.total === invoice.total && payment.currency === invoice.currency; }
export type Due = { date: string; amount: number };
export type Invoice = {
    id: string; key: string; rut: string; supplier: string; type: string; folio: string;
    issued: string | null; received: string | null; total: number; currency: string; net?: number | null;
    dues: Due[]; dueIssue: string | null; declaredPayment: string | null; pdf: string | null;
};
export type SourcePage = { invoices: Invoice[]; count: number; nextOffset: number | null; excluded: number; xmlUnavailable: number; };
export const money = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function validDate(s: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s; }
export function monthShift(month: string, n: number) { const d = new Date(`${month}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); }
export function monthsBetween(from: string, to: string) { const result: string[] = []; for (let m = from; m <= to && result.length < 12; m = monthShift(m, 1)) result.push(m); return result; }
export function calendarDays(month: string) {
    const d = new Date(`${month}-01T12:00:00Z`), offset = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(1 - offset);
    return Array.from({ length: 42 }, (_, n) => { const v = new Date(d); v.setUTCDate(v.getUTCDate() + n); return v.toISOString().slice(0, 10); });
}
export function unixDay(value: unknown): string | null { const n = Number(value); return Number.isFinite(n) && n > 0 ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(n * 1000)) : null; }
export function safeDocumentUrl(value: unknown): string | null {
    try { const u = new URL(String(value)); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && ['dte.bsale.cl', 'dte.bsale.io', 'api.bsale.io'].includes(u.hostname) ? u.href : null; } catch { return null; }
}
export function bsaleDocumentUrl(value: unknown): string | null {
    try { const url = new URL(String(value)); if (url.protocol === 'http:') url.protocol = 'https:'; return safeDocumentUrl(url.href); } catch { return null; }
}
export function normalizeHeader(raw: Record<string, unknown>): Invoice | null {
    if (!['30', '32', '33', '34', '45', '46'].includes(String(raw.codeSii)) || Number(raw.canceled) !== 0 || (raw.include != null && Number(raw.include) !== 1) || (raw.bookType && String(raw.bookType).toLowerCase() !== 'compra')) return null;
    const rut = String(raw.clientCode || '').replace(/[.\s]/g, '').toUpperCase();
    const total = Number(raw.totalAmount);
    if (!/^\d+$/.test(String(raw.id)) || !rut || !String(raw.number ?? '') || !Number.isFinite(total) || total < 0) throw new Error('Bsale entregó una factura incompleta.');
    const netValue = raw.netAmount == null || raw.netAmount === '' ? null : Number(raw.netAmount);
    const exempt = raw.exemptAmount == null || raw.exemptAmount === '' ? 0 : Number(raw.exemptAmount);
    const net = ['32', '34'].includes(String(raw.codeSii)) ? (exempt > 0 ? exempt : netValue) : netValue === null ? null : netValue + exempt;
    const safeNet = net !== null && Number.isFinite(net) && net >= 0 ? net : null;
    return { id: String(raw.id), key: `${rut}:${raw.codeSii}:${String(raw.number).replace(/^0+(?=\d)/, '')}`, rut, supplier: String(raw.clientActivity || rut), type: String(raw.codeSii), folio: String(raw.number), issued: unixDay(raw.emissionDate), received: unixDay(raw.siiReceptionDate), total, net: safeNet, currency: 'CLP', dues: [], dueIssue: 'Sin vencimiento informado', declaredPayment: null, pdf: bsaleDocumentUrl(raw.urlPdf) };
}
// Extract only bounded DTE header fields; do not resolve entities or keep XML bodies.
function blocks(xml: string, tag: string) { return [...xml.matchAll(new RegExp(`<(?:(?:[\\w.-]+):)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${tag}\\s*>`, 'g'))].map(m => m[1]); }
function field(xml: string, tag: string) { const values = blocks(xml, tag); if (values.length > 1) throw new Error('Campo XML ambiguo'); return values[0]?.trim() ?? ''; }
const rutKey = (s: string) => s.replace(/[.\s-]/g, '').toUpperCase();
export function enrichFromXml(invoice: Invoice, xml: string): Invoice {
    if (xml.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML no compatible');
    const headers = blocks(xml, 'Encabezado'); if (headers.length !== 1) throw new Error('XML sin encabezado único');
    const h = headers[0], ident = field(h, 'IdDoc'), issuer = field(h, 'Emisor'), totals = field(h, 'Totales');
    if (field(ident, 'Folio').replace(/^0+(?=\d)/, '') !== invoice.folio.replace(/^0+(?=\d)/, '') || field(ident, 'TipoDTE') !== invoice.type || rutKey(field(issuer, 'RUTEmisor')) !== rutKey(invoice.rut) || !field(totals, 'MntTotal') || Math.abs(Number(field(totals, 'MntTotal')) - invoice.total) > 0.5) throw new Error('XML no coincide con factura');
    const currency = field(totals, 'TpoMoneda');
    const xmlNet = field(totals, 'MntNeto'), xmlExempt = field(totals, 'MntExe');
    const net = xmlNet || xmlExempt ? Number(xmlNet || 0) + Number(xmlExempt || 0) : invoice.net ?? null;
    const result = { ...invoice, net: net !== null && Number.isFinite(net) && net >= 0 ? net : null, currency: !currency || /^(CLP|PESO(?:S)?(?: CHILENO(?:S)?)?)$/i.test(currency) ? 'CLP' : currency, declaredPayment: ({ '1': 'Contado declarado en XML', '2': 'Crédito declarado en XML', '3': 'Sin costo declarado en XML' } as Record<string, string>)[field(ident, 'FmaPago')] ?? null };
    const schedule = blocks(ident, 'MntPagos');
    if (schedule.length) {
        const dues = schedule.map(s => ({ date: field(s, 'FchPago'), amount: Number(field(s, 'MntPago')) }));
        if (dues.some(d => !validDate(d.date) || !Number.isFinite(d.amount) || d.amount <= 0) || Math.abs(dues.reduce((s, d) => s + d.amount, 0) - invoice.total) > 0.5) return { ...result, dues: [], dueIssue: 'Calendario XML incompleto o distinto del total' };
        return { ...result, dues, dueIssue: null };
    }
    const date = field(ident, 'FchVenc');
    return validDate(date) ? { ...result, dues: [{ date, amount: invoice.total }], dueIssue: null } : { ...result, dues: [], dueIssue: 'Sin vencimiento informado en XML' };
}
export function daySummary(invoices: Invoice[], date: string, payments: Record<string, PaidRecord> = {}) {
    const received = invoices.filter(i => i.received === date);
    const paid = invoices.filter(i => isPaid(i, payments[i.key]) && unixDay(Date.parse(payments[i.key].paidAt) / 1000) === date);
    const due = invoices.filter(i => !isPaid(i, payments[i.key])).flatMap(i => i.dues.filter(d => d.date === date).map(d => ({ invoice: i, ...d })));
    return { received, due, paid, paidTotal: paid.filter(i => i.currency === 'CLP').reduce((s, i) => s + i.total, 0), receivedTotal: received.filter(i => i.currency === 'CLP').reduce((s, i) => s + i.total, 0), dueTotal: due.filter(d => d.invoice.currency === 'CLP').reduce((s, d) => s + d.amount, 0) };
}
export function validateChoice(choice: PaymentChoice) {
    if (!['', 'Cheque', 'Transferencia', 'Efectivo', 'Otro'].includes(choice.method)) throw new Error('Forma de pago inválida.');
    if (choice.method === 'Cheque' && (!choice.cheque.trim() || choice.cheque.length > 80)) throw new Error('Ingresa el número del cheque, conservando sus ceros iniciales.');
    return { method: choice.method, cheque: choice.method === 'Cheque' ? choice.cheque.trim() : '' };
}
