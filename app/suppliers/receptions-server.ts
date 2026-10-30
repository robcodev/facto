import 'server-only';
import type { paymentContext } from './payments-server';
import { bsaleRead, sourceInvoice } from './server';
import { buildReceipt, object, type ReceptionReport, type Receipt, type Row } from './receptions-core';

type Context = Awaited<ReturnType<typeof paymentContext>>;
async function livePages(path: string, cap: number) {
    const rows: Row[] = []; let expected: number | null = null;
    for (let offset = 0; ; ) {
        const p = await bsaleRead(`${path}${path.includes('?') ? '&' : '?'}limit=50&offset=${offset}`);
        if (!Array.isArray(p.items) || !Number.isInteger(p.count) || p.count < 0 || (expected !== null && expected !== p.count)) throw new Error('Bsale cambió o no informó la cantidad de recepciones.');
        const count: number = p.count;
        expected = count;
        if (!p.items.length && offset < count) throw new Error('Bsale dejó incompleta la consulta de recepciones.');
        rows.push(...p.items.slice(0, cap - rows.length)); offset += p.items.length;
        if (offset >= count || rows.length >= cap) return { rows, complete: offset === count && rows.length === count };
    }
}
export async function receptionReport(ctx: Context, invoiceId: string): Promise<ReceptionReport> {
    const invoice = await sourceInvoice(invoiceId, true);
    const warnings: string[] = [], checkedAt = new Date().toISOString();
    const savedQuery = ctx.db.from('intel_records').select('external_id,raw,data,observed_at')
        .eq('organization_id', ctx.orgId).eq('source', 'bsale').eq('resource', 'inventory_receptions')
        .eq('raw->>documentNumber', invoice.folio).order('id').limit(21);
    const [saved, live] = await Promise.allSettled([savedQuery, livePages(`/v1/stocks/receptions.json?documentnumber=${encodeURIComponent(invoice.folio)}&expand=[office]`, 20)]);
    const headers = new Map<string, { raw: Row; data: Row; source: Receipt['source']; observedAt: string }>();
    let searchComplete = false;
    if (saved.status === 'fulfilled' && !saved.value.error) {
        for (const row of saved.value.data || []) headers.set(String(row.external_id), { raw: object(row.raw), data: object(row.data), source: 'Intel', observedAt: row.observed_at });
        if (saved.value.data?.length === 21) warnings.push('Hay más coincidencias en Intel que las mostradas. La búsqueda es parcial.');
    } else warnings.push('No se pudo consultar el espejo de recepciones en Intel.');
    if (live.status === 'fulfilled') {
        searchComplete = live.value.complete;
        for (const raw of live.value.rows) headers.set(String(raw.id), { raw, data: {}, source: 'Bsale', observedAt: checkedAt });
        if (!live.value.complete) warnings.push('Bsale contiene más coincidencias de las mostradas. No se confirma ausencia de recepciones.');
    } else warnings.push('No se pudo comprobar Bsale en este momento. Los registros de Intel pueden estar desactualizados.');
    if (headers.size > 20) { searchComplete = false; warnings.push('Se muestran hasta 20 recepciones candidatas; la búsqueda es parcial.'); }
    const receipts: Receipt[] = []; let cursor = 0;
    const candidates = [...headers.values()].slice(0, 20);
    await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, async () => {
        while (cursor < candidates.length) {
            const candidate = candidates[cursor++]; const { raw, source, observedAt } = candidate;
            let rows: Row[] = [], complete = false;
            if (!/^\d+$/.test(String(raw.id))) continue;
            // Only fetch details of matching invoice receipts, never guides sharing a folio.
            const preview = buildReceipt(invoice, invoice.net ?? null, raw, [], false, source, observedAt);
            if (!preview) continue;
            if (source === 'Bsale') {
                try { const page = await livePages(`/v1/stocks/receptions/${raw.id}/details.json`, 500); rows = page.rows; complete = page.complete; }
                catch { warnings.push(`No se pudo completar el detalle de la recepción ${raw.id}.`); }
            } else {
                const local = await ctx.db.from('intel_records').select('raw').eq('organization_id', ctx.orgId).eq('source', 'bsale')
                    .eq('resource', 'inventory_receptions_details').eq('data->>movementId', String(raw.id)).order('id').limit(501);
                if (!local.error) { rows = (local.data || []).slice(0, 500).map(r => object(r.raw)); complete = candidate.data.complete === true && (local.data?.length || 0) <= 500; }
            }
            const receipt = buildReceipt(invoice, invoice.net ?? null, raw, rows, complete, source, observedAt);
            if (receipt) receipts.push(receipt);
        }
    }));
    const variants = [...new Set(receipts.flatMap(r => r.lines.map(l => l.variantId)).filter(Boolean))];
    for (let n = 0; n < variants.length; n += 100) {
        const catalog = await ctx.db.from('intel_records').select('external_id,name,product_id,data').eq('organization_id', ctx.orgId)
            .eq('source', 'bsale').eq('resource', 'variants').in('external_id', variants.slice(n, n + 100));
        if (catalog.error) { warnings.push('No se pudieron recuperar algunos nombres y SKU del catálogo Intel.'); continue; }
        const products = [...new Set((catalog.data || []).map(r => r.product_id).filter(Boolean))];
        const names = new Map<string, string>();
        if (products.length) {
            const p = await ctx.db.from('intel_records').select('external_id,name').eq('organization_id', ctx.orgId).eq('source', 'bsale').eq('resource', 'products').in('external_id', products);
            for (const row of p.data || []) names.set(String(row.external_id), row.name);
        }
        const index = new Map((catalog.data || []).map(row => [String(row.external_id), row]));
        for (const receipt of receipts) for (const line of receipt.lines) {
            const variant = index.get(line.variantId); if (!variant) continue;
            line.sku = String(object(variant.data).sku || '');
            line.name = [names.get(String(variant.product_id)), String(variant.name || '')].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
        }
    }
    receipts.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id));
    if (receipts.some(r => r.source === 'Intel')) warnings.push('Las coincidencias solo presentes en Intel no están confirmadas en la consulta actual de Bsale.');
    return { checkedAt, invoiceNet: invoice.net ?? null, currency: invoice.currency, receipts, searchComplete, warnings: [...new Set(warnings)] };
}
