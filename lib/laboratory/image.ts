import 'server-only';
import { imageUrl } from './product';

export async function fetchProductImage(input: string) {
    const initial = imageUrl(input);
    if (!initial || input.length > 2500) throw new Error('Imagen no admitida.');
    let url: string = initial;
    const signal = AbortSignal.timeout(15000);
    for (let hop = 0; hop < 3; hop++) {
        const response = await fetch(url, {
            redirect: 'manual', signal, cache: 'no-store',
            headers: { Referer: 'https://fish.shimano.com/', 'User-Agent': 'Mozilla/5.0', Accept: 'image/webp,image/jpeg,image/png,image/avif,image/*;q=0.8' },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            const redirected = location ? imageUrl(new URL(location, url).href) : null;
            await response.body?.cancel();
            if (!redirected) throw new Error('Redirección de imagen no admitida.');
            url = redirected; continue;
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error('La imagen del fabricante no está disponible.'); }
        const type = response.headers.get('content-type')?.split(';')[0];
        if (!type || !['image/jpeg','image/png','image/webp','image/avif'].includes(type)) { await response.body?.cancel(); throw new Error('El fabricante no devolvió una imagen compatible.'); }
        const reader = response.body?.getReader();
        if (!reader) throw new Error('La imagen está vacía.');
        const chunks: Uint8Array[] = []; let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                size += value.byteLength;
                if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Imagen demasiado grande.'); }
                chunks.push(value);
            }
        } finally { reader.releaseLock(); }
        if (!size) throw new Error('La imagen está vacía.');
        const data = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
        return { data, type };
    }
    throw new Error('Demasiadas redirecciones de imagen.');
}
