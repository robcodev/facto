import { z } from 'zod';

export const EXAMPLE_URL = 'https://fish.shimano.com/ja-JP/product/lure/surf/minnow/a15f900000e5srliav.html';
export function sourceUrl(value: string): string {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'fish.shimano.com' || url.username || url.password || (url.port && url.port !== '443') || !/^\/ja-JP\/product\/[a-zA-Z0-9/_-]+\.html$/.test(url.pathname)) {
        throw new Error('Usa una ficha de producto de Shimano Japón: https://fish.shimano.com/ja-JP/product/…html');
    }
    url.search = ''; url.hash = '';
    return url.href;
}
export function imageUrl(value: string, base = EXAMPLE_URL): string | null {
    try {
        const url = new URL(value, base);
        if (url.protocol !== 'https:' || !['dassets2.shimano.com', 'fish.shimano.com'].includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443') || !url.pathname.startsWith('/content/dam/') || !/\.(jpe?g|png|webp)$/i.test(url.pathname)) return null;
        return url.href;
    } catch { return null; }
}
const text = z.string().max(3000);
const image = z.string().max(2500).refine(value => imageUrl(value) !== null).nullable();
export const productViewSchema = z.object({
    version: z.literal(1),
    source: z.string().max(2500).refine(value => { try { return sourceUrl(value) === value; } catch { return false; } }),
    title: text,
    fetchedAt: z.iso.datetime(),
    headers: z.array(z.object({ source: text, label: text })).max(80),
    variants: z.array(z.object({
        id: text, model: text, colorNumber: text, colorName: text, productCode: text, jan: text,
        image, imageTitle: text.nullable(),
        specifications: z.array(z.object({ source: text, label: text, value: text, original: text })).max(80),
    })).min(1).max(500),
    notices: z.array(text).max(30),
});
export type ProductView = z.infer<typeof productViewSchema>;
export const searchText = (value: string) => value.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
