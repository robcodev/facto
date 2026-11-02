import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("./reader.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { readOpportunities } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
let nextId = 1;
const rows = [];
const queries = [];
const runs = [
  {
    id: "run",
    organization_id: 1,
    kind: "inventory",
    status: "running",
    cursor: { phase: "list", stockRows: 2 },
    started_at: "2026-10-26",
  },
];
function row(
  resource,
  external_id,
  data,
  product_id = null,
  org = 1,
  run_id = "run",
) {
  const r = {
    id: nextId++,
    organization_id: org,
    resource,
    external_id,
    name: external_id,
    product_id,
    data,
    run_id,
    observed_at: "2026-10-26T12:00:00Z",
  };
  rows.push(r);
  return r;
}
const value = (r, key) =>
  key.includes("->") ? r.data[key.split(/->>?/)[1]] : r[key];
class Query {
  constructor(table) {
    this.table = table;
    this.pred = [];
    this.orders = [];
    this.max = 1000;
  }
  like(k, pattern) {
    this.pred.push((r) =>
      String(value(r, k)).startsWith(pattern.replace(/%$/, "")),
    );
    return this;
  }
  select(projection, options = {}) {
    this.projection = projection;
    this.counted = !!options.count;
    return this;
  }
  eq(k, v) {
    this.pred.push((r) => String(value(r, k)) === String(v));
    return this;
  }
  neq(k, v) {
    this.pred.push((r) => String(value(r, k)) !== String(v));
    return this;
  }
  in(k, vs) {
    this.pred.push((r) => vs.map(String).includes(String(value(r, k))));
    return this;
  }
  gte(k, v) {
    this.pred.push((r) => value(r, k) >= v);
    return this;
  }
  lte(k, v) {
    this.pred.push((r) => value(r, k) <= v);
    return this;
  }
  lt(k, v) {
    this.pred.push((r) => value(r, k) < v);
    return this;
  }
  order(k, o = {}) {
    this.orders.push([k, o.ascending !== false]);
    return this;
  }
  limit(v) {
    this.max = v;
    return this;
  }
  range(from, to) { this.offset = from; this.max = to - from + 1; return this; }
  then(resolve, reject) {
    queries.push({ table: this.table, projection: this.projection, counted: this.counted });
    let data = (this.table === "intel_records" ? rows : runs).filter((r) =>
      this.pred.every((p) => p(r)),
    );
    const count = data.length;
    data = data.slice().sort((a, b) => {
      for (const [k, asc] of this.orders) {
        const av = value(a, k),
          bv = value(b, k);
        if (av !== bv) return (av > bv ? 1 : -1) * (asc ? 1 : -1);
      }
      return 0;
    });
    return Promise.resolve({
      data: data.slice(this.offset ?? 0, (this.offset ?? 0) + this.max).map(r => {
        if (!this.projection || this.projection === '*') return r;
        return Object.fromEntries(this.projection.split(',').map(field => {
          const separator = field.indexOf(':'), alias = separator < 0 ? field : field.slice(0, separator), key = separator < 0 ? field : field.slice(separator + 1);
          return [alias, value(r, key) ?? null];
        }));
      }),
      count,
      error: null,
    }).then(resolve, reject);
  }
}
const db = {
  from(table) {
    assert.ok(["intel_records", "intel_sync_runs"].includes(table));
    return new Query(table);
  },
  rpc() {
    throw Error("RPC must not be used");
  },
};
row("products", "p", { state: 0 });
row("variants", "v", { state: 0 }, "p");
row("inventory_receptions", "h", {
  complete: true,
  updateStock: 1,
  date: Date.parse("2026-10-24") / 1000,
});
row("inventory_receptions_details", "l", {
  movementId: "h",
  variantId: "v",
  quantity: 2,
});
row("inventory_receptions", "incomplete", {
  complete: false,
  updateStock: 1,
  date: Date.parse("2026-10-24") / 1000,
});
row("inventory_receptions_details", "bad", {
  movementId: "incomplete",
  variantId: "v",
  quantity: 999,
});
row(
  "inventory_receptions_details",
  "old",
  { movementId: "h", variantId: "v", quantity: 999 },
  null,
  1,
  "old-run",
);
row("inventory_stock", "s", { variantId: "v", officeId: 1, available: 0 });
let r = await readOpportunities(db, 1, "2026-10-01", "2026-10-25");
assert.equal(r.candidates.length, 1);
assert.equal(r.candidates[0].quantity, 2);
assert.equal(r.candidates[0].available, 0);
assert.equal(r.coverage.salesCovered, false);
assert.equal(
  (await readOpportunities(db, 2, "2026-10-01", "2026-10-25")).candidates
    .length,
  0,
);
row("sales_windows", "w", {
  from: "2026-10-01",
  to: "2026-10-25",
  sourceCount: 2,
  importedCount: 2,
  reconciliation: "document_count_only",
});
row("sales_documents", "ticket", {
  emissionDay: "2026-10-24",
  emissionDate: Date.parse("2026-10-24") / 1000,
  documentType: "TICKET DE VENTA",
  complete: true,
  state: 0,
});
row("sales_details", "ticketline", {
  documentId: "ticket",
  variantId: "v",
  quantity: 3,
});
row("sales_documents", "presale", {
  emissionDay: "2026-10-24",
  documentType: "PREVENTA",
  complete: true,
  state: 0,
});
row("sales_details", "presaleline", {
  documentId: "presale",
  variantId: "v",
  quantity: 500,
});
r = await readOpportunities(db, 1, "2026-10-01", "2026-10-25");
assert.equal(r.candidates.find((c) => c.signal === "sales").quantity, 3);
const credit = row("sales_documents", "credit", {
  emissionDay: "2026-10-24",
  codeSii: 61,
  complete: true,
});
r = await readOpportunities(db, 1, "2026-10-01", "2026-10-25");
assert.equal(r.coverage.adjustmentsPending, false);
assert.equal(r.candidates.find((c) => c.signal === "sales").quantity, 3);
assert.ok(r.notices.some(n => n.includes("1 notas")));
rows.splice(rows.indexOf(credit), 1);
for (let i = 0; i < 601; i++)
  row("sales_documents", "extra" + i, {
    emissionDay: "2026-10-24",
    documentType: "PREVENTA",
    complete: true,
  });
r = await readOpportunities(db, 1, "2026-10-01", "2026-10-25");
assert.equal(r.coverage.salesCovered, true);
assert.equal(r.candidates.find(c => c.signal === "sales").quantity, 3);
row("sales_documents", "cancelled", {emissionDay:"2026-10-24", documentType:"TICKET DE VENTA",complete:true,state:0,cancellationStatus:1});
row("sales_details","cancelled-line",{documentId:"cancelled",variantId:"v",quantity:900});
r = await readOpportunities(db,1,"2026-10-01","2026-10-25");
assert.equal(r.candidates.find(c=>c.signal==="sales").quantity,3);
// A full product keeps more than fifteen sold variants, with one count per document.
for(let i=0;i<18;i++){row('variants','pv'+i,{state:0},'p');row('sales_details','pvline'+i,{documentId:'ticket',variantId:'pv'+i,quantity:2});}
row('products','bulk',{state:0});row('variants','bulk-v',{state:0},'bulk');row('sales_documents','bulk-doc',{emissionDay:'2026-10-24',emissionDate:Date.parse('2026-10-24')/1000,documentType:'TICKET DE VENTA',complete:true,state:0});row('sales_details','bulk-line',{documentId:'bulk-doc',variantId:'bulk-v',quantity:10000});
for(let i=0;i<20;i++){row('products','regular'+i,{state:0});row('variants','regular-v'+i,{state:0},'regular'+i);for(let j=0;j<3;j++){const id='regular-doc'+i+'-'+j;row('sales_documents',id,{emissionDay:'2026-10-24',emissionDate:Date.parse('2026-10-24')/1000,documentType:'TICKET DE VENTA',complete:true,state:0});row('sales_details','regular-line'+i+'-'+j,{documentId:id,variantId:'regular-v'+i,quantity:1});}}
queries.length = 0;
r=await readOpportunities(db,1,'2026-10-01','2026-10-25');assert.equal(r.productSales.p.quantity,39);assert.equal(r.productSales.p.documents,1);assert.equal(r.productSales.p.largestDocumentQuantity,39);assert.equal(r.candidates.filter(c=>c.productId==='p'&&c.signal==='sales').length,19);assert.equal(r.candidates.some(c=>c.productId==='bulk'),false);assert.equal(r.productSales.bulk.concentrated,true);assert.equal(r.productSales.regular0.concentrated,false);
assert.equal(queries.filter(q => q.projection.includes('d_documentId')).length, 1, 'more than sixty sale headers share one complete details batch');
assert.ok(queries.every(q => !q.counted), 'threshold checks do not calculate exact totals');
assert.ok(queries.filter(q => q.table === 'intel_records').every(q => !q.projection.split(',').includes('data')), 'reader transfers only projected JSON fields');
const comparison=await readOpportunities(db,1,'2026-10-01','2026-10-25',true);assert.equal(comparison.candidates.length,0);assert.equal(comparison.productSales.p.quantity,39);
row("sales_documents","unfinished",{emissionDay:"2026-10-24",documentType:"TICKET DE VENTA",complete:false,state:0});
r = await readOpportunities(db,1,"2026-10-01","2026-10-25");
assert.equal(r.coverage.adjustmentsPending,true);
assert.equal(r.candidates.filter(c=>c.signal==="sales").length,0);
// Sentinel rows detect truncation without reading or counting the whole set.
for (let i = 0; i < 101; i++) row('inventory_receptions', 'receipt-limit-' + i, {complete:true,updateStock:1,date:Date.parse('2026-10-24')/1000});
r = await readOpportunities(db,1,'2026-10-01','2026-10-25');
assert.ok(r.notices.some(n => n.includes('100 recepciones')));
for (let i = 0; i < 100; i++) row('sales_windows', 'window-limit-' + i, {from:'2026-10-01',to:'2026-10-25',reconciliation:'document_count_only',sourceCount:0,importedCount:0});
r = await readOpportunities(db,1,'2026-10-01','2026-10-25');
assert.equal(r.coverage.salesCovered, false, '101 windows never imply verified complete coverage');
const server = await readFile(new URL("./server.ts", import.meta.url), "utf8");
assert.doesNotMatch(server, /\.\s*(insert|update|delete|upsert|rpc)\s*\(/);
assert.doesNotMatch(source, /\.\s*(insert|update|delete|upsert|rpc)\s*\(/);
console.log(
  "PASS: read-only/no RPC, company scope, complete receipts, current detail run, zero stock, coverage, tickets/presales, separate credit notes, cancelled sales, incomplete block and multi-page reads.",
);
