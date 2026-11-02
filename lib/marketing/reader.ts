import type { SupabaseClient } from "@supabase/supabase-js";
import type { Candidate, Opportunities } from "./core";
type Row = {
  id: number;
  external_id: string;
  product_id: string | null;
  name: string;
  data: Record<string, unknown>;
  run_id: string;
  observed_at: string;
};
const metadata = "id,external_id,product_id,name,run_id,observed_at";
// Keep the original mirror intact; transfer only the fields used by this reader.
const dataFields: Record<string, string[]> = {
  sales_documents: ["net", "currency", "state", "complete", "cancellationStatus", "cancellationDate", "codeSii", "isCreditNote", "documentType", "emissionDay", "emissionDate"],
  sales_details: ["documentId", "variantId", "quantity", "relatedDetailId", "net", "discountPercentage", "netDiscount"],
  sales_windows: ["from", "to", "reconciliation", "importedCount", "sourceCount", "excludedCount"],
  inventory_receptions: ["complete", "updateStock", "date"],
  inventory_receptions_details: ["movementId", "variantId", "quantity", "cost", "date"],
  inventory_stock: ["variantId", "officeId", "available", "observedAt"],
  variants: ["state"],
  products: ["state", "brandName"],
  web: ["url"],
};
const fields = (resource: string) => dataFields[resource]
  ? metadata + "," + dataFields[resource].map(key => `d_${key}:data->${key}`).join(",")
  : metadata + ",data";
const batchSize = 100;
const n = (x: unknown) =>
  x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x))
    ? Number(x)
    : null;
const yes = (x: unknown) => x === true || x === 1 || x === "1" || x === "true";
const final = (r: Row) =>
  ["33", "34", "39", "41"].includes(String(r.data.codeSii)) ||
  String(r.data.documentType).toUpperCase() === "TICKET DE VENTA";
export async function readOpportunities(
  db: SupabaseClient,
  org: number,
  from: string,
  to: string,
  comparisonOnly = false,
  includeReceipts = false,
  includeCommercial = false,
): Promise<Opportunities> {
  const notices: string[] = [];
  const base = (resource: string) => {
    const query = db
      .from("intel_records")
      .select(fields(resource))
      .eq("organization_id", org)
      .eq("resource", resource);
    // Explicit predicate matches Intel's existing partial indexes.
    return resource.startsWith("inventory_")
      ? query.like("resource", "inventory_%")
      : resource.startsWith("sales_")
        ? query.like("resource", "sales_%")
        : query;
  };
  const unwrap = (r: { data: unknown; error: { message: string } | null }) => {
    if (r.error)
      throw new Error("No pudimos consultar Intel.", { cause: r.error });
    return ((r.data ?? []) as (Row & Record<string, unknown>)[]).map(row => {
      const data: Record<string, unknown> = { ...row.data };
      for (const [key, value] of Object.entries(row)) {
        if (key.startsWith("d_")) data[key.slice(2)] = value;
      }
      return { ...row, data };
    });
  };
  async function pages(make: () => ReturnType<typeof base>, cap = 10000, label = "sales_documents") {
    const all: Row[] = [];
    for (let offset = 0; offset < cap; offset += 500) {
      const result = await make().range(offset, offset + 499);
      if (result.error) throw new Error(`No pudimos leer ${label}: ${result.error.message}`);
      const rows = unwrap(result);
      all.push(...rows);
      if (rows.length < 500) return all;
    }
    throw new Error("No se pudo confirmar la lectura completa; reduce las fechas.");
  }
  const start = Date.parse(from) / 1000,
    end = Date.parse(to) / 1000 + 86400;
  const [rr, wr, dr, sr] = await Promise.all([
    comparisonOnly && !includeReceipts ? Promise.resolve({data:[],error:null}) : base("inventory_receptions")
      .eq("data->>complete", "true")
      .eq("data->>updateStock", "1")
      .gte("data->date", start)
      .lt("data->date", end)
      .order("data->date", { ascending: false })
      .order("id")
      .limit(101),
    base("sales_windows")
      .lte("data->>from", to)
      .gte("data->>to", from)
      .limit(101),
    pages(() => base("sales_documents").gte("data->>emissionDay", from).lte("data->>emissionDay", to).order("id")),
    comparisonOnly ? Promise.resolve({data:[],error:null}) : db
      .from("intel_sync_runs")
      .select("id,status,cursor")
      .eq("organization_id", org)
      .eq("kind", "inventory")
      .neq("status", "cancelled")
      .order("started_at", { ascending: false })
      .limit(5),
  ]);
  const receiptRows = unwrap(rr), windowRows = unwrap(wr);
  const receipts = receiptRows.slice(0, 100),
    windows = windowRows.slice(0, 100),
    docs = dr;
  if (sr.error) throw new Error("No pudimos consultar las capturas de stock.");
  const stockRun = sr.data?.find(
    (r) =>
      n(r.cursor.stockRows)! > 0 &&
      ["list", "details", "check", "done"].includes(r.cursor.phase) &&
      !yes(r.cursor.checkingStock),
  );
  if (receiptRows.length > 100)
    notices.push(
      "Prueba acotada a las 100 recepciones más recientes del período; no es un ranking completo.",
    );
  let covered = windowRows.length <= 100;
  for (
    let day = Date.parse(from);
    covered && day <= Date.parse(to);
    day += 86400000
  ) {
    const d = new Date(day).toISOString().slice(0, 10);
    covered = windows.some(
      (w) =>
        w.data.reconciliation === "document_count_only" &&
        String(w.data.from) <= d &&
        String(w.data.to) >= d &&
        n(w.data.importedCount) !== null &&
        n(w.data.sourceCount) !== null &&
        n(w.data.importedCount)! + (n(w.data.excludedCount) ?? 0) ===
          n(w.data.sourceCount),
    );
  }
  const cancelled = (d: Row) =>
    ![null, undefined, 0, "0", false, "false", ""].includes(d.data.cancellationStatus as never) ||
    ![null, undefined, 0, "0", ""].includes(d.data.cancellationDate as never);
  const credit = (d: Row) => ["56", "61"].includes(String(d.data.codeSii)) || yes(d.data.isCreditNote);
  const adjustments = docs.some(d => final(d) && !credit(d) && !cancelled(d) && String(d.data.state) === "0" && !yes(d.data.complete));
  const salesLimited = false;
  const finalDocs = docs.filter(d => final(d) && !credit(d) && !cancelled(d) && String(d.data.state) === "0" && yes(d.data.complete));
  const creditCount = docs.filter(credit).length;
  const cancelledCount = docs.filter(cancelled).length;
  notices.push(`Ventas: ${docs.length} documentos leídos; ${finalDocs.length} ventas finales activas; ${creditCount} notas de crédito/débito y ${cancelledCount} anulados separados. Las unidades son brutas: no descuentan devoluciones ni representan ventas netas.`);
  async function details(resource: string, parents: Row[], field: string) {
    if (!parents.length) return [];
    const all: Row[] = [];
    for (let offset = 0; offset < parents.length; offset += batchSize) {
      const batch = parents.slice(offset, offset + batchSize);
      const parentRuns = new Map(batch.map(h => [h.external_id, h.run_id]));
      const rows = await pages(() => base(resource)
        .in(`data->>${field}`, batch.map(p => p.external_id)).order("data->>" + field).order("id"), 10000, resource);
      all.push(...rows.filter(l => parentRuns.get(String(l.data[field])) === l.run_id));
      if (all.length > 20000) throw new Error("Los detalles superan 20.000 líneas; reduce el período.");
    }
    return all;
  }
  const noteDocs=includeCommercial?docs.filter(d=>credit(d)&&!cancelled(d)&&String(d.data.state)==='0'):[];
  const [receiptLines, saleLines, noteLines] = await Promise.all([
    details("inventory_receptions_details", receipts, "movementId"),
    covered && !adjustments && !salesLimited
      ? details("sales_details", finalDocs, "documentId")
      : Promise.resolve([]),
    includeCommercial?details("sales_details",noteDocs,"documentId"):Promise.resolve([]),
  ]);
  let invalidLines = saleLines === null;
  if (covered && !adjustments && !salesLimited && saleLines)
    invalidLines =
      (() => { const ids = new Set(saleLines.map(l => String(l.data.documentId))); return finalDocs.some(h => !ids.has(h.external_id)); })() ||
      saleLines.some(
        (l) =>
          n(l.data.quantity) === null ||
          n(l.data.quantity)! <= 0 ||
          !l.data.variantId,
      );
  const runs = receipts.length
    ? await db
        .from("intel_sync_runs")
        .select("id,status")
        .eq("organization_id", org)
        .in("id", [...new Set(receipts.map((r) => r.run_id))])
    : { data: [], error: null };
  if (runs.error) throw new Error("No pudimos validar las recepciones.");
  const validReceipts = receipts.filter((h) =>
    runs.data?.some((r) => r.id === h.run_id && r.status !== "cancelled"),
  );
  type Group = {
    signal: "receipt" | "sales";
    variantId: string;
    quantity: number;
    event: number;
    observedAt: string;
    ids: Set<number>;
    documentQuantities: Map<number,number>;
  };
  const groups = new Map<string, Group>();
  function group(
    lines: Row[],
    parents: Row[],
    signal: "receipt" | "sales",
    field: string,
  ) {
    const byParent = new Map(parents.map(p => [p.external_id + ":" + p.run_id, p]));
    for (const l of lines) {
      const h = byParent.get(String(l.data[field]) + ":" + l.run_id);
      const quantity = n(l.data.quantity),
        event = n(h?.data[signal === "receipt" ? "date" : "emissionDate"]);
      if (
        !h ||
        quantity === null ||
        quantity <= 0 ||
        !l.data.variantId ||
        event === null
      )
        continue;
      const id = String(l.data.variantId),
        key = `${signal}:${id}`;
      const g = groups.get(key) ?? {
        signal,
        variantId: id,
        quantity: 0,
        event,
        observedAt: h.observed_at,
        ids: new Set<number>(),
        documentQuantities: new Map<number,number>(),
      };
      g.quantity += quantity;
      g.event = Math.max(g.event, event);
      if (h.observed_at > g.observedAt) g.observedAt = h.observed_at;
      g.ids.add(h.id);
      g.documentQuantities.set(h.id,(g.documentQuantities.get(h.id)??0)+quantity);
      groups.set(key, g);
    }
  }
  if (receiptLines) group(receiptLines, validReceipts, "receipt", "movementId");
  if (covered && !adjustments && !salesLimited && !invalidLines && saleLines)
    group(saleLines, finalDocs, "sales", "documentId");
  const variantIds = [...new Set([...groups.values()].map(g=>g.variantId).concat(noteLines.map(l=>String(l.data.variantId??'')).filter(id=>/^\d+$/.test(id))))];
  async function lookup(resource:string,field:string,ids:string[]) {
    if(ids.length>5000)throw new Error('Más de 5.000 referencias de catálogo; reduce el período.');
    const result:Row[]=[];
    for(let i=0;i<ids.length;i+=batchSize)result.push(...await pages(()=>base(resource).in(field,ids.slice(i,i+batchSize)).order('id')));
    return result;
  }
  const movementVariants=await lookup('variants','external_id',variantIds);
  const byVariant=new Map(movementVariants.map(v=>[v.external_id,v]));
  const variantSales=Object.fromEntries([...groups.values()].filter(g=>g.signal==='sales').map(g=>[g.variantId,{quantity:g.quantity,documents:g.ids.size,largestDocumentQuantity:Math.max(...g.documentQuantities.values()),largestDocumentShare:Math.max(...g.documentQuantities.values())/g.quantity,recordIds:[...g.ids].slice(0,10)}]));
  const perProduct=new Map<string,{quantity:number;documents:Map<number,number>;variants:Set<string>;records:Set<number>}>();
  let unmappedSalesVariants=0;
  for(const g of groups.values()){
    if(g.signal!=='sales')continue;
    const productId=byVariant.get(g.variantId)?.product_id;
    if(!productId){unmappedSalesVariants++;continue;}
    const aggregate=perProduct.get(productId)??{quantity:0,documents:new Map<number,number>(),variants:new Set<string>(),records:new Set<number>()};
    aggregate.quantity+=g.quantity;aggregate.variants.add(g.variantId);
    for(const [id,quantity] of g.documentQuantities){aggregate.documents.set(id,(aggregate.documents.get(id)??0)+quantity);aggregate.records.add(id);}
    perProduct.set(productId,aggregate);
  }
  const productSales=Object.fromEntries([...perProduct].map(([id,p])=>{
    const largest=Math.max(...p.documents.values());
    return [id,{quantity:p.quantity,documents:p.documents.size,largestDocumentQuantity:largest,largestDocumentShare:largest/p.quantity,distributedUnits:p.quantity-largest,concentrated:p.documents.size===1||largest/p.quantity>=0.5,variantIds:[...p.variants],recordIds:[...p.records].slice(0,10)}];
  }));
  if(unmappedSalesVariants)notices.push(`${unmappedSalesVariants} variantes vendidas sin producto identificado: se muestran agregados conocidos; comparaciones completas no disponibles.`);
  const coverage={salesCovered:covered&&!salesLimited,adjustmentsPending:adjustments,invalidLines,stockRunId:stockRun?.id??null};
  const receiptTotals=new Map<string,{quantity:number;documents:Set<number>;lastEvent:number}>();
  for(const g of groups.values())if(g.signal==='receipt'){
    const id=byVariant.get(g.variantId)?.product_id;if(!id)continue;
    const p=receiptTotals.get(id)??{quantity:0,documents:new Set<number>(),lastEvent:0};p.quantity+=g.quantity;for(const document of g.ids)p.documents.add(document);p.lastEvent=Math.max(p.lastEvent,g.event);receiptTotals.set(id,p);
  }
  const productReceipts=Object.fromEntries([...receiptTotals].map(([id,p])=>[id,{quantity:p.quantity,documents:p.documents.size,lastDate:new Date(p.lastEvent*1000).toISOString(),limited:receiptRows.length>100}]));
  let commercial:Opportunities['commercial'];
  if(includeCommercial){
    const detailId=(line:Row)=>line.external_id.split(':')[1];
    const currentById=new Map(saleLines.map(l=>[detailId(l),l]));
    const missingRelated=[...new Set(noteLines.map(l=>String(l.data.relatedDetailId??'')).filter(id=>/^\d+$/.test(id)&&id!=='0'&&!currentById.has(id)))];
    if(missingRelated.length>500)throw new Error('Más de 500 enlaces de notas por comprobar; reduce el período.');
    const related:Row[]=[];
    for(let i=0;i<missingRelated.length;i+=batchSize){const batch=missingRelated.slice(i,i+batchSize);related.push(...await pages(()=>base('sales_details').eq('source','bsale').in('raw->>id',batch).order('id'),10000,'enlaces de notas'));}
    const allRelated=[...saleLines,...related];
    const parentIds=[...new Set(related.map(l=>String(l.data.documentId)).filter(id=>!docs.some(d=>d.external_id===id)))];
    const parents=[...docs,...await lookup('sales_documents','external_id',parentIds)];
    const toLine=(line:Row)=>{const id=String(line.data.variantId??''),matches=allRelated.filter(l=>detailId(l)===String(line.data.relatedDetailId)),origin=matches.length===1?matches[0]:null,parent=origin?parents.find(p=>p.external_id===String(origin.data.documentId)&&p.run_id===origin.run_id):null;return {variantId:id,productId:byVariant.get(id)?.product_id??null,quantity:n(line.data.quantity),net:n(line.data.net),discounted:(n(line.data.discountPercentage)??0)>0||(n(line.data.netDiscount)??0)>0,originalLinked:!!parent&&final(parent)&&!credit(parent)&&String(parent.data.state)==='0'&&yes(parent.data.complete)&&String(origin?.data.variantId)===id,originalCancelled:!!parent&&cancelled(parent)};};
    const currency=(d:Row)=>{const value=d.data.currency;if(typeof value==='string'&&/^[A-Z]{3}$/.test(value))return value;if(value&&typeof value==='object'&&'isoCode'in value&&/^[A-Z]{3}$/.test(String(value.isoCode)))return String(value.isoCode);return null;};
    commercial={covered:coverage.salesCovered&&!coverage.adjustmentsPending&&!coverage.invalidLines&&unmappedSalesVariants===0,documents:[...finalDocs,...noteDocs].map(d=>({id:d.external_id,kind:credit(d)?String(d.data.codeSii)==='56'?'debit' as const:'credit' as const:'sale' as const,currency:currency(d),net:n(d.data.net),complete:yes(d.data.complete),lines:(credit(d)?noteLines:saleLines).filter(l=>String(l.data.documentId)===d.external_id&&l.run_id===d.run_id).map(toLine)})),receiptCosts:receiptLines.filter(l=>validReceipts.some(h=>h.external_id===String(l.data.movementId)&&h.run_id===l.run_id)).map(l=>({variantId:String(l.data.variantId),cost:n(l.data.cost),quantity:n(l.data.quantity)??0,day:new Date((n(l.data.date)??0)*1000).toISOString().slice(0,10)}))};
  }
  if(comparisonOnly)return {checkedAt:new Date().toISOString(),from,to,coverage,candidates:[],variantSales,commercial,productReceipts,productSales,productSalesComplete:unmappedSalesVariants===0,notices};
  const movementProductIds=[...new Set(movementVariants.map(v=>v.product_id).filter((id):id is string=>!!id))];
  const products=await lookup('products','external_id',movementProductIds);
  const activeProducts=new Set(products.filter(p=>String(p.data.state)==='0').map(p=>p.external_id));
  const salesProducts=Object.entries(productSales).filter(([id])=>activeProducts.has(id)).sort((a,b)=>Number(a[1].concentrated)-Number(b[1].concentrated)||b[1].documents-a[1].documents||b[1].distributedUnits-a[1].distributedUnits||a[0].localeCompare(b[0]));
  const receiptProducts=new Map<string,number>();
  for(const g of groups.values())if(g.signal==='receipt'){
    const id=byVariant.get(g.variantId)?.product_id;
    if(id&&activeProducts.has(id))receiptProducts.set(id,Math.max(receiptProducts.get(id)??0,g.event));
  }
  const selectedProductIds=[...new Set([...salesProducts.slice(0,20).map(([id])=>id),...[...receiptProducts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10).map(([id])=>id)])];
  const selectedSet=new Set(selectedProductIds);
  const chosen=[...groups.values()].filter(g=>{const v=byVariant.get(g.variantId);return v?.product_id&&selectedSet.has(v.product_id)&&String(v.data.state)==='0';});
  const productVariants=await lookup('variants','product_id',selectedProductIds);
  const activeVariants=productVariants.filter(v=>String(v.data.state)==='0');
  const stockIds=[...new Set(activeVariants.map(v=>v.external_id))];
  const webRows=await lookup('web','product_id',selectedProductIds);
  const stockRows:Row[]=[];
  if(stockRun)for(let i=0;i<stockIds.length;i+=batchSize){
    stockRows.push(...await pages(()=>base('inventory_stock').eq('run_id',stockRun.id).in('data->>variantId',stockIds.slice(i,i+batchSize)).order('data->>variantId').order('id')));
    if(stockRows.length>20000)throw new Error('El stock supera 20.000 registros; reduce el período.');
  }
  function stockFor(id:string){
    const rows=stockRows.filter(s=>String(s.data.variantId)===id);
    const valid=rows.length>0&&rows.every(s=>n(s.data.available)!==null);
    return {rows,available:valid?rows.reduce((sum,s)=>sum+n(s.data.available)!,0):null,observedAt:rows.length?rows.map(s=>s.observed_at).sort()[0]:null};
  }
  const productSummaries=Object.fromEntries(selectedProductIds.map(id=>{
    const variants=activeVariants.filter(v=>v.product_id===id);
    const stock=variants.map(v=>stockFor(v.external_id));
    return [id,{sales:productSales[id]??null,activeVariantIds:variants.map(v=>v.external_id),stock:{available:stock.length&&stock.every(s=>s.available!==null)?stock.reduce((sum,s)=>sum+s.available!,0):null,observedAt:stock.length&&stock.every(s=>s.observedAt)?stock.map(s=>s.observedAt!).sort()[0]:null,variantsObserved:stock.filter(s=>s.available!==null).length,variantsTotal:variants.length},selectionReason:salesProducts.slice(0,20).some(([p])=>p===id)?'sales_documents':'recent_receipt'}];
  }));
  const missing=variantIds.filter(id=>!byVariant.get(id)?.product_id||!products.some(p=>p.external_id===byVariant.get(id)?.product_id)).length;
  if(missing)notices.push(`${missing} variantes de movimiento sin referencia completa de catálogo: excluidas, sin unir por SKU.`);
  notices.push('Selección por producto: hasta 20 por documentos y unidades fuera del mayor documento, más 10 por recepción reciente. Se incluyen todas sus variantes con movimiento. Concentración: un solo documento o al menos 50 % de unidades en el mayor; es una alerta de revisión, no prueba de una compra excepcional ni de compradores distintos.');
  const candidates:Candidate[]=[];
  for(const g of chosen){
    const v=byVariant.get(g.variantId)!,p=products.find(p=>p.external_id===v.product_id)!;
    const stock=stockFor(g.variantId);
    const url=webRows.filter(w=>w.product_id===p.external_id).sort((a,b)=>b.observed_at.localeCompare(a.observed_at))[0]?.data.url;
    candidates.push({key:`${g.signal}:${g.variantId}`,signal:g.signal,productId:p.external_id,variantId:g.variantId,productName:p.name,variantName:v.name,brand:typeof p.data.brandName==='string'?p.data.brandName:null,quantity:g.quantity,documentCount:g.ids.size,eventDate:new Date(g.event*1000).toISOString(),observedAt:g.observedAt,catalogObservedAt:p.observed_at,recordIds:[...g.ids].slice(0,10),available:stock.available,stockObservedAt:stock.observedAt,offices:stock.rows.length?stock.rows.map(s=>({officeId:String(s.data.officeId),available:n(s.data.available)??0,observedAt:String(s.data.observedAt??s.observed_at),recordId:s.id})):null,url:typeof url==='string'?url:null});
  }
  return {checkedAt:new Date().toISOString(),from,to,coverage,candidates,variantSales,commercial,productReceipts,productSales,productSalesComplete:unmappedSalesVariants===0,productSummaries,selection:{evaluatedSalesProducts:salesProducts.length,selectedProducts:selectedProductIds.length,unmappedSalesVariants},notices};
}
