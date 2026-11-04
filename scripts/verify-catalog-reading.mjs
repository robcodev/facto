import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n in overrides?overrides[n]:require(n),m,m.exports);return m.exports;}
const reception=compile('lib/reception-products/core.ts'),core=compile('lib/catalog-reading/core.ts',{'@/lib/reception-products/core':reception});
const {PDFDocument,StandardFonts}=require('pdf-lib');
const fixture=await PDFDocument.create(),font=await fixture.embedFont(StandardFonts.Helvetica);
for(const line of ['SKU 000123 | GUANTE MAR AZUL talla M | Cantidad 2 | Costo unitario neto CLP 1000 | Precio venta IVA incluido CLP 2990','SKU 000124 | GUANTE MAR AZUL talla L | Cantidad 3 | Sin costo ni precio de venta indicado']){const p=fixture.addPage([842,595]);p.drawText('DOCUMENTO DE PRUEBA - FOLIO 456',{x:30,y:550,size:16,font});p.drawText(line,{x:30,y:500,size:10,font});}
const original=await fixture.save();
const dbRows=new Map(),imports=new Map(),downloads=[],calls=[];let outputs=[];
class Query{filters=[];patch;addition;constructor(table){this.table=table;}select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}update(p){this.patch=structuredClone(p);return this;}insert(p){this.addition=structuredClone(p);return this;}async maybeSingle(){const map=this.table==='catalog_reading_jobs'?dbRows:imports;if(this.addition){if(map.has(this.addition.id))return{error:{code:'23505'}};map.set(this.addition.id,this.addition);return{data:structuredClone(this.addition),error:null};}const r=[...map.values()].find(r=>this.filters.every(f=>f(r)));if(r&&this.patch)Object.assign(r,this.patch);return{data:r?structuredClone(r):null,error:null};}single(){return this.maybeSingle();}then(a,b){return this.maybeSingle().then(a,b);}}
const db={from:t=>new Query(t),storage:{from:b=>{assert.equal(b,'catalog-reading');return{download:async p=>{downloads.push(p);return{data:new Blob([original]),error:null};}};}}};
const google={...require('@google/genai'),GoogleGenAI:class{models={generateContent:async input=>{calls.push(input);const next=outputs.shift();assert.ok(next,'Unexpected AI call');if(next instanceof Error)throw next;return{text:JSON.stringify(next)};}};}};
const service=compile('lib/catalog-reading/server.ts',{'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/reception-products/core':reception,'./core':core,'@google/genai':google});
const ref={id:crypto.randomUUID(),orgId:1,userId:crypto.randomUUID(),generation:crypto.randomUUID()};
dbRows.set(ref.id,{id:ref.id,organization_id:1,created_by:ref.userId,generation:ref.generation,status:'queued',sources:[{path:`1/${ref.userId}/${ref.id}/0`,mime:'application/pdf',name:'fixture.pdf'}],progress:{prepared:false,pages:[],mappings:[],number:''},project_id:null});
const raw=(code,extra={})=>({code,description:'Guante Mar Azul talla '+(code==='000123'?'M':'L'),quantity:2,totalNet:null,netUnitValue:1000,salePrice:2990,salePriceIncludesVat:true,...extra});
const oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture-only';
try{
 assert.equal(await service.prepare(ref),2);assert.ok(dbRows.get(ref.id).progress.pages.every(p=>p.text?.includes('SKU')),'Native PDF text retained per page');
 outputs=[{documentNumber:'456',complete:true,rows:[raw('000123')]}];assert.deepEqual(await service.extract(ref,0,0),{ok:true});assert.ok(calls[0].contents[0].text,'Text-native pages do not need visual PDF input');
 outputs=[Object.assign(new Error('Unavailable'),{status:503})];let result=await service.extract(ref,1,0);assert.equal(result.ok,false);assert.equal(result.retryable,true);assert.equal(dbRows.get(ref.id).progress.pages[0].done,true);assert.equal(imports.size,0,'Partial document is never a ready import');
 const before=calls.length;assert.deepEqual(await service.extract(ref,0,0),{ok:true});assert.equal(calls.length,before,'Already completed pages are not sent again');
 outputs=[{documentNumber:'456',complete:true,rows:[raw('000124',{netUnitValue:null,salePrice:null,salePriceIncludesVat:null,quantity:3})]}];await service.extract(ref,1,1);
 outputs=[{groups:[{index:0,productName:'GUANTE MAR AZUL',variantName:'M',cost:999},{index:8,productName:'WRONG',variantName:'X'}]}];result=await service.group(ref,0,0);assert.equal(result.ok,false);assert.equal(imports.size,0);
 outputs=[{groups:[{index:0,productName:'GUANTE MAR AZUL',variantName:'M',cost:999},{index:1,productName:'GUANTE MAR AZUL',variantName:'L'}]}];assert.deepEqual(await service.group(ref,0,1),{ok:true});
 await service.finish(ref);await service.finish(ref);assert.equal(imports.size,1,'Finalization retries produce one draft');
 const imported=imports.get(ref.id).document;assert.equal(imported.groups.length,1);assert.equal(imported.rows[0].code,'000123');assert.equal(imported.rows[0].cost,1000);assert.equal(imported.rows[0].priceGross,2990);assert.equal(imported.rows[1].cost,null);assert.equal(imported.rows[1].priceGross,null);assert.equal(imported.rows[1].quantity,3);assert.equal(imported.receiptId,null);
 assert.equal(dbRows.get(ref.id).status,'completed');assert.equal(dbRows.get(ref.id).progress.pages[0].rows.length,0,'Completed jobs do not keep duplicate financial rows');
 await assert.rejects(service.getJob({db,orgId:2,userId:ref.userId},ref.id),/no encontrada/);await assert.rejects(service.getJob({db,orgId:1,userId:crypto.randomUUID()},ref.id),/no encontrada/);
 dbRows.get(ref.id).generation=crypto.randomUUID();await assert.rejects(service.markFailed(ref,'stale'),/reemplazada/);
 assert.throws(()=>core.parsePage(JSON.stringify({documentNumber:'1',complete:false,rows:[]})),/incompleta/);
 // Reproduce the actual failure: ten stored pages (200 rows), page 11 pending.
 const largeRef={id:crypto.randomUUID(),orgId:1,userId:ref.userId,generation:crypto.randomUUID()};
 const pages=Array.from({length:11},(_,p)=>({file:0,page:p,text:'Native fixture page',done:p<10,rows:p<10?Array.from({length:20},(_,i)=>raw(String(p*20+i).padStart(6,'0'),{quantity:p+1,netUnitValue:100+p*20+i})):[],attempts:p<10?1:0}));
 dbRows.set(largeRef.id,{id:largeRef.id,organization_id:1,created_by:largeRef.userId,generation:largeRef.generation,status:'failed',sources:[],progress:{prepared:true,pages,mappings:[],number:'456'},project_id:null,error:'Página 11: El documento supera 200 variantes. Divide el documento.'});
 const restarted=await service.restart({db,orgId:1,userId:ref.userId},structuredClone(dbRows.get(largeRef.id)));largeRef.generation=restarted.generation;
 const oldPageCalls=calls.length;
 for(let i=0;i<10;i++)await service.extract(largeRef,i,0);
 assert.equal(calls.length,oldPageCalls,'Resume must not reread the previous 200 rows');
 outputs=[{documentNumber:'456',complete:true,rows:Array.from({length:20},(_,i)=>raw(String(200+i).padStart(6,'0'),{quantity:11,netUnitValue:300+i}))}];
 assert.deepEqual(await service.extract(largeRef,10,0),{ok:true});
 assert.equal(core.rowsOf(dbRows.get(largeRef.id)).length,220);
 for(let offset=0;offset<220;offset+=40){outputs=[{groups:Array.from({length:Math.min(40,220-offset)},(_,i)=>({index:offset+i,productName:'MODELO '+Math.floor((offset+i)/10),variantName:'Variante '+(offset+i)}))}];assert.deepEqual(await service.group(largeRef,offset,0),{ok:true});}
 await service.finish(largeRef);await service.finish(largeRef);
 const largeDocument=imports.get(largeRef.id).document;
 assert.equal(largeDocument.rows.length,220);assert.equal(largeDocument.rows[219].cost,319);assert.equal(largeDocument.rows[219].quantity,11);assert.equal(largeDocument.rows[219].code,'000219');
 assert.equal(reception.editDocument(largeDocument,largeDocument).rows.length,220,'Review save must keep all rows, including hidden review pages');
 assert.throws(()=>reception.newDocument(Array.from({length:reception.MAX_ROWS+1},()=>({code:'x',productName:'x',variantName:'x',quantity:1,cost:1,priceGross:1}))),/variantes/);
 const boundedContext=core.groupingContext([raw('x')],Array.from({length:2000},(_,i)=>({index:i,productName:i===0?'GUANTE MAR AZUL':'PRODUCTO '+i,variantName:'x'})));
 assert.equal(boundedContext.length,80);assert.ok(boundedContext.includes('GUANTE MAR AZUL'),'Relevant parents must survive a large previous catalog');
 console.log('PASS: resumed page 11 beyond 200 rows, no rereading of pages 1-10, six grouping blocks, all 220 reviewed rows preserved, unique final draft, 2,000-row guard and bounded grouping context.');
 console.log('PASS: real two-page PDF native extraction, per-page checkpoints, selective retry, incomplete-document blocking, exact grouping coverage, financial values immutable during grouping, deterministic final draft, compact completed journal, user/company isolation and stale-worker rejection. No real Gemini or Bsale requests.');
}finally{if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
