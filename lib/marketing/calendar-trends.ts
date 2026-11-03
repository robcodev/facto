import { addDays, previousYear, exclusion, type CalendarInput, type DaySales } from './calendar-core';
import { editorialFamily, smallAccessory } from './calendar-interest';
import type { CalendarWebContext } from './calendar-web-core';

export type TrendPeriod = {from:string;to:string;covered:boolean};
export type TrendValue = {units:number|null;documents:number|null;maxDocumentUnits:number|null};
export type SalesComparison = {current:TrendValue;previous:TrendValue;delta:number|null;percent:number|null;direction:'up'|'down'|'flat'|'no_previous'|'small_base'|'missing';reason:string};
export type TrendWeek = {from:string;to:string;yearFrom:string;yearTo:string;current:number|null;previousYear:number|null};
export type TrendGoogle = {views:number|null;previousViews:number|null;clicks:number|null;previousClicks:number|null;viewsPercent:number|null;clicksPercent:number|null;observedProducts:number;verifiedProducts:number;viewsProducts:number;clicksProducts:number};
export type TrendFamily = {name:string;products:number;annual:SalesComparison;momentum:SalesComparison;weeks:TrendWeek[];google:TrendGoogle|null};
export type TrendProduct = {id:string;name:string;family:string;stock:number|null;annual:SalesComparison;momentum:SalesComparison};
export type CalendarTrendsReport = {cutoff:string;checkedAt:string;periods:{recent:TrendPeriod;year:TrendPeriod;previous:TrendPeriod};families:TrendFamily[];products:TrendProduct[];eligibleProducts:number;excludedProducts:number;web:{periods:CalendarWebContext['periods'];sources:CalendarWebContext['sources'];notices:string[]}|null;limitations:string[]};

function value(series:DaySales[]|undefined, period:TrendPeriod):TrendValue {
 if(!period.covered)return {units:null,documents:null,maxDocumentUnits:null};
 let units=0,documents=0,maxDocumentUnits=0;
 for(const row of series??[])if(row.day>=period.from&&row.day<=period.to){units+=row.units;documents+=row.documents;maxDocumentUnits=Math.max(maxDocumentUnits,row.maxDocumentUnits);}
 return {units,documents,maxDocumentUnits};
}
export function compareSales(current:TrendValue,previous:TrendValue,product=false):SalesComparison {
 const base={current,previous,delta:current.units===null||previous.units===null?null:current.units-previous.units,percent:null};
 if(current.units===null||previous.units===null)return {...base,direction:'missing',reason:'Faltan días cubiertos o hay incidencias de importación. No se compara una muestra incompleta.'};
 if(previous.units===0)return {...base,direction:'no_previous',reason:'Sin ventas registradas en el período de comparación; no se calcula un porcentaje ni se supone que sea un producto nuevo.'};
 const concentrated=product&&((current.units>0&&(current.maxDocumentUnits??0)>current.units*.5)||(previous.maxDocumentUnits??0)>previous.units*.5);
 if(previous.units<(product?5:10)||product&&(previous.documents??0)<5||concentrated)return {...base,direction:'small_base',reason:concentrated?'Ventas concentradas en un documento; no se presenta como tendencia sostenida.':'Base de comparación pequeña; se muestran unidades y diferencia, sin porcentaje de tendencia.'};
 const percent=(current.units-previous.units)/previous.units*100;
 return {...base,percent,direction:percent>0?'up':percent<0?'down':'flat',reason:'Variación descriptiva de unidades vendidas en períodos cubiertos; no prueba una tendencia futura ni el efecto de publicidad.'};
}
const percent=(now:number|null,old:number|null)=>now!==null&&old!==null&&old>0?(now-old)/old*100:null;
export function buildCalendarTrends(input:CalendarInput,web?:CalendarWebContext):CalendarTrendsReport {
 const covered=new Set(input.coveredDays),issues=new Set(input.issueDays);
 function period(from:string,to:string):TrendPeriod{let valid=input.source.windowCountIssues===0;for(let d=from;d<=to;d=addDays(d,1))if(!covered.has(d)||issues.has(d)){valid=false;break;}return {from,to,covered:valid};}
 const recent=period(addDays(input.cutoff,-55),input.cutoff),yearFrom=previousYear(recent.from),year=period(yearFrom,addDays(yearFrom,55)),previous=period(addDays(recent.from,-56),addDays(recent.from,-1));
 const windows=Array.from({length:12},(_,i)=>{const to=addDays(input.cutoff,-(11-i)*7),from=addDays(to,-6),yearFrom=previousYear(from);return {now:period(from,to),old:period(yearFrom,addDays(yearFrom,6))};});
 const types=new Map(input.types.map(t=>[t.id,t])),pool=input.products.filter(p=>p.active&&!exclusion(p,types.get(p.typeId??'')));
 const products:TrendProduct[]=pool.map(p=>{const current=value(input.productDaily[p.id],recent);return {id:p.id,name:p.name,family:smallAccessory(p.name,types.get(p.typeId??'')!.name)?'Accesorios pequeños':editorialFamily(types.get(p.typeId??'')!.name),stock:p.stock,annual:compareSales(current,value(input.productDaily[p.id],year),true),momentum:compareSales(current,value(input.productDaily[p.id],previous),true)};});
 function googleFor(ids:string[]):TrendGoogle|null{if(!web)return null;let views:number|null=null,previousViews:number|null=null,clicks:number|null=null,previousClicks:number|null=null,viewsProducts=0,clicksProducts=0,verifiedProducts=0,observedProducts=0;for(const id of ids){const p=web.products[id];if(!p?.verified)continue;verifiedProducts++;if(p.observations.some(o=>o.current))observedProducts++;const ga=p.observations.find(o=>o.source==='ga4'),sc=p.observations.find(o=>o.source==='search_console');if(web.sources.some(s=>s.source==='ga4'&&s.ready)&&ga&&!ga.thresholded&&ga.current?.views!=null&&ga.previous?.views!=null){views=(views??0)+ga.current.views;previousViews=(previousViews??0)+ga.previous.views;viewsProducts++;}if(web.sources.some(s=>s.source==='search_console'&&s.ready)&&sc?.current?.clicks!=null&&sc.previous?.clicks!=null){clicks=(clicks??0)+sc.current.clicks;previousClicks=(previousClicks??0)+sc.previous.clicks;clicksProducts++;}}return {views,previousViews,clicks,previousClicks,viewsProducts,clicksProducts,verifiedProducts,observedProducts,viewsPercent:percent(views,previousViews),clicksPercent:percent(clicks,previousClicks)};}
 const groups=new Map<string,TrendProduct[]>();for(const p of products){const list=groups.get(p.family)??[];list.push(p);groups.set(p.family,list);}
 function total(ids:string[],range:TrendPeriod):TrendValue{if(!range.covered)return {units:null,documents:null,maxDocumentUnits:null};return {units:ids.reduce((n,id)=>n+value(input.productDaily[id],range).units!,0),documents:null,maxDocumentUnits:null};}
 const families=[...groups].map(([name,items])=>{const ids=items.map(p=>p.id),current=total(ids,recent);return {name,products:ids.length,annual:compareSales(current,total(ids,year)),momentum:compareSales(current,total(ids,previous)),weeks:windows.map(w=>({from:w.now.from,to:w.now.to,yearFrom:w.old.from,yearTo:w.old.to,current:total(ids,w.now).units,previousYear:total(ids,w.old).units})),google:googleFor(ids)};}).sort((a,b)=>(b.annual.current.units??-1)-(a.annual.current.units??-1)||a.name.localeCompare(b.name));
 return {cutoff:input.cutoff,checkedAt:input.checkedAt,periods:{recent,year,previous},families,products,eligibleProducts:pool.length,excludedProducts:input.products.filter(p=>p.active).length-pool.length,web:web?{periods:web.periods,sources:web.sources,notices:web.notices}:null,limitations:[
  'Cohorte: catálogo activo y tipos elegibles para Marketing. Incluye productos sin stock para distinguir demanda de inventario; el calendario conserva sus reglas de stock positivo.',
  'Las familias suman unidades de los productos de esa misma cohorte. No son el total histórico de la tienda ni documentos únicos; no se suman los conteos de documentos entre productos.',
  'Doce tramos observados de siete días hasta el corte, comparados con fechas equivalentes del año anterior. La comparación reciente usa dos tramos de 56 días de igual duración.',
  'No se mezclan ventas observadas con proyecciones. Google usa dos períodos separados de 28 días y cobertura de páginas verificadas, parcial dentro de cada familia.',
  'Una subida de unidades o interés web no demuestra causalidad publicitaria. Ausencia de cobertura es sin dato; cero solo representa ausencia de ventas registradas en un período cubierto.',
 ]};
}
