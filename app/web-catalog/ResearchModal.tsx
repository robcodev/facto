'use client';

import { useEffect, useState, useTransition } from 'react';
import { getProductResearchDraft, saveProductResearchDraft } from './actions';
import type { ProductResearchDraft, WebCatalogGap } from './types';

const confidenceLabel = { low: 'Baja', medium: 'Media', high: 'Alta' } as const;

export default function ResearchModal({ product, onClose }: { product: WebCatalogGap; onClose: () => void }) {
    const [draft, setDraft] = useState<ProductResearchDraft | null>(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loadingDraft, startLoadingDraft] = useTransition();
    const [researching, setResearching] = useState(false);
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

    return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Investigación de ${product.productName}`}>
        <div className="my-4 w-full max-w-6xl rounded-2xl bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-2xl border-b bg-white p-5">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Investigación de producto</p><h2 className="mt-1 text-xl font-bold text-gray-900">{product.productName}</h2><p className="mt-1 text-sm text-gray-500">ID {product.productId} · {product.brandName} · {product.variants.map((item) => item.sku).filter(Boolean).join(', ')}</p></div>
                <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm font-semibold">Cerrar</button>
            </header>
            <div className="space-y-5 p-5">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
                {message && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
                <section className="rounded-xl border bg-gray-50 p-4"><h3 className="font-semibold text-gray-900">Descripción actual en Bsale</h3>{product.currentDescription ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-700">{product.currentDescription}</pre> : <p className="mt-2 text-sm text-gray-500">Este producto no tiene una descripción web disponible.</p>}</section>
                {loadingDraft ? <p className="py-8 text-center text-sm text-gray-600">Buscando un borrador guardado…</p> : !draft ? <section className="rounded-xl border border-dashed p-8 text-center"><h3 className="font-bold text-gray-900">Todavía no hemos investigado este producto</h3><p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600">Gemini buscará la marca, modelo y SKU en internet. La operación puede tardar hasta un minuto.</p><button type="button" onClick={research} disabled={researching} className="mt-4 rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{researching ? 'Investigando en internet…' : 'Investigar y generar borrador'}</button></section> : <>
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="text-sm text-gray-500">Confianza general</p><p className="font-bold text-gray-900">{confidenceLabel[draft.confidence]}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={research} disabled={researching || saving} className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50">{researching ? 'Investigando…' : 'Volver a investigar'}</button><button type="button" onClick={() => save('draft')} disabled={saving} className="rounded-md border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Guardar borrador</button><button type="button" onClick={() => save('approved')} disabled={saving} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Aprobar borrador</button></div></section>
                    {draft.warnings.length > 0 && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-bold text-amber-900">Requiere revisión</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></section>}
                    <section className="rounded-xl border"><div className="border-b p-4"><h3 className="font-bold text-gray-900">Características encontradas</h3><p className="mt-1 text-sm text-gray-500">Desmarca cualquier dato que no quieras aceptar en este borrador.</p></div><div className="overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Usar</th><th>Característica</th><th>Valor</th><th>Confianza</th><th>Fuentes</th></tr></thead><tbody className="divide-y">{draft.facts.map((fact, index) => <tr key={`${fact.label}-${index}`}><td className="px-4 py-3"><input type="checkbox" checked={fact.accepted} onChange={(event) => setDraft({ ...draft, facts: draft.facts.map((item, factIndex) => factIndex === index ? { ...item, accepted: event.target.checked } : item) })} /></td><td className="font-medium">{fact.label}</td><td>{fact.value}</td><td>{confidenceLabel[fact.confidence]}</td><td>{fact.sourceIndexes.map((sourceIndex) => sourceIndex + 1).join(', ') || '—'}</td></tr>)}</tbody></table></div></section>
                    <section className="grid gap-4 lg:grid-cols-2"><HtmlEditor title="Bloque 1 · Descripción principal" value={draft.blockOneHtml} onChange={(value) => setDraft({ ...draft, blockOneHtml: value })} onCopy={() => copy(draft.blockOneHtml, 'Bloque 1')} /><HtmlEditor title="Bloque 2 · Información técnica" value={draft.blockTwoHtml} onChange={(value) => setDraft({ ...draft, blockTwoHtml: value })} onCopy={() => copy(draft.blockTwoHtml, 'Bloque 2')} /></section>
                    <section className="rounded-xl border p-4"><h3 className="font-bold text-gray-900">Fuentes</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">{draft.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">{source.title}</a></li>)}</ol></section>
                </>}
            </div>
        </div>
    </div>;
}

function HtmlEditor({ title, value, onChange, onCopy }: { title: string; value: string; onChange: (value: string) => void; onCopy: () => void }) {
    return <div className="rounded-xl border"><div className="flex items-center justify-between border-b p-3"><h3 className="font-bold text-gray-900">{title}</h3><button type="button" onClick={onCopy} className="rounded-md border px-3 py-1 text-xs font-semibold">Copiar HTML</button></div><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={18} spellCheck={false} className="block w-full resize-y rounded-b-xl p-3 font-mono text-xs outline-none" /></div>;
}
