'use server';

import { submitStockReception } from '@/app/reception/actions';
import type { StockReceptionPayload } from '@/app/reception/types';
import type { FullBsaleValidation } from './types';

const BSALE_TOKEN = process.env.BSALE_TOKEN;

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

export async function validateFullSku(originalSku: string): Promise<FullBsaleValidation> {
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

export async function submitFullReception(payload: StockReceptionPayload) {
    return submitStockReception({
        ...payload,
        note: 'Ingreso automatizado de ventas entregadas de Mercado Libre Full',
    });
}
