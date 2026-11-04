'use client';
import { useCallback, useEffect, useState } from 'react';
import type { JobView } from '@/lib/catalog-reading/core';
import { MAX_ROWS } from '@/lib/reception-products/core';
type History={id:string;status:JobView['status'];error:string|null;project_id:string|null;updated_at:string};
const button='rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40';
const labels={queued:'En cola',reading:'Leyendo páginas',grouping:'Agrupando productos y variantes',completed:'Propuesta lista',failed:'Lectura detenida'};
async function api<T>(url:string,init?:RequestInit):Promise<T> { const r=await fetch(url,{...init,cache:'no-store'}), b=await r.json().catch(()=>null); if(!r.ok) throw new Error(b?.error||'No pudimos consultar la lectura.'); return b as T; }
export default function CatalogReader({disabled,onOpen}:{disabled:boolean;onOpen:(id:string)=>void}) {
    const [job,setJob]=useState<JobView|null>(null),[history,setHistory]=useState<History[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const refresh=useCallback(async()=>setHistory((await api<{jobs:History[]}>('/api/reception/catalog-jobs')).jobs),[]);
    const select=useCallback(async(id:string)=>{ const r=await api<{job:JobView}>('/api/reception/catalog-jobs?id='+id); setJob(r.job); localStorage.setItem('facto-catalog-reading',id); },[]);
    useEffect(()=>{let active=true; api<{jobs:History[]}>('/api/reception/catalog-jobs').then(async r=>{if(!active)return;setHistory(r.jobs);const saved=localStorage.getItem('facto-catalog-reading'); if(saved&&r.jobs.some(j=>j.id===saved)){ const result=await api<{job:JobView}>('/api/reception/catalog-jobs?id='+saved); if(active)setJob(result.job); }}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
    const id=job?.id,status=job?.status;
    useEffect(()=>{
        if(!id||status==='completed'||status==='failed')return;
        let active=true,timer:ReturnType<typeof setTimeout>;
        const poll=async()=>{try{const r=await api<{job:JobView}>('/api/reception/catalog-jobs?id='+id);if(active){setJob(r.job);setError('');if(r.job.status==='completed'||r.job.status==='failed'){await refresh();return;}}}catch{if(active)setError('No pudimos consultar el progreso. El trabajo sigue independiente de esta pestaña; volveremos a consultar.');}if(active)timer=setTimeout(poll,4000);};
        timer=setTimeout(poll,1000);return()=>{active=false;clearTimeout(timer);};
    },[id,status,refresh]);
    async function upload(input:HTMLInputElement){
        const files=Array.from(input.files??[]);if(!files.length)return;
        if(files.length>10||files.reduce((s,f)=>s+f.size,0)>4*1024*1024){setError('Selecciona hasta diez archivos, con un máximo total de 4 MB.');input.value='';return;}
        setBusy(true);setError('');
        try{const form=new FormData();files.forEach(f=>form.append('files',f));const r=await api<{job:JobView}>('/api/reception/catalog-jobs',{method:'POST',body:form,signal:AbortSignal.timeout(90000)});setJob(r.job);localStorage.setItem('facto-catalog-reading',r.job.id);await refresh();}
        catch(e){setError(e instanceof Error?e.message:'No pudimos iniciar la lectura.');await refresh().catch(()=>{});}finally{setBusy(false);input.value='';}
    }
    async function retry(){if(!job)return;setBusy(true);setError('');try{const r=await api<{job:JobView}>('/api/reception/catalog-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'retry',id:job.id})});setJob(r.job);await refresh();}catch(e){setError(e instanceof Error?e.message:'No pudimos reanudar.');}finally{setBusy(false);}}
    return <div className="space-y-3 border-t pt-4">
        <label className="block text-sm font-semibold">Leer documento por páginas<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={disabled||busy} onChange={e=>upload(e.target)} className="mt-2 block w-full text-sm"/></label>
        <p className="text-xs text-slate-500">Hasta 30 páginas, {MAX_ROWS.toLocaleString('es-CL')} variantes y 4 MB en total. Primero se leen las filas y luego se proponen las variantes. Puedes cerrar la pestaña y volver a esta lectura; el servidor debe seguir encendido si trabajas en local.</p>
        {history.length>0&&<label className="block text-sm">Lecturas guardadas<select aria-label="Lecturas guardadas" value={job?.id??''} disabled={busy||disabled} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm" onChange={e=>{if(e.target.value)select(e.target.value).catch(e=>setError(e.message));}}><option value="">Seleccionar lectura</option>{history.map(j=><option key={j.id} value={j.id}>{new Date(j.updated_at).toLocaleString('es-CL',{timeZone:'America/Santiago'})} · {labels[j.status]}</option>)}</select></label>}
        {busy&&<p role="status" className="text-sm text-blue-700">Guardando archivo e iniciando la tarea…</p>}
        {job&&<div role="status" className="space-y-2 rounded-lg bg-blue-50 p-4 text-sm text-blue-950"><p className="font-semibold">{labels[job.status]}</p><p>{job.readPages} de {job.pages||'…'} páginas leídas · {job.rows} filas{job.status==='grouping'?` · ${job.groupedRows} agrupadas`:''}</p>{job.status!=='completed'&&job.status!=='failed'&&<p className="text-xs">El progreso se guarda por partes. Si Gemini falla temporalmente, se reintentará solo esa parte, hasta tres intentos.</p>}{job.error&&<p className="text-red-800">{job.error}</p>}{job.status==='failed'&&<button className={button} disabled={busy||disabled} onClick={retry}>Reanudar lectura pendiente</button>}{job.projectId&&<button className={button} disabled={busy||disabled} onClick={()=>onOpen(job.projectId!)}>Revisar productos y variantes</button>}</div>}
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>;
}
