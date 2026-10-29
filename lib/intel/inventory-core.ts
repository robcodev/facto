import { identifier, object, type SourceRow } from './normalize';

export type InventoryCursor = {
    phase: 'stocks' | 'list' | 'details' | 'check' | 'done';
    source: 'receptions' | 'consumptions'; offset: number; childOffset: number;
    queue: SourceRow[]; listEnd: boolean; expected: number | null;
    completedMovements: number; stockRows: number; detailExpected?: number; detailCount: number;
    checkingStock?: boolean;
};
export const initialInventoryCursor = (): InventoryCursor => ({
    phase: 'stocks', source: 'receptions', offset: 0, childOffset: 0, queue: [], listEnd: false,
    expected: null, completedMovements: 0, stockRows: 0, detailCount: 0,
});
function numeric(value: unknown, required = false): number | null {
    if (value == null || value === '') { if (required) throw new Error('Cantidad de inventario ausente.'); return null; }
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('Cantidad o costo inválido.');
    return n;
}
export function inventoryRecord(resource: string, raw: SourceRow, data: SourceRow, externalId?: string) {
    const id = externalId ?? identifier(raw.id);
    if (!id) throw new Error('Inventario sin identificador.');
    return { resource, external_id: id, name: '', product_id: null, category_id: null, raw, data };
}
export function stockObservation(raw: SourceRow, runId: string, observedAt: string) {
    const variantId = identifier(object(raw.variant).id), officeId = identifier(object(raw.office).id), id = identifier(raw.id);
    if (!variantId || !officeId || !id) throw new Error('Stock sin variante, sucursal o ID.');
    return inventoryRecord('inventory_stock', raw, {
        variantId, officeId, physical: numeric(raw.quantity, true), reserved: numeric(raw.quantityReserved, true),
        available: numeric(raw.quantityAvailable, true), observedAt, evidence: 'observed',
    }, `${runId}:${id}`);
}
export function movementHeader(source: 'receptions' | 'consumptions', raw: SourceRow) {
    const date = numeric(source === 'receptions' ? raw.admissionDate : raw.consumptionDate, true)!;
    const officeId = identifier(object(raw.office).id);
    if (!officeId || !Number.isFinite(new Date(date * 1000).getTime())) throw new Error('Movimiento sin fecha o sucursal.');
    return inventoryRecord(`inventory_${source}`, raw, {
        officeId, date, updateStock: raw.updateStock ?? null, complete: false, evidence: 'observed',
    });
}
export function movementDetail(source: 'receptions' | 'consumptions', parent: SourceRow, raw: SourceRow) {
    const header = movementHeader(source, parent);
    const variantId = identifier(object(raw.variant).id), id = identifier(raw.id);
    if (!variantId || !id) throw new Error('Detalle sin variante o ID.');
    return inventoryRecord(`inventory_${source}_details`, raw, {
        ...header.data, movementId: header.external_id, variantId, quantity: numeric(raw.quantity, true),
        cost: numeric(raw.cost), reportedVariantStock: numeric(raw.variantStock),
        // Cost is the source's receipt/consumption cost, not a cost assigned to a sale.
        costBasis: source === 'receptions' ? 'receipt_reported' : 'consumption_reported',
    }, `${header.external_id}:${id}`);
}
// Diagnostic only: variantStock's balance semantics and complete movement coverage
// must be confirmed before a computed balance can be published as historical stock.
export function inventoryDiagnostic(details: SourceRow[], current: SourceRow | null, captured: SourceRow | null = null) {
    const difference = (key: string) => current?.[key] != null && captured?.[key] != null ? Number(current[key]) - Number(captured[key]) : null;
    return {
        status: 'not_reconciled', evidence: 'observed', current, captured,
        differenceSinceCapture: { physical: difference('physical'), available: difference('available'), reserved: difference('reserved') },
        receiptRows: details.filter(d => d.costBasis === 'receipt_reported').length,
        consumptionRows: details.filter(d => d.costBasis === 'consumption_reported').length,
        missingCosts: details.filter(d => d.cost == null).length,
        zeroCosts: details.filter(d => d.cost === 0).length,
        unknownStockEffect: details.filter(d => ![0, 1, false, true].includes(d.updateStock as number)).length,
        historicalAvailable: null, reconstructedPhysical: null,
        warnings: [
            'No se certifica stock histórico: faltan validar ventas, devoluciones, ajustes, traslados y reservas.',
            'variantStock se conserva tal como lo entrega Bsale; no se presupone que sea el saldo posterior.',
            'No se aplica el costo actual ni el último costo de recepción a ventas pasadas.',
            'Una diferencia entre la captura y la consulta actual puede corresponder a movimientos posteriores, no necesariamente a un error.',
        ],
    };
}
