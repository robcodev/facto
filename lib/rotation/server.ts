import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDataset, selectRows, type Row, type Filters } from './core';
type Context = { db: SupabaseClient; orgId: number };
let activeReads = 0;
const waitingReads: (() => void)[] = [];
async function readSlot<T>(read: () => PromiseLike<T>): Promise<T> {
  if (activeReads >= 4) await new Promise<void>(resolve => waitingReads.push(resolve)); else activeReads++;
  try { return await read(); } finally { const next = waitingReads.shift(); if (next) next(); else activeReads--; }
}
export async function scan(ctx: Context, resource: string, projection: string, cap: number, runId?: string) {
  const rows: Row[] = []; let cursor = ''; let pageSize = projection.includes('raw->') ? 250 : 1000; let retries = 0;
  for (;;) {
    let query = ctx.db.from('intel_records').select('external_id,run_id,' + projection).eq('organization_id', ctx.orgId).eq('source', 'bsale').eq('resource', resource).order('external_id').limit(pageSize);
    if (resource.startsWith('inventory_')) query = query.like('resource', 'inventory_%');
    if (resource.startsWith('sales_')) query = query.like('resource', 'sales_%');
    if (runId) query = query.eq('run_id', runId);
    if (cursor) query = query.gt('external_id', cursor);
    const response = await readSlot(() => query);
    if (response.error && /timeout|57014/i.test(response.error.code + ' ' + response.error.message) && retries < 2) { retries++; pageSize = Math.max(250, Math.floor(pageSize / 2)); continue; }
    if (response.error) throw Error('No pudimos leer ' + resource + ' de Intel: ' + response.error.message);
    retries = 0;
    const page = response.data as unknown as Row[]; rows.push(...page);
    if (rows.length > cap) throw Error(resource + ' supera el límite de lectura. No se mostrará una muestra parcial como completa.');
    if (page.length < pageSize) return rows;
    const next = page.at(-1)!.external_id; if (next === cursor) throw Error('La consulta no avanzó en ' + resource); cursor = next;
  }
}
export async function loadInventory(ctx: Context) {
  const started = Date.now();
  const runs = await ctx.db.from('intel_sync_runs').select('id,updated_at,stockRows:cursor->stockRows,phase:cursor->>phase,checkingStock:cursor->checkingStock').eq('organization_id', ctx.orgId).eq('kind', 'inventory').eq('status', 'completed').order('started_at', { ascending: false }).limit(30);
  if (runs.error) throw Error('No pudimos comprobar las capturas de stock.');
  const run = (runs.data as unknown as { id: string; updated_at: string; stockRows: number; phase: string; checkingStock: unknown }[]).find(r => Number(r.stockRows) > 0 && r.phase === 'done');
  const declaredBrands = await ctx.db.from('commercial_brand_names').select('brand_id,name').eq('organization_id', ctx.orgId).limit(1001);
  if ((declaredBrands.data?.length ?? 0) > 1000) throw Error('Los nombres de marca superan el límite del módulo.');
  const [products, variants, types, brands, web, windows, documents, details, consumptions, consumptionLines, stock] = await Promise.all([
    scan(ctx, 'products', 'name,category_id,brandId:data->>brandId,brandName:data->>brandName', 30000),
    scan(ctx, 'variants', 'name,product_id,sku:data->>sku', 60000),
    scan(ctx, 'types', 'name', 5000), scan(ctx, 'brands', 'name', 5000), scan(ctx, 'web', 'product_id', 30000),
    scan(ctx, 'sales_windows', 'from:data->>from,to:data->>to,reconciliation:data->>reconciliation,importedCount:data->importedCount,sourceCount:data->sourceCount,excludedCount:data->excludedCount', 10000),
    scan(ctx, 'sales_documents', 'observed_at,day:data->>emissionDay,number:data->>number,code:data->>codeSii,documentType:data->>documentType,documentTypeId:data->>documentTypeId,state:data->state,complete:data->complete,cancellationStatus:data->cancellationStatus,cancellationDate:data->cancellationDate,isCreditNote:data->isCreditNote', 300000),
    scan(ctx, 'sales_details', 'documentId:data->>documentId,variantId:data->>variantId,quantity:data->quantity,relatedDetailId:data->>relatedDetailId', 1000000),
    scan(ctx, 'inventory_consumptions', 'observed_at,date:data->date,complete:data->complete,updateStock:data->updateStock,note:raw->>note,documentReference:raw->>document,documentNumber:raw->>documentNumber', 60000),
    scan(ctx, 'inventory_consumptions_details', 'movementId:data->>movementId,variantId:data->>variantId,quantity:data->quantity,cost:data->cost', 200000),
    run ? scan(ctx, 'inventory_stock', 'observed_at,stockDate:data->>observedAt,variantId:data->>variantId,officeId:data->>officeId,physical:data->physical,available:data->available', 60000, run.id) : Promise.resolve([]),
  ]);
  if (run && stock.length !== Number(run.stockRows)) throw Error('La captura de stock no coincide con su conteo verificado.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const namedBrands = [...brands, ...(declaredBrands.data ?? []).map(b => ({ external_id: b.brand_id, name: b.name, run_id: 'declared-brand' }))];
  const dataset = buildDataset({ products, variants, types, brands: namedBrands, web, windows, documents, details, receptions: [], receiptLines: [], consumptions, consumptionLines, stock, closed: new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10) });
  return { ...dataset, completedStockRuns: (runs.data as unknown as {id:string;stockRows:number;phase:string}[]).filter(r=>Number(r.stockRows)>0&&r.phase==='done').map(r=>r.id), stockRunId: run?.id ?? null, stockUpdatedAt: run?.updated_at ?? null, durationMs: Date.now() - started, catalogTotal: variants.length, counts: { documents: documents.length, salesLines: details.length, receptions: 0, consumptions: consumptions.length, stockRows: stock.length } };
}
type Dataset = Awaited<ReturnType<typeof loadInventory>>;
const cache = new Map<number, { promise: Promise<Dataset>; expires: number }>();
async function dataset(ctx: Context) {
  const old = cache.get(ctx.orgId); if (old && old.expires > Date.now()) return old.promise;
  if (cache.size >= 3) cache.delete(cache.keys().next().value!);
  const entry = { promise: loadInventory(ctx), expires: Date.now() + 300000 }; cache.set(ctx.orgId, entry);
  try { return await entry.promise; } catch (e) { if (cache.get(ctx.orgId) === entry) cache.delete(ctx.orgId); throw e; }
}
export async function inventoryView(ctx: Context, f: Filters) {
  const data = await dataset(ctx), { rows, ...meta } = data;
  if (f.variantId) {
    const variant = rows.find(r => r.id === f.variantId); if (!variant) throw Error('Variante no encontrada en esta empresa.');
    const observations = data.completedStockRuns.length ? await ctx.db.from('intel_records').select('external_id,run_id,stockDate:data->>observedAt,officeId:data->>officeId,physical:data->physical,available:data->available').eq('organization_id',ctx.orgId).eq('source','bsale').eq('resource','inventory_stock').like('resource','inventory_%').eq('data->>variantId',variant.id).in('run_id',data.completedStockRuns).order('id',{ascending:false}).limit(201) : {data:[],error:null};
    if(observations.error) throw Error('No pudimos leer las observaciones de stock de esta variante.');
    const page = f.page, events = variant.events.slice(page * 50, (page + 1) * 50);
    return { ...meta, variant: { ...variant, events }, stockHistory: (observations.data as unknown as Row[]).slice(0,200), stockHistoryLimited: (observations.data?.length??0)>200, eventTotal: variant.events.length, page, hasMore: (page + 1) * 50 < variant.events.length };
  }
  const selected = selectRows(rows, f), page = Math.min(f.page, Math.max(0, Math.ceil(selected.length / 25) - 1));
  return { ...meta, total: selected.length, page, hasMore: (page + 1) * 25 < selected.length, brands: [...new Set(rows.map(r => r.brand))].sort(), categories: [...new Set(rows.map(r => r.category))].sort(), rows: selected.slice(page * 25, page * 25 + 25).map(r => { const { events, stockRows, ...summary } = r; void events; void stockRows; return summary; }) };
}
export type InventoryResponse = Awaited<ReturnType<typeof inventoryView>>;
