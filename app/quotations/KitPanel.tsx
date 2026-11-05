import { kitSummary, type Item } from '@/lib/quotations/core';
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-40';
type Props = { item: Item; busy: boolean; search: (componentId?: string) => void; select: (componentId: string, alternativeId: string | null) => void; assemble: () => void };
export default function KitPanel({ item, busy, search, select, assemble }: Props) {
  if (!item.kit) return null;
  const summary = kitSummary(item);
  return <section className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
    <div className="flex flex-wrap gap-2"><div className="mr-auto"><h3 className="font-semibold">Composición del set</h3><p className="mt-1 text-xs text-slate-600">Las piezas pertenecen a la misma fila. Puedes comparar el set completo con una solución armada por componentes.</p></div><button className={button} disabled={busy} onClick={() => search()}>Buscar todos los componentes</button></div>
    {item.kit.components.map(part => <article key={part.id} className="space-y-2 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-start gap-2"><div className="mr-auto"><h4 className="font-medium">{part.quantityPerSet} × {part.name}</h4><p className="text-xs text-slate-500">{part.brandModel} · {part.unit} por pieza{item.requirements.quantity !== null ? ` · Para ${item.requirements.quantity} sets: ${part.quantityPerSet * item.requirements.quantity} ${part.unit}(s)` : ' · Cantidad total pendiente de confirmar'}</p></div><button className={button} disabled={busy || part.search.state === 'running'} onClick={() => search(part.id)}>{part.search.state === 'done' ? 'Actualizar pieza' : 'Buscar esta pieza'}</button></div>
      {part.search.error && <p className="text-sm text-rose-700">{part.search.error}</p>}
      {part.search.state === 'running' && <p className="text-sm text-indigo-700">Investigando esta pieza…</p>}
      {!part.alternatives.length && <p className="text-xs text-slate-500">Sin opciones documentadas todavía.</p>}
      {part.alternatives.filter(a=>a.review?.chileSupported).map(a => <div key={a.id} className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm">
        <p className="font-medium">{a.product} · {a.supplier}</p><p>{a.price === null ? 'Precio por confirmar' : `${a.price.toLocaleString('es-CL')} ${a.currency}`} · IVA {{ included: 'incluido', excluded: 'excluido', unknown: 'desconocido' }[a.vat]}</p>
        <p className="text-xs">{a.presentation} · Unidades por precio: {a.unitsPerPrice ?? 'Desconocidas'}</p><p className="text-xs">Disponibilidad publicada: {a.availability || 'Por confirmar'}</p>
        <p className="text-xs">Coincide: {a.matches}</p>{a.differences && <p className="text-xs text-amber-800">Diferencias: {a.differences}</p>}<p className="text-xs text-amber-800">{a.pending}</p>
        <a href={a.url} target="_blank" rel="noreferrer" className="block break-all text-xs text-indigo-700 underline">{a.sourceTitle} ↗</a>
        <details className="text-xs"><summary>Evidencia y revisión</summary><p className="whitespace-pre-wrap">{a.evidence}</p>{a.review?.issues.map((issue, index) => <p key={index}>{issue}</p>)}</details>
        <button className={button} disabled={busy || a.match === 'insufficient' || a.requirementRevision !== item.revision} onClick={() => select(part.id, a.id === part.selectedId ? null : a.id)}>{a.id === part.selectedId ? 'Quitar selección de pieza' : 'Elegir pieza'}</button>
      </div>)}
    </article>)}
    <div className="rounded-lg border bg-white p-3 text-sm"><p className="font-semibold">Set armado por componentes</p>
      <p>{summary.complete ? 'Todas las piezas tienen una opción seleccionada.' : `Falta elegir: ${summary.missing.join(', ')}`}</p>
      <p className="mt-2">Referencia por set: {summary.perSet === null ? 'Precio pendiente o condiciones no comparables' : `${summary.perSet.toLocaleString('es-CL')} ${summary.currency}`}</p>
      <p>Referencia para la cantidad solicitada: {summary.total === null ? 'Por confirmar' : `${summary.total.toLocaleString('es-CL')} ${summary.currency}`}</p>
      <p className="mt-1 text-xs text-slate-500">Importes públicos según presentación, sin mezclar monedas ni tratamiento de IVA. No confirman oferta mayorista, costos de envío ni stock suficiente.</p>
      <button className={button + ' mt-3'} disabled={busy || !summary.complete} onClick={assemble}>{item.selectedMode === 'assembled' ? 'Set armado seleccionado' : 'Elegir este set armado'}</button>
    </div>
  </section>;
}
