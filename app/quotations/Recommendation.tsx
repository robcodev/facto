import type { Item } from '@/lib/quotations/core';
export default function Recommendation({item}:{item:Item}) {
 const options=item.alternatives.filter(a=>a.review?.chileSupported && a.requirementRevision===item.revision && a.match!=='insufficient');
 const preferred=options.find(a=>a.match==='exact') || options.find(a=>a.match==='alternative');
 if(!preferred)return item.search.state==='done'?<div className="rounded-lg bg-amber-50 p-3 text-sm">No hay una opción suficientemente respaldada para recomendar en Chile.{item.kit && ' Revisa el avance de sus componentes.'}</div>:null;
 return <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm"><strong>{preferred.match==='exact'?'Recomiendo revisar esta coincidencia exacta':'Alternativa propuesta para tu revisión'}: {preferred.product}</strong><p className="mt-1">{preferred.matches}</p>{preferred.differences && <p className="mt-1 text-amber-900">Diferencias: {preferred.differences}</p>}<p className="mt-1">Proveedor local: {preferred.review?.chileEvidence}</p><p className="mt-1">Antes de ofrecer: {preferred.pending || 'Confirma precio mayorista, stock para la cantidad solicitada y despacho.'}</p><p className="mt-1 text-xs">Priorizada por coincidencia con los requisitos. La selección final es tuya.</p></div>;
}
