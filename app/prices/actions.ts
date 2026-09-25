'use server';

import type {
    BsalePriceList,
    PriceComparisonRow,
    PriceCatalogRow,
    BsaleOfficeOption,
    VariantStock,
    PriceUpdateInput,
    PriceUpdateResult,
} from './types';

const BSALE_TOKEN = process.env.BSALE_TOKEN;
const BSALE_API = 'https://api.bsale.io/v1';
const PAGE_SIZE = 50;
const IVA_FACTOR = 1.19;

function getHeaders() {
    if (!BSALE_TOKEN) throw new Error('Falta configurar la variable de entorno BSALE_TOKEN.');
    return { 'Content-Type': 'application/json', access_token: BSALE_TOKEN };
}

async function getJson(path: string) {
    const response = await fetch(`${BSALE_API}${path}`, {
        headers: getHeaders(),
        cache: 'no-store',
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
        throw new Error(String(data.description ?? data.message ?? data.error ?? data.raw ?? response.statusText));
    }
    return data;
}

async function getAllPages(path: string) {
    const separator = path.includes('?') ? '&' : '?';
    const first = await getJson(`${path}${separator}limit=${PAGE_SIZE}&offset=0`);
    const count = Number(first.count ?? 0);
    const firstItems = Array.isArray(first.items) ? first.items as Array<Record<string, unknown>> : [];
    const offsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < count; offset += PAGE_SIZE) offsets.push(offset);

    const pages: Array<Array<Record<string, unknown>>> = [];
    for (let start = 0; start < offsets.length; start += 8) {
        const batch = offsets.slice(start, start + 8);
        const responses = await Promise.all(batch.map(async (offset) => {
            const page = await getJson(`${path}${separator}limit=${PAGE_SIZE}&offset=${offset}`);
            return Array.isArray(page.items) ? page.items as Array<Record<string, unknown>> : [];
        }));
        pages.push(...responses);
    }
    return [firstItems, ...pages].flat();
}

export async function getPriceLists() {
    try {
        const items = await getAllPages('/price_lists.json');
        const lists: BsalePriceList[] = items.map((item) => ({
            id: Number(item.id),
            name: String(item.name ?? `Lista ${item.id}`),
            state: Number(item.state ?? 1),
            base: item.base == null ? null : Number(item.base),
        })).filter((item) => Number.isInteger(item.id) && item.id > 0);
        lists.sort((a, b) => a.state - b.state || a.name.localeCompare(b.name, 'es'));
        return { success: true as const, lists };
    } catch (error) {
        return { success: false as const, lists: [], error: error instanceof Error ? error.message : 'No pudimos cargar las listas.' };
    }
}

type DetailInfo = {
    detailId: number;
    variantId: number;
    priceWithTaxes: number;
    sku: string;
    variantName: string;
    productId: number;
    variantState: number;
};

function parseDetail(item: Record<string, unknown>): DetailInfo | null {
    const variant = item.variant && typeof item.variant === 'object'
        ? item.variant as Record<string, unknown>
        : null;
    const product = variant?.product && typeof variant.product === 'object'
        ? variant.product as Record<string, unknown>
        : null;
    const detailId = Number(item.id);
    const variantId = Number(variant?.id);
    const productId = Number(product?.id);
    const priceWithTaxes = Number(item.variantValueWithTaxes);
    if (![detailId, variantId, productId, priceWithTaxes].every(Number.isFinite)) return null;
    return {
        detailId,
        variantId,
        productId,
        priceWithTaxes,
        sku: String(variant?.code ?? '').trim(),
        variantName: String(variant?.description ?? '').trim(),
        variantState: Number(variant?.state ?? 1),
    };
}

export async function loadPriceComparison(referenceListId: number, editableListId: number) {
    try {
        if (!Number.isInteger(referenceListId) || referenceListId <= 0) throw new Error('Lista de referencia inválida.');
        if (!Number.isInteger(editableListId) || editableListId <= 0) throw new Error('Lista editable inválida.');
        if (referenceListId === editableListId) throw new Error('La lista de referencia y la editable deben ser distintas.');

        const [referenceItems, editableItems, productItems] = await Promise.all([
            getAllPages(`/price_lists/${referenceListId}/details.json?expand=[variant]`),
            getAllPages(`/price_lists/${editableListId}/details.json?expand=[variant]`),
            getAllPages('/products.json?state=0&expand=[product_type]'),
        ]);

        const products = new Map<number, { name: string; typeId: number | null; typeName: string }>();
        for (const item of productItems) {
            const type = item.product_type && typeof item.product_type === 'object'
                ? item.product_type as Record<string, unknown>
                : null;
            const id = Number(item.id);
            if (!Number.isInteger(id)) continue;
            products.set(id, {
                name: String(item.name ?? `Producto ${id}`).trim(),
                typeId: Number.isInteger(Number(type?.id)) ? Number(type?.id) : null,
                typeName: String(type?.name ?? 'Sin tipo').trim(),
            });
        }

        const editable = new Map<number, DetailInfo>();
        for (const item of editableItems) {
            const detail = parseDetail(item);
            if (detail) editable.set(detail.variantId, detail);
        }

        const rows: PriceComparisonRow[] = [];
        for (const item of referenceItems) {
            const reference = parseDetail(item);
            if (!reference || reference.variantState !== 0 || !reference.sku) continue;
            const product = products.get(reference.productId);
            if (!product) continue;
            const target = editable.get(reference.variantId);
            rows.push({
                variantId: reference.variantId,
                detailId: target?.detailId ?? null,
                sku: reference.sku,
                variantName: reference.variantName,
                productId: reference.productId,
                productName: product.name,
                productTypeId: product.typeId,
                productTypeName: product.typeName,
                referencePrice: Math.round(reference.priceWithTaxes),
                currentPrice: target ? Math.round(target.priceWithTaxes) : null,
            });
        }
        rows.sort((a, b) => a.productName.localeCompare(b.productName, 'es') || a.variantName.localeCompare(b.variantName, 'es'));
        return { success: true as const, rows };
    } catch (error) {
        return { success: false as const, rows: [], error: error instanceof Error ? error.message : 'No pudimos comparar las listas.' };
    }
}

export async function loadPriceListProducts(priceListId: number) {
    try {
        if (!Number.isInteger(priceListId) || priceListId <= 0) throw new Error('Lista de precios inválida.');
        const [detailItems, productItems] = await Promise.all([
            getAllPages(`/price_lists/${priceListId}/details.json?expand=[variant]`),
            getAllPages('/products.json?state=0&expand=[product_type]'),
        ]);
        const products = new Map<number, { name: string; typeId: number | null; typeName: string }>();
        for (const item of productItems) {
            const type = item.product_type && typeof item.product_type === 'object' ? item.product_type as Record<string, unknown> : null;
            const id = Number(item.id);
            if (!Number.isInteger(id)) continue;
            products.set(id, {
                name: String(item.name ?? `Producto ${id}`).trim(),
                typeId: Number.isInteger(Number(type?.id)) ? Number(type?.id) : null,
                typeName: String(type?.name ?? 'Sin familia').trim(),
            });
        }
        const rows: PriceCatalogRow[] = [];
        for (const item of detailItems) {
            const detail = parseDetail(item);
            if (!detail || detail.variantState !== 0 || !detail.sku) continue;
            const product = products.get(detail.productId);
            if (!product) continue;
            rows.push({
                variantId: detail.variantId,
                productId: detail.productId,
                sku: detail.sku,
                productName: product.name,
                variantName: detail.variantName,
                productTypeId: product.typeId,
                productTypeName: product.typeName,
                price: Math.round(detail.priceWithTaxes),
            });
        }
        rows.sort((a, b) => a.productName.localeCompare(b.productName, 'es') || a.variantName.localeCompare(b.variantName, 'es'));
        return { success: true as const, rows };
    } catch (error) {
        return { success: false as const, rows: [] as PriceCatalogRow[], error: error instanceof Error ? error.message : 'No pudimos cargar los productos.' };
    }
}

export async function getActiveOffices() {
    try {
        const items = await getAllPages('/offices.json?state=0');
        const offices: BsaleOfficeOption[] = items.map((item) => ({ id: Number(item.id), name: String(item.name ?? `Sucursal ${item.id}`) }))
            .filter((office) => Number.isInteger(office.id) && office.id > 0);
        return { success: true as const, offices };
    } catch (error) {
        return { success: false as const, offices: [] as BsaleOfficeOption[], error: error instanceof Error ? error.message : 'No pudimos cargar las sucursales.' };
    }
}

export async function loadOfficeStocks(officeId: number) {
    try {
        if (!Number.isInteger(officeId) || officeId <= 0) throw new Error('Sucursal inválida.');
        const items = await getAllPages(`/stocks.json?officeid=${officeId}`);
        const stocks: VariantStock[] = items.map((item) => {
            const variant = item.variant && typeof item.variant === 'object' ? item.variant as Record<string, unknown> : null;
            return {
                variantId: Number(variant?.id),
                quantity: Number(item.quantity ?? 0),
                reserved: Number(item.quantityReserved ?? 0),
                available: Number(item.quantityAvailable ?? 0),
            };
        }).filter((stock) => Number.isInteger(stock.variantId));
        return { success: true as const, stocks };
    } catch (error) {
        return { success: false as const, stocks: [] as VariantStock[], error: error instanceof Error ? error.message : 'No pudimos cargar el stock.' };
    }
}

export async function updatePrices(editableListId: number, updates: PriceUpdateInput[]) {
    if (!Number.isInteger(editableListId) || editableListId <= 0) {
        return { success: false as const, results: [], error: 'Lista editable inválida.' };
    }
    if (!Array.isArray(updates) || updates.length === 0) {
        return { success: false as const, results: [], error: 'No hay precios para actualizar.' };
    }
    if (updates.length > 50) {
        return { success: false as const, results: [], error: 'Cada lote puede contener como máximo 50 variantes.' };
    }

    const seen = new Set<number>();
    const normalized = updates.map((item) => {
        const variantId = Number(item.variantId);
        const detailId = Number(item.detailId);
        const grossPrice = Number(item.grossPrice);
        if (!Number.isInteger(variantId) || variantId <= 0) throw new Error('Hay una variante inválida.');
        if (!Number.isInteger(detailId) || detailId <= 0 || seen.has(detailId)) throw new Error('Hay un detalle de precio inválido o repetido.');
        if (!Number.isInteger(grossPrice) || grossPrice <= 0) throw new Error('Todos los precios finales deben ser enteros mayores que cero.');
        seen.add(detailId);
        return { variantId, detailId, grossPrice, netPrice: grossPrice / IVA_FACTOR };
    });

    const results = new Array<PriceUpdateResult>(normalized.length);
    const queue = normalized.map((item, index) => ({ item, index }));
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
        while (queue.length > 0) {
            const entry = queue.shift();
            if (!entry) return;
            const { item, index } = entry;
            try {
                const response = await fetch(`${BSALE_API}/price_lists/${editableListId}/details/${item.detailId}.json`, {
                    method: 'PUT',
                    headers: getHeaders(),
                    cache: 'no-store',
                    body: JSON.stringify({ id: item.detailId, variantValue: item.netPrice }),
                });
                const text = await response.text();
                let body: Record<string, unknown> = {};
                try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { body = { raw: text }; }
                if (!response.ok) throw new Error(String(body.description ?? body.message ?? body.error ?? body.raw ?? response.statusText));
                results[index] = { variantId: item.variantId, detailId: item.detailId, success: true };
            } catch (error) {
                results[index] = {
                    variantId: item.variantId,
                    detailId: item.detailId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Error desconocido',
                };
            }
        }
    });
    await Promise.all(workers);
    return { success: results.every((item) => item.success), results };
}
