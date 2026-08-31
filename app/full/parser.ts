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
    const totalIndex = findHeaderIndex(headers, 'Total (CLP)');
    const salePriceIndex = findHeaderIndex(headers, 'Precio unitario de venta de la publicación (CLP)');

    const required = [saleIndex, dateIndex, statusIndex, packageIndex, unitsIndex, skuIndex, titleIndex, deliveryIndex, totalIndex, salePriceIndex];
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

    const combinedAllocations = new Map<number, number>();
    let combinedAllocatedWithTax = 0;
    rows.forEach((parentRow) => {
        const date = clean(parentRow[dateIndex]);
        if (!normalized(parentRow[deliveryIndex]).includes('full') || !normalized(parentRow[statusIndex]).startsWith('paquete de ') || clean(parentRow[skuIndex])) return;
        const packageTotal = Number(parentRow[totalIndex]);
        if (!Number.isFinite(packageTotal) || packageTotal <= 0) return;
        const children = rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => clean(row[dateIndex]) === date && clean(row[skuIndex]) && normalized(row[packageIndex]) === 'sí' && !clean(row[deliveryIndex]));
        const weights = children.map(({ row }) => Number(row[salePriceIndex]) * Number(row[unitsIndex]));
        const weightTotal = weights.reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0);
        if (weightTotal <= 0) return;
        let assigned = 0;
        children.forEach(({ index }, childIndex) => {
            const allocation = childIndex === children.length - 1
                ? packageTotal - assigned
                : Math.round((packageTotal * weights[childIndex] / weightTotal) * 100) / 100;
            combinedAllocations.set(index, allocation);
            assigned += allocation;
        });
        combinedAllocatedWithTax += packageTotal;
    });

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


        const finalAmountWithTax = isCombinedChild ? combinedAllocations.get(rowIndex) : Number(row[totalIndex]);
        if (!Number.isFinite(finalAmountWithTax) || Number(finalAmountWithTax) <= 0) {
            const key = 'Importe final pendiente';
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
            finalAmountWithTax: 0,
            presaleNetUnitValue: 0,
        };

        current.quantity += quantity;
        current.saleCount += 1;
        current.finalAmountWithTax += Number(finalAmountWithTax);
        if (!current.title) current.title = clean(row[titleIndex]);
        grouped.set(sku, current);
        includedRows += 1;
        includedUnits += quantity;
    });

    const items = [...grouped.values()]
        .map((item) => ({
            ...item,
            finalAmountWithTax: Math.round(item.finalAmountWithTax * 100) / 100,
            presaleNetUnitValue: Math.round((item.finalAmountWithTax / item.quantity / 1.19) * 1000000) / 1000000,
        }))
        .sort((a, b) => a.originalSku.localeCompare(b.originalSku));

    return {
        sheetName,
        sourceRows: rows.length,
        includedRows,
        includedUnits,
        combinedPurchaseRows: combinedChildren.size,
        totalReceivedWithTax: Math.round(items.reduce((sum, item) => sum + item.finalAmountWithTax, 0) * 100) / 100,
        combinedAllocatedWithTax: Math.round(combinedAllocatedWithTax * 100) / 100,
        items,
        exclusions: [...exclusions.values()].sort((a, b) => b.rows - a.rows),
    };
}
