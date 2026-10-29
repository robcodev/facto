export type SourceRow = Record<string, unknown>;
export function object(value: unknown): SourceRow {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as SourceRow : {};
}
export function rows(value: unknown): SourceRow[] { return Array.isArray(value) ? value.map(object) : []; }
export function identifier(value: unknown): string | null {
    const id = String(value ?? '');
    return /^\d+$/.test(id) ? id : null;
}
export function safeUrl(value: unknown, base?: string): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try { const url = base ? new URL(value, base) : new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
}
export function normalize(resource: string, raw: SourceRow, officeId: number, priceListId: number, storeUrl: string) {
    const id = identifier(raw.id);
    if (!id) throw new Error(`Bsale devolvió un registro sin identificador válido (${resource}).`);
    const variantId = identifier(object(raw.variant).id);
    const productId = resource === 'products' ? id : identifier(raw.productId ?? object(raw.product).id);
    const categoryId = identifier(object(raw.product_type).id);
    const data: SourceRow = { state: raw.state ?? null };
    if (resource === 'products') Object.assign(data, { brandId: identifier(object(raw.brand).id), brandName: object(raw.brand).name ?? null, brand: raw.brand ?? null, description: raw.description ?? '', classification: raw.classification ?? null });
    if (resource === 'variants') Object.assign(data, { sku: String(raw.code ?? ''), barcode: String(raw.barCode ?? ''), description: String(raw.description ?? ''), unlimitedStock: raw.unlimitedStock ?? null });
    if (resource === 'web') {
        Object.assign(data, { brandId: identifier(object(raw.brand).id), brandName: object(raw.brand).name ?? null, brand: raw.brand ?? null });
        const images = rows(raw.pictures).map(image => ({ id: image.id, url: safeUrl(image.href ?? image.url), caption: image.legendImage ?? '', state: image.state ?? null }));
        const mainImage = safeUrl(raw.urlImg);
        if (mainImage && !images.some(image => image.url === mainImage)) images.unshift({ id: null, url: mainImage, caption: '', state: null });
        Object.assign(data, { url: safeUrl(raw.link, storeUrl), slug: raw.urlSlug ?? '', description: raw.description ?? '', descriptions: raw.descriptions ?? [], images: images.filter(image => image.url), collections: raw.collections ?? [], videoUrl: safeUrl(raw.urlVideo), mainImage });
    }
    if (resource === 'stocks') {
        if (!variantId || raw.quantityAvailable == null || !Number.isFinite(Number(raw.quantityAvailable))) throw new Error('Bsale devolvió stock sin cantidad disponible o variante.');
        Object.assign(data, { variantId, officeId, available: Number(raw.quantityAvailable), quantity: raw.quantity ?? null });
    }
    if (resource === 'prices') Object.assign(data, { variantId, priceListId, net: raw.variantValue ?? null, gross: raw.variantValueWithTaxes ?? null });
    return { resource, external_id: ['stocks', 'prices'].includes(resource) ? `${resource === 'stocks' ? officeId : priceListId}:${id}` : id,
        name: String(raw.name ?? raw.description ?? raw.code ?? ''), product_id: productId, category_id: categoryId, data, raw };
}
