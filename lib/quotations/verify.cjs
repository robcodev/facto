const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),req=createRequire(root+'/package.json'),ts=req('typescript');
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
(async()=>{
 const zod=JSON.stringify(pathToFileURL(req.resolve('zod')).href);
 const coreUrl=compile(fs.readFileSync(root+'/lib/quotations/core.ts','utf8').replace("'zod'",zod)),core=await import(coreUrl);
 const promptsUrl=compile(fs.readFileSync(root+'/lib/quotations/prompts.ts','utf8')),prompts=await import(promptsUrl);
 const store=new Map(),calls=[];let gate=null,badIdentity=false,badPrice=false,fullKit=false,wrongId=false,noGrounding=false;
 const db={from(table){let filters=[],mode='read',value,single=false;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},insert(v){mode='insert';value=v;return q},update(v){mode='update';value=v;return q},then(resolve,reject){return Promise.resolve().then(()=>{
  if(table==='organizations')return {data:{id:1},error:null};
  if(mode==='insert'){const row={...structuredClone(value),id:crypto.randomUUID(),version:0,updated_at:new Date().toISOString()};store.set(row.id,row);return{data:structuredClone(row),error:null}}
  let rows=[...store.values()].filter(r=>filters.every(([k,v])=>r[k]===v));if(mode==='update')rows=rows.map(r=>{const next={...r,...structuredClone(value)};store.set(r.id,next);return next});return{data:structuredClone(single?rows[0]||null:rows),error:null}
 }).then(resolve,reject)}};return q}};
 const unpack=input=>JSON.parse(input.contents.slice(input.contents.indexOf('DATOS: ')+7));
 const respond=async input=>{
  calls.push(input);if(gate&&input.config.tools){const current=gate;gate=null;await current();}
  const rules=input.config.systemInstruction;
  if(rules===prompts.interpretationPrompt()){
   const rows=unpack(input);assert.equal(rows.length,1);const row=rows[0];
   return{text:JSON.stringify({proposals:[{itemId:wrongId?crypto.randomUUID():row.itemId,requirements:{name:row.original,quantity:999,unit:'unidad inventada',mandatory:'',brandModel:'',sizeCapacity:'',allowedAlternatives:'',links:[],questions:row.quantity===null?'Cantidad por confirmar':'',status:'ready',searchBlockers:[],components:[]}}]})};
  }
  if(input.config.tools)return{text:'Producto publicado con precio y presentación, disponibilidad y modelo.',candidates:noGrounding?[]:[{groundingMetadata:{webSearchQueries:['producto prueba'],groundingChunks:[{web:{uri:'https://example.com/product',title:'Ficha publicada'}},{web:{uri:'https://example.com/product',title:'Fuente repetida'}}]}}]};
  const data=unpack(input);
  if(rules===prompts.extractionPrompt()){
   const r=data.task.requirements,price=/0711/.test(r.brandModel)?20:/0715/.test(r.brandModel)?30:10;
   return{text:JSON.stringify({alternatives:[{product:r.name,brandModel:r.brandModel,supplier:'Proveedor',url:'https://example.com/product',price,currency:'CLP',vat:'included',presentation:'1 unidad',unitsPerPrice:1,availability:'Publicado, cantidad por confirmar',leadTime:'Por confirmar',match:'exact',matches:'Modelo publicado',differences:'',pending:'Confirmar precio mayorista, stock total y envío.',evidence:'Precio y presentación publicados.',...(fullKit&&data.task.task==='complete_set'?{kitCoverage:data.task.kit.map(k=>({componentId:k.componentId,quantity:k.quantityPerSet}))}:{})}]})};
  }
  if(rules===prompts.reviewPrompt())return{text:JSON.stringify({reviews:data.alternatives.map((a,index)=>({index,identitySupported:!badIdentity,priceSupported:!badPrice,presentationSupported:true,vatSupported:true,availabilitySupported:true,issues:badPrice?['Precio sin respaldo suficiente']:[]}))})};
  throw Error('Unexpected prompt');
 };
 globalThis.__focusedDb=db;globalThis.__focusedAI=class{models={generateContent:respond}};
 const source=fs.readFileSync(root+'/lib/quotations/server.ts','utf8').replace("import 'server-only';",'').replace("import { GoogleGenAI } from '@google/genai';",'const GoogleGenAI=globalThis.__focusedAI;').replace("import { createClient } from '@/lib/supabase/server';",'const createClient=async()=>globalThis.__focusedDb;').replace("'./core'",JSON.stringify(coreUrl)).replace("'./prompts'",JSON.stringify(promptsUrl)).replace("'zod'",zod).replace("'read-excel-file/node'",JSON.stringify(pathToFileURL(req.resolve('read-excel-file/node')).href));
 const server=await import(compile(source));process.env.GEMINI_API_KEY='fixture-only';const ctx={db,orgId:1,userId:'fixture'};
 await require('./verify-import.cjs')({core,server,ctx,calls,setWrongId:v=>wrongId=v});
 const kitText='MANGA ADIESTRAMIENTO SET Gappay KIT 1 Manga Base Rígida (Modelo 0700), 2 Fundas de Yute Durisimas (Modelo 0711) y 1 Funda de Tela Francesa / Nylcot (Modelo 0715)';
 let p=await server.create(ctx,'Kit y búsqueda aislada');p=await server.action(ctx,{action:'chat',id:p.id,version:p.version,text:'Descripción del Ítem\nCantidad\n'+kitText+'\n2\nProducto sin cantidad\n',itemIds:[]});
 const kitId=p.document.items[0].id,unknownId=p.document.items[1].id;
 assert.deepEqual(p.document.items[0].kit.components.map(c=>c.quantityPerSet),[1,2,1]);assert.ok(core.ready(p.document.items[1].requirements));
 const start=calls.length;p=await server.action(ctx,{action:'research',id:p.id,itemId:kitId,refresh:false});
 assert.equal(calls.length-start,3);assert.equal(p.document.items[0].alternatives[0].match,'insufficient');
 await assert.rejects(()=>server.action(ctx,{action:'select',id:p.id,version:p.version,itemId:kitId,alternativeId:p.document.items[0].alternatives[0].id}),/condiciones/);
 for(const part of [...p.document.items[0].kit.components]){
  p=await server.action(ctx,{action:'research',id:p.id,itemId:kitId,componentId:part.id,refresh:false});
  const current=p.document.items[0].kit.components.find(c=>c.id===part.id);
  assert.equal(current.selectedId,null);
  p=await server.action(ctx,{action:'select',id:p.id,version:p.version,itemId:kitId,componentId:part.id,alternativeId:current.alternatives[0].id});
 }
 let summary=core.kitSummary(p.document.items[0]);assert.equal(summary.complete,true);assert.equal(summary.perSet,80);assert.equal(summary.total,160);
 const copy=structuredClone(p.document.items[0]);copy.kit.components[1].alternatives[0].currency='USD';assert.equal(core.kitSummary(copy).total,null);
 const unknownTax=structuredClone(p.document.items[0]);for(const part of unknownTax.kit.components) for(const a of part.alternatives) a.vat='unknown';assert.equal(core.kitSummary(unknownTax).total,null);
 const unknown=structuredClone(p.document.items[0]);unknown.requirements.quantity=null;assert.equal(core.kitSummary(unknown).total,null);
 p=await server.action(ctx,{action:'select_assembled',id:p.id,version:p.version,itemId:kitId});assert.equal(p.document.items[0].selectedMode,'assembled');
 const part=p.document.items[0].kit.components[0],priorSelection=part.selectedId;
 p=await server.action(ctx,{action:'research',id:p.id,itemId:kitId,componentId:part.id,refresh:true});assert.equal(p.document.items[0].kit.components[0].selectedId,priorSelection);assert.equal(core.kitSummary(p.document.items[0]).total,160);
 badPrice=true;p=await server.action(ctx,{action:'research',id:p.id,itemId:unknownId,refresh:false});badPrice=false;
 assert.equal(p.document.items[1].alternatives[0].price,null);assert.equal(p.document.items[1].requirements.quantity,null);
 let release;gate=()=>new Promise(r=>release=r);const concurrent=server.action(ctx,{action:'research',id:p.id,itemId:unknownId,refresh:true});
 while(!release)await new Promise(r=>setTimeout(r,1));await assert.rejects(()=>server.action(ctx,{action:'research',id:p.id,itemId:unknownId,refresh:true}),/ya se está/);release();p=await concurrent;
 noGrounding=true;await assert.rejects(()=>server.action(ctx,{action:'research',id:p.id,itemId:unknownId,refresh:true}),/evidencia/);noGrounding=false;p=await server.load(ctx,p.id);assert.equal(p.document.items[1].search.state,'failed');
 fullKit=true;p=await server.action(ctx,{action:'research',id:p.id,itemId:kitId,refresh:true});fullKit=false;assert.ok(p.document.items[0].alternatives.some(a=>a.match==='exact'));
 const before=p.version;p=await server.action(ctx,{action:'edit',id:p.id,version:p.version,itemId:kitId,requirements:{...p.document.items[0].requirements,brandModel:'CORRECCIÓN MANUAL'}});assert.equal(core.kitSummary(p.document.items[0]).complete,false);
 await assert.rejects(()=>server.action(ctx,{action:'edit',id:p.id,version:before,itemId:kitId,requirements:p.document.items[0].requirements}),/recientes/);
 await assert.rejects(()=>server.load({...ctx,orgId:2},p.id),/no encontrada/);assert.deepEqual((await server.load(ctx,p.id)).document,p.document);
 assert.ok(calls.filter(c=>c.config.tools).every(c=>!c.contents.includes('conversation')&&!c.contents.includes('Solicitud completa')&&c.config.systemInstruction===prompts.researchPrompt()));
 assert.ok(calls.filter(c=>c.config.systemInstruction===prompts.extractionPrompt()||c.config.systemInstruction===prompts.reviewPrompt()).every(c=>!c.contents.includes('conversation')));
 console.log('PASS focused research: complete prompts each call; one product per request; no conversation leakage; missing quantity/unit do not block; identity contradictions block; kit 1/2/1; partial kit cannot be selected; component search and human selection; packaging-aware total; no mixed-currency total; audit removes unsupported price; locks, isolated errors, stale revisions, company scope and reload.');
})().catch(e=>{console.error(e.message);process.exit(1)});
