'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ProductResearchDraft, ProductResearchFact, WebCatalogGap, WebCatalogOffice, WebCatalogVariant } from './types';

const BSALE_TOKEN = process.env.BSALE_TOKEN;
const BSALE_ORIGIN = 'https://api.bsale.io';
const PAGE_SIZE = 50;
const EXCLUDED_PRODUCT_TYPE_IDS = new Set([1, 48, 49, 53, 54, 69]);
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
type BsaleObject = Record<string, unknown>;

function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function headers() {
    if (!BSALE_TOKEN) throw new Error('Falta configurar BSALE_TOKEN.');
    return { access_token: BSALE_TOKEN };
}

async function getJson(path: string) {
    let lastError = 'Bsale no respondió correctamente.';
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`${BSALE_ORIGIN}${path}`, { headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(20000) });
        const text = await response.text();
        let body: BsaleObject = {};
        try { body = text ? JSON.parse(text) as BsaleObject : {}; } catch { body = { raw: text }; }
        if (response.ok) return body;
        lastError = String(body.message ?? body.error ?? body.raw ?? response.statusText);
        if (!RETRYABLE_STATUS.has(response.status) || attempt === 2) break;
        await wait(500 * (attempt + 1));
    }
    throw new Error(lastError);
}

async function putJson(path: string, payload: BsaleObject) {
    const response = await fetch(`${BSALE_ORIGIN}${path}`, {
        method: 'PUT',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let body: BsaleObject = {};
    try { body = text ? JSON.parse(text) as BsaleObject : {}; } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(String(body.message ?? body.error ?? body.raw ?? response.statusText));
    return body;
}

function pageItems(body: BsaleObject) {
    if (Array.isArray(body.items)) return body.items as BsaleObject[];
    if (Array.isArray(body.data)) return body.data as BsaleObject[];
    return [];
}

async function getAllPages(path: string) {
    const separator = path.includes('?') ? '&' : '?';
    const first = await getJson(`${path}${separator}limit=${PAGE_SIZE}&offset=0`);
    const count = Number(first.count ?? 0);
    const pages = [pageItems(first)];
    const offsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < count; offset += PAGE_SIZE) offsets.push(offset);
    for (let start = 0; start < offsets.length; start += 5) {
        const batch = offsets.slice(start, start + 5);
        const responses = await Promise.all(batch.map((offset) => getJson(`${path}${separator}limit=${PAGE_SIZE}&offset=${offset}`)));
        pages.push(...responses.map(pageItems));
    }
    return pages.flat();
}

function nested(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as BsaleObject : null;
}

function visibleText(value: unknown) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export async function getWebCatalogOffices() {
    try {
        const items = await getAllPages('/v1/offices.json?state=0');
        const offices: WebCatalogOffice[] = items.map((item) => ({ id: Number(item.id), name: String(item.name ?? `Sucursal ${item.id}`) }))
            .filter((office) => Number.isInteger(office.id) && office.id > 0);
        return { success: true as const, offices };
    } catch (error) {
        return { success: false as const, offices: [] as WebCatalogOffice[], error: error instanceof Error ? error.message : 'No pudimos cargar las sucursales.' };
    }
}

export async function loadWebCatalogGaps(officeId: number) {
    try {
        if (!Number.isInteger(officeId) || officeId <= 0) throw new Error('Sucursal inválida.');
        const [stockItems, productItems, webItems] = await Promise.all([
            getAllPages(`/v1/stocks.json?officeid=${officeId}&expand=[variant]`),
            getAllPages('/v1/products.json?state=0&expand=[product_type,brand]'),
            getAllPages('/v2/products/list/market_info.json?expand=[collections,descriptions]'),
        ]);
        const brands = new Map<number, string>();
        for (const item of webItems) {
            const brand = nested(item.brand);
            const brandId = Number(brand?.id);
            const brandName = String(brand?.name ?? '').trim();
            if (Number.isInteger(brandId) && brandId > 0 && brandName) brands.set(brandId, brandName);
        }

        const stockByProduct = new Map<number, WebCatalogVariant[]>();
        for (const item of stockItems) {
            const available = Number(item.quantityAvailable ?? 0);
            const variant = nested(item.variant);
            const product = nested(variant?.product);
            const productId = Number(product?.id);
            const variantId = Number(variant?.id);
            if (!(available > 0) || Number(variant?.state ?? 1) !== 0 || !Number.isInteger(productId) || !Number.isInteger(variantId)) continue;
            const variants = stockByProduct.get(productId) ?? [];
            variants.push({ id: variantId, sku: String(variant?.code ?? '').trim(), name: String(variant?.description ?? '').trim(), available });
            stockByProduct.set(productId, variants);
        }

        const webByProduct = new Map<number, { id: number | null; hasDescription: boolean; description: string; additionalDescription: string; collections: Set<string> }>();
        for (const item of webItems) {
            const productId = Number(item.productId);
            if (!Number.isInteger(productId)) continue;
            const current = webByProduct.get(productId) ?? { id: null, hasDescription: false, description: '', additionalDescription: '', collections: new Set<string>() };
            const webId = Number(item.id);
            if (!current.id && Number.isInteger(webId) && webId > 0) current.id = webId;
            const description = String(item.description ?? '').trim();
            current.hasDescription ||= visibleText(description).length > 0;
            if (!current.description && description) current.description = description;
            if (Array.isArray(item.descriptions)) {
                const technical = (item.descriptions as BsaleObject[]).find((descriptionItem) => String(descriptionItem.descriptionName ?? '').trim().toLocaleLowerCase('es') === 'información técnica');
                if (technical && !current.additionalDescription) current.additionalDescription = String(technical.html ?? '').trim();
            }
            if (Array.isArray(item.collections)) {
                for (const collectionValue of item.collections) {
                    const collection = nested(collectionValue);
                    if (Number(collection?.state ?? 0) === 1) current.collections.add(String(collection?.name ?? 'Colección').trim());
                }
            }
            webByProduct.set(productId, current);
        }

        const rows: WebCatalogGap[] = [];
        for (const item of productItems) {
            const productId = Number(item.id);
            const variants = stockByProduct.get(productId);
            if (!variants?.length || Number(item.state ?? 1) !== 0 || Number(item.classification ?? 0) !== 0) continue;
            const web = webByProduct.get(productId);
            const productType = nested(item.product_type);
            const productTypeId = Number(productType?.id);
            if (Number.isInteger(productTypeId) && EXCLUDED_PRODUCT_TYPE_IDS.has(productTypeId)) continue;
            const hasDescription = web?.hasDescription ?? false;
            const collections = [...(web?.collections ?? new Set<string>())].sort((a, b) => a.localeCompare(b, 'es'));
            const brand = nested(item.brand);
            const brandId = Number(brand?.id);
            variants.sort((a, b) => a.sku.localeCompare(b.sku, 'es'));
            rows.push({
                webMarketInfoId: web?.id ?? null,
                productId,
                productName: String(item.name ?? `Producto ${productId}`).trim(),
                brandName: brands.get(brandId) || (Number.isInteger(brandId) && brandId > 0 ? `Marca ID ${brandId}` : 'Sin marca'),
                productTypeName: String(productType?.name ?? 'Sin tipo').trim() || 'Sin tipo',
                available: variants.reduce((sum, variant) => sum + variant.available, 0),
                reason: !hasDescription ? 'missing_description' : collections.length === 0 ? 'missing_collection' : 'ready',
                collections,
                currentDescription: web?.description ?? '',
                currentAdditionalDescription: web?.additionalDescription ?? '',
                variants,
            });
        }
        rows.sort((a, b) => b.available - a.available || b.productId - a.productId);
        return { success: true as const, rows };
    } catch (error) {
        return { success: false as const, rows: [] as WebCatalogGap[], error: error instanceof Error ? error.message : 'No pudimos revisar el catálogo web.' };
    }
}

async function requireUser() {
    const auth = await createClient();
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) throw new Error('Debes iniciar sesión.');
    return user;
}

async function sharedOrganizationId() {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('organizations').select('id').eq('slug', 'facto-compartido').single();
    if (error) throw new Error(error.message);
    return { supabase, organizationId: Number(data.id) };
}

function normalizeDraft(row: Record<string, unknown>): ProductResearchDraft {
    return {
        productId: Number(row.bsale_product_id),
        productName: String(row.product_name ?? ''),
        brandName: String(row.brand_name ?? ''),
        sources: Array.isArray(row.sources) ? row.sources as ProductResearchDraft['sources'] : [],
        facts: Array.isArray(row.facts) ? row.facts as ProductResearchFact[] : [],
        warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
        confidence: row.confidence === 'high' || row.confidence === 'medium' ? row.confidence : 'low',
        blockOneHtml: String(row.block_one_html ?? ''),
        blockTwoHtml: String(row.block_two_html ?? ''),
        status: row.status === 'approved' || row.status === 'needs_review' ? row.status : 'draft',
        updatedAt: String(row.updated_at ?? ''),
    };
}

export async function getProductResearchDraft(productId: number) {
    try {
        await requireUser();
        if (!Number.isInteger(productId) || productId <= 0) throw new Error('Producto inválido.');
        const { supabase, organizationId } = await sharedOrganizationId();
        const { data, error } = await supabase.from('product_research_drafts').select('*').eq('organization_id', organizationId).eq('bsale_product_id', productId).maybeSingle();
        if (error) throw new Error(error.message);
        return { success: true as const, draft: data ? normalizeDraft(data) : null };
    } catch (error) {
        return { success: false as const, draft: null, error: error instanceof Error ? error.message : 'No pudimos cargar el borrador.' };
    }
}

export async function saveProductResearchDraft(draft: ProductResearchDraft) {
    try {
        const user = await requireUser();
        if (!Number.isInteger(draft.productId) || draft.productId <= 0) throw new Error('Producto inválido.');
        if (!['draft', 'needs_review', 'approved'].includes(draft.status)) throw new Error('Estado inválido.');
        const { supabase, organizationId } = await sharedOrganizationId();
        const { data, error } = await supabase.from('product_research_drafts').upsert({
            organization_id: organizationId,
            bsale_product_id: draft.productId,
            product_name: draft.productName.slice(0, 240),
            brand_name: draft.brandName.slice(0, 160),
            sources: draft.sources.slice(0, 10),
            facts: draft.facts.slice(0, 40),
            warnings: draft.warnings.slice(0, 20),
            confidence: draft.confidence,
            block_one_html: draft.blockOneHtml.slice(0, 20_000),
            block_two_html: draft.blockTwoHtml.slice(0, 30_000),
            status: draft.status,
            updated_by: user.id,
            created_by: user.id,
        }, { onConflict: 'organization_id,bsale_product_id' }).select('*').single();
        if (error) throw new Error(error.message);
        return { success: true as const, draft: normalizeDraft(data) };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos guardar el borrador.' };
    }
}

function validatePublishableHtml(value: string, label: string) {
    if (!value.trim()) throw new Error(`${label} está vacía.`);
    if (/<\s*(script|style|iframe|object|embed|form)\b/i.test(value) || /\son\w+\s*=|javascript:/i.test(value)) throw new Error(`${label} contiene HTML no permitido.`);
}

function canonicalHtml(value: unknown) {
    return String(value ?? '')
        .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
        .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ').trim();
}

export async function publishProductDescriptions(webMarketInfoId: number | null, draft: ProductResearchDraft) {
    try {
        await requireUser();
        if (!Number.isInteger(webMarketInfoId) || Number(webMarketInfoId) <= 0) throw new Error('Este producto todavía no tiene una ficha web en Bsale. Créala en Bsale antes de publicar las descripciones.');
        if (!Number.isInteger(draft.productId) || draft.productId <= 0) throw new Error('Producto inválido.');
        validatePublishableHtml(draft.blockOneHtml, 'La descripción principal');
        validatePublishableHtml(draft.blockTwoHtml, 'La descripción adicional');

        const currentResponse = await getJson(`/v2/products/market_info/${webMarketInfoId}.json?expand=[descriptions]`);
        const current = nested(currentResponse.data) ?? currentResponse;
        if (Number(current.productId) !== draft.productId) throw new Error('La ficha web de Bsale no corresponde al producto seleccionado.');
        const descriptions = Array.isArray(current.descriptions) ? current.descriptions as BsaleObject[] : [];
        const technicalIndex = descriptions.findIndex((item) => String(item.descriptionName ?? '').trim().toLocaleLowerCase('es') === 'información técnica');
        const technical: BsaleObject = {
            ...(technicalIndex >= 0 && Number.isInteger(Number(descriptions[technicalIndex].id)) ? { id: Number(descriptions[technicalIndex].id) } : {}),
            descriptionName: 'Información técnica', html: draft.blockTwoHtml, order: technicalIndex >= 0 ? Number(descriptions[technicalIndex].order ?? 0) : descriptions.length, default: 0,
        };
        const nextDescriptions = technicalIndex >= 0
            ? descriptions.map((item, index) => index === technicalIndex ? technical : item)
            : [...descriptions, technical];

        const originalPayload = {
            name: String(current.name ?? draft.productName), description: String(current.description ?? ''),
            displayNotice: String(current.displayNotice ?? ''), descriptions,
        };
        await putJson(`/v2/products/market_info/${webMarketInfoId}.json`, {
            name: String(current.name ?? draft.productName), description: draft.blockOneHtml,
            displayNotice: String(current.displayNotice ?? ''), descriptions: nextDescriptions,
        });

        const verificationResponse = await getJson(`/v2/products/market_info/${webMarketInfoId}.json?expand=[descriptions]`);
        const verification = nested(verificationResponse.data) ?? verificationResponse;
        const verifiedDescriptions = Array.isArray(verification.descriptions) ? verification.descriptions as BsaleObject[] : [];
        const verifiedTechnical = verifiedDescriptions.find((item) => String(item.descriptionName ?? '').trim().toLocaleLowerCase('es') === 'información técnica');
        if (canonicalHtml(verification.description) !== canonicalHtml(draft.blockOneHtml) || canonicalHtml(verifiedTechnical?.html) !== canonicalHtml(draft.blockTwoHtml)) {
            try {
                await putJson(`/v2/products/market_info/${webMarketInfoId}.json`, originalPayload);
                throw new Error('Bsale no guardó correctamente ambos textos, por lo que Facto restauró la descripción anterior. No se aplicaron los cambios.');
            } catch (rollbackError) {
                if (rollbackError instanceof Error && rollbackError.message.includes('restauró la descripción anterior')) throw rollbackError;
                throw new Error('Bsale no guardó correctamente ambos textos y no pudimos confirmar la restauración. Revisa la ficha del producto antes de volver a intentar.');
            }
        }
        return { success: true as const };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos publicar las descripciones.' };
    }
}
