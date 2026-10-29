import type { Opportunities, ProductSales } from '../marketing/core';

export type CatalogProduct={id:string;name:string;brand:string|null;brandId?:string|null;observedAt:string};
export type CatalogVariant={id:string;productId:string;name:string;sku:string;active:boolean;observedAt:string};
export type StockObservation={variantId:string;officeId:string;available:number|null;observedAt:string};
export type WebEvidence={source:string;reportId:string;observedAt:string;metrics:Record<string,number|null>;partial:boolean;timeZone:string|null};
export type ProductPage={url:string|null;verified:boolean;checkedAt:string|null;evidence:WebEvidence[]};
export type HealthSignal={code:string;label:string;action:string};
export type HealthVariant={id:string;name:string;sku:string;active:boolean;units:number|null;documents:number|null;share:number|null;available:number|null;stockObservedAt:string|null};
export type HealthProduct={id:string;name:string;brand:string|null;brandId?:string|null;catalogObservedAt:string;units:number|null;documents:number|null;sales:ProductSales|null;previousUnits:number|null;delta:number|null;percent:number|null;stock:{available:number|null;observedAt:string|null;observed:number;total:number};receipts:{quantity:number;documents:number;lastDate:string;limited:boolean}|null;page:ProductPage;signals:HealthSignal[];variants:HealthVariant[]};
export const signalLabels:Record<string,string>={distributed:'Ventas repartidas',concentrated:'Revisar concentración',no_stock:'Ventas y stock observado sin unidades',search_interest:'Interés de búsqueda',growth:'Más unidades que antes',receipt:'Recepción documentada',no_movement:'Sin ventas en el intervalo'};
export const stockStatus=(p:HealthProduct)=>p.stock.available==null?'unknown':p.stock.available>0?'positive':'zero';
const salesCovered=(data:Opportunities|null)=>!!data&&data.coverage.salesCovered&&!data.coverage.invalidLines&&!data.coverage.adjustmentsPending&&data.productSalesComplete!==false;
export function buildHealth(input:{products:CatalogProduct[];variants:CatalogVariant[];stock:StockObservation[];current:Opportunities;previous:Opportunities|null;pages:Record<string,ProductPage>;checkedAt:string}):HealthProduct[]{
 const {current,previous}=input,covered=salesCovered(current),priorCovered=salesCovered(previous);
 const variantsByProduct=new Map<string,CatalogVariant[]>(),stockByVariant=new Map<string,StockObservation[]>();
 for(const v of input.variants){const a=variantsByProduct.get(v.productId)??[];a.push(v);variantsByProduct.set(v.productId,a);}
 for(const s of input.stock){const a=stockByVariant.get(s.variantId)??[];a.push(s);stockByVariant.set(s.variantId,a);}
 return input.products.map(p=>{
  const sales=covered?current.productSales?.[p.id]??null:null,units=covered?sales?.quantity??0:null;
  const previousUnits=priorCovered?previous?.productSales?.[p.id]?.quantity??0:null;
  const variants=(variantsByProduct.get(p.id)??[]).map(v=>{
   const rows=stockByVariant.get(v.id)??[],valid=rows.length>0&&rows.every(s=>s.available!==null),at=rows.length?rows.map(s=>s.observedAt).sort()[0]:null;
   const units=covered?current.variantSales?.[v.id]?.quantity??0:null;
   return {id:v.id,name:v.name,sku:v.sku,active:v.active,units,documents:covered?current.variantSales?.[v.id]?.documents??0:null,share:units!==null&&sales&&sales.quantity>0?units/sales.quantity:null,available:valid?rows.reduce((n,s)=>n+s.available!,0):null,stockObservedAt:at};
  });
  variants.sort((a,b)=>(b.units??-1)-(a.units??-1)||(b.documents??-1)-(a.documents??-1)||a.id.localeCompare(b.id));
  const active=variants.filter(v=>v.active),complete=active.length>0&&active.every(v=>v.available!==null),at=complete?active.map(v=>v.stockObservedAt!).sort()[0]:null;
  const stock={available:complete?active.reduce((n,v)=>n+v.available!,0):null,observedAt:at,observed:active.filter(v=>v.available!==null).length,total:active.length};
  const page=input.pages[p.id]??{url:null,verified:false,checkedAt:null,evidence:[]},receipts=current.productReceipts?.[p.id]??null;
  const signals:HealthSignal[]=[];
  const add=(code:string,action:string)=>signals.push({code,label:signalLabels[code],action});
  if(sales?.concentrated)add('concentrated','Revisar qué peso tiene el mayor documento antes de priorizar este producto. No confirma una compra excepcional.');
  else if(sales&&sales.documents>1)add('distributed','Evaluar una oportunidad de contenido con ventas repartidas entre documentos, sin asumir compradores distintos.');
  if((units??0)>0&&stock.available!==null&&stock.available<=0)add('no_stock','Revisar disponibilidad por variante y sucursal; no se estima un quiebre histórico.');
  if(page.verified&&page.evidence.some(e=>e.source==='search_console'&&(e.metrics.clicks??0)>0))add('search_interest','Revisar qué información podría ayudar a quienes ya encuentran esta página.');
  if(units!==null&&previousUnits!==null&&previousUnits>0&&units>previousUnits&&!sales?.concentrated)add('growth','Investigar el aumento observado; no atribuirlo a publicidad ni reconstruir disponibilidad pasada.');
  if(receipts)add('receipt','Revisar el ingreso documentado; no confirma novedad ni reposición después de agotamiento.');
  if(units===0)add('no_movement','Investigar contexto e historial de disponibilidad antes de interpretar interés.');
  return {...p,catalogObservedAt:p.observedAt,units,documents:covered?sales?.documents??0:null,sales,previousUnits,delta:units!==null&&previousUnits!==null?units-previousUnits:null,percent:units!==null&&previousUnits!==null&&previousUnits>0?(units-previousUnits)/previousUnits*100:null,stock,receipts,page,signals,variants};
 });
}
export function filterHealth(products:HealthProduct[],filters:{q:string;brand:string;stock:string;signal:string}){
 const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 const q=normalized(filters.q.trim());
 return products.filter(p=>(!q||normalized([p.name,p.id,p.brand??'',...p.variants.flatMap(v=>[v.name,v.sku,v.id])].join(' ')).includes(q))&&(!filters.brand||p.brand===filters.brand)&&(filters.stock==='all'||stockStatus(p)===filters.stock)&&(!filters.signal||p.signals.some(s=>s.code===filters.signal))).sort((a,b)=>(b.documents??-1)-(a.documents??-1)||(b.sales?.distributedUnits??0)-(a.sales?.distributedUnits??0)||a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id));
}
export function latestCoveredEnd(windows:{from:string;to:string;reconciliation:unknown;importedCount:unknown;sourceCount:unknown;excludedCount?:unknown}[],closedThrough:string){
 const valid=windows.filter(w=>/^\d{4}-\d{2}-\d{2}$/.test(w.from)&&/^\d{4}-\d{2}-\d{2}$/.test(w.to)&&w.from<=w.to&&w.from<=closedThrough&&w.reconciliation==='document_count_only'&&w.importedCount!==null&&w.importedCount!==undefined&&w.importedCount!==''&&w.sourceCount!==null&&w.sourceCount!==undefined&&w.sourceCount!==''&&Number.isFinite(Number(w.importedCount))&&Number(w.importedCount)>=0&&Number(w.sourceCount)>=0&&Number(w.importedCount)+Number(w.excludedCount??0)===Number(w.sourceCount));
 return valid.map(w=>w.to<closedThrough?w.to:closedThrough).sort().at(-1)??null;
}
