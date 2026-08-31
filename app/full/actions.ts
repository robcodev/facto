'use server';

import { submitStockReception } from '@/app/reception/actions';
import type { StockReceptionPayload } from '@/app/reception/types';
import type { FullBsaleValidation, FullPresalePayload } from './types';

const BSALE_TOKEN = process.env.BSALE_TOKEN;
const FULL_CLIENT_CODE = '77398220-1';

const getBsaleHeaders = () => {
    if (!BSALE_TOKEN) throw new Error('Falta configurar la variable de entorno BSALE_TOKEN');
    return { 'Content-Type': 'application/json', access_token: BSALE_TOKEN };
};

async function getJson(url: string) {
    const response = await fetch(url, { headers: getBsaleHeaders(), cache: 'no-store' });
    const text = await response.text();
    let data: unknown = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
        const record = data as Record<string, unknown>;
        throw new Error(String(record.description ?? record.message ?? record.error ?? record.raw ?? response.statusText));
    }
    return data as Record<string, unknown>;
}

async function findVariant(code: string) {
    const data = await getJson(`https://api.bsale.io/v1/variants.json?code=${encodeURIComponent(code)}`);
    const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
    const exact = items.find((item) => String(item.code ?? '').trim().toLocaleUpperCase() === code.toLocaleUpperCase());
    const variant = exact ?? (items.length === 1 ? items[0] : null);
    return variant ? {
        id: Number(variant.id),
        name: String(variant.description ?? variant.name ?? code),
    } : null;
}

async function getLastCost(variantId: number) {
    const data = await getJson(`https://api.bsale.io/v1/variants/${variantId}/costs.json`);
    const history = Array.isArray(data.history)
        ? data.history as Array<Record<string, unknown>>
        : [];
    const latestReception = [...history]
        .sort((a, b) => Number(b.admissionDate ?? 0) - Number(a.admissionDate ?? 0))
        .find((item) => Number.isFinite(Number(item.cost)) && Number(item.cost) > 0);

    if (latestReception) {
        return { cost: Number(latestReception.cost), source: 'last_reception' as const };
    }

    const averageCost = Number(data.averageCost);
    if (Number.isFinite(averageCost) && averageCost > 0) {
        return { cost: averageCost, source: 'average' as const };
    }

    return { cost: 0, source: 'missing' as const };
}

async function validateFullSkuBase(originalSku: string): Promise<FullBsaleValidation> {
    const cleanSku = String(originalSku ?? '').trim();
    const fullSku = `FULL${cleanSku}`;

    try {
        if (!cleanSku) throw new Error('SKU original vacío.');
        const [original, full] = await Promise.all([findVariant(cleanSku), findVariant(fullSku)]);
        let averageCost: number | null = null;
        let costSource: FullBsaleValidation['costSource'] = 'missing';
        let costError: string | undefined;
        if (original) {
            try {
                const lastCost = await getLastCost(original.id);
                averageCost = lastCost.cost;
                costSource = lastCost.source;
            } catch (error) {
                costError = error instanceof Error ? error.message : 'No pudimos obtener el último costo.';
            }
        }

        return {
            originalSku: cleanSku,
            fullSku,
            originalExists: Boolean(original),
            fullExists: Boolean(full),
            originalName: original?.name ?? null,
            fullName: full?.name ?? null,
            originalVariantId: original?.id ?? null,
            fullVariantId: full?.id ?? null,
            averageCost,
            costSource,
            error: costError,
        };
    } catch (error) {
        return {
            originalSku: cleanSku,
            fullSku,
            originalExists: false,
            fullExists: false,
            originalName: null,
            fullName: null,
            originalVariantId: null,
            fullVariantId: null,
            averageCost: null,
            costSource: 'missing',
            error: error instanceof Error ? error.message : 'No pudimos validar el SKU en Bsale.',
        };
    }
}

async function findLatestReceptionCosts(variantIds: number[]) {
    const pending = new Set(variantIds);
    const found = new Map<number, { cost: number; date?: string }>();
    if (pending.size === 0) return found;

    const firstPage = await getJson('https://api.bsale.io/v1/stocks/receptions.json?limit=1');
    const count = Number(firstPage.count);
    if (!Number.isFinite(count) || count <= 0) return found;

    const pageSize = 50;
    const maxReceptionsToInspect = 1000;
    const minimumOffset = Math.max(0, count - maxReceptionsToInspect);

    for (let offset = Math.max(0, count - pageSize); offset >= minimumOffset && pending.size > 0; offset -= pageSize) {
        const page = await getJson(
            `https://api.bsale.io/v1/stocks/receptions.json?limit=${pageSize}&offset=${offset}&expand=[details]`
        );
        const receptions = Array.isArray(page.items)
            ? page.items as Array<Record<string, unknown>>
            : [];

        for (let receptionIndex = receptions.length - 1; receptionIndex >= 0; receptionIndex -= 1) {
            const reception = receptions[receptionIndex];
            const detailsNode = reception.details as Record<string, unknown> | undefined;
            const details = Array.isArray(detailsNode?.items)
                ? detailsNode.items as Array<Record<string, unknown>>
                : [];

            for (let detailIndex = details.length - 1; detailIndex >= 0; detailIndex -= 1) {
                const detail = details[detailIndex];
                const variant = detail.variant as Record<string, unknown> | undefined;
                const variantId = Number(variant?.id);
                const cost = Number(detail.cost);
                if (pending.has(variantId) && Number.isFinite(cost) && cost > 0) {
                    found.set(variantId, {
                        cost,
                        date: typeof reception.rawAdmissionDate === 'string'
                            ? reception.rawAdmissionDate
                            : undefined,
                    });
                    pending.delete(variantId);
                }
            }
        }
    }

    return found;
}

export async function validateFullSkus(originalSkus: string[]): Promise<FullBsaleValidation[]> {
    const cleanSkus = originalSkus.map((sku) => String(sku ?? '').trim());
    const results = new Array<FullBsaleValidation>(cleanSkus.length);
    const queue = cleanSkus.map((sku, index) => ({ sku, index }));
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
        while (queue.length) {
            const item = queue.shift();
            if (!item) return;
            results[item.index] = await validateFullSkuBase(item.sku);
        }
    });
    await Promise.all(workers);

    const missingCostVariantIds = results
        .filter((result) => result.originalVariantId && Number(result.averageCost) <= 0)
        .map((result) => result.originalVariantId as number);
    const receptionCosts = await findLatestReceptionCosts(missingCostVariantIds);

    return results.map((result) => {
        if (!result.originalVariantId || Number(result.averageCost) > 0) return result;
        const receptionCost = receptionCosts.get(result.originalVariantId);
        if (!receptionCost) return result;
        return {
            ...result,
            averageCost: receptionCost.cost,
            costSource: 'last_reception',
            costDate: receptionCost.date,
            error: undefined,
        };
    });
}

export async function validateFullSku(originalSku: string): Promise<FullBsaleValidation> {
    return (await validateFullSkus([originalSku]))[0];
}

export async function submitFullReception(payload: StockReceptionPayload) {
    return submitStockReception({
        ...payload,
        note: 'Ingreso automatizado de ventas incluidas de Mercado Libre Full',
    });
}

export async function submitFullPresale(payload: FullPresalePayload) {
    try {
        const officeId = Number(payload.officeId);
        const priceListId = payload.priceListId == null ? undefined : Number(payload.priceListId);
        if (!Number.isInteger(officeId) || officeId <= 0) throw new Error('Sucursal inválida.');
        if (priceListId !== undefined && (!Number.isInteger(priceListId) || priceListId <= 0)) throw new Error('Lista de precios inválida.');
        if (!Array.isArray(payload.details) || payload.details.length === 0) throw new Error('La preventa no contiene productos.');

        const clientsData = await getJson(`https://api.bsale.io/v1/clients.json?code=${encodeURIComponent(FULL_CLIENT_CODE)}&state=0&limit=50`);
        const clients = Array.isArray(clientsData.items) ? clientsData.items as Array<Record<string, unknown>> : [];
        const normalizeCode = (value: unknown) => String(value ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
        const client = clients.find((item) => normalizeCode(item.code) === normalizeCode(FULL_CLIENT_CODE));
        const clientId = Number(client?.id);
        if (!Number.isInteger(clientId) || clientId <= 0) {
            throw new Error(`No encontramos activo en Bsale al cliente ${FULL_CLIENT_CODE} — Mercado Libre S.A. (Full).`);
        }

        const details = payload.details.map((item, index) => {
            const code = String(item.code ?? '').trim();
            const quantity = Number(item.quantity);
            const netUnitValue = Number(item.netUnitValue);
            if (!code) throw new Error(`Línea ${index + 1}: SKU vacío.`);
            if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Línea ${index + 1} (${code}): cantidad inválida.`);
            if (!Number.isFinite(netUnitValue) || netUnitValue <= 0) throw new Error(`Línea ${index + 1} (${code}): precio neto pendiente.`);
            return { code, quantity, netUnitValue, discount: 0 };
        });
        if (new Set(details.map((item) => item.code.toLocaleUpperCase('es-CL'))).size !== details.length) {
            throw new Error('La preventa contiene un SKU repetido. Cada producto debe enviarse una sola vez con su cantidad total.');
        }

        const now = new Date();
        const date = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 1000);
        const bsalePayload = {
            documentTypeId: 38,
            officeId,
            ...(priceListId ? { priceListId } : {}),
            emissionDate: date,
            expirationDate: date,
            declareSii: 0,
            dispatch: 0,
            observation: 'Preventa generada desde recepción Mercado Libre Full',
            clientId,
            details,
        };

        const response = await fetch('https://api.bsale.io/v1/documents.json', {
            method: 'POST', headers: getBsaleHeaders(), body: JSON.stringify(bsalePayload), cache: 'no-store',
        });
        const text = await response.text();
        let result: Record<string, unknown> = {};
        try { result = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { result = { raw: text }; }
        if (!response.ok) throw new Error(String(result.description ?? result.message ?? result.error ?? result.raw ?? response.statusText));
        return {
            success: true as const,
            documentId: Number(result.id) || null,
            documentNumber: Number(result.number) || null,
            url: typeof result.urlPublicView === 'string' ? result.urlPublicView : null,
        };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos crear la preventa.' };
    }
}
