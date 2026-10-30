const fs=require('node:fs'),root='C:/Users/multi/Documents/dev/facto',assert=require('node:assert/strict'),ts=require(root+'/node_modules/typescript');
function compile(file,req){const m={exports:{}};new Function('require','exports','module',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(req,m.exports,m);return m.exports;}
const core=compile(root+'/lib/rotation/core.ts',require);
const file=fs.existsSync(__dirname+'/receptions.ts')?__dirname+'/receptions.ts':root+'/lib/rotation/receptions.ts';
const api=compile(file,n=>n==='server-only'?{}:n==='./core'?core:n==='../intel/server'?{}:require(n));
const ref={reception_detail:{id:2,href:'https://api.bsale.io/v1/stocks/receptions/1/details/2.json'},admissionDate:1704067200,cost:0};
assert.throws(()=>api.receiptReferences({history:[{...ref,reception_detail:{id:2,href:'https://evil.example/2'}}]}),/inválida/);
assert.throws(()=>api.receiptReferences({}),/válido/);
assert.throws(()=>api.receiptReferences({history:[ref,ref]}),/repitió/);
const header={id:1,admissionDate:1704067200,note:'Ingreso Mercado Libre FULL',document:'Factura',documentNumber:100,office:{id:1},updateStock:0},detail={id:2,variant:{id:9},quantity:3,cost:0};
assert.equal(api.liveReceipt(header,detail,'9',api.receiptReferences({history:[ref]})[0]).cost,0);
assert.throws(()=>api.liveReceipt(header,detail,'10',api.receiptReferences({history:[ref]})[0]),/corresponde/);
(async()=>{const paths=[];const read=async path=>{paths.push(path);if(path.endsWith('/costs.json'))return{history:[ref]};if(path.endsWith('/details/2.json'))return detail;return header;};const result=await api.liveReceptions('9',0,read);assert.equal(result.source,'bsale_live');assert.equal(result.rows.length,1);assert.equal(result.rows[0].administrative,true);assert.equal(result.historyComplete,false);assert.equal(paths.length,3);assert.ok(paths.every(p=>p.startsWith('/v1/')));const failed=await api.liveReceptions('9',0,async p=>{if(p.endsWith('costs.json'))return{history:[ref]};throw Error('timeout fixture');});assert.equal(failed.errors.length,1);assert.equal(failed.rows.length,0);const empty=await api.liveReceptions('9',0,async()=>({history:[]}));assert.equal(empty.historyComplete,false);assert.equal(empty.rows.length,0);console.log('Recepciones directas: identidad, cantidades, costo cero, origen, errores y cobertura parcial verificados.');})().catch(e=>{console.error(e);process.exitCode=1;});
