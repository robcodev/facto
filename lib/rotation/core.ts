export const METHOD = 'inventory-diagnostic-v2-bsale-direct';
export type Row = { external_id: string; run_id: string; name?: string; product_id?: string | null; category_id?: string | null; observed_at?: string; [key: string]: unknown };
export const num = (v: unknown): number | null => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export const yes = (v: unknown) => [true, 1, '1', 'true'].includes(v as never);
export const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const dateOf = (r: Row) => num(r.date) === null ? null : day(Number(r.date) * 1000);
const cancelled = (r: Row) => ![null, undefined, 0, '0', false, 'false', ''].includes(r.cancellationStatus as never) || ![null, undefined, 0, '0', false, 'false', ''].includes(r.cancellationDate as never);
export const finalSale = (r: Row) => (['33', '34', '39', '41'].includes(String(r.code)) || String(r.documentType).toUpperCase() === 'TICKET DE VENTA') && !['38'].includes(String(r.documentTypeId)) && !/PREVENTA|COTIZA|GU[IÍ]A/i.test(String(r.documentType)) && !yes(r.isCreditNote) && !['56', '61'].includes(String(r.code));
export function coveredDays(windows: Row[], closed: string) {
  const result = new Set<string>();
  for (const w of windows) {
    if (w.reconciliation !== 'document_count_only' || num(w.sourceCount) === null || num(w.importedCount) === null || Number(w.importedCount) + (num(w.excludedCount) ?? 0) !== Number(w.sourceCount)) continue;
    const from = String(w.from), to = String(w.to);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000) continue;
    for (let t = Date.parse(from); t <= Math.min(Date.parse(to), Date.parse(closed)); t += 86400000) result.add(day(t));
  }
  return result;
}
// Only the current header's run is eligible. A repeated source detail invalidates
// the document rather than counting two positional copies of the same line.
export function currentLines(headers: Row[], lines: Row[], field: string) {
  const parents = new Map(headers.map(h => [h.external_id + ':' + h.run_id, h]));
  const groups = new Map<string, Row[]>();
  for (const l of lines) {
    const key = String(l[field]) + ':' + l.run_id;
    if (!parents.has(key)) continue;
    const group = groups.get(key) ?? []; group.push(l); groups.set(key, group);
  }
  const invalid = new Set<string>();
  for (const h of headers) {
    const key = h.external_id + ':' + h.run_id, list = groups.get(key) ?? [], seen = new Set<string>();
    if (!yes(h.complete) || !list.length) invalid.add(key);
    for (const l of list) {
      const id = l.external_id.split(':')[1];
      if (!id || id === 'no-id' || seen.has(id) || !l.variantId || num(l.quantity) === null || Number(l.quantity) <= 0) invalid.add(key);
      seen.add(id);
    }
  }
  return { groups, invalid };
}
export type Event = { kind: 'Venta' | 'Nota de crédito/débito' | 'Recepción' | 'Consumo'; date: string; documentId: string; number: string | null; quantity: number; cost: number | null; stockEffect: string; administrative: boolean; recordId: string; runId: string; observedAt: string | null; documentReference: string | null };
export type Diagnostic = { id: string; asOf: string; productId: string | null; product: string; name: string; sku: string; brand: string; category: string; web: boolean; full: boolean; physical: number | null; available: number | null; stockDate: string | null; firstReceipt: string | null; lastReceipt: string | null; receipts: number; lastSale: string | null; daysWithoutSale: number | null; units: Record<string, number | null>; previousYear: number | null; cost: number | null; costDate: string | null; value: number | null; events: Event[]; stockRows: Row[]; quality: string[] };
export function buildDataset(input: { products: Row[]; variants: Row[]; types: Row[]; brands: Row[]; web: Row[]; documents: Row[]; details: Row[]; windows: Row[]; receptions: Row[]; receiptLines: Row[]; consumptions: Row[]; consumptionLines: Row[]; stock: Row[]; closed: string; }) {
  const covered = coveredDays(input.windows, input.closed), to = [...covered].sort().at(-1);
  if (!to) throw Error('Intel no tiene un corte de ventas verificado.');
  const saleHeaders = input.documents.filter(h => finalSale(h) && !cancelled(h) && String(h.state) === '0' && String(h.day) <= to);
  const sales = currentLines(saleHeaders, input.details, 'documentId');
  const badDays = new Set(saleHeaders.filter(h => sales.invalid.has(h.external_id + ':' + h.run_id)).map(h => String(h.day)));
  // Verify window counts against current headers, not just old sync metadata.
  const docCounts = new Map<string, number>(); for (const d of input.documents) docCounts.set(String(d.day), (docCounts.get(String(d.day)) ?? 0) + 1);
  for (const w of input.windows) { let actual = 0; for (let t = Date.parse(String(w.from)); t <= Date.parse(String(w.to)); t += 86400000) actual += docCounts.get(day(t)) ?? 0; if (actual !== num(w.importedCount)) for (let t = Date.parse(String(w.from)); t <= Date.parse(String(w.to)); t += 86400000) badDays.add(day(t)); }
  // Coverage depends on the period, not the variant. Avoid rechecking the same
  // calendar hundreds of thousands of times while building a catalog view.
  const intervalCache = new Map<string, boolean>();
  const intervalCovered = (from: string, end: string) => {
    const key = from + ':' + end, cached = intervalCache.get(key);
    if (cached !== undefined) return cached;
    for (let t = Date.parse(from); t <= Date.parse(end); t += 86400000) {
      if (!covered.has(day(t)) || badDays.has(day(t))) { intervalCache.set(key, false); return false; }
    }
    intervalCache.set(key, true); return true;
  };
  const periods = [30, 90, 365].map(days => {
    const from = day(Date.parse(to) - (days - 1) * 86400000);
    return { days, from, covered: intervalCovered(from, to) };
  });
  const previousTo = day(Date.parse(to) - 365 * 86400000), previousFrom = day(Date.parse(previousTo) - 89 * 86400000), previousCovered = intervalCovered(previousFrom, previousTo);
  const events = new Map<string, Event[]>();
  const push = (id: string, e: Event) => { const list = events.get(id) ?? []; list.push(e); events.set(id, list); };
  for (const h of saleHeaders) { const key = h.external_id + ':' + h.run_id; if (sales.invalid.has(key) || !covered.has(String(h.day))) continue; for (const l of sales.groups.get(key) ?? []) push(String(l.variantId), { kind: 'Venta', date: String(h.day), documentId: h.external_id, number: h.number == null ? null : String(h.number), quantity: Number(l.quantity), cost: null, stockEffect: 'No se resta de la captura', administrative: false, recordId: l.external_id, runId: l.run_id, observedAt: h.observed_at ?? null, documentReference: null }); }
  const notes = input.documents.filter(h => (['56', '61'].includes(String(h.code)) || yes(h.isCreditNote)) && !cancelled(h) && String(h.state) === '0');
  const noteLines = currentLines(notes, input.details, 'documentId');
  for (const h of notes) { const key = h.external_id + ':' + h.run_id; if (noteLines.invalid.has(key)) continue; for (const l of noteLines.groups.get(key) ?? []) push(String(l.variantId), { kind: 'Nota de crédito/débito', date: String(h.day), documentId: h.external_id, number: h.number == null ? null : String(h.number), quantity: Number(l.quantity), cost: null, stockEffect: 'Devolución física sin verificar; no descontada', administrative: false, recordId: l.external_id, runId: l.run_id, observedAt: h.observed_at ?? null, documentReference: l.relatedDetailId ? 'Detalle original ID ' + String(l.relatedDetailId) : null }); }
  let invalidMovements = 0;
  for (const [headers, lines, kind] of [[input.receptions, input.receiptLines, 'Recepción'], [input.consumptions, input.consumptionLines, 'Consumo']] as const) {
    const joined = currentLines(headers, lines, 'movementId'); invalidMovements += joined.invalid.size;
    for (const h of headers) { const key = h.external_id + ':' + h.run_id, date = dateOf(h); if (joined.invalid.has(key) || !date) continue;
      const administrative = /FULL|reclasific|traspas|traslad|ajuste/i.test(String(h.note ?? ''));
      for (const l of joined.groups.get(key) ?? []) push(String(l.variantId), { kind, date, documentId: h.external_id, number: null, quantity: Number(l.quantity), cost: num(l.cost), stockEffect: 'updateStock=' + String(h.updateStock ?? 'sin dato') + '; efecto pendiente de conciliación', administrative, recordId: l.external_id, runId: l.run_id, observedAt: h.observed_at ?? null, documentReference: h.documentReference == null ? null : [String(h.documentReference), h.documentNumber ? 'folio ' + String(h.documentNumber) : 'folio ausente'].join(' · ') });
    }
  }
  const products = new Map(input.products.map(p => [p.external_id, p])), brands = new Map(input.brands.map(p => [p.external_id, p.name ?? p.external_id])), types = new Map(input.types.map(p => [p.external_id, p.name ?? p.external_id]));
  const stock = new Map<string, Row[]>(); for (const s of input.stock) { const list = stock.get(String(s.variantId)) ?? []; list.push(s); stock.set(String(s.variantId), list); }
  const web = new Set(input.web.map(w => w.product_id));
  const fullCandidates = new Set<string>(); const skus = new Set(input.variants.map(v => String(v.sku))); for (const v of input.variants) { const sku = String(v.sku); if (sku.startsWith('FULL')) { fullCandidates.add(sku); if (skus.has(sku.slice(4))) fullCandidates.add(sku.slice(4)); } }
  const rows: Diagnostic[] = input.variants.map(v => {
    const p = products.get(v.product_id ?? ''), list = (events.get(v.external_id) ?? []).sort((a, b) => b.date.localeCompare(a.date) || a.recordId.localeCompare(b.recordId));
    const ss = stock.get(v.external_id) ?? [], offices = new Set(ss.map(s => s.officeId)), stockValid = ss.length > 0 && ss.length === offices.size;
    const sum = (key: string) => stockValid && ss.every(s => num(s[key]) !== null) ? ss.reduce((n, s) => n + Number(s[key]), 0) : null;
    const full = fullCandidates.has(String(v.sku)), receipts = list.filter(e => e.kind === 'Recepción' && !e.administrative && e.date <= to), costEvent = !full ? receipts.find(e => e.cost !== null && e.cost >= 0) : undefined;
    const saleEvents = list.filter(e => e.kind === 'Venta'), lastSale = saleEvents[0]?.date ?? null;
    const units: Record<string, number | null> = {};
    for (const period of periods) units[period.days] = period.covered ? saleEvents.filter(e => e.date >= period.from && e.date <= to).reduce((n, e) => n + e.quantity, 0) : null;
    const previousYear = previousCovered ? saleEvents.filter(e => e.date >= previousFrom && e.date <= previousTo).reduce((n, e) => n + e.quantity, 0) : null;
    const physical = sum('physical'), available = sum('available'), cost = costEvent?.cost ?? null;
    const quality = ['Días históricos con stock desconocidos.', 'Primer ingreso observado no es lanzamiento ni antigüedad del stock restante.', 'Proveedor y vínculo de factura sin verificar.'];
    if (full) quality.push('Posible relación FULL pendiente: sin consolidar SKU ni estimar antigüedad o costo.');
    if (!ss.length) quality.push('Sin observación en la captura; no equivale a stock cero.');
    if (cost === null) quality.push('Sin costo utilizable.'); else if (cost === 0) quality.push('Costo cero informado; revisar antes de priorizar por valor.');
    if (previousYear === null) quality.push('Comparación estacional sin cobertura suficiente.');
    return { id: v.external_id, asOf: to, productId: v.product_id ?? null, product: p?.name ?? 'Producto sin correspondencia', name: v.name ?? '', sku: String(v.sku ?? ''), brand: String(p?.brandName || brands.get(String(p?.brandId)) || (p?.brandId ? 'Marca ID ' + String(p.brandId) : 'Sin marca')), category: types.get(p?.category_id ?? '') ?? (p?.category_id ? 'Categoría ID ' + p.category_id : 'Sin categoría'), web: web.has(v.product_id), full, physical, available, stockDate: stockValid ? ss.map(s => String(s.stockDate ?? s.observed_at)).sort()[0] : null, firstReceipt: receipts.at(-1)?.date ?? null, lastReceipt: receipts[0]?.date ?? null, receipts: new Set(receipts.map(e => e.documentId)).size, lastSale, daysWithoutSale: lastSale && intervalCovered(lastSale, to) ? Math.floor((Date.parse(to) - Date.parse(lastSale)) / 86400000) : null, units, previousYear, cost, costDate: costEvent?.date ?? null, value: physical !== null && cost !== null && physical >= 0 ? physical * cost : null, events: list, stockRows: ss, quality };
  });
  return { rows, to, checkedAt: new Date().toISOString(), method: METHOD, quality: { invalidSalesDocuments: sales.invalid.size, invalidMovements, badDays: badDays.size, creditDocuments: notes.length, cancelledDocuments: input.documents.filter(cancelled).length }, coverage: Object.fromEntries(periods.map(period => [period.days, period.covered])) };
}
export type Filters = { days: number; threshold: number; q: string; brand: string; category: string; signal: string; positive: boolean; segment: string; sort: string; direction: string; group: boolean; page: number; variantId?: string };
export function diagnose(row: Diagnostic, days: number, threshold: number) {
  const units = row.units[days], velocity = units === null ? null : units / days, coverage = row.available !== null && row.available >= 0 && velocity !== null && velocity > 0 ? row.available / velocity : null;
  const reasons: string[] = [];
  if ((row.available ?? 0) > 0 && units === 0) reasons.push('Sin ventas en el período');
  if ((row.available ?? 0) > 0 && row.daysWithoutSale !== null && row.daysWithoutSale >= threshold) reasons.push('Última venta hace ' + row.daysWithoutSale + ' días');
  if (coverage !== null && coverage > threshold) reasons.push('Cobertura superior a ' + threshold + ' días');
  if (row.full) reasons.push('Revisar flujo FULL');
  // Descriptive score, not a probability of a bad purchase. Unknown data lowers confidence.
  const score = (units === 0 && (row.available ?? 0) > 0 ? 30 : 0) + (row.daysWithoutSale !== null && row.daysWithoutSale >= threshold ? 20 : 0) + (coverage !== null && coverage > threshold ? 20 : 0) + (row.firstReceipt && Date.parse(row.firstReceipt) <= Date.parse(row.asOf) - threshold * 86400000 && !row.full ? 5 : 0) + (row.value !== null && row.value > 0 ? Math.min(15, Math.log10(1 + row.value) * 2) : 0) - (units === null ? 30 : 0) - (row.full ? 20 : 0) - (row.cost === null ? 5 : 0);
  return { ...row, unitsPeriod: units, velocity, coverage, reasons, score, lagging: false };
}
export function selectRows(rows: Diagnostic[], f: Filters) {
  const all = rows.map(r => diagnose(r, f.days, f.threshold));
  const parentDemand = new Map<string, boolean>(); for (const r of all) if (r.productId && (r.unitsPeriod ?? 0) > 0) parentDemand.set(r.productId, true);
  for (const r of all) if (r.productId && parentDemand.has(r.productId) && r.unitsPeriod === 0 && (r.available ?? 0) > 0) { r.lagging = true; r.reasons.push('Variante rezagada frente a sus hermanas'); }
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = all.filter(r => (!f.positive || (r.available ?? 0) > 0) && (!f.q || norm([r.product, r.name, r.sku].join(' ')).includes(norm(f.q))) && (!f.brand || r.brand === f.brand) && (!f.category || r.category === f.category) && (f.segment === 'all' || f.segment === 'web' && r.web || f.segment === 'other' && !r.web || f.segment === 'full' && r.full) && (!f.signal || f.signal === 'no_sales' && r.unitsPeriod === 0 || f.signal === 'old' && r.daysWithoutSale !== null && r.daysWithoutSale >= f.threshold || f.signal === 'excess' && r.coverage !== null && r.coverage > f.threshold || f.signal === 'lagging' && r.lagging));
  type ViewRow = ReturnType<typeof diagnose> & { variantCount?: number };
  let result: ViewRow[] = filtered;
  if (f.group) { const groups = new Map<string, typeof filtered>(); for (const r of filtered) { const key = r.productId ?? 'orphan:' + r.id, list = groups.get(key) ?? []; list.push(r); groups.set(key, list); }
    result = [...groups.values()].map(list => { const first = list[0], sum = (key: 'physical' | 'available' | 'value' | 'unitsPeriod') => list.every(r => r[key] !== null) ? list.reduce((n, r) => n + r[key]!, 0) : null, unitsPeriod = sum('unitsPeriod'), available = sum('available'), velocity = unitsPeriod === null ? null : unitsPeriod / f.days; return { ...first, id: 'product:' + (first.productId ?? first.id), name: list.length + ' variantes que cumplen filtros', sku: 'Agrupado', variantCount: list.length, lastSale: list.map(r => r.lastSale).filter((d): d is string => !!d).sort().at(-1) ?? null, lastReceipt: list.map(r => r.lastReceipt).filter((d): d is string => !!d).sort().at(-1) ?? null, physical: sum('physical'), available, value: sum('value'), unitsPeriod, velocity, coverage: velocity !== null && velocity > 0 && available !== null && available >= 0 ? available / velocity : null, daysWithoutSale: list.every(r => r.daysWithoutSale !== null) ? Math.min(...list.map(r => r.daysWithoutSale!)) : null, firstReceipt: list.map(r => r.firstReceipt).filter((d): d is string => !!d).sort()[0] ?? null, reasons: [...new Set(list.flatMap(r => r.reasons))], score: Math.max(...list.map(r => r.score)), units: Object.fromEntries([30, 90, 365].map(d => [d, list.every(r => r.units[d] !== null) ? list.reduce((n, r) => n + r.units[d]!, 0) : null])), previousYear: list.every(r => r.previousYear !== null) ? list.reduce((n, r) => n + r.previousYear!, 0) : null }; }); }
  const sortKeys = { stock: 'available', days: 'daysWithoutSale', sales: 'unitsPeriod', coverage: 'coverage', value: 'value', priority: 'score', age: 'firstReceipt' } as const;
  const key = sortKeys[f.sort as keyof typeof sortKeys] ?? 'score';
  result.sort((a, b) => { const x = a[key], y = b[key]; if (x === null) return y === null ? a.id.localeCompare(b.id) : 1; if (y === null) return -1; const order = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : Number(x) - Number(y); return (f.direction === 'asc' ? 1 : -1) * order || a.id.localeCompare(b.id); });
  return result;
}
