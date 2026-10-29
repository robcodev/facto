'use client';
import { useEffect, useRef, useState } from 'react';

type Run = { id:string; status:string; config:{mode:string}; last_error:string|null; updated_at:string; progress:{phase:string;source:string;offset:number;expected:number|null;stockRows:number;completedMovements:number} };
type Result = { runs:Run[];records:{id:number;external_id:string;data:Record<string,unknown>}[];total:number;runId?:string };
const button = 'rounded border px-3 py-2 text-sm disabled:opacity-40';
async function api<T>(query = '', body?: unknown): Promise<T> {
    const response = await fetch(`/api/intel/inventory${query}`, { cache:'no-store', ...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {}) });
    if (response.redirected) throw new Error('Vuelve a iniciar sesión.');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo consultar inventario.');
    return result;
}
export default function InventoryPage() {
    const [result,setResult] = useState<Result>({runs:[],records:[],total:0});
    const [run,setRun] = useState<Run|null>(null);
    const [busy,setBusy] = useState(false), [error,setError] = useState('');
    const [resource,setResource] = useState('inventory_stock'), [page,setPage] = useState(0);
    const [variant,setVariant] = useState(''), [office,setOffice] = useState(''), [capture,setCapture] = useState('');
    const [diagnostic,setDiagnostic] = useState<Record<string,unknown>|null>(null);
    const stop = useRef(false);
    const query = `?${new URLSearchParams({resource,page:String(page),variant,office,...(capture ? {runId:capture} : {})})}`;
    useEffect(() => {
        let active = true;
        api<Result>(query).then(value => { if(active) {setResult(value);setRun(value.runs.find(r=>r.status==='running')??null);} }).catch(e=>{if(active)setError(e.message);});
        return ()=>{active=false;};
    },[query]);
    useEffect(()=>()=>{stop.current=true;},[]);
    async function refresh() { const value=await api<Result>(query);setResult(value);setRun(value.runs.find(r=>r.status==='running')??null); }
    async function start(mode:'history'|'snapshot') {
        stop.current=false;setBusy(true);setError('');
        try {
            let current=run??(await api<{run:Run}>('',{action:'start',mode})).run;
            setRun(current);
            while(current.status==='running'&&!stop.current) {current=(await api<{run:Run}>('',{action:'step',runId:current.id})).run;setRun(current);}
            await refresh();
        } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
    }
    return <main className="mx-auto max-w-7xl space-y-5 p-6">
        <a href="/intel" className="text-indigo-700 underline">← Intel</a>
        <h1 className="text-3xl font-bold">Costos y stock</h1>
        <p>Datos observados de Bsale. Las recepciones y consumos conservan sus costos originales; no representan por sí solos el margen de cada venta.</p>
        <p className="rounded bg-amber-50 p-4 text-sm">El stock disponible histórico no se reconstruye a partir de ventas únicamente. Ajustes, reservas, devoluciones y traslados deben conciliarse primero. Cada captura tiene su fecha real; nunca completamos días faltantes con cero.</p>
        {error&&<p role="alert" className="rounded bg-red-50 p-4 text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-3">
            <button className={button} disabled={busy} onClick={()=>start('history')}>{run?'Reanudar importación':'Importar movimientos históricos y stock'}</button>
            <button className={button} disabled={busy||!!run} onClick={()=>start('snapshot')}>Capturar solo stock actual</button>
            {busy&&<button className={button} onClick={()=>{stop.current=true;}}>Pausar al terminar este lote</button>}
            {run&&!busy&&<button className={button} onClick={async()=>{if(!confirm('¿Cerrar la ejecución conservando sus datos parciales?'))return;try{await api('',{action:'cancel',runId:run.id});await refresh();}catch(e){setError((e as Error).message);}}}>Cerrar ejecución</button>}
        </div>
        <p className="text-sm text-slate-600">Importa todo el historial disponible, sin listas de precios. Mantén esta pantalla abierta. Puedes repetir las capturas para construir el historial observado; todavía no hay una tarea diaria automática activada.</p>
        {run&&<p aria-live="polite" className="rounded bg-indigo-50 p-3">{run.progress.phase} · {run.progress.source} · {run.progress.stockRows} filas de stock · {run.progress.completedMovements} movimientos completos · Página acumulada {run.progress.offset}/{run.progress.expected??'—'}{run.last_error?` · ${run.last_error}`:''}</p>}
        <div className="flex flex-wrap gap-3">
            <select aria-label="Captura" className={button} value={capture} disabled={busy} onChange={e=>{setCapture(e.target.value);setPage(0);setDiagnostic(null);}}><option value="">Última ejecución</option>{result.runs.map(r=><option key={r.id} value={r.id}>{new Date(r.updated_at).toLocaleString('es-CL',{timeZone:'America/Santiago'})} · {r.config.mode} · {r.status}</option>)}</select>
            <select aria-label="Datos" className={button} value={resource} disabled={busy} onChange={e=>{setResource(e.target.value);setPage(0);}}>{[['inventory_stock','Stock observado'],['inventory_receptions_details','Costos de recepción'],['inventory_consumptions_details','Consumos'],['inventory_checks','Conteos verificados']].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
            <input aria-label="ID variante" placeholder="ID variante" className={button} disabled={busy} value={variant} onChange={e=>{setVariant(e.target.value.replace(/\D/g,''));setPage(0);setDiagnostic(null);}} />
            <input aria-label="ID sucursal" placeholder="ID sucursal" className={button} disabled={busy} value={office} onChange={e=>{setOffice(e.target.value.replace(/\D/g,''));setPage(0);setDiagnostic(null);}} />
            <button className={button} disabled={busy||!variant||!office||!result.runId} onClick={async()=>{setBusy(true);setError('');try{setDiagnostic(await api('',{action:'diagnostic',runId:result.runId,variantId:variant,officeId:office}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Contrastar variante con Bsale</button>
        </div>
        {diagnostic&&<section className="rounded border p-4"><h2 className="font-semibold">Diagnóstico: no conciliado</h2><p className="text-sm">Compara la información disponible; no certifica un saldo histórico ni inventa datos faltantes.</p><pre className="overflow-auto text-xs">{JSON.stringify(diagnostic,null,2)}</pre></section>}
        <p>{result.total} registros en esta ejecución y filtro. Una captura parcial no constituye un inventario completo.</p>
        <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Registro','Variante / sucursal','Fecha observada o movimiento','Cantidades y costos'].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{result.records.map(row=><tr key={row.id} className="border-t"><td className="p-3">{row.external_id}</td><td className="p-3">{String(row.data.variantId??'—')} / {String(row.data.officeId??'—')}</td><td className="p-3">{row.data.observedAt?new Date(String(row.data.observedAt)).toLocaleString('es-CL',{timeZone:'America/Santiago'}):row.data.date?new Date(Number(row.data.date)*1000).toISOString().slice(0,10):String(row.data.checkedAt??'—')}</td><td className="p-3">{resource==='inventory_stock'?`Físico: ${row.data.physical} · Reservado: ${row.data.reserved} · Disponible: ${row.data.available}`:resource==='inventory_checks'?`Bsale: ${row.data.sourceCount} · Guardados: ${row.data.importedCount}`:`Cantidad: ${row.data.quantity} · Costo informado: ${row.data.cost??'Sin dato'} · Saldo informado: ${row.data.reportedVariantStock??'Sin dato'}`}</td></tr>)}</tbody></table></div>
        <div className="flex gap-4"><button className={button} disabled={busy||page===0} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page+1}</span><button className={button} disabled={busy||(page+1)*50>=result.total} onClick={()=>setPage(page+1)}>Siguiente</button></div>
    </main>;
}
