'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import { getProductResearchDraft, publishProductDescriptions, saveProductResearchDraft } from './actions';
import type { ProductResearchDraft, WebCatalogGap } from './types';

const confidenceLabel = { low: 'Baja', medium: 'Media', high: 'Alta' } as const;

export default function ResearchModal({ product, onClose }: { product: WebCatalogGap; onClose: () => void }) {
    const [draft, setDraft] = useState<ProductResearchDraft | null>(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loadingDraft, startLoadingDraft] = useTransition();
    const [researching, setResearching] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [saving, startSaving] = useTransition();

    useEffect(() => {
        startLoadingDraft(async () => {
            const result = await getProductResearchDraft(product.productId);
            if (!result.success) { setError(result.error); return; }
            setDraft(result.draft);
        });
    }, [product.productId]);

    async function research() {
        setError(''); setMessage(''); setResearching(true);
        try {
            const response = await fetch('/api/web-catalog/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(product) });
            const body = await response.json() as { draft?: ProductResearchDraft; error?: string };
            if (!response.ok || !body.draft) throw new Error(body.error || 'No pudimos investigar el producto.');
            setDraft(body.draft);
            setMessage('Investigación guardada como borrador.');
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos investigar el producto.'); }
        finally { setResearching(false); }
    }

    function save(status: ProductResearchDraft['status']) {
        if (!draft) return;
        setError(''); setMessage('');
        startSaving(async () => {
            const result = await saveProductResearchDraft({ ...draft, status });
            if (!result.success) { setError(result.error); return; }
            setDraft(result.draft);
            setMessage(status === 'approved' ? 'Borrador aprobado. Bsale no fue modificado.' : 'Borrador guardado.');
        });
    }

    async function copy(value: string, label: string) {
        await navigator.clipboard.writeText(value);
        setMessage(`${label} copiado.`);
    }

    async function publish() {
        if (!draft || publishing || saving) return;
        if (!product.webMarketInfoId) { setError('Este producto todavía no tiene una ficha web en Bsale. Créala en Bsale antes de publicar las descripciones.'); return; }
        const confirmed = window.confirm(`Se reemplazarán en Bsale la descripción principal y la pestaña “Información técnica” de ${product.productName}. ¿Quieres continuar?`);
        if (!confirmed) return;
        setError(''); setMessage(''); setPublishing(true);
        try {
            const approvedDraft = { ...draft, status: 'approved' as const };
            const saved = await saveProductResearchDraft(approvedDraft);
            if (!saved.success) throw new Error(saved.error);
            const result = await publishProductDescriptions(product.webMarketInfoId, saved.draft);
            if (!result.success) throw new Error(result.error);
            setDraft(saved.draft);
            setMessage('Descripción principal e Información técnica publicadas y verificadas en Bsale.');
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos publicar las descripciones.'); }
        finally { setPublishing(false); }
    }

    return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Investigación de ${product.productName}`}>
        <div className="my-4 w-full max-w-6xl rounded-2xl bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-2xl border-b bg-white p-5">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Investigación de producto</p><h2 className="mt-1 text-xl font-bold text-gray-900">{product.productName}</h2><p className="mt-1 text-sm text-gray-500">ID {product.productId} · {product.brandName} · {product.variants.map((item) => item.sku).filter(Boolean).join(', ')}</p></div>
                <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm font-semibold">Cerrar</button>
            </header>
            <div className="space-y-5 p-5">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
                {message && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
                <section className="grid gap-3 lg:grid-cols-2"><CurrentDescription title="Descripción actual en Bsale" value={product.currentDescription} empty="Este producto no tiene una descripción web disponible." /><CurrentDescription title="Información técnica actual" value={product.currentAdditionalDescription} empty="Este producto no tiene una descripción adicional llamada Información técnica." /></section>
                {loadingDraft ? <p className="py-8 text-center text-sm text-gray-600">Buscando un borrador guardado…</p> : !draft ? <section className="rounded-xl border border-dashed p-8 text-center"><h3 className="font-bold text-gray-900">Todavía no hemos investigado este producto</h3><p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600">Gemini buscará la marca, modelo y SKU en internet. La operación puede tardar hasta un minuto.</p><button type="button" onClick={research} disabled={researching} className="mt-4 rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{researching ? 'Investigando en internet…' : 'Investigar y generar borrador'}</button></section> : <>
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="text-sm text-gray-500">Confianza general</p><p className="font-bold text-gray-900">{confidenceLabel[draft.confidence]}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={research} disabled={researching || saving || publishing} className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50">{researching ? 'Investigando…' : 'Volver a investigar'}</button><button type="button" onClick={() => save('draft')} disabled={saving || publishing} className="rounded-md border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Guardar borrador</button><button type="button" onClick={() => save('approved')} disabled={saving || publishing} className="rounded-md border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Aprobar borrador</button><button type="button" onClick={publish} disabled={saving || publishing || !product.webMarketInfoId} title={!product.webMarketInfoId ? 'Primero debes crear la ficha web en Bsale' : undefined} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{publishing ? 'Publicando y verificando…' : 'Publicar en Bsale'}</button></div></section>
                    {draft.warnings.length > 0 && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-bold text-amber-900">Requiere revisión</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></section>}
                    <section className="rounded-xl border"><div className="border-b p-4"><h3 className="font-bold text-gray-900">Características encontradas</h3><p className="mt-1 text-sm text-gray-500">La selección queda guardada como parte de la revisión. Si descartas un dato, quítalo también de los textos antes de aprobar.</p></div><div className="overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Usar</th><th>Característica</th><th>Valor</th><th>Confianza</th><th>Fuentes</th></tr></thead><tbody className="divide-y">{draft.facts.map((fact, index) => <tr key={`${fact.label}-${index}`}><td className="px-4 py-3"><input type="checkbox" checked={fact.accepted} onChange={(event) => setDraft({ ...draft, facts: draft.facts.map((item, factIndex) => factIndex === index ? { ...item, accepted: event.target.checked } : item) })} /></td><td className="font-medium">{fact.label}</td><td>{fact.value}</td><td>{confidenceLabel[fact.confidence]}</td><td>{fact.sourceIndexes.map((sourceIndex) => sourceIndex + 1).join(', ') || '—'}</td></tr>)}</tbody></table></div></section>
                    <section className="grid gap-4 lg:grid-cols-2"><HtmlEditor title="Bloque 1 · Descripción principal" value={draft.blockOneHtml} onChange={(value) => setDraft({ ...draft, blockOneHtml: value })} onCopy={() => copy(draft.blockOneHtml, 'Bloque 1')} /><HtmlEditor title="Bloque 2 · Información técnica" value={draft.blockTwoHtml} onChange={(value) => setDraft({ ...draft, blockTwoHtml: value })} onCopy={() => copy(draft.blockTwoHtml, 'Bloque 2')} /></section>
                    <section className="rounded-xl border p-4"><h3 className="font-bold text-gray-900">Fuentes</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">{draft.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">{source.title}</a></li>)}</ol></section>
                </>}
            </div>
        </div>
    </div>;
}

function CurrentDescription({ title, value, empty }: { title: string; value: string; empty: string }) {
    return <section className="rounded-xl border bg-gray-50 p-4"><h3 className="font-semibold text-gray-900">{title}</h3>{value ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-700">{value}</pre> : <p className="mt-2 text-sm text-gray-500">{empty}</p>}</section>;
}

function HtmlEditor({ title, value, onChange, onCopy }: { title: string; value: string; onChange: (value: string) => void; onCopy: () => void }) {
    const [mode, setMode] = useState<'visual' | 'code'>('visual');
    const visualEditor = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (mode === 'visual' && visualEditor.current && document.activeElement !== visualEditor.current) {
            visualEditor.current.innerHTML = sanitizePreviewHtml(value);
        }
    }, [mode, value]);

    function changeMode(nextMode: 'visual' | 'code') {
        if (mode === 'visual' && visualEditor.current) onChange(visualEditor.current.innerHTML);
        setMode(nextMode);
    }

    return <div className="overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
            <h3 className="font-bold text-gray-900">{title}</h3>
            <button type="button" onClick={onCopy} className="rounded-md border px-3 py-1 text-xs font-semibold">Copiar HTML</button>
        </div>
        <div className="flex gap-1 border-b bg-gray-50 px-3 pt-2" role="tablist" aria-label={`Vista de ${title}`}>
            <EditorTab active={mode === 'visual'} onClick={() => changeMode('visual')}>Vista previa</EditorTab>
            <EditorTab active={mode === 'code'} onClick={() => changeMode('code')}>Código HTML</EditorTab>
        </div>
        {mode === 'visual' ? <>
            <div
                ref={visualEditor}
                contentEditable
                suppressContentEditableWarning
                onBlur={(event) => onChange(event.currentTarget.innerHTML)}
                className="min-h-96 p-5 text-sm leading-7 text-gray-800 outline-none focus:bg-emerald-50/20 [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-4 [&_table]:w-full [&_td]:border-b [&_td]:p-2 [&_th]:border-b [&_th]:p-2"
                aria-label={`${title}, edición visual`}
            />
            <p className="border-t bg-gray-50 px-3 py-2 text-xs text-gray-500">Puedes hacer clic sobre el contenido y editarlo directamente.</p>
        </> : <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={18} spellCheck={false} className="block w-full resize-y p-3 font-mono text-xs outline-none" aria-label={`${title}, código HTML`} />}
    </div>;
}

function EditorTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`rounded-t-md border border-b-0 px-3 py-2 text-xs font-semibold ${active ? 'bg-white text-emerald-800' : 'border-transparent text-gray-500'}`}>{children}</button>;
}

function sanitizePreviewHtml(value: string) {
    const documentValue = new DOMParser().parseFromString(value, 'text/html');
    documentValue.querySelectorAll('script, style, iframe, object, embed, form').forEach((element) => element.remove());
    documentValue.querySelectorAll('*').forEach((element) => {
        for (const attribute of Array.from(element.attributes)) {
            if (attribute.name.toLowerCase().startsWith('on') || /javascript:/i.test(attribute.value)) element.removeAttribute(attribute.name);
        }
    });
    return documentValue.body.innerHTML;
}
