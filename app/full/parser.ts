import type { FullReportAnalysis, FullReportExclusion, FullReportItem } from './types';

type Cell = unknown;

const clean = (value: Cell) => String(value ?? '').trim();
const normalized = (value: Cell) => clean(value).toLocaleLowerCase('es-CL');

const findHeaderIndex = (headers: Cell[], label: string, occurrence = 0) => {
    const matches = headers
        .map((header, index) => ({ header: normalized(header), index }))
        .filter(({ header }) => header === label.toLocaleLowerCase('es-CL'));

    return matches[occurrence]?.index ?? -1;
};

const isDelivered = (status: string) => normalized(status) === 'entregado';

export function parseFullSalesRows(rawRows: Cell[][], sheetName: string): FullReportAnalysis {
    const headerRowIndex = rawRows.findIndex((row) =>
        row.some((cell) => normalized(cell) === '# de venta') &&
        row.some((cell) => normalized(cell) === 'sku')
    );

    if (headerRowIndex < 0) {
        throw new Error('No encontramos los encabezados esperados del reporte de ventas de Mercado Libre.');
    }

    const headers = rawRows[headerRowIndex];
    const saleIndex = findHeaderIndex(headers, '# de venta');
    const dateIndex = findHeaderIndex(headers, 'Fecha de venta');
    const statusIndex = findHeaderIndex(headers, 'Estado');
    const packageIndex = findHeaderIndex(headers, 'Paquete de varios productos');
    const unitsIndex = findHeaderIndex(headers, 'Unidades');
    const skuIndex = findHeaderIndex(headers, 'SKU');
    const titleIndex = findHeaderIndex(headers, 'Título de la publicación');
    const deliveryIndex = findHeaderIndex(headers, 'Forma de entrega');

    const required = [saleIndex, dateIndex, statusIndex, packageIndex, unitsIndex, skuIndex, titleIndex, deliveryIndex];
    if (required.some((index) => index < 0)) {
        throw new Error('El reporte no contiene todas las columnas necesarias: venta, fecha, estado, unidades, SKU y forma de entrega.');
    }

    const rows = rawRows
        .slice(headerRowIndex + 1)
        .filter((row) => row.some((cell) => clean(cell) !== ''));

    const fullCombinedPurchaseDates = new Set(
        rows
            .filter((row) =>
                normalized(row[deliveryIndex]).includes('full') &&
                normalized(row[statusIndex]).startsWith('paquete de ') &&
                !clean(row[skuIndex])
            )
            .map((row) => clean(row[dateIndex]))
    );

    const combinedChildren = new Set<number>();
    const exclusions = new Map<string, FullReportExclusion>();
    const grouped = new Map<string, FullReportItem>();
    let includedRows = 0;
    let includedUnits = 0;

    rows.forEach((row, rowIndex) => {
        const sku = clean(row[skuIndex]);
        const status = clean(row[statusIndex]);
        const delivery = normalized(row[deliveryIndex]);
        const date = clean(row[dateIndex]);
        const isCombinedChild = Boolean(
            sku &&
            normalized(row[packageIndex]) === 'sí' &&
            !delivery &&
            fullCombinedPurchaseDates.has(date)
        );

        if (isCombinedChild) combinedChildren.add(rowIndex);

        const isFull = delivery.includes('full') || isCombinedChild;
        if (!isFull || !sku) return;

        const quantity = Number(row[unitsIndex]);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            const key = 'Cantidad inválida';
            const current = exclusions.get(key) ?? { status: key, rows: 0, units: 0 };
            current.rows += 1;
            exclusions.set(key, current);
            return;
        }

        if (!isDelivered(status)) {
            const key = status || 'Estado vacío';
            const current = exclusions.get(key) ?? { status: key, rows: 0, units: 0 };
            current.rows += 1;
            current.units += quantity;
            exclusions.set(key, current);
            return;
        }

        const current = grouped.get(sku) ?? {
            originalSku: sku,
            fullSku: `FULL${sku}`,
            quantity: 0,
            title: clean(row[titleIndex]),
            saleCount: 0,
        };

        current.quantity += quantity;
        current.saleCount += 1;
        if (!current.title) current.title = clean(row[titleIndex]);
        grouped.set(sku, current);
        includedRows += 1;
        includedUnits += quantity;
    });

    return {
        sheetName,
        sourceRows: rows.length,
        includedRows,
        includedUnits,
        combinedPurchaseRows: combinedChildren.size,
        items: [...grouped.values()].sort((a, b) => a.originalSku.localeCompare(b.originalSku)),
        exclusions: [...exclusions.values()].sort((a, b) => b.rows - a.rows),
    };
}
