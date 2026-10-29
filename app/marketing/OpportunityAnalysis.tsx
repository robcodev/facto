'use client';
import { useState } from 'react';
import type { Opportunities } from '@/lib/marketing/core';
import type { AnalysisResult, CompactProduct } from '@/lib/marketing/analysis-core';
import DecisionEvidence, { ProductNumbers, dayLabel } from './DecisionEvidence';

// Keep percentages in the calculated metrics, rather than model prose.
const editorialText=(value:string)=>value.replace(/en verifiedFacts/gi,'en las características verificadas').replace(/verifiedFacts/gi,'características verificadas').replace(/commercialAllowed/gi,'habilitación comercial').replace(/decisionSignals/gi,'señales calculadas').replace(/(?:\bdel? |\ben un |\bde un )?\d+(?:[.,]\d+)?\s*%/g,'').replace(/\s{2,}/g,' ').trim();
type Result = {id:string|null;saved:boolean;warning:string;createdAt:string;result:AnalysisResult;snapshot:{products:CompactProduct[];comparisonWarnings:string[];from:string;to:string;model:string;promptVersion:string}};
export type ChoiceProps = {selectedKeys:string[];selectedAnalysisId:string|null;disabled:boolean;onChoose:(keys:string[],format:string|undefined,analysisId:string|null)=>void};
const formats:Record<string,string>={reel:'Reel',historias:'Historias',carrusel:'Carrusel',banner:'Banner',email:'Email'};

export default function OpportunityAnalysis({data,selectedKeys,selectedAnalysisId,disabled,onChoose}:{data:Opportunities}&ChoiceProps){
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function requestAnalysis(recover=false){
  setBusy(true);setError('');
  try{
   const url='/api/marketing/analysis'+(recover?'?'+new URLSearchParams({from:data.from,to:data.to}):'');
   const response=await fetch(url,recover?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:data.from,to:data.to})});
   const body=await response.json();if(!response.ok)throw Error(body.error??'No se pudo analizar.');
   if(body.snapshot?.promptVersion!=='marketing-analysis-v4')throw Error('Este análisis usa criterios anteriores. Solicita un análisis nuevo.');
   setResult(body);if(body.id!==result?.id)onChoose([],undefined,null);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const currentKeys=result?.id&&result.id===selectedAnalysisId?selectedKeys:[];
 return <div className="space-y-4" aria-label="Prioridades de contenido">
  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
   <h3 className="font-semibold text-purple-950">Hasta tres prioridades para decidir</h3>
   <p className="mt-1 text-sm text-slate-700">La IA compara por qué elegir cada producto y qué justifica comunicarlo ahora. Puede recomendar menos de tres o ninguna.</p>
   <div className="mt-3 flex flex-wrap items-center gap-3"><button className="rounded-lg bg-purple-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy||disabled||!data.candidates.length} onClick={()=>void requestAnalysis()}>{busy?'Revisando oportunidades…':result?'Volver a analizar con IA':'Analizar oportunidades con IA'}</button><button className="text-sm text-purple-900 underline disabled:opacity-50" disabled={busy||disabled} onClick={()=>void requestAnalysis(true)}>Recuperar último análisis del período</button></div>
   <p className="mt-3 text-xs text-slate-600">Gemini recibe evidencia agregada por producto, sin datos de clientes. Analizar prepara recomendaciones; seleccionarlas prepara el siguiente paso de redacción.</p>
  </div>
  {busy&&<p role="status" className="text-sm">Comparando evidencia y revisando las afirmaciones. El resultado anterior se conserva hasta completar la consulta.</p>}
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {result&&<>
   <div><p className="text-xs font-semibold uppercase tracking-wide text-purple-800">Recomendaciones de IA · revisión humana</p><p className="mt-2">{editorialText(result.result.diagnosis)}</p><p className="mt-1 text-xs text-slate-500">{dayLabel(result.snapshot.from)}–{dayLabel(result.snapshot.to)} · {result.saved?'Análisis guardado':'Análisis de esta sesión'}</p></div>
   {result.warning&&<p role="status" className="rounded bg-amber-50 p-3 text-sm">{result.warning} Para desarrollar una recomendación con su enfoque, primero debe quedar guardada.</p>}
   {!result.result.recommendations.length&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h4 className="font-semibold">No hay una oportunidad suficientemente justificada</h4><p className="mt-1 text-sm">Revisa los motivos y datos pendientes antes de pedir otro análisis.</p></div>}
   <div className="grid items-start gap-4 xl:grid-cols-3">{result.result.recommendations.map((r,i)=>{
    const p=result.snapshot.products.find(p=>p.productId===r.productId);if(!p)return null;
    const validKeys=(r.mode==='commercial'?p.commercialKeys:p.keys).filter(key=>data.candidates.some(c=>c.key===key));
    const candidates=validKeys.map(key=>data.candidates.find(c=>c.key===key)!).sort((a,b)=>Number((b.available??0)>0)-Number((a.available??0)>0)||Number(b.signal==='sales')-Number(a.signal==='sales'));
    const chosen=currentKeys.find(key=>p.keys.includes(key)),key=chosen??candidates[0]?.key;
    const alternative=result.snapshot.products.find(p=>p.productId===r.priorityComparison?.productId);
    const isDisabled=busy||disabled||!result.id||!key;
    return <article key={p.productId} className={`space-y-3 rounded-xl border bg-white p-4 ${chosen?'border-blue-500 ring-1 ring-blue-200':'border-slate-200'}`}>
     <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-purple-800">Prioridad {i+1} · {r.mode==='commercial'?'Comercial':'Educativa'}</p><h4 className="mt-1 font-semibold">{p.name}</h4></div><input type="checkbox" aria-label={`Seleccionar ${p.name}`} checked={!!chosen} disabled={isDisabled} className="mt-1 h-5 w-5" onChange={e=>{const next=currentKeys.filter(k=>!p.keys.includes(k));if(e.target.checked&&key)next.push(key);onChoose(next,currentKeys.length?undefined:r.format,next.length?result.id:null);}}/></div>
     <ProductNumbers product={p}/>
     <p className="text-sm"><strong>Por qué este producto:</strong> {editorialText(r.whyProduct)}</p>
     <p className="text-sm"><strong>Por qué ahora:</strong> {editorialText(r.reasonNow)}</p>
     {r.priorityComparison&&alternative&&<p className="text-sm"><strong>Antes que {alternative.name}:</strong> {editorialText(r.priorityComparison.reason)}</p>}
     <div className="rounded-lg bg-blue-50 p-3 text-sm"><p className="font-medium">{formats[r.format]} · {editorialText(r.angle)}</p><p className="mt-1">{editorialText(r.hypothesis)}</p></div>
     <p className="text-xs text-slate-600">Confianza { {low:'baja',medium:'media',high:'alta'}[r.confidence] } · estimación de IA sin calibrar.</p>
     {chosen&&<p className="text-xs font-medium text-blue-800">Seleccionada para un borrador · {data.candidates.find(c=>c.key===chosen)?.variantName||'variante disponible'}.</p>}
     <details className="text-sm"><summary className="cursor-pointer font-medium text-slate-700">Evidencia y detalles de la propuesta</summary><div className="mt-3 space-y-2"><p><strong>Interpretación:</strong> {editorialText(r.interpretation)}</p><p><strong>Público y necesidad — hipótesis:</strong> {editorialText(r.audience)} · {editorialText(r.need)}</p><p><strong>Limitaciones:</strong> {r.limitations.map(editorialText).join(' · ')}</p><p><strong>Material necesario:</strong> {r.materials.map(editorialText).join(' · ')||'Por definir'}</p><p><strong>Objetivo y evaluación:</strong> {editorialText(r.objective)} · {editorialText(r.metric)}</p><DecisionEvidence product={p} evidenceIds={r.evidenceIds}/>{alternative&&r.priorityComparison&&<details className="mt-3"><summary className="cursor-pointer">Evidencia de la alternativa: {alternative.name}</summary><DecisionEvidence product={alternative} evidenceIds={r.priorityComparison.evidenceIds}/></details>}</div></details>
    </article>;
   })}</div>
   <details className="rounded-xl border bg-white p-4 text-sm" open={result.result.recommendations.length===0}><summary className="cursor-pointer font-medium">Qué posponer y qué falta comprobar</summary><div className="mt-3 space-y-2">{result.result.postpone.map(p=><p key={p.productId}><strong>{result.snapshot.products.find(x=>x.productId===p.productId)?.name}:</strong> {editorialText(p.reason)}</p>)}<ul className="list-disc pl-5">{[...result.result.missingData,...result.snapshot.comparisonWarnings].map((x,i)=><li key={i}>{editorialText(x)}</li>)}</ul></div></details>
   <details className="text-xs text-slate-500"><summary className="cursor-pointer">Fecha y versión del análisis</summary><p>{new Date(result.createdAt).toLocaleString('es-CL')} · {result.snapshot.model} · {result.snapshot.promptVersion}</p></details>
  </>}
 </div>;
}
