import { z } from 'zod';

export const MAX_ROWS = 2000;
const id = z.string().uuid();
const amount = z.number().finite().nonnegative().max(1e12).nullable();
export const inputRow = z.object({
    code: z.string().trim().max(100), productName: z.string().trim().max(200),
    variantName: z.string().trim().max(200), quantity: amount, cost: amount, priceGross: amount,
});
export type ExtractedRow = z.infer<typeof inputRow>;
export type ImportGroup = { id: string; name: string; typeId: number | null; selectedParentId: number | null; productId: number | null };
export type ImportRow = { id: string; groupId: string; code: string; variantName: string; quantity: number | null; cost: number | null; priceGross: number | null; checked: boolean; variantId: number | null; existing: boolean; active: boolean | null; matchedName: string | null; priceSaved: boolean; issue: string | null };
export type Pending = { kind: 'product' | 'variant' | 'price' | 'receipt'; id: string };
export type ImportDocument = {
    number: string; documentType: 'FACTURA' | 'GUÍA' | 'OTRO'; officeId: number | null; priceListId: number | null; note: string;
    groups: ImportGroup[]; rows: ImportRow[]; phase: 'draft' | 'checking' | 'review' | 'creating' | 'verifying' | 'ready' | 'received';
    readyAt: string | null;
    pending: Pending | null; receiptId: number | null; lastError: string | null;
};
export type ImportProject = { id: string; document: ImportDocument; version: number; updated_at: string; lease_until: string | null };
export class ImportError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const normalized = (value: string) => value.trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleUpperCase('es-CL');
export function newDocument(items: ExtractedRow[], number = ''): ImportDocument {
    if (items.length > MAX_ROWS) throw new ImportError(`Se admiten hasta ${MAX_ROWS} variantes por documento.`);
    const groups = new Map<string, ImportGroup>();
    const rows = items.map(item => {
        const key = normalized(item.productName) || crypto.randomUUID();
        const group = groups.get(key) ?? { id: crypto.randomUUID(), name: item.productName, typeId: null, selectedParentId: null, productId: null };
        groups.set(key, group);
        return { id: crypto.randomUUID(), groupId: group.id, code: item.code, variantName: item.variantName, quantity: item.quantity, cost: item.cost, priceGross: item.priceGross, checked: false, variantId: null, existing: false, active: null, matchedName: null, priceSaved: false, issue: null };
    });
    return { number, documentType: 'FACTURA', officeId: null, priceListId: null, note: '', groups: [...groups.values()], rows, phase: 'draft', readyAt: null, pending: null, receiptId: null, lastError: null };
}
export const editableSchema = z.object({
    number: z.string().trim().max(30), documentType: z.enum(['FACTURA', 'GUÍA', 'OTRO']),
    officeId: z.number().int().positive().nullable(), priceListId: z.number().int().positive().nullable(), note: z.string().max(1000),
    groups: z.array(z.object({ id, name: z.string().trim().max(200), typeId: z.number().int().positive().nullable(), selectedParentId: z.number().int().positive().nullable() })).max(MAX_ROWS),
    rows: z.array(z.object({ id, groupId: id, code: z.string().trim().max(100), variantName: z.string().trim().max(200), quantity: amount, cost: amount, priceGross: amount })).max(MAX_ROWS),
});
export function editDocument(old: ImportDocument, value: unknown): ImportDocument {
    if (!['draft', 'review'].includes(old.phase) || old.pending) throw new ImportError('La creación ya comenzó. Conserva este avance y resuelve el paso pendiente antes de continuar.', 409);
    const input = editableSchema.parse(value);
    if (new Set(input.rows.map(r => r.id)).size !== input.rows.length || new Set(input.groups.map(g => g.id)).size !== input.groups.length) throw new ImportError('Hay identificadores de fila o grupo repetidos.');
    const groupIds = new Set(input.groups.map(g => g.id));
    if (input.rows.some(r => !groupIds.has(r.groupId))) throw new ImportError('Una variante no tiene un producto padre válido.');
    const prior = new Map(old.rows.map(r => [r.id, r]));
    const rows = input.rows.map(r => {
        const previous = prior.get(r.id);
        return previous?.code === r.code ? { ...previous, ...r } : { ...r, checked: false, variantId: null, existing: false, active: null, matchedName: null, priceSaved: false, issue: null };
    });
    return { ...old, ...input, groups: input.groups.map(g => ({ ...g, productId: null })), rows, phase: rows.length && rows.every(r => r.checked) ? 'review' : 'draft', readyAt: null, lastError: null };
}
export function problems(d: ImportDocument, creating = false) {
    const result: string[] = [], seen = new Set<string>();
    if (!d.rows.length) result.push('Agrega al menos una variante.');
    if (d.rows.length > MAX_ROWS) result.push(`Se admiten hasta ${MAX_ROWS} variantes por documento.`);
    const groups = new Map(d.groups.map(g => [g.id, g]));
    d.rows.forEach((row, i) => {
        const label = `Fila ${i + 1}`, group = groups.get(row.groupId), sku = normalized(row.code);
        if (!sku) result.push(`${label}: falta el SKU.`);
        if (seen.has(sku)) result.push(`${label}: SKU repetido en el documento.`); seen.add(sku);
        if (!group?.name.trim()) result.push(`${label}: falta el nombre del producto.`);
        if (!row.variantName.trim()) result.push(`${label}: falta el nombre de la variante.`);
        if (row.quantity === null || !Number.isInteger(row.quantity) || row.quantity <= 0) result.push(`${label}: la cantidad debe ser un entero mayor que cero.`);
        if (row.cost === null || !Number.isFinite(row.cost) || row.cost < 0) result.push(`${label}: falta un costo neto válido.`);
        if (creating) {
            if (!row.checked || row.issue) result.push(`${label}: ${row.issue || 'falta validar el SKU en Bsale.'}`);
            if (!row.existing && !group?.selectedParentId && !group?.typeId) result.push(`${label}: selecciona el tipo de producto.`);
            if (!row.existing && (row.priceGross === null || !Number.isFinite(row.priceGross) || row.priceGross <= 0)) result.push(`${label}: falta un precio de venta con IVA mayor que cero.`);
        }
    });
    if (creating && d.rows.some(r => !r.existing) && !d.priceListId) result.push('Selecciona la lista donde guardar los precios de las variantes nuevas.');
    if (creating && (!d.officeId || !/^\d+$/.test(d.number) || !Number.isSafeInteger(Number(d.number)) || Number(d.number) <= 0)) result.push('Completa la sucursal y un folio numérico válido para la recepción.');
    return result;
}
export function requireReady(d: ImportDocument) {
    if (d.phase !== 'ready' || d.pending || d.rows.some(r => !r.variantId || !r.active || (!r.existing && !r.priceSaved))) throw new ImportError('Primero completa la creación y los precios de todas las variantes.');
    if (!d.officeId || !/^\d+$/.test(d.number) || !Number.isSafeInteger(Number(d.number)) || Number(d.number) <= 0) throw new ImportError('Selecciona sucursal e ingresa un folio numérico válido antes de recepcionar.');
}
