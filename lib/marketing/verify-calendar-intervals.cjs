const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),repo=process.cwd(),ts=require(path.join(repo,'node_modules/typescript')),modules=new Map();
let fixture;
class MarketingError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function load(name){if(modules.has(name))return modules.get(name);const m={exports:{}};modules.set(name,m.exports);const file=path.join(repo,'lib/marketing',name+'.ts'),js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(id=>{
 if(id==='server-only')return {};
 if(name==='calendar-server'&&id==='./server')return {MarketingError,marketingContext:()=>({})};
 if(name==='calendar-server'&&id==='./calendar-reader')return {calendarInput:async()=>fixture};
 if(name==='calendar-server'&&id==='./calendar-web-server')return {safeCalendarWebContext:async()=>undefined};
 if(name==='calendar-server'&&id==='./calendar-history')return {readCalendarHistory:async()=>({items:[],from:'2024-01-01',to:'2028-12-31',checkedAt:new Date().toISOString()})};
 if(name==='calendar-server'&&id==='./calendar-destinations')return {verifyBannerDestinations:async p=>p};
 return id.startsWith('./')?load(id.slice(2)):require(id==='zod'?path.join(repo,'node_modules/zod'):id);
 },m,m.exports);return m.exports;}
(async()=>{
 const core=load('calendar-core'),range=load('calendar-range'),server=load('calendar-server'),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const coveredDays=[];for(let d=core.addDays(today,-800);d<=today;d=core.addDays(d,1))coveredDays.push(d);
 const products=Array.from({length:60},(_,n)=>({id:String(n+1),name:'Caña '+n,typeId:'16',active:true,stock:10,stockObservedAt:new Date().toISOString(),url:'https://www.dmultisport.cl/product/cana-'+n})),rows=[];
 for(let i=0;i<90;i++)rows.push({day:core.addDays(core.previousYear(today),i),units:3,documents:3,maxDocumentUnits:1});
 fixture={checkedAt:new Date().toISOString(),cutoff:core.addDays(today,-1),coveredDays,issueDays:[],products,types:[{id:'16',name:'CAÑAS'}],productDaily:Object.fromEntries(products.map(p=>[p.id,rows])),typeDaily:{},source:{windowCountIssues:0,documentsRead:100,linesRead:100,salesDocuments:100,notesExcluded:0,nonFinalExcluded:0,invalidExcluded:0,zeroValueLinesExcluded:0}};
 const cadence={...core.defaultCadence,productGapDays:7,angleGapDays:28};
 for(const days of [1,3,10,12,31,56]){const config={...cadence,from:today,to:core.addDays(today,days-1),weeks:1},plan=core.generateCalendar(fixture,config);assert.equal(plan.period.to,config.to);assert.equal(plan.weeks.length,Math.ceil(days/7));assert.equal(plan.config.weeks,Math.ceil(days/7));assert.equal(plan.entries.length,range.calendarSlotCount(config));assert.equal(plan.entries.filter(e=>e.format==='historia').length,days);for(const e of plan.entries){assert(e.scheduledOn>=today&&e.scheduledOn<=config.to);const w=e.evidence.targetWeek;assert(w.to<=config.to);if(e.evidence.annualPeriod)assert.equal(Date.parse(e.evidence.annualPeriod.to)-Date.parse(e.evidence.annualPeriod.from),Date.parse(w.to)-Date.parse(w.from));}}
 assert.throws(()=>range.calendarRange({...cadence,from:today,to:core.addDays(today,-1),weeks:1}));assert.throws(()=>range.calendarRange({...cadence,from:today,to:core.addDays(today,56),weeks:1}));
 assert.deepEqual(range.rangePreset('2026-11-19','month'),{from:'2026-11-19',to:'2026-11-30'});assert.deepEqual(range.rangePreset('2026-11-19','nextMonth'),{from:'2026-12-01',to:'2026-12-31'});assert.deepEqual(range.rangePreset('2026-12-31','nextMonth'),{from:'2027-01-01',to:'2027-01-31'});assert.deepEqual(range.rangePreset('2028-01-31','nextMonth'),{from:'2028-02-01',to:'2028-02-29'});
 const old=server.calendarConfigSchema.parse({...cadence,from:today,weeks:2});assert.equal(old.to,core.addDays(today,13));assert.equal(old.allowStaleSales,false);
 const custom=server.calendarConfigSchema.parse({...cadence,from:today,to:core.addDays(today,9)});assert.equal(custom.weeks,2);
 assert(!server.calendarConfigSchema.safeParse({...cadence,from:today,to:core.addDays(today,-1)}).success);
 process.env.FACTO_BACKEND_SECRET='isolated-test-secret-never-used-for-real-data';fixture.cutoff=core.addDays(today,-24);
 const ctx={orgId:1,userId:'00000000-0000-4000-8000-000000000001',db:{}};
 await assert.rejects(()=>server.proposeCalendar(ctx,{...custom,allowStaleSales:false}),e=>e instanceof server.CalendarDataError&&e.ageDays===24&&e.cutoff===fixture.cutoff);
 const historical=await server.proposeCalendar(ctx,{...custom,allowStaleSales:true});assert(historical.summary.dataFreshness.historical);assert(historical.limitations[0].includes('BORRADOR CON DATOS ATRASADOS'));assert.equal(historical.cutoff,fixture.cutoff);
 console.log('PASS: 1/3/10/12/31/56-day ranges; clipped final week and annual reference; exact cadence; reversed/oversized ranges rejected; month/leap/year rollover; old weeks compatibility; stale data requires explicit choice and keeps cutoff/warning.');
})().catch(e=>{console.error(e.message);process.exit(1)});
