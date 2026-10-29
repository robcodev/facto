import type { CompactProduct } from '@/lib/marketing/analysis-core';

export const quantity = (value: number | null | undefined) => value == null ? 'Sin cobertura' : value.toLocaleString('es-CL', { maximumFractionDigits: 1 });
export const dayLabel = (value: string) => value.split('-').reverse().join('/');
export function ProductNumbers({ product: p }: { product: CompactProduct }) {
  const delta = p.previous.absolute;
  return <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-sm">
    <div><p className="text-xs text-slate-500">Unidades brutas</p><strong className="text-xl">{quantity(p.unitsGross)}</strong></div>
    <div><p className="text-xs text-slate-500">Período anterior</p><strong className="text-xl">{quantity(p.previous.previous)}</strong></div>
    <div><p className="text-xs text-slate-500">Diferencia</p><strong className="text-xl">{delta == null ? '—' : `${delta > 0 ? '+' : ''}${quantity(delta)}`}</strong><p className="text-xs">{p.previous.percent == null ? 'Sin porcentaje comparable' : `${p.previous.percent > 0 ? '+' : ''}${quantity(p.previous.percent)} %`}</p></div>
  </div>;
}
export default function DecisionEvidence({ product: p, evidenceIds }: { product: CompactProduct; evidenceIds: string[] }) {
  return <div className="mt-3 space-y-3 text-sm text-slate-700">
    <p>Unidades brutas: las devoluciones no están descontadas. Los documentos no equivalen a compradores distintos.</p>
    {p.productMetrics && <p>{quantity(p.productMetrics.documents)} documentos. El mayor concentra {quantity(p.productMetrics.largestDocumentQuantity)} unidades ({quantity(p.productMetrics.largestDocumentShare * 100)} %); {quantity(p.productMetrics.distributedUnits)} están en los demás. {p.productMetrics.concentrated && 'Concentración pendiente de revisión.'}</p>}
    <table className="w-full text-left"><caption className="text-left font-medium">Comparaciones de ventas</caption><thead><tr><th className="py-2">Período</th><th>Unidades brutas</th></tr></thead><tbody>{(['current', 'previous', 'year'] as const).map((kind, i) => {
      const source = p.evidence.find(e => e.id === `${p.productId}:${kind}`);
      const amount = kind === 'current' ? p.unitsGross : kind === 'previous' ? p.previous.previous : p.year.previous;
      return <tr key={kind} className="border-t"><td className="py-2">{['Actual', 'Anterior', 'Año anterior'][i]}{source && <span className="block text-xs">{dayLabel(source.from)}–{dayLabel(source.to)}</span>}</td><td>{quantity(amount)}</td></tr>;
    })}</tbody></table>
    <p>Enlace: {p.urlStatus === 'verified' ? 'identidad verificada' : p.urlStatus === 'pending' ? 'pendiente de verificar' : 'no disponible'}.{p.urlVerification?.checkedAt && ` Comprobado: ${new Date(p.urlVerification.checkedAt).toLocaleString('es-CL')}.`}</p>
    {p.url && /^https?:\/\//i.test(p.url) && <a className="text-blue-700 underline" href={p.url} target="_blank" rel="noreferrer">Abrir página del producto</a>}
    {p.evidence.filter(e => evidenceIds.includes(e.id)).map(e => <div key={e.id} className="rounded border p-3">
      <p className="font-medium">{e.source === 'ga4' ? 'Visitas de Analytics' : e.source === 'search_console' ? 'Búsquedas de Search Console' : 'Ventas y movimientos de Intel'}</p>
      <p className="text-xs">{dayLabel(e.from)}–{dayLabel(e.to)} · Leído: {new Date(e.checkedAt).toLocaleString('es-CL')}</p>
      {'metrics' in e && <><p>{Object.entries(e.metrics).map(([key, value]) => `${({sessions:'Sesiones',clicks:'Clics',impressions:'Impresiones',ctr:'CTR',position:'Posición media'} as Record<string,string>)[key] ?? key}: ${key === 'ctr' && value != null ? quantity(value * 100) + ' %' : quantity(value)}`).join(' · ')}</p><p className="text-xs">{e.limitations.truncated === true && 'Reporte parcial. '}Zona horaria: {String(e.limitations.timeZone ?? 'no informada')}. {e.source === 'ga4' && 'Visitas a la página; compras de este artículo pendientes de validar.'}</p></>}
      {'productStock' in e && e.productStock && <p>Disponibilidad observada: {e.productStock.available == null ? 'incompleta' : quantity(e.productStock.available)} · {e.productStock.variantsObserved} de {e.productStock.variantsTotal} variantes observadas. No reconstruye stock histórico.</p>}
      <details className="mt-2 text-xs"><summary className="cursor-pointer">Referencia de esta evidencia</summary><p className="break-all">{e.id}</p></details>
    </div>)}
    <details><summary className="cursor-pointer">Características verificadas y límites</summary>{p.verifiedFacts.length ? <ul className="mt-2 list-disc pl-4">{p.verifiedFacts.map((f,i)=><li key={i}>{f.label}: {f.value}</li>)}</ul> : <p>No hay características técnicas aprobadas en este resumen.</p>}<ul className="mt-2 list-disc pl-4">{p.limitations.map(l=><li key={l}>{l}</li>)}</ul></details>
  </div>;
}
