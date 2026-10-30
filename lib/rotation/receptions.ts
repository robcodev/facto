import 'server-only';
import { bsale } from '../intel/server';
import { num } from './core';
type Json = Record<string, unknown>;
const object = (v: unknown): Json => v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
export function receiptReferences(body: Json) {
  if (!Array.isArray(body.history)) throw Error('Bsale no devolvió un historial de costos válido.');
  const seen = new Set<string>();
  return body.history.map(value => {
    const row = object(value), ref = object(row.reception_detail);
    const match = typeof ref.href === 'string' ? /^https:\/\/api\.bsale\.io\/v1\/stocks\/receptions\/(\d+)\/details\/(\d+)\.json$/.exec(ref.href) : null;
    if (!match || String(ref.id) !== match[2]) throw Error('Bsale devolvió una referencia de recepción inválida.');
    const key = match[1] + ':' + match[2];
    if (seen.has(key)) throw Error('Bsale repitió una referencia de recepción.');
    seen.add(key);
    return { id: key, receptionId: match[1], detailId: match[2] };
  });
}
export function liveReceipt(header: Json, detail: Json, variantId: string, reference: ReturnType<typeof receiptReferences>[number]) {
  if (String(header.id) !== reference.receptionId || String(detail.id) !== reference.detailId || String(object(detail.variant).id) !== variantId) throw Error('La recepción no corresponde a la variante solicitada.');
  const date = num(header.admissionDate), quantity = num(detail.quantity), cost = num(detail.cost);
  if (date === null || !Number.isFinite(new Date(date * 1000).getTime()) || quantity === null) throw Error('La recepción tiene fecha o cantidad inválida.');
  const note = String(header.note ?? '');
  return { id: reference.id, receptionId: reference.receptionId, date: new Date(date * 1000).toISOString().slice(0,10), quantity, cost, officeId: String(object(header.office).id ?? ''), documentType: header.document == null ? null : String(header.document), documentNumber: header.documentNumber == null ? null : String(header.documentNumber), administrative: /FULL|reclasific|traspas|traslad|ajuste/i.test(note), updateStock: header.updateStock == null ? null : String(header.updateStock) };
}
// No mirror fallback, persistence or inferred matching by folio/SKU.
export async function liveReceptions(variantId: string, page = 0, read: (path: string) => Promise<Json> = bsale) {
  if (!/^\d+$/.test(variantId) || !Number.isInteger(page) || page < 0) throw Error('Variante o página inválida.');
  const costs = await read(`/v1/variants/${variantId}/costs.json`), refs = receiptReferences(costs), chosen = refs.slice(page * 10, (page + 1) * 10);
  const rows: ReturnType<typeof liveReceipt>[] = [], errors: string[] = [];
  let next = 0;
  await Promise.all(Array.from({length: Math.min(3, chosen.length)}, async () => {
    for (;;) {
      const index = next++; if (index >= chosen.length) return; const ref = chosen[index];
      try {
        const header = await read(`/v1/stocks/receptions/${ref.receptionId}.json`);
        const detail = await read(`/v1/stocks/receptions/${ref.receptionId}/details/${ref.detailId}.json`);
        rows.push(liveReceipt(header, detail, variantId, ref));
      } catch (cause) { errors.push('Recepción ' + ref.receptionId + ': ' + (cause instanceof Error ? cause.message : 'No disponible.')); }
    }
  }));
  rows.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  return { source: 'bsale_live' as const, queriedAt: new Date().toISOString(), variantId, page, rows, references: refs.length, hasMore: (page + 1) * 10 < refs.length, errors, historyComplete: false as const, notice: 'Consulta directa a Bsale mediante las referencias del historial de costos. Puede omitir recepciones antiguas o agotadas: no certifica todas las compras ni el primer ingreso. El folio no confirma una factura de proveedor vinculada.' };
}
export type LiveReceptions = Awaited<ReturnType<typeof liveReceptions>>;
