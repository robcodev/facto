import ProductLinks from './ProductLinks';
import OpportunityAnalysis, { type ChoiceProps } from './OpportunityAnalysis';
import DecisionEvidence, { quantity } from './DecisionEvidence';
import { compactProducts } from '@/lib/marketing/analysis-core';
import type { Opportunities } from '@/lib/marketing/core';

export default function ProductDecisions({data,...choice}: {data:Opportunities}&ChoiceProps){
 const products=compactProducts(data,null,null);
 return <section className="space-y-4" aria-label="Decisiones por producto">
  <div><h2 className="text-xl font-semibold">Qué comunicar y por qué</h2><p className="mt-1 text-sm text-slate-600">{products.length} productos para comparar. Analiza, selecciona las prioridades y prepara sus borradores.</p></div>
  <OpportunityAnalysis key={data.checkedAt} data={data} {...choice}/>
  <details className="rounded-xl border bg-white p-4 text-sm"><summary className="cursor-pointer font-medium">Señales calculadas de los {products.length} productos</summary><p className="my-3 text-slate-600">Estos datos son la base del análisis. Las ventas son brutas y la selección es acotada; los detalles no suponen una recomendación de publicación.</p><div className="space-y-2">{products.map(p=><details key={p.productId} className="rounded-lg border p-3"><summary className="cursor-pointer"><span className="font-medium">{p.name}</span><span className="mt-1 block text-xs text-slate-600">{quantity(p.unitsGross)} unidades brutas · {quantity(p.productMetrics?.documents)} documentos · {p.urlStatus==='verified'?'URL verificada':p.urlStatus==='pending'?'URL pendiente':'Sin URL'}{p.productMetrics?.concentrated?' · Revisar concentración':''}</span></summary><DecisionEvidence product={p} evidenceIds={p.evidence.map(e=>e.id)}/></details>)}</div></details>
  <ProductLinks products={products.filter(p=>p.url&&p.urlStatus!=='verified').map(p=>({productId:p.productId,url:p.url!}))}/>
 </section>;
}
