'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { rows, safeUrl, type SourceRow } from '@/lib/intel/normalize';

type RecordRow = { id: number; resource: string; external_id: string; product_id: string | null; category_id: string | null; name: string; data: SourceRow; observed_at: string; run_id: string };
type Setting = { category_id: string; included: boolean; editorial_name: string; parent_name: string; responsible: string; priority: number };
type Run = { id: string; status: string; stage: number; page_offset: number; processed: number; started_at: string; completed_at: string | null; last_error: string | null; office_id: number | null; price_list_id: number | null; config?: { scope?: string } };
type Dashboard = { records: RecordRow[]; settings: Setting[]; runs: Run[]; canEdit: boolean; total: number; page: number; counts: { products: number; variants: number; web: number; types: number } };
const labels = ['Categorías', 'Marcas', 'Sucursales', 'Listas de precios', 'Productos', 'Variantes', 'Fichas web e imágenes', 'Colecciones', 'Stock', 'Precios'];
const inputClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const buttonClass = 'rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';
const date = (value?: string | null) => value ? new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'Sin actualizar';
async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...init?.headers } });
    if (response.redirected) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
    return body as T;
}
export default function IntelPage() {
    const [data, setData] = useState<Dashboard>({ records: [], settings: [], runs: [], canEdit: false, total: 0, page: 0, counts: { products: 0, variants: 0, web: 0, types: 0 } });
    const [tab, setTab] = useState('products');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [run, setRun] = useState<Run | null>(null);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [onlyStock, setOnlyStock] = useState(false);
    const [onlyIncluded, setOnlyIncluded] = useState(false);
    const [activeOnly, setActiveOnly] = useState(false);
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<RecordRow | null>(null);
    const stop = useRef(false);
    const [detail, setDetail] = useState<RecordRow[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [revision, setRevision] = useState(0);
    const [listLoading, setListLoading] = useState(false);
    const refresh = useRef(false);
    const cache = useRef(new Map<string, { value: Dashboard; expires: number }>());
    const selection = useRef(0);
    const query = new URLSearchParams({ search, category, stock: onlyStock ? '1' : '0', included: onlyIncluded ? '1' : '0', active: activeOnly ? '1' : '0', page: String(page) }).toString();
    async function reload() {
        cache.current.clear();
        refresh.current = true;
        setRevision(value => value + 1);
    }
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const cached = cache.current.get(query);
        const apply = (next: Dashboard) => {
            setHasLoaded(true); setData(next); setRun(next.runs.find(item => item.status === 'running') ?? null);
        };
        if (cached && cached.expires > Date.now()) { apply(cached.value); setLoading(false); setListLoading(false); return; }
        setListLoading(true);
        const timer = setTimeout(() => {
            const fresh = refresh.current; refresh.current = false;
            api<Dashboard>(`/api/intel?${query}${fresh ? '&fresh=1' : ''}`, { signal: controller.signal }).then(next => {
                if (cancelled) return;
                if (cache.current.size >= 20) cache.current.delete(cache.current.keys().next().value!);
                cache.current.set(query, { value: next, expires: Date.now() + 30_000 }); apply(next); setError('');
            }).catch(cause => { if (!cancelled) setError(cause.message); }).finally(() => {
                if (!cancelled) { setLoading(false); setListLoading(false); }
            });
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
    }, [query, revision]);
    useEffect(() => () => { stop.current = true; }, []);
    async function openProduct(product: RecordRow) {
        const request = ++selection.current;
        setSelected(product); setDetail([]); setDetailLoading(true);
        try {
            const next = await api<{ records: RecordRow[] }>(`/api/intel?product=${product.external_id}`);
            if (selection.current === request) setDetail(next.records);
        } catch (cause) { if (selection.current === request) setError((cause as Error).message); }
        finally { if (selection.current === request) setDetailLoading(false); }
    }
    const types = data.records.filter(item => item.resource === 'types');
    const settings = new Map(data.settings.map(item => [item.category_id, item]));
    const latestCatalog = data.runs.find(item => item.status === 'completed');
    const latest = data.runs.find(item => item.status === 'completed' && item.config?.scope !== 'catalog');
    const catalog = useMemo(() => {
        const byProduct = new Map<string, RecordRow[]>();
        for (const variant of data.records.filter(item => item.resource === 'variants')) {
            const key = variant.product_id || '';
            byProduct.set(key, [...(byProduct.get(key) || []), variant]);
        }
        const stock = new Map<string, number>();
        // Only use a completed capture for stock; missing data stays unknown rather than zero.
        for (const item of data.records.filter(item => item.resource === 'stocks' && item.run_id === latest?.id)) {
            stock.set(String(item.data.variantId), Number(item.data.available));
        }
        return data.records.filter(item => item.resource === 'products').map(product => {
            const children = byProduct.get(product.external_id) || [];
            const quantities = children.filter(item => Number(item.data.state) === 0).map(item => stock.get(item.external_id));
            return { product, children, available: quantities.length && quantities.every(value => value !== undefined) ? quantities.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null };
        });
    }, [data.records, latest?.id]);
    const filtered = catalog;
    async function synchronize() {
        if (busy || loading || !data.canEdit) return;
        stop.current = false; setBusy(true); setError('');
        try {
            let current = run?.status === 'running' ? run : null;
            if (!current) current = (await api<{ run: Run }>('/api/intel/sync', { method: 'POST', body: JSON.stringify({ scope: 'catalog' }) })).run;
            setRun(current);
            while (current.status === 'running' && !stop.current) {
                current = (await api<{ run: Run }>('/api/intel/sync', { method: 'POST', body: JSON.stringify({ runId: current.id }) })).run;
                setRun(current);
            }
            await reload();
        } catch (cause) { setError((cause as Error).message); }
        finally { setBusy(false); }
    }
    async function saveCategory(value: Setting) {
        setError('');
        await api('/api/intel', { method: 'PATCH', body: JSON.stringify(value) });
        await reload();
    }
    return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-indigo-700">Facto · Datos del negocio</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Intel</h1><p className="mt-2 text-sm text-slate-600">Catálogo compartido para analizar productos y preparar futuras decisiones.</p></div><a href="/api/intel/export" className={`${inputClass} font-semibold`}>Exportar catálogo JSON</a></header>
        <a href="/intel/sales" className="inline-block rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">Ventas históricas →</a>
        <a href="/intel/inventory" className="ml-3 inline-block rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">Costos y stock →</a>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" onClick={() => reload()} disabled={listLoading} className="ml-3 rounded-md border border-red-300 px-3 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50">{listLoading ? 'Consultando…' : 'Reintentar consulta'}</button></div>}
        <section aria-label="Sincronización de productos" className="space-y-3 rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-semibold">Actualizar productos desde Bsale</h2><p className="text-sm text-slate-600">{loading ? 'Consultando el estado de sincronización…' : `Última sincronización completa: ${date(latestCatalog?.completed_at)} · Hora de Chile`}</p></div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={loading || busy || !data.canEdit} onClick={() => synchronize()} className={buttonClass}>{busy ? 'Sincronizando productos…' : run?.status === 'running' ? 'Reanudar sincronización de productos' : 'Sincronizar productos'}</button>
                    {busy && <button type="button" onClick={() => { stop.current = true; }} className={inputClass}>Pausar al terminar este lote</button>}
                </div>
            </div>
            <p className="text-xs text-slate-500">Actualiza el catálogo guardado en Intel. No modifica productos en Bsale ni inicia la importación de ventas. Mantén esta página abierta durante la sincronización.</p>
            {run && <p aria-live="polite" className="rounded-lg bg-indigo-50 p-3 text-sm">{run.status === 'completed' ? 'Completado' : labels[run.stage]} · {run.processed} registros procesados · {run.last_error || (run.status === 'completed' ? 'Sincronización terminada' : busy ? 'En curso' : 'Listo para reanudar')}</p>}
        </section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Productos', data.counts.products], ['Variantes', data.counts.variants], ['Fichas web', data.counts.web], ['Categorías', data.counts.types]].map(([label, count]) => <div key={label} className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">{label}</p><strong className={hasLoaded ? "text-2xl" : "text-base"}>{hasLoaded ? count : loading ? 'Cargando…' : 'No disponible'}</strong></div>)}</div>
        <div className="flex gap-2 border-b">{[['products', 'Productos'], ['categories', 'Categorías'], ['sources', 'Fuentes y actualización']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-sm font-semibold ${tab === key ? 'border-b-2 border-indigo-700 text-indigo-700' : 'text-slate-500'}`}>{label}</button>)}</div>
        {loading ? <p role="status">Cargando datos guardados…</p> : tab === 'sources' ? <section className="space-y-4 rounded-xl border bg-white p-5">
            <h2 className="text-xl font-semibold">Bsale</h2><p className="text-sm text-slate-600">Última sincronización completa: {date(latestCatalog?.completed_at)} · Hora de Chile</p>
            <p className="text-sm text-slate-600">Primero importa el catálogo: productos activos e inactivos, variantes, marcas, familias, fichas web, enlaces de imágenes y colecciones. No requiere elegir sucursal ni precios. Conserva esta página abierta; puedes pausar y reanudar sin perder lo guardado. No modifica Bsale ni el avance de ventas.</p>
            <h3 className="font-semibold">Bloques verificados</h3>
            <p className="text-xs text-slate-500">Se comparan los identificadores únicos guardados con el total informado por Bsale. Cada bloque conserva su fecha de verificación; no es una comprobación de todos los campos.</p>
            <table className="w-full text-left text-sm"><thead><tr><th>Bloque</th><th>Bsale</th><th>Guardados</th><th>Verificado (Chile)</th></tr></thead><tbody>{data.records.filter(item => item.resource === 'catalog_checks').map(item => <tr key={item.id} className="border-t"><td className="py-2">{labels[['types', 'brands', 'offices', 'price_lists', 'products', 'variants', 'web', 'collections', 'stocks', 'prices'].indexOf(item.external_id)] || item.name}</td><td>{String(item.data.sourceCount)}</td><td>{String(item.data.importedCount)}</td><td>{date(String(item.data.checkedAt))}</td></tr>)}</tbody></table>
            <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Guardamos datos, respuestas originales, descripciones, URLs e historial de cambios. Las imágenes siguen alojadas en su servidor original: todavía no respaldamos sus archivos. No consultamos listas de precios. Los precios para gráficos se obtendrán de los documentos tributarios y sus descuentos; las ventas históricas se importan por separado.</div>
            <h3 className="font-semibold">Historial</h3>{data.runs.map(item => <p key={item.id} className="border-t py-2 text-sm">{date(item.started_at)} · {item.status === 'completed' ? 'Completa' : 'Pendiente'} · {item.processed} registros{item.last_error ? ` · ${item.last_error}` : ''}</p>)}
        </section> : tab === 'categories' ? <section className="space-y-3"><p className="text-sm text-slate-600">Excluir una categoría afecta su selección para análisis; sus productos se siguen conservando. Los nombres editoriales no cambian Bsale.</p>{types.map(type => <CategoryEditor key={type.external_id} type={type} initial={settings.get(type.external_id)} canEdit={data.canEdit} save={saveCategory} />)}{!types.length && <Empty onClick={() => setTab('sources')} />}</section> : <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3"><input aria-label="Buscar producto o SKU" className={inputClass} placeholder="Producto, SKU o ID…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><select aria-label="Categoría" className={inputClass} value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="">Todas las categorías</option>{types.map(type => <option key={type.external_id} value={type.external_id}>{type.name}</option>)}</select>{[['stock', 'Con stock', onlyStock], ['included', 'Incluidos en análisis', onlyIncluded], ['active', 'Activos', activeOnly]].map(([key, label, checked]) => <label key={String(key)} className="flex gap-2 text-sm"><input type="checkbox" checked={Boolean(checked)} onChange={e => { (key === 'stock' ? setOnlyStock : key === 'included' ? setOnlyIncluded : setActiveOnly)(e.target.checked); setPage(0); }} />{label}</label>)}</div>
            <p aria-live="polite" className="text-xs text-slate-500">{listLoading ? 'Actualizando resultados… · ' : ''}{data.total} productos · Stock de la última sincronización completa: {date(latest?.completed_at)}. “—” significa sin dato confirmado.</p>
            <div className="overflow-auto rounded-xl border bg-white"><table className="w-full min-w-[700px] text-sm"><thead className="bg-slate-50 text-left"><tr>{['Producto', 'Categoría', 'Variantes', 'Disponible', 'Web'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{filtered.map(({ product, children, available }) => {
                const web = data.records.find(item => item.resource === 'web' && item.product_id === product.external_id);
                const url = safeUrl(web?.data.url);
                return <tr key={product.id} className="border-t"><td className="p-3"><button className="text-left font-semibold text-indigo-800 hover:underline" onClick={() => openProduct(product)}>{product.name}</button><p className="text-xs text-slate-500">#{product.external_id} · {Number(product.data.state) === 0 ? 'Activo' : 'Inactivo'}</p></td><td className="p-3">{types.find(type => type.external_id === product.category_id)?.name || 'Sin categoría'}</td><td className="p-3">{children.length}</td><td className="p-3 tabular-nums">{available ?? '—'}</td><td className="p-3">{url ? <a href={url} target="_blank" rel="noreferrer" className="text-indigo-700 underline">Ver producto</a> : 'Sin enlace'}</td></tr>;
            })}</tbody></table></div>{!data.counts.products && <Empty onClick={() => setTab('sources')} />}
            <div className="flex items-center gap-3"><button className={inputClass} disabled={listLoading || data.page === 0} onClick={() => setPage(data.page - 1)}>Anterior</button><span className="text-sm">Página {data.page + 1}</span><button className={inputClass} disabled={listLoading || (data.page + 1) * 50 >= data.total} onClick={() => setPage(data.page + 1)}>Siguiente</button></div>
        </section>}
        {selected && <div className="fixed inset-0 z-50 overflow-auto bg-black/50 p-5" role="dialog" aria-modal="true" aria-label={selected.name}><div className="mx-auto max-w-4xl space-y-5 rounded-xl bg-white p-6"><div className="flex justify-between gap-4"><h2 className="text-xl font-semibold">{selected.name}</h2><button className={inputClass} onClick={() => { selection.current++; setSelected(null); }}>Cerrar</button></div><p className="text-sm">ID Bsale: {selected.external_id} · Consultado: {date(selected.observed_at)}</p><h3 className="font-semibold">Variantes y precio con IVA</h3>{detailLoading && <p aria-live="polite">Cargando detalle del producto…</p>}{detail.filter(item => item.resource === 'variants').filter(item => item.product_id === selected.external_id).map(variant => {
            const price = detail.find(item => item.resource === 'prices' && item.data.variantId === variant.external_id && item.run_id === latest?.id);
            const stock = data.records.find(item => item.resource === 'stocks' && item.data.variantId === variant.external_id && item.run_id === latest?.id);
            return <p key={variant.id} className="border-b py-2 text-sm">{String(variant.data.sku)} · {variant.name} · Código de barras: {String(variant.data.barcode || '—')} · Precio: {price?.data.gross == null ? '—' : `$${Number(price.data.gross).toLocaleString('es-CL')}`} · Disponible: {String(stock?.data.available ?? '—')}</p>;
        })}<h3 className="font-semibold">Publicaciones e imágenes</h3>{detail.filter(item => item.resource === 'web' && item.product_id === selected.external_id).map(web => <section key={web.id} className="space-y-3 rounded-lg border p-4"><p className="font-medium">{web.name} · Ficha #{web.external_id}</p>{safeUrl(web.data.url) && <a className="block text-indigo-700 underline" href={String(web.data.url)} target="_blank" rel="noreferrer">Abrir publicación</a>}<p className="text-sm">Colecciones: {rows(web.data.collections).map(item => String(item.name)).join(', ') || 'Sin colección'}</p><div className="flex flex-wrap gap-3">{rows(web.data.images).filter(image => safeUrl(image.url)).map((image, index) => <a key={index} href={String(image.url)} target="_blank" rel="noreferrer" className="rounded border p-2 text-sm text-indigo-700">Imagen {index + 1}{image.caption ? ` · ${String(image.caption)}` : ''}</a>)}</div><details><summary className="cursor-pointer text-sm">Descripción guardada (HTML)</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{String(web.data.description)}{'\n\n'}{JSON.stringify(web.data.descriptions, null, 2)}</pre></details></section>)}<p className="text-xs text-slate-500">Los enlaces son referencias al servidor original. La exportación contiene el catálogo guardado y las respuestas originales de Bsale.</p></div></div>}
    </div>;
}
function Empty({ onClick }: { onClick: () => void }) { return <div className="rounded-xl border border-dashed p-8 text-center"><p className="mb-3">Primero sincroniza Bsale para guardar el catálogo en Intel.</p><button className={buttonClass} onClick={onClick}>Configurar fuente</button></div>; }
function CategoryEditor({ type, initial, canEdit, save }: { type: RecordRow; initial?: Setting; canEdit: boolean; save: (value: Setting) => Promise<void> }) {
    const [value, setValue] = useState<Setting>(initial || { category_id: type.external_id, included: true, editorial_name: '', parent_name: '', responsible: '', priority: 2 });
    const [status, setStatus] = useState('');
    const [saving, setSaving] = useState(false);
    return <div className="space-y-3 rounded-xl border bg-white p-4"><div className="flex justify-between"><strong>{type.name}</strong><label className="flex gap-2 text-sm"><input type="checkbox" disabled={!canEdit || saving} checked={value.included} onChange={e => setValue({ ...value, included: e.target.checked })} />Incluir en análisis</label></div><div className="flex flex-wrap gap-3">{[['editorial_name', 'Nombre editorial'], ['parent_name', 'Grupo (ej. Pesca)'], ['responsible', 'Responsable']].map(([key, label]) => <label key={key} className="text-xs text-slate-600">{label}<input className={`${inputClass} mt-1 block`} disabled={!canEdit || saving} maxLength={160} value={String(value[key as keyof Setting])} onChange={e => setValue({ ...value, [key]: e.target.value })} /></label>)}<label className="text-xs text-slate-600">Prioridad<select className={`${inputClass} mt-1 block`} disabled={!canEdit || saving} value={value.priority} onChange={e => setValue({ ...value, priority: Number(e.target.value) })}><option value={1}>Alta</option><option value={2}>Media</option><option value={3}>Baja</option></select></label>{canEdit && <button disabled={saving} className={`${buttonClass} self-end`} onClick={async () => { setSaving(true); setStatus(''); try { await save(value); setStatus('Guardado'); } catch (error) { setStatus((error as Error).message); } finally { setSaving(false); } }}>{saving ? 'Guardando…' : 'Guardar'}</button>}</div><p aria-live="polite" className="text-sm">{status}</p></div>;
}
