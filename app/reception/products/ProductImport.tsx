'use client';

import { useEffect, useRef, useState } from 'react';
import CatalogReader from './CatalogReader';
import { MAX_ROWS, newDocument, problems, type ExtractedRow, type ImportDocument, type ImportGroup, type ImportProject } from '@/lib/reception-products/core';

type Option = { id: number; name: string };
type Meta = { types: Option[]; lists: Option[]; offices: Option[]; drafts: { id: string; number: string; phase: string; updated_at: string }[] };
type Parent = Option & { active: boolean };
const phaseName: Record<ImportDocument['phase'], string> = { draft: 'Revisión del documento', checking: 'Validando SKU en Bsale', review: 'Catálogo validado', creating: 'Creando productos y precios', verifying: 'Comprobación final de variantes', ready: 'Listo para recepcionar', received: 'Recepción confirmada' };
const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-100';
const primary = 'rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';
const secondary = 'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40';
const REVIEW_PAGE_SIZE = 50;
const number = (value: string) => value === '' ? null : Number(value);
async function read<T>(url: string, init?: RequestInit): Promise<T> {
    const r = await fetch(url, { ...init, cache: 'no-store' });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(body?.error || 'No pudimos completar la solicitud. Abre de nuevo el avance antes de reintentar.');
    return body as T;
}
const post = async (body: unknown) => (await read<{ project: ImportProject }>('/api/reception/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(95000) })).project;

export default function ProductImport() {
    const [meta, setMeta] = useState<Meta | null>(null), [project, setProject] = useState<ImportProject | null>(null), [doc, setDoc] = useState<ImportDocument | null>(null);
    const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    const [parents, setParents] = useState<Record<string, Parent[]>>({}), [resolveId, setResolveId] = useState('');
    const [pageIndex, setPageIndex] = useState(0);
    const [seconds, setSeconds] = useState(0); const mounted = useRef(true);
    const set = (p: ImportProject) => { if (mounted.current) { setProject(p); setDoc(structuredClone(p.document)); setDirty(false); } };
    const refresh = async () => setMeta(await read<Meta>('/api/reception/products'));
    useEffect(() => { let active = true; mounted.current = true; read<Meta>('/api/reception/products').then(value => { if (active) setMeta(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; mounted.current = false; }; }, []);
    useEffect(() => { if (!busy) return; const start = Date.now(); const t = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000); return () => clearInterval(t); }, [busy]);
    useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
    const change = (edit: (d: ImportDocument) => void) => { setDoc(old => { if (!old) return old; const next = structuredClone(old); edit(next); return next; }); setDirty(true); };
    const editable = !!doc && ['draft', 'review'].includes(doc.phase) && !busy;
    const save = async (p = project!) => { const saved = await post({ action: 'save', id: p.id, version: p.version, document: doc }); set(saved); return saved; };
    async function run(action: string, extra: Record<string, unknown> = {}) {
        if (!project || busy) return;
        setBusy(true); setSeconds(0); setError(''); setMessage('');
        try {
            let p = dirty && action !== 'link_parent' ? await save() : project;
            p = await post({ action, id: p.id, version: p.version, ...extra }); set(p);
            while (mounted.current && ['checking', 'creating', 'verifying'].includes(p.document.phase) && !p.document.pending && !p.document.lastError) {
                p = await post({ action: 'step', id: p.id, version: p.version }); set(p);
            }
            if (p.document.lastError) setError(p.document.lastError);
            await refresh();
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar el paso.'); }
        finally { if (mounted.current) setBusy(false); }
    }
    async function open(id: string) {
        if (dirty && !window.confirm('Hay cambios sin guardar. ¿Abrir otro avance?')) return;
        setBusy(true); setError(''); setPageIndex(0);
        try { set((await read<{ project: ImportProject }>('/api/reception/products?id=' + id)).project); setParents({}); await refresh(); }
        catch (e) { setError(e instanceof Error ? e.message : 'No pudimos abrir el avance.'); }
        finally { setBusy(false); }
    }
    async function create(items: ExtractedRow[] = [], number = '') {
        const p = await post({ action: 'create', items, number }); setPageIndex(0); set(p); setParents({}); await refresh();
    }
    async function search(group: ImportGroup) {
        try { const result = await read<{ parents: Parent[] }>('/api/reception/products?parents=' + encodeURIComponent(group.name)); setParents(old => ({ ...old, [group.id]: result.parents })); }
        catch (e) { setError(e instanceof Error ? e.message : 'No pudimos buscar productos.'); }
    }
    const issues = doc ? problems(doc) : [];
    const pageCount = Math.max(1,Math.ceil((doc?.rows.length ?? 0)/REVIEW_PAGE_SIZE));
    const currentPage = Math.min(pageIndex,pageCount-1);
    const visibleRows = doc?.rows.slice(currentPage*REVIEW_PAGE_SIZE,(currentPage+1)*REVIEW_PAGE_SIZE) ?? [];
    const visibleGroups = new Set(visibleRows.map(r => r.groupId));
    const nonemptyGroups = new Set(doc?.rows.map(r => r.groupId));
    const checked = doc?.rows.filter(r => r.checked).length ?? 0, variants = doc?.rows.filter(r => r.variantId).length ?? 0;
    return <div className="space-y-5">
        <section className="rounded-xl border bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-60 flex-1 text-sm font-medium">Avances guardados<select className={inputClass + ' mt-1'} disabled={busy} value={project?.id ?? ''} onChange={e => e.target.value && open(e.target.value)}><option value="">Selecciona una importación</option>{meta?.drafts.map(p => <option key={p.id} value={p.id}>{p.number ? `Documento ${p.number}` : 'Sin folio'} · {p.phase} · {new Date(p.updated_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</option>)}</select></label>
                <button className={secondary} disabled={busy || !meta} onClick={async () => { if (dirty && !window.confirm('¿Crear otro avance sin guardar los cambios actuales?')) return; setBusy(true); setError(''); try { await create(); } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos crear el avance.'); } finally { setBusy(false); } }}>Nuevo ingreso manual</button>
                {project && <button className={secondary} disabled={busy} onClick={() => open(project.id)}>Recargar avance</button>}
            </div>
            <CatalogReader disabled={busy} onOpen={id => open(id)} />
        </section>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {message && <p className="text-sm text-slate-600">{message}</p>}
        {busy && <p role="status" className="text-sm font-semibold text-blue-700">{doc ? phaseName[doc.phase] : 'Procesando documento'}… {seconds} s {doc && `· ${checked}/${doc.rows.length} SKU comprobados · ${variants} variantes identificadas`}</p>}
        {doc && project && <>
            <section className="rounded-xl border bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{phaseName[doc.phase]}</h2><span className="text-xs text-slate-500">{dirty ? 'Cambios sin guardar' : 'Avance guardado'}</span></div>
                <div className="grid gap-3 md:grid-cols-4">
                    <label className="text-sm">Folio<input className={inputClass} value={doc.number} disabled={!editable} inputMode="numeric" onChange={e => change(d => { d.number = e.target.value; })} /></label>
                    <label className="text-sm">Tipo de documento<select className={inputClass} value={doc.documentType} disabled={!editable} onChange={e => change(d => { d.documentType = e.target.value as ImportDocument['documentType']; })}>{['FACTURA', 'GUÍA', 'OTRO'].map(t => <option key={t}>{t}</option>)}</select></label>
                    <label className="text-sm">Sucursal<select className={inputClass} value={doc.officeId ?? ''} disabled={!editable} onChange={e => change(d => { d.officeId = number(e.target.value); })}><option value="">Seleccionar</option>{meta?.offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
                    <label className="text-sm">Lista de venta con IVA<select className={inputClass} value={doc.priceListId ?? ''} disabled={!editable} onChange={e => change(d => { d.priceListId = number(e.target.value); })}><option value="">Seleccionar lista CLP</option>{meta?.lists.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
                </div>
                <label className="block text-sm">Comentario<input className={inputClass} value={doc.note} maxLength={1000} disabled={!editable} onChange={e => change(d => { d.note = e.target.value; })} /></label>
                <p className="text-xs text-slate-500">El costo se registra al confirmar la recepción. Solo se guardan precios de variantes nuevas en la lista seleccionada; los SKU existentes mantienen sus precios.</p>
            </section>
            {doc.rows.length > REVIEW_PAGE_SIZE && <nav aria-label="Páginas de variantes" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4 text-sm"><p>Mostrando {currentPage*REVIEW_PAGE_SIZE+1}–{Math.min((currentPage+1)*REVIEW_PAGE_SIZE,doc.rows.length)} de {doc.rows.length} variantes. Se guardan y procesan todas las páginas.</p><div className="flex items-center gap-2"><button className={secondary} disabled={currentPage===0} onClick={()=>setPageIndex(currentPage-1)}>Anterior</button><span>{currentPage+1} / {pageCount}</span><button className={secondary} disabled={currentPage===pageCount-1} onClick={()=>setPageIndex(currentPage+1)}>Siguiente</button></div></nav>}
            {doc.groups.filter(g => visibleGroups.has(g.id) || (currentPage===0 && !nonemptyGroups.has(g.id))).map(group => <section key={group.id} className="overflow-hidden rounded-xl border bg-white">
                <div className="grid gap-3 bg-slate-50 p-4 md:grid-cols-3">
                    <label className="text-sm font-semibold">Producto padre<input className={inputClass} value={group.name} disabled={!editable} onChange={e => change(d => { d.groups.find(g => g.id === group.id)!.name = e.target.value; })} /></label>
                    <label className="text-sm">Tipo de producto<select className={inputClass} value={group.typeId ?? ''} disabled={!editable || !!group.selectedParentId} onChange={e => change(d => { d.groups.find(g => g.id === group.id)!.typeId = number(e.target.value); })}><option value="">Seleccionar para producto nuevo</option>{meta?.types.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
                    <div className="space-y-2"><label className="block text-sm">Usar padre existente (ID)<input type="number" min="1" className={inputClass} value={group.selectedParentId ?? ''} disabled={busy || !!group.productId || !['draft', 'review', 'creating'].includes(doc.phase)} onChange={e => change(d => { d.groups.find(g => g.id === group.id)!.selectedParentId = number(e.target.value); })} /></label><button className={secondary} disabled={busy || group.name.trim().length < 2} onClick={() => search(group)}>Buscar por nombre</button>
                    {parents[group.id] && <select aria-label="Coincidencias de producto padre" className={inputClass} disabled={busy || !!group.productId || !!doc.pending || !['draft', 'review', 'creating'].includes(doc.phase)} value={group.selectedParentId ?? ''} onChange={e => change(d => { d.groups.find(g => g.id === group.id)!.selectedParentId = number(e.target.value); })}><option value="">{parents[group.id].length ? 'Selecciona una coincidencia' : 'Sin coincidencias'}</option>{parents[group.id].map(p => <option key={p.id} value={p.id} disabled={!p.active}>{p.id} · {p.name}{p.active ? '' : ' (inactivo)'}</option>)}</select>}
                    {doc.phase === 'creating' && !group.productId && group.selectedParentId && <button className={primary} disabled={busy || !!doc.pending} onClick={() => run('link_parent', { groupId: group.id, productId: group.selectedParentId })}>Vincular este padre y continuar</button>}
                    {group.productId && <p className="text-xs text-green-700">Padre Bsale #{group.productId}</p>}</div>
                </div>
                <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-y text-xs text-slate-600"><tr>{['SKU', 'Variante', 'Cantidad', 'Costo neto', 'Venta con IVA', 'Estado'].map(h => <th className="px-3 py-3" key={h}>{h}</th>)}<th /></tr></thead><tbody>{visibleRows.filter(r => r.groupId === group.id).map(row => <tr key={row.id} className="border-b align-top">
                    <td className="p-2"><input aria-label="SKU" className={inputClass} value={row.code} disabled={!editable} onChange={e => change(d => { d.rows.find(r => r.id === row.id)!.code = e.target.value; })} /></td>
                    <td className="p-2"><input aria-label="Nombre de variante" className={inputClass} value={row.variantName} disabled={!editable} onChange={e => change(d => { d.rows.find(r => r.id === row.id)!.variantName = e.target.value; })} />{editable && doc.groups.length > 1 && <select aria-label="Producto padre de esta variante" className={inputClass + ' mt-1'} value={row.groupId} onChange={e => change(d => { d.rows.find(r => r.id === row.id)!.groupId = e.target.value; })}>{doc.groups.map(g => <option key={g.id} value={g.id}>{g.name || 'Sin nombre'}</option>)}</select>}</td>
                    {(['quantity', 'cost', 'priceGross'] as const).map((field, index) => <td className="p-2" key={field}><input type="number" min="0" step={field === 'quantity' ? '1' : 'any'} aria-label={['Cantidad', 'Costo neto', 'Precio con IVA'][index]} className={inputClass} value={row[field] ?? ''} disabled={!editable || (field === 'priceGross' && row.existing)} onChange={e => change(d => { d.rows.find(r => r.id === row.id)![field] = number(e.target.value); })} /></td>)}
                    <td className="max-w-64 p-3 text-xs"><span className={row.issue ? 'text-red-700' : row.variantId ? 'text-green-700' : 'text-slate-600'}>{row.issue || (row.existing ? 'Ya existe · precios conservados' : row.priceSaved ? 'Creado · precio guardado' : row.variantId ? 'Variante creada · falta precio' : row.checked ? 'SKU nuevo' : 'Por validar')}</span>{row.matchedName && <p className="mt-1 text-slate-500">{row.matchedName}</p>}</td>
                    <td className="p-2">{editable && <button aria-label="Quitar variante" className="px-2 text-red-700" onClick={() => change(d => { d.rows = d.rows.filter(r => r.id !== row.id); })}>×</button>}</td>
                </tr>)}</tbody></table></div>
                {editable && <div className="flex flex-wrap gap-2 p-3"><button className={secondary} disabled={doc.rows.length>=MAX_ROWS} onClick={() => { setPageIndex(Math.floor(doc.rows.length/REVIEW_PAGE_SIZE)); change(d => { const temp = newDocument([{ code: '', productName: group.name, variantName: '', quantity: null, cost: null, priceGross: null }]); d.rows.push({ ...temp.rows[0], groupId: group.id }); }); }}>+ Variante</button><button className={secondary} onClick={() => change(d => { d.rows = d.rows.filter(r => r.groupId !== group.id); d.groups = d.groups.filter(g => g.id !== group.id); })}>Quitar grupo</button></div>}
            </section>)}
            {editable && <button className={secondary} disabled={doc.rows.length>=MAX_ROWS} onClick={() => { setPageIndex(Math.floor(doc.rows.length/REVIEW_PAGE_SIZE)); change(d => { const temp = newDocument([{ code: '', productName: '', variantName: '', quantity: null, cost: null, priceGross: null }]); d.groups.push(temp.groups[0]); d.rows.push(temp.rows[0]); }); }}>+ Producto padre</button>}
            {editable && issues.length > 0 && <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{issues.slice(0, 6).map((i, index) => <p key={index}>{i}</p>)}</div>}
            {doc.pending && <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm"><h2 className="font-bold">Hay una operación sin confirmar</h2><p>El avance está guardado. No repitas la recepción ni crees otro producto sin revisar Bsale.</p>
                {['product', 'receipt'].includes(doc.pending.kind) && <div className="flex flex-wrap gap-2"><input className={inputClass + ' max-w-60'} type="number" min="1" aria-label="ID confirmado en Bsale" placeholder={doc.pending.kind === 'product' ? 'ID del producto creado' : 'ID de la recepción creada'} value={resolveId} onChange={e => setResolveId(e.target.value)} /><button className={secondary} disabled={busy || Number(resolveId) <= 0} onClick={() => run(doc.pending!.kind === 'product' ? 'resolve_parent' : 'resolve_receipt', doc.pending!.kind === 'product' ? { productId: Number(resolveId) } : { receiptId: Number(resolveId) })}>Comprobar y recuperar resultado</button></div>}
                {['variant', 'price'].includes(doc.pending.kind) && <button className={secondary} disabled={busy} onClick={() => run('step')}>Comprobar si Bsale completó el paso</button>}
                {doc.pending.kind !== 'receipt' && <button className={secondary} disabled={busy} onClick={() => window.confirm('¿Confirmaste en Bsale que esta operación no se completó? Se volverán a comprobar nombre/SKU antes de intentar crear.') && run('retry')}>Confirmé que no se completó: reintentar</button>}
            </section>}
            <footer className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-5">
                {editable && <><button className={secondary} disabled={busy || !dirty} onClick={async () => { setBusy(true); setError(''); try { await save(); } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos guardar.'); } finally { setBusy(false); } }}>Guardar revisión</button><button className={secondary} disabled={busy || issues.length > 0} onClick={() => run('check')}>Validar SKU en Bsale</button></>}
                {doc.phase === 'review' && <button className={primary} disabled={busy || issues.length > 0} onClick={() => window.confirm('Se crearán los productos y variantes que falten y se guardarán sus precios en la lista seleccionada. Todavía no se ingresará stock. ¿Continuar?') && run('start')}>Crear productos y guardar precios</button>}
                {['checking', 'creating', 'verifying'].includes(doc.phase) && !doc.pending && <button className={primary} disabled={busy} onClick={() => run('step')}>Continuar avance guardado</button>}
                {doc.phase === 'ready' && <><button className={secondary} disabled={busy} onClick={() => run('recheck')}>Comprobar catálogo otra vez</button><button className={primary} disabled={busy || doc.rows.some(r => r.issue || !r.active)} onClick={() => window.confirm(`Se ingresará stock de ${doc.rows.length} variantes con los costos netos revisados. ¿Confirmar recepción del documento ${doc.number}?`) && run('receive')}>Confirmar recepción en Bsale</button></>}
                {doc.receiptId && <p className="font-semibold text-green-700">Recepción #{doc.receiptId} confirmada. El stock ya fue ingresado.</p>}
            </footer>
        </>}
    </div>;
}
