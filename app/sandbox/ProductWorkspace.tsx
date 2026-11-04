'use client';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { EXAMPLE_URL, productViewSchema, searchText, sourceUrl, type ProductView } from '@/lib/laboratory/product';
const button = 'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
const imageSource = (url: string) => '/api/laboratory/image?src=' + encodeURIComponent(url);
const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm';
export default function ProductWorkspace({ userId }: { userId: string }) {
    const key = `facto-laboratory-product-v1:${userId}`;
    const [url, setUrl] = useState(EXAMPLE_URL), [view, setView] = useState<ProductView | null>(null);
    const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [mode, setMode] = useState<'cards'|'table'>('cards'), [search, setSearch] = useState(''), [onlyMissing, setOnlyMissing] = useState(false);
    const [expanded, setExpanded] = useState<ProductView['variants'][number] | null>(null);
    const [unavailableImages, setUnavailableImages] = useState<Set<string>>(() => new Set());
    const imageFailed = (id: string) => setUnavailableImages(old => new Set([...old, id]));
    useEffect(() => {
        let active = true;
        Promise.resolve().then(() => {
            if (!active) return;
            try { const saved = localStorage.getItem(key); if (saved) { const data = productViewSchema.parse(JSON.parse(saved)); setView(data); setUrl(data.source); } }
            catch { setNotice('No pudimos recuperar la vista guardada. Puedes cargar el enlace de nuevo.'); }
            setLoaded(true);
        });
        return () => { active = false; };
    }, [key]);
    useEffect(() => {
        if (!expanded) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(null); };
        window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
    }, [expanded]);
    const filtered = useMemo(() => view?.variants.filter(variant => (!onlyMissing || !variant.image) && searchText([variant.model, variant.colorNumber, variant.colorName, variant.productCode, variant.jan, ...variant.specifications.map(s => s.value)].join(' ')).includes(searchText(search))) ?? [], [view, search, onlyMissing]);
    async function load() {
        if (busy) return;
        let requested: string;
        try { requested = sourceUrl(url); } catch (e) { setError(e instanceof Error ? e.message : 'Revisa el enlace.'); return; }
        if (view && requested !== view.source && !window.confirm('¿Reemplazar la vista actual con la ficha de este enlace? La anterior se quitará cuando la nueva esté lista.')) return;
        setBusy(true); setError(''); setNotice('');
        let previous: string | null = null, storageAvailable = true;
        try { previous = localStorage.getItem(key); } catch { storageAvailable = false; }
        try {
            const response = await fetch('/api/laboratory/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: requested }), signal: AbortSignal.timeout(30000), cache: 'no-store' });
            const result = await response.json().catch(() => null);
            if (!response.ok) throw new Error(result?.error || 'No pudimos preparar la ficha.');
            const next = productViewSchema.parse(result.view);
            if (storageAvailable) {
                try { if (localStorage.getItem(key) !== previous) throw new Error('other-tab'); localStorage.setItem(key, JSON.stringify(next)); }
                catch (e) { if (e instanceof Error && e.message === 'other-tab') throw new Error('El laboratorio cambió en otra pestaña. Recarga antes de reemplazar su contenido.'); setNotice('La vista está lista, pero el navegador no permitió guardarla. Se perderá al cerrar.'); }
            } else setNotice('La vista está lista, pero este navegador no permite guardarla.');
            setUnavailableImages(new Set()); setView(next); setUrl(next.source); setSearch(''); setOnlyMissing(false); setExpanded(null);
        } catch (e) { setError(e instanceof Error && ['TimeoutError','AbortError'].includes(e.name) ? 'La consulta tardó demasiado. Puedes reintentar; la vista anterior se conserva.' : e instanceof Error ? e.message : 'No pudimos preparar la ficha.'); }
        finally { setBusy(false); }
    }
    function clear() {
        if (!window.confirm('¿Vaciar este laboratorio? Se quitará la vista guardada en este navegador. Puedes volver a generarla desde su enlace.')) return;
        try { localStorage.removeItem(key); } catch { setError('El navegador no permitió quitar la vista guardada.'); return; }
        setView(null); setUnavailableImages(new Set()); setExpanded(null); setSearch(''); setError(''); setNotice('Laboratorio vacío. Puedes cargar otra ficha.');
    }
    const matched = view?.variants.filter(v => v.image).length ?? 0;
    return <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Herramientas · Espacio temporal</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Laboratorio</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Reúne las imágenes y especificaciones de una ficha de Shimano Japón en una vista por variante.</p></div>{view&&<button className={button} disabled={busy} onClick={clear}>Vaciar laboratorio</button>}</header>
        <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={e=>{e.preventDefault();void load();}}><label className="block text-sm font-semibold text-slate-800" htmlFor="product-source-url">Enlace de producto</label><div className="mt-2 flex flex-col gap-3 sm:flex-row"><input id="product-source-url" type="url" required maxLength={2500} className={input+' flex-1'} value={url} onChange={e=>setUrl(e.target.value)} disabled={busy||!loaded}/><button type="submit" disabled={busy||!loaded} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40">{busy?'Preparando vista…':view?'Cargar / actualizar vista':'Crear vista'}</button></div><p className="mt-3 text-xs leading-5 text-slate-500">Se guarda una sola vista por usuario en este navegador. Al cargar otro enlace puedes reemplazar la anterior. Los colores y valores se conservan según el fabricante; los precios están en yenes.</p></form>
        {busy&&<p role="status" className="text-sm font-medium text-blue-700">Leyendo la ficha y relacionando cada imagen con su modelo y color…</p>}
        {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {notice&&<p role="status" className="text-sm text-slate-600">{notice}</p>}
        {!view&&!busy&&loaded&&<section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><h2 className="text-lg font-semibold text-slate-800">La ficha, reunida en un solo lugar</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">El enlace de ejemplo ya está cargado. Pulsa Crear vista para ver cada color junto a su imagen, medidas, peso, anzuelos y códigos.</p></section>}
        {view&&<>
            <section className="flex flex-wrap items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Shimano · Ficha del fabricante</p><h2 className="mt-2 text-2xl font-bold text-slate-900">{view.title}</h2><p className="mt-2 text-sm text-slate-600">{[...new Set(view.variants.map(v=>v.model))].join(' · ')}</p><a className="mt-3 inline-block text-sm font-semibold text-blue-700 underline" href={view.source} target="_blank" rel="noreferrer">Ver ficha original ↗</a><p className="mt-2 text-xs text-slate-400">Consultado: {new Date(view.fetchedAt).toLocaleString('es-CL',{timeZone:'America/Santiago'})}</p></div><div className="flex gap-8"><div><p className="text-3xl font-bold text-slate-900">{view.variants.length}</p><p className="mt-1 text-xs text-slate-500">Variantes</p></div><div><p className="text-3xl font-bold text-blue-700">{matched}/{view.variants.length}</p><p className="mt-1 text-xs text-slate-500">Imágenes relacionadas</p></div></div></section>
            {unavailableImages.size>0&&<div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No se pudieron cargar {unavailableImages.size} imágenes del fabricante. <button className="ml-2 font-semibold underline" onClick={()=>setUnavailableImages(new Set())}>Reintentar imágenes</button></div>}
            {view.notices.length>0&&<details className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" open><summary className="cursor-pointer font-semibold">Relaciones pendientes de revisión ({view.notices.length})</summary><ul className="mt-2 list-inside list-disc space-y-1">{view.notices.map((n,i)=><li key={i}>{n}</li>)}</ul></details>}
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-1 flex-wrap items-center gap-3"><label className="min-w-56 max-w-lg flex-1"><span className="sr-only">Buscar variante</span><input className={input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar color, código de producto o JAN…"/></label><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyMissing} onChange={e=>setOnlyMissing(e.target.checked)}/>Solo sin imagen</label></div><div role="group" aria-label="Tipo de vista" className="flex gap-2"><button className={button} aria-pressed={mode==='cards'} onClick={()=>setMode('cards')}>Tarjetas</button><button className={button} aria-pressed={mode==='table'} onClick={()=>setMode('table')}>Tabla con imágenes</button></div></div>
            <p className="text-xs text-slate-500">Mostrando {filtered.length} de {view.variants.length} variantes. La relación se comprueba por modelo, número y nombre de color.</p>
            {filtered.length===0&&<p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">No hay variantes que coincidan con el filtro.</p>}
            {mode==='cards'?<div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{filtered.map(variant=><article key={variant.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-start justify-between gap-3 p-5 pb-0"><div><p className="text-xs font-medium text-slate-400">{variant.model}</p><h3 className="mt-1 text-lg font-bold text-slate-900">Color {variant.colorNumber}</h3><p className="mt-1 text-sm text-slate-600">{variant.colorName}</p></div><span className={'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold '+(variant.image&&!unavailableImages.has(variant.id)?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800')}>{variant.image&&!unavailableImages.has(variant.id)?'Imagen verificada':'Por revisar'}</span></div><div className="flex h-52 items-center justify-center bg-white p-3">{variant.image&&!unavailableImages.has(variant.id)?<button className="h-full w-full cursor-zoom-in rounded-lg focus:ring-2 focus:ring-blue-600" aria-label={`Ampliar imagen del color ${variant.colorNumber}`} onClick={()=>setExpanded(variant)}><Image unoptimized width={962} height={962} src={imageSource(variant.image)} onError={()=>imageFailed(variant.id)} alt={`${variant.model} · ${variant.colorNumber} · ${variant.colorName}`} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain"/></button>:<p className="text-sm text-slate-400">{unavailableImages.has(variant.id)?'Imagen no disponible':'Sin imagen confirmada'}</p>}</div><dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-slate-100 p-5">{variant.specifications.filter(s=>!['品番','カラー番号','カラー'].includes(s.source)).map((s,i)=><div className={s.source==='JANコード'?'col-span-2':''} key={i}><dt title={s.source} className="text-[11px] font-medium text-slate-400">{s.label}</dt><dd title={s.original} className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-800">{s.value||'—'}</dd></div>)}</dl></article>)}</div>:<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Imagen</th>{view.headers.map((h,i)=><th className="whitespace-nowrap p-3" title={h.source} key={i}>{h.label}</th>)}</tr></thead><tbody>{filtered.map(v=><tr className="border-b last:border-0 hover:bg-slate-50" key={v.id}><td className="min-w-40 p-2">{v.image&&!unavailableImages.has(v.id)?<button className="h-24 w-40 cursor-zoom-in" aria-label={`Ampliar imagen del color ${v.colorNumber}`} onClick={()=>setExpanded(v)}><Image unoptimized width={962} height={962} src={imageSource(v.image)} onError={()=>imageFailed(v.id)} alt={`Color ${v.colorNumber}`} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain"/></button>:<span className="text-amber-700">Sin imagen</span>}</td>{v.specifications.map((s,i)=><td key={i} title={s.original} className="whitespace-nowrap p-3 tabular-nums">{s.value||'—'}</td>)}</tr>)}</tbody></table></div>}
        </>}
        {expanded&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-label={`Imagen del color ${expanded.colorNumber}`} onClick={()=>setExpanded(null)}><div className="relative w-full max-w-4xl rounded-2xl bg-white p-5" onClick={e=>e.stopPropagation()}><button autoFocus className={button+' absolute right-3 top-3'} onClick={()=>setExpanded(null)}>Cerrar</button><Image unoptimized width={962} height={962} src={imageSource(expanded.image!)} onError={()=>{imageFailed(expanded.id);setExpanded(null);}} alt={expanded.imageTitle||expanded.colorName} referrerPolicy="no-referrer" className="max-h-[70vh] w-full object-contain"/><p className="mt-3 font-semibold text-slate-900">{expanded.model} · Color {expanded.colorNumber} · {expanded.colorName}</p><p className="mt-1 text-sm text-slate-500">Código {expanded.productCode} · JAN {expanded.jan}</p><a href={imageSource(expanded.image!)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-blue-700 underline">Abrir imagen en otra pestaña ↗</a></div></div>}
    </div>;
}
