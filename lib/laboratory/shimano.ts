import 'server-only';
import { parseHTML } from 'linkedom';
import { imageUrl, productViewSchema, sourceUrl, type ProductView } from './product';

const normal = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
const compact = (value: string) => normal(value).replace(/\s/g, '');
const text = (element: { textContent: string | null } | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
const labels: Record<string, string> = {
    '品番': 'Modelo', 'カラー番号': 'N.º de color', 'カラー': 'Color del fabricante', 'タイプ': 'Tipo',
    '全長(mm)': 'Largo (mm)', '重量(g)': 'Peso (g)', 'フック': 'Anzuelos', '本体価格(円)': 'Precio fabricante (JPY)',
    '商品コード': 'Código de producto', 'JANコード': 'Código JAN', 'サイズ': 'Tamaño', '自重(g)': 'Peso (g)',
    '入数(本)': 'Unidades', '入数': 'Unidades', '全長(m)': 'Largo (m)', '最大飛距離(m)': 'Distancia máxima (m)',
};
function displayValue(header: string, original: string) {
    if (compact(header) !== 'タイプ') return original;
    return ({ 'シンキング': 'Hundimiento (sinking)', 'フローティング': 'Flotante (floating)', 'サスペンド': 'Suspendido (suspend)' } as Record<string, string>)[normal(original)] ?? original;
}

export function parseShimano(html: string, url: string): ProductView {
    const source = sourceUrl(url);
    const { document } = parseHTML(html);
    const table = [...document.querySelectorAll('table')].find(t => {
        const heads = [...t.querySelectorAll('th')].map(h => compact(text(h)));
        return ['品番', 'カラー番号', 'カラー', '商品コード'].every(h => heads.includes(h));
    });
    if (!table) throw new Error('Esta ficha no contiene una tabla de modelos y colores compatible con esta vista.');
    const headers = [...table.querySelectorAll('thead th')].map(h => text(h));
    if (!headers.length) headers.push(...[...[...table.querySelectorAll('tr')][0].querySelectorAll('th')].map(h => text(h)));
    if (headers.length > 80 || new Set(headers.map(compact)).size !== headers.length) throw new Error('La tabla tiene encabezados repetidos o una estructura no compatible.');
    const column = (name: string) => headers.findIndex(h => compact(h) === name);
    const modelIndex = column('品番'), colorIndex = column('カラー番号'), colorNameIndex = column('カラー');
    const productIndex = column('商品コード'), janIndex = column('JANコード');
    const lineup = [...document.querySelectorAll('.skulisting .thumbnail__item')].map(item => ({
        title: text(item.querySelector('.thumbnail__title')) || item.querySelector('img')?.getAttribute('alt') || '',
        image: imageUrl(item.querySelector('a.thumbnail__zoom')?.getAttribute('href') || item.querySelector('img')?.getAttribute('src') || '', source),
    })).filter(item => item.title && item.image);
    const variants: ProductView['variants'] = [];
    const notices: string[] = [];
    // Expand row spans instead of pairing table rows to image order.
    const carried = new Map<number, { remaining: number; value: string }>();
    for (const row of table.querySelectorAll('tr')) {
        const cells = [...row.querySelectorAll('td')];
        if (!cells.length) continue;
        const values: string[] = [];
        for (const [index, cell] of carried) {
            values[index] = cell.value;
            if (--cell.remaining === 0) carried.delete(index);
        }
        let index = 0;
        for (const cell of cells) {
            while (values[index] !== undefined) index++;
            const span = Number(cell.getAttribute('colspan') || '1'), rows = Number(cell.getAttribute('rowspan') || '1');
            if (!Number.isInteger(span) || span < 1 || span > headers.length || !Number.isInteger(rows) || rows < 1 || rows > 500) throw new Error('La tabla contiene celdas combinadas no compatibles.');
            for (let offset = 0; offset < span; offset++) {
                values[index] = text(cell);
                if (rows > 1) carried.set(index, { remaining: rows - 1, value: values[index] });
                index++;
            }
        }
        if (values.length !== headers.length || Array.from(values).some(v => v === undefined)) throw new Error('No pudimos leer todas las columnas de una variante. Revisa la ficha original.');
        const model = values[modelIndex], colorNumber = values[colorIndex], colorName = values[colorNameIndex];
        if (!model || !colorNumber || !colorName) throw new Error('Una variante no tiene modelo o color identificable.');
        const matches = lineup.filter(item => {
            const title = normal(item.title), prefix = normal(model) + ' ';
            if (!title.startsWith(prefix)) return false;
            const tokens = title.slice(prefix.length).split(' ');
            return tokens.some((token, i) => token === normal(colorNumber) && compact(tokens.slice(i + 1).join(' ')) === compact(colorName));
        });
        const unique = [...new Map(matches.map(item => [item.image!, item])).values()];
        const match = unique.length === 1 ? unique[0] : null;
        if (!match) notices.push(`${model} · color ${colorNumber}: ${unique.length > 1 ? 'hay más de una imagen posible' : 'no se confirmó una imagen correspondiente'}.`);
        const productCode = productIndex >= 0 ? values[productIndex] : '', jan = janIndex >= 0 ? values[janIndex] : '';
        variants.push({ id: `${model}:${colorNumber}:${productCode || jan || variants.length}`, model, colorNumber, colorName, productCode, jan,
            image: match?.image ?? null, imageTitle: match?.title ?? null,
            specifications: headers.map((header, i) => ({ source: header, label: labels[compact(header)] ?? header, original: values[i], value: displayValue(header, values[i]) })),
        });
    }
    if (new Set(variants.map(v => v.id)).size !== variants.length) throw new Error('La tabla repite identificadores de variante. Revisa la fuente antes de usar esta vista.');
    if (notices.length > 30) throw new Error('Hay demasiadas variantes sin una relación de imagen verificable para esta vista.');
    return productViewSchema.parse({ version: 1, source, title: text(document.querySelector('h1')) || 'Producto Shimano', fetchedAt: new Date().toISOString(), headers: headers.map(header => ({ source: header, label: labels[compact(header)] ?? header })), variants, notices });
}

export async function fetchShimano(input: string) {
    let url = sourceUrl(input);
    const signal = AbortSignal.timeout(20000);
    for (let hop = 0; hop < 3; hop++) {
        const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal, headers: { Accept: 'text/html' } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) throw new Error('Shimano devolvió una redirección incompleta.');
            url = sourceUrl(new URL(location, url).href);
            continue;
        }
        if (!response.ok) throw new Error(`Shimano respondió ${response.status}. Intenta abrir la ficha original o vuelve a intentarlo más tarde.`);
        if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('El enlace no devolvió una ficha HTML.');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('La página llegó vacía.');
        const chunks: Uint8Array[] = []; let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                size += value.byteLength;
                if (size > 3 * 1024 * 1024) { await reader.cancel(); throw new Error('La ficha supera el tamaño admitido para esta vista.'); }
                chunks.push(value);
            }
        } finally { reader.releaseLock(); }
        const data = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
        return parseShimano(new TextDecoder().decode(data), url);
    }
    throw new Error('La ficha realizó demasiadas redirecciones.');
}
