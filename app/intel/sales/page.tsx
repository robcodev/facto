'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { object, rows, type SourceRow } from '@/lib/intel/normalize';

type Run = { id: string; status: string; config: { from: string; to: string; background?: boolean; worker?: { state?: string; heartbeatAt?: string; retryAt?: number } }; last_error: string | null; progress: { phase: string; clientsImported?: number; clientsExpected?: number; from: string; to: string; documentId?: string; completedDocuments: number; completedWindows: number } };
type Result = { documents: { id: number; external_id: string; data: SourceRow }[]; total: number; runs: Run[]; canEdit: boolean; masters: { resource: string; external_id: string; name: string }[] };
const control = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50';
const primary = 'rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white disabled:opacity-50';
async function api<T>(query = '', body?: unknown): Promise<T> {
    const response = await fetch(`/api/intel/sales${query}`, { cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    if (response.redirected) throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No pudimos consultar las ventas.');
    return data;
}
function defaultPeriod() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    const end = new Date(Date.parse(today) - 86400000), start = new Date(today);
    start.setUTCFullYear(start.getUTCFullYear() - 2);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
const money = (value: unknown) => value == null ? '—' : Number(value).toLocaleString('es-CL', { maximumFractionDigits: 2 });
export default function IntelSalesPage() {
    return <Suspense fallback={<p>Cargando ventas…</p>}><IntelSalesContent /></Suspense>;
}
function IntelSalesContent() {
    const searchParams = useSearchParams();
    const [period, setPeriod] = useState(defaultPeriod);
    const [filters, setFilters] = useState({ from: '', to: '', seller: '', office: '', client: /^\d+$/.test(searchParams.get('client') || '') ? searchParams.get('client')! : '' });
    const [result, setResult] = useState<Result>({ documents: [], total: 0, runs: [], masters: [], canEdit: false });
    const [run, setRun] = useState<Run | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [page, setPage] = useState(0);
    const [detail, setDetail] = useState<{ document: SourceRow; children: SourceRow[]; total: number; page: number } | null>(null);
    const activeRunId=run?.id;
    const query = `?${new URLSearchParams({ ...filters, page: String(page) })}`;
    useEffect(() => { let active = true; api<Result>(query).then(data => { if (active) { setResult(data); setRun(data.runs.find(r => r.status === 'running') ?? null); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [query]);
    useEffect(() => {
        if (!activeRunId) return;
        let active=true;
        const timer=setInterval(()=>{api<{runs:Run[]}>('?progress=1').then(data=>{
            if(!active)return;
            const current=data.runs.find(r=>r.status==='running')??null;
            setRun(current);setResult(previous=>({...previous,runs:data.runs}));
        }).catch(e=>{if(active)setError(e.message);});},5000);
        return ()=>{active=false;clearInterval(timer);};
    },[activeRunId]);
    async function refresh() { const data = await api<Result>(query); setResult(data); setRun(data.runs.find(r => r.status === 'running') ?? null); }
    async function synchronize() {
        setBusy(true); setError('');
        try {
            let current = run ?? (await api<{ run: Run }>('', { action: 'start', ...period })).run;
            if (run) current = (await api<{run:Run}>('',{action:'resume',runId:run.id})).run;
            setRun(current);
            await refresh();
        } catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
    }
    async function openDocument(id: string, detailPage = 0) {
        try { setDetail(await api(`?documentId=${id}&page=${detailPage}`)); } catch (e) { setError((e as Error).message); }
    }
    return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
        <a href="/intel" className="text-sm text-indigo-700 underline">← Intel · Catálogo</a><a href="/intel/clients" className="ml-4 text-sm text-indigo-700 underline">Clientes y documentos →</a>
        <header><h1 className="text-3xl font-bold">Ventas históricas</h1><p className="mt-2 text-slate-600">Documentos de todos los vendedores, sucursales y productos, aunque no estén en la web.</p></header>
        <p className="rounded-lg bg-amber-50 p-4 text-sm">Estos son documentos originales, no ventas netas conciliadas. Las preventas están excluidas. Todavía incluyen otros documentos, anulaciones y notas de crédito: no sumes todos sus importes. Un canal no informado no se deduce del vendedor ni de la sucursal.</p>
        {error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</div>}
        <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Importación y actualización</h2><p className="text-sm text-slate-600">Puedes cerrar la pestaña: el proceso independiente guarda cada lote y reintenta los errores temporales. El equipo donde está instalado debe permanecer encendido y conectado. Volver a importar un periodo actualiza sus datos sin duplicarlos.</p>
            {result.canEdit && <div className="flex flex-wrap gap-3">{(['from', 'to'] as const).map(key => <label key={key} className="text-sm">{key === 'from' ? 'Desde' : 'Hasta'} <input type="date" className={control} value={period[key]} disabled={busy || !!run} onChange={e => setPeriod({ ...period, [key]: e.target.value })} /></label>)}<button className={primary} disabled={busy || run?.config.background === true} onClick={synchronize}>{busy ? 'Guardando…' : run?.config.background ? 'Importación en segundo plano' : run ? 'Reanudar importación' : 'Importar periodo'}</button>{run?.config.background && <button disabled={busy} className={control} onClick={async()=>{setBusy(true);try{await api('',{action:'pause',runId:run.id});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Pausar después del lote actual</button>}{run && !busy && <button className={control} onClick={async () => { if (!confirm('¿Cerrar esta ejecución? Se conserva todo lo importado y podrás iniciar otra para revisar el periodo.')) return; try { await api('', { action: 'cancel', runId: run.id }); await refresh(); } catch (e) { setError((e as Error).message); } }}>Cerrar ejecución sin borrar datos</button>}</div>}
            {run && <p className="text-sm text-slate-600">{run.config.worker?.state === 'retrying' ? 'Error temporal: se reintentará automáticamente.' : run.config.worker?.state === 'attention' ? 'Se necesita revisar el error antes de reanudar.' : run.config.background ? 'Continuación automática habilitada.' : 'Importación pausada.'} {run.config.worker?.heartbeatAt ? `Última señal del proceso: ${new Date(run.config.worker.heartbeatAt).toLocaleString('es-CL',{timeZone:'America/Santiago'})}.` : 'Esperando conexión del proceso de importación.'}</p>}
            {run && <p aria-live="polite" className="rounded-lg bg-indigo-50 p-3 text-sm">{run.progress.phase === 'clients' ? `Clientes: ${run.progress.clientsImported ?? 0} / ${run.progress.clientsExpected ?? 'consultando'} · ` : ''}Periodo {run.progress.from} al {run.progress.to} · {run.progress.completedDocuments} documentos completos · {run.progress.completedWindows} periodos verificados{run.progress.documentId ? ` · Documento #${run.progress.documentId}` : ''}{run.last_error ? ` · ${run.last_error}` : ''}</p>}
            <details><summary className="cursor-pointer text-sm font-semibold">Historial y cobertura de importaciones</summary>{result.runs.map(item => <p key={item.id} className="border-b py-2 text-sm">{item.config.from} → {item.config.to} · {item.status === 'completed' ? 'Importación completa (conteos verificados)' : item.status === 'cancelled' ? 'Interrumpida; cobertura parcial' : 'Pendiente'} · {item.progress.completedDocuments} documentos</p>)}</details>
        </section>
        <section className="space-y-4"><label className="text-sm">ID de cliente <input aria-label="ID de cliente" className={control} value={filters.client} onChange={e => { setPage(0); setFilters({ ...filters, client: e.target.value.replace(/\D/g, '') }); }} placeholder="Todos los clientes" /></label><h2 className="text-lg font-semibold">Documentos guardados ({result.total})</h2><div className="flex flex-wrap gap-3">{(['from', 'to'] as const).map(key => <label key={key} className="text-sm">{key === 'from' ? 'Emisión desde' : 'Hasta'} <input className={control} type="date" value={filters[key]} disabled={busy} onChange={e => { setPage(0); setFilters({ ...filters, [key]: e.target.value }); }} /></label>)}{(['seller', 'office'] as const).map(key => <select key={key} aria-label={key === 'seller' ? 'Vendedor' : 'Sucursal'} className={control} value={filters[key]} disabled={busy} onChange={e => { setPage(0); setFilters({ ...filters, [key]: e.target.value }); }}><option value="">{key === 'seller' ? 'Todos los vendedores' : 'Todas las sucursales'}</option>{result.masters.filter(m => m.resource === (key === 'seller' ? 'sales_users' : 'sales_offices')).map(m => <option key={m.external_id} value={m.external_id}>{m.name}</option>)}</select>)}</div>
            <div className="overflow-auto rounded-xl border"><table className="w-full min-w-[900px] bg-white text-sm"><thead className="bg-slate-50 text-left"><tr>{['Fecha', 'Documento', 'Vendedores', 'Sucursal', 'Canal informado', 'Importe original', 'Carga'].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{result.documents.map(doc => <tr key={doc.id} className="border-t"><td className="p-3">{String(doc.data.emissionDay)}</td><td className="p-3"><button className="text-indigo-700 underline" onClick={() => openDocument(doc.external_id)}>{String(doc.data.documentType ?? 'Documento')} #{String(doc.data.number ?? doc.external_id)}</button><p className="text-xs text-slate-500">ID {doc.external_id} · Estado original: {String(doc.data.state ?? '—')}</p></td><td className="p-3">{rows(doc.data.sellers).map(s => String(s.name)).join(', ') || 'Sin información'}</td><td className="p-3">{String(doc.data.officeName ?? 'Sin información')}</td><td className="p-3">{typeof doc.data.channel === 'string' ? doc.data.channel : 'Sin información'}</td><td className="p-3">{money(doc.data.total)}<span className="block text-xs">{String(object(doc.data.currency).name ?? 'Moneda sin identificar')}</span></td><td className="p-3">{doc.data.complete ? 'Completa' : 'Parcial'}</td></tr>)}</tbody></table></div><div className="flex gap-3"><button className={control} disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span className="py-2 text-sm">Página {page + 1}</span><button className={control} disabled={busy || (page + 1) * 50 >= result.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>
        </section>
        {detail && <div role="dialog" aria-modal="true" aria-label="Documento original" className="fixed inset-0 z-50 overflow-auto bg-black/50 p-5"><section className="mx-auto max-w-4xl space-y-4 rounded-xl bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">Documento #{String(object(detail.document.data).number)} · Datos conservados</h2><button className={control} onClick={() => setDetail(null)}>Cerrar</button></div><p className="text-sm">Incluye información de clientes: úsala solo para fines autorizados del negocio. Las relaciones mostradas corresponden a la misma importación del documento.</p><details><summary>Documento original completo</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(detail.document.raw, null, 2)}</pre></details>{detail.children.map(child => <details key={String(child.id)} className="rounded border p-3"><summary>{String(child.resource).replace('sales_', '')} · {String(child.external_id)}</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(child.raw, null, 2)}</pre></details>)}<div className="flex gap-3"><button className={control} disabled={detail.page === 0} onClick={() => openDocument(String(detail.document.external_id), detail.page - 1)}>Anterior</button><span className="py-2 text-sm">{detail.total} registros relacionados</span><button className={control} disabled={(detail.page + 1) * 100 >= detail.total} onClick={() => openDocument(String(detail.document.external_id), detail.page + 1)}>Más relaciones</button></div></section></div>}
    </main>;
}
