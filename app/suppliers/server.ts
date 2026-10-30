import 'server-only';
import { bsaleDocumentUrl, enrichFromXml, normalizeHeader, type Invoice, type SourcePage } from './core';

const xmlMetadata = new Map<string, { expires: number; data: Pick<Invoice, 'dues' | 'dueIssue' | 'currency' | 'declaredPayment' | 'net'> }>();
export async function bsaleRead(path: string) {
    const token = process.env.BSALE_TOKEN;
    if (!token) throw new Error('Falta configurar la conexión con Bsale.');
    for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(`https://api.bsale.io${path}`, { headers: { access_token: token }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) });
        if ([429, 502, 503].includes(response.status) && attempt === 0) { await new Promise(r => setTimeout(r, 800)); continue; }
        if (!response.ok) throw new Error(`Bsale respondió ${response.status}. Reintenta la consulta.`);
        return await response.json();
    }
}
async function xmlText(url: string) {
    let target = bsaleDocumentUrl(url);
    if (!target) throw new Error('Enlace XML no permitido');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 7000);
    try {
        for (let hop = 0; hop < 3; hop++) {
            const r: Response = await fetch(target, { redirect: 'manual', signal: controller.signal, cache: 'no-store' });
            if ([301, 302, 303, 307, 308].includes(r.status)) {
                const next: string | null = r.headers.get('location');
                target = next ? bsaleDocumentUrl(new URL(next, target).href) : null;
                await r.body?.cancel();
                if (!target) throw new Error('Redirección XML no permitida');
                continue;
            }
            if (!r.ok || !r.body) throw new Error('XML no disponible');
            const reader = r.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
            for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 1_000_000) { await reader.cancel(); throw new Error('XML demasiado grande'); } chunks.push(value); }
            return Buffer.concat(chunks).toString('utf8');
        }
        throw new Error('Demasiadas redirecciones XML');
    } finally { clearTimeout(timer); }
}
export async function sourcePage(month: string, offset: number): Promise<SourcePage> {
    const [year, m] = month.split('-');
    const body = await bsaleRead(`/v1/third_party_documents.json?year=${year}&month=${Number(m)}&limit=25&offset=${offset}`);
    if (!body || !Array.isArray(body.items) || !Number.isInteger(body.count) || body.count < 0 || (body.items.length === 0 && offset < body.count)) throw new Error('Bsale no pudo completar la página de documentos.');
    const headers = (body.items as Record<string, unknown>[]).map(raw => ({ raw, invoice: normalizeHeader(raw) })).filter((x): x is { raw: Record<string, unknown>; invoice: Invoice } => x.invoice !== null);
    let xmlUnavailable = 0, index = 0;
    const invoices: Invoice[] = new Array(headers.length);
    await Promise.all(Array.from({ length: Math.min(5, headers.length) }, async () => {
        while (index < headers.length) {
            const n = index++, { raw, invoice } = headers[n];
            const key = `${invoice.id}:${invoice.key}:${invoice.total}:${raw.urlXml}`;
            const cached = xmlMetadata.get(key);
            if (cached && cached.expires > Date.now()) { invoices[n] = { ...invoice, ...cached.data }; continue; }
            if (!raw.urlXml) { invoices[n] = { ...invoice, dueIssue: 'Bsale no proporciona XML' }; xmlUnavailable++; continue; }
            try {
                const enriched = enrichFromXml(invoice, await xmlText(String(raw.urlXml)));
                const data = { dues: enriched.dues, dueIssue: enriched.dueIssue, currency: enriched.currency, declaredPayment: enriched.declaredPayment, net: enriched.net };
                if (xmlMetadata.size >= 2000) xmlMetadata.delete(xmlMetadata.keys().next().value!);
                xmlMetadata.set(key, { expires: Date.now() + 5 * 60_000, data });
                invoices[n] = enriched;
            } catch { invoices[n] = { ...invoice, dueIssue: 'No se pudo verificar el vencimiento del XML' }; xmlUnavailable++; }
        }
    }));
    const next = offset + body.items.length;
    if (next > body.count) throw new Error('Bsale cambió el total durante la consulta. Actualiza.');
    return { invoices, count: body.count, nextOffset: next < body.count ? next : null, excluded: body.items.length - headers.length, xmlUnavailable };
}

export async function sourceInvoice(id: string, withXml = false) {
    if (!/^\d+$/.test(id)) throw new Error('Factura inválida.');
    const raw = await bsaleRead(`/v1/third_party_documents/${id}.json`);
    const invoice = normalizeHeader(raw);
    if (!invoice) throw new Error('La factura está anulada, excluida o no corresponde a una factura de compra.');
    if (withXml && raw.urlXml) { try { return enrichFromXml(invoice, await xmlText(String(raw.urlXml))); } catch { /* Keep Bsale header values when XML is unavailable. */ } }
    return invoice;
}
