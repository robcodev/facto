'use client';

import { useEffect, useState } from 'react';
import type { Invoice } from './core';
import type { ReceptionReport } from './receptions-core';

const amountFormat = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (amount: number) => amountFormat.format(amount);

export default function ReceptionDetails({ invoice }: { invoice: Invoice }) {
    const [report, setReport] = useState<ReceptionReport | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            await Promise.resolve(); if (controller.signal.aborted) return;
            setReport(null); setError('');
            try {
                const response = await fetch(`/api/suppliers?receptions=${invoice.id}`, { signal: controller.signal, cache: 'no-store' });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'No pudimos consultar las recepciones.');
                if (!controller.signal.aborted) setReport(data);
            } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No pudimos consultar las recepciones.'); }
        }
        void load(); return () => controller.abort();
    }, [invoice.id, retry]);
    return <section aria-label={`Recepciones de factura ${invoice.folio}`} className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-semibold">Recepción de mercadería</h4>
        {!report && !error && <p role="status" className="text-xs text-slate-500">Buscando recepciones en Bsale e Intel…</p>}
        {error && <div role="alert" className="text-xs text-red-800"><p>{error} No se puede determinar si fue recepcionada.</p><button className="mt-2 rounded border bg-white px-3 py-1.5" onClick={() => setRetry(n => n + 1)}>Reintentar consulta</button></div>}
        {report && <>
            <p className="text-xs text-slate-600">Neto de la factura: <strong>{report.invoiceNet !== null && report.currency === 'CLP' ? money(report.invoiceNet) : 'No comparable en CLP'}</strong>. Se compara con cantidades × costo unitario neto de cada recepción, sin IVA.</p>
            {!report.receipts.length && <p className="text-sm text-slate-700">{report.searchComplete ? 'No se encontró una recepción directa con el folio de esta factura. Puede estar ingresada mediante una guía u otro documento.' : 'No se pudo completar la búsqueda. No se puede afirmar que no fue recepcionada.'}</p>}
            {report.warnings.map(w => <p key={w} className="text-xs text-amber-900">{w}</p>)}
            {report.receipts.map(receipt => <div key={receipt.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Recepción #{receipt.id}</strong><span className={`rounded-full px-2 py-1 text-xs ${receipt.match === 'declared' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{receipt.match === 'declared' ? 'Vínculo declarado' : receipt.match === 'mismatch' ? 'Otra factura / proveedor' : 'Coincidencia por confirmar'}</span></div>
                <p className="text-xs text-slate-600">Fecha: <strong>{receipt.date || 'Sin fecha informada'}</strong> · Sucursal: {receipt.office} · {receipt.document} {receipt.folio}</p>
                <p className="text-xs text-slate-600">{receipt.matchReason}</p>
                <div className="text-sm"><p>Neto recibido: <strong>{receipt.net === null ? 'Detalle incompleto o costos faltantes' : money(receipt.net)}</strong></p><p className={receipt.comparison === 'matches' ? 'text-emerald-800' : receipt.comparison === 'differs' ? 'text-amber-900' : 'text-slate-500'}>{receipt.comparison === 'matches' ? 'Los montos netos coinciden.' : receipt.comparison === 'differs' ? `Diferencia de neto (recepción − factura): ${money(receipt.difference!)}` : 'No se pueden comparar los montos con la información disponible.'}</p></div>
                {receipt.match !== 'declared' && receipt.comparison !== 'unknown' && <p className="text-xs text-slate-500">La comparación de importes no confirma por sí sola que la recepción sea de este proveedor. No se suman coincidencias ambiguas.</p>}
                <details><summary className="cursor-pointer text-sm font-medium text-blue-700">Ver qué se recepcionó ({receipt.lines.length} líneas{!receipt.complete ? ' · incompleto' : ''})</summary><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[450px] text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="py-2 pr-2">Producto / SKU</th><th className="p-2">Cantidad</th><th className="p-2">Costo neto unit.</th><th className="p-2">Neto línea</th></tr></thead><tbody>{receipt.lines.map((line, n) => <tr key={`${line.id}-${n}`} className="border-b border-slate-100"><td className="py-2 pr-2">{line.name || `Variante ${line.variantId || 'sin identificar'}`}<span className="block text-slate-500">{line.sku || 'SKU no disponible'}</span></td><td className="p-2">{line.quantity ?? '—'}</td><td className="p-2">{line.unitCost !== null ? money(line.unitCost) : '—'}</td><td className="p-2">{line.net !== null ? money(line.net) : '—'}</td></tr>)}</tbody></table></div></details>
                <p className="text-[11px] text-slate-400">Fuente: {receipt.source} · Consultada: {new Date(receipt.observedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}. El registro no certifica las existencias actuales.</p>
            </div>)}
        </>}
    </section>;
}
