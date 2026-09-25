'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { getPriceLists, loadPriceComparison, updatePrices } from './actions';
import CampaignListsModal from './CampaignListsModal';
import type { BsalePriceList, PriceComparisonRow, PriceUpdateResult } from './types';

type EditableRow = PriceComparisonRow & { newPrice: number };
type Scope = 'selected' | 'filtered';

const PAGE_SIZE = 100;
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

function discountFor(row: EditableRow) {
    return row.referencePrice > 0 ? (1 - row.newPrice / row.referencePrice) * 100 : 0;
}

function isChanged(row: EditableRow) {
    return row.currentPrice != null && row.newPrice !== row.currentPrice;
}

export default function PricesPage() {
    const [lists, setLists] = useState<BsalePriceList[]>([]);
    const [referenceId, setReferenceId] = useState('');
    const [editableId, setEditableId] = useState('');
    const [rows, setRows] = useState<EditableRow[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [newestCount, setNewestCount] = useState('');
    const [discountFilter, setDiscountFilter] = useState('');
    const [bulkDiscount, setBulkDiscount] = useState('');
    const [page, setPage] = useState(1);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [riskyConfirmed, setRiskyConfirmed] = useState(false);
    const [lastResults, setLastResults] = useState<PriceUpdateResult[]>([]);
    const [progress, setProgress] = useState('');
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        startTransition(async () => {
            const result = await getPriceLists();
            if (!result.success) return setMessage({ type: 'error', text: result.error });
            setLists(result.lists);
        });
    }, []);

    const newestProductIds = useMemo(() => {
        if (!newestCount) return null;
        const limit = Number(newestCount);
        const ids = [...new Set(rows.map((row) => row.productId))]
            .sort((a, b) => b - a)
            .slice(0, limit);
        return new Set(ids);
    }, [rows, newestCount]);

    const filteredRows = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('es-CL');
        return rows.filter((row) => {
            const matchesText = !term || [row.sku, row.productName, row.variantName]
                .some((value) => value.toLocaleLowerCase('es-CL').includes(term));
            const matchesType = !typeFilter || String(row.productTypeId ?? '') === typeFilter;
            const matchesNewest = !newestProductIds || newestProductIds.has(row.productId);
            const currentDiscount = row.currentPrice == null || row.referencePrice <= 0
                ? null
                : (1 - row.currentPrice / row.referencePrice) * 100;
            const matchesDiscount = !discountFilter
                || (discountFilter === 'none' && currentDiscount != null && Math.abs(currentDiscount) < 0.005)
                || (discountFilter === 'with' && currentDiscount != null && currentDiscount > 0)
                || (discountFilter === 'over50' && currentDiscount != null && currentDiscount > 50)
                || (discountFilter === 'negative' && currentDiscount != null && currentDiscount < 0)
                || (discountFilter === 'missing' && row.currentPrice == null);
            return matchesText && matchesType && matchesNewest && matchesDiscount;
        });
    }, [rows, search, typeFilter, newestProductIds, discountFilter]);

    const productTypes = useMemo(() => {
        const values = new Map<number, string>();
        rows.forEach((row) => {
            if (row.productTypeId != null) values.set(row.productTypeId, row.productTypeName);
        });
        return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
    }, [rows]);

    const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const changedRows = rows.filter(isChanged);
    const riskyRows = changedRows.filter((row) => discountFor(row) > 50 || discountFor(row) < 0);
    const invalidRows = changedRows.filter((row) => row.newPrice <= 0 || !Number.isInteger(row.newPrice) || row.detailId == null);
    const resultByVariant = new Map(lastResults.map((result) => [result.variantId, result]));
    const failedRows = rows.filter((row) => resultByVariant.get(row.variantId)?.success === false);

    function replaceRow(variantId: number, transform: (row: EditableRow) => EditableRow) {
        setRows((current) => current.map((row) => row.variantId === variantId ? transform(row) : row));
        setPreviewOpen(false);
        setLastResults([]);
    }

    function setRowDiscount(variantId: number, value: string) {
        const parsed = Number(value.replace(',', '.'));
        if (!Number.isFinite(parsed)) return;
        replaceRow(variantId, (row) => ({
            ...row,
            newPrice: Math.max(0, Math.round(row.referencePrice * (1 - parsed / 100))),
        }));
    }

    function setRowPrice(variantId: number, value: string) {
        const parsed = Math.round(Number(value));
        if (!Number.isFinite(parsed)) return;
        replaceRow(variantId, (row) => ({ ...row, newPrice: parsed }));
    }

    function toggleSelection(variantId: number) {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(variantId)) next.delete(variantId); else next.add(variantId);
            return next;
        });
    }

    function selectProduct(productId: number) {
        setSelected((current) => {
            const next = new Set(current);
            rows.filter((row) => row.productId === productId).forEach((row) => next.add(row.variantId));
            return next;
        });
    }

    function selectFiltered() {
        setSelected((current) => {
            const next = new Set(current);
            filteredRows.forEach((row) => next.add(row.variantId));
            return next;
        });
    }

    function applyBulk(scope: Scope) {
        const discount = Number(bulkDiscount.replace(',', '.'));
        if (!Number.isFinite(discount)) {
            setMessage({ type: 'error', text: 'Ingresa un porcentaje válido.' });
            return;
        }
        const targets = scope === 'selected'
            ? selected
            : new Set(filteredRows.map((row) => row.variantId));
        if (targets.size === 0) {
            setMessage({ type: 'error', text: scope === 'selected' ? 'Selecciona al menos una variante.' : 'No hay resultados filtrados.' });
            return;
        }
        setRows((current) => current.map((row) => targets.has(row.variantId)
            ? { ...row, newPrice: Math.max(0, Math.round(row.referencePrice * (1 - discount / 100))) }
            : row));
        setMessage(null);
        setPreviewOpen(false);
        setLastResults([]);
    }

    function handleLoad() {
        const reference = Number(referenceId);
        const editable = Number(editableId);
        setMessage(null);
        setRows([]);
        setSelected(new Set());
        setPreviewOpen(false);
        setLastResults([]);
        startTransition(async () => {
            const result = await loadPriceComparison(reference, editable);
            if (!result.success) return setMessage({ type: 'error', text: result.error });
            setRows(result.rows.map((row) => ({ ...row, newPrice: row.currentPrice ?? row.referencePrice })));
            setPage(1);
            setMessage({ type: 'success', text: `Se cargaron ${result.rows.length.toLocaleString('es-CL')} variantes.` });
        });
    }

    async function submit(targetRows: EditableRow[]) {
        setMessage(null);
        const valid = targetRows.filter((row) => row.detailId != null && row.newPrice > 0 && Number.isInteger(row.newPrice));
        const updates = valid.map((row) => ({
            variantId: row.variantId,
            detailId: row.detailId as number,
            grossPrice: row.newPrice,
        }));
        const allResults: PriceUpdateResult[] = [];
        const batchSize = 25;
        for (let start = 0; start < updates.length; start += batchSize) {
            const batch = updates.slice(start, start + batchSize);
            setProgress(`Procesando ${Math.min(start + batch.length, updates.length)} de ${updates.length}…`);
            const result = await updatePrices(Number(editableId), batch);
            if ('error' in result && result.error) {
                setMessage({ type: 'error', text: result.error });
                setProgress('');
                return;
            }
            allResults.push(...result.results);
        }
        setProgress('');
        setLastResults(allResults);
        const succeeded = allResults.filter((item) => item.success);
        const failed = allResults.filter((item) => !item.success);
        const successfulIds = new Set(succeeded.map((item) => item.variantId));
        setRows((current) => current.map((row) => successfulIds.has(row.variantId)
            ? { ...row, currentPrice: row.newPrice }
            : row));
        setPreviewOpen(false);
        setMessage({
            type: failed.length ? 'error' : 'success',
            text: `${succeeded.length} precios actualizados${failed.length ? `; ${failed.length} fallaron y pueden reintentarse.` : ' correctamente.'}`,
        });
    }

    function handleSubmit(targetRows: EditableRow[]) {
        startTransition(() => submit(targetRows));
    }


    const editableList = lists.find((list) => String(list.id) === editableId);

    return (
        <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
            <header>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Campañas y Cyber Days</p>
                <h1 className="mt-1 text-3xl font-bold text-gray-900">Cambios de precios por lotes</h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-600">Compara una lista de referencia con una lista editable. Los precios se muestran con IVA y Bsale recibe automáticamente el valor neto.</p>
            </header>

            <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
                <div><h2 className="font-semibold text-gray-900">Listas guardadas de productos</h2><p className="mt-1 text-sm text-gray-600">Crea, revisa y edita campañas sin modificar Bsale.</p></div>
                <CampaignListsModal priceLists={lists} />
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                    <label className="text-sm font-medium text-gray-700">Lista de referencia
                        <select value={referenceId} onChange={(event) => setReferenceId(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                            <option value="">Seleccionar…</option>
                            {lists.filter((list) => list.state === 0).map((list) => <option key={list.id} value={list.id}>#{list.id} · {list.name}{list.base === 1 ? ' · Base' : ''}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-medium text-gray-700">Lista editable
                        <select value={editableId} onChange={(event) => setEditableId(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                            <option value="">Seleccionar…</option>
                            {lists.filter((list) => list.state === 0).map((list) => <option key={list.id} value={list.id}>#{list.id} · {list.name}</option>)}
                        </select>
                    </label>
                    <button type="button" onClick={handleLoad} disabled={isPending || !referenceId || !editableId || referenceId === editableId} className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                        {isPending && rows.length === 0 ? 'Cargando Bsale…' : 'Comparar listas'}
                    </button>
                </div>
                {referenceId && editableId && referenceId === editableId && <p className="mt-3 text-sm text-red-700">La lista editable debe ser distinta de la lista de referencia.</p>}
            </section>

            {message && <div className={`rounded-md px-4 py-3 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{message.text}</div>}

            {rows.length > 0 && <>
                <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <label className="text-sm font-medium text-gray-700 xl:col-span-2">Buscar SKU o producto
                        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Ej. 2200401074 o Shimano Nasci" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700">Familia
                        <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                            <option value="">Todos</option>
                            {productTypes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-medium text-gray-700">Productos más nuevos
                        <select value={newestCount} onChange={(event) => { setNewestCount(event.target.value); setPage(1); }} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                            <option value="">Todos</option>
                            <option value="50">Últimos 50 productos</option>
                            <option value="100">Últimos 100 productos</option>
                            <option value="250">Últimos 250 productos</option>
                            <option value="500">Últimos 500 productos</option>
                        </select>
                    </label>
                    <label className="text-sm font-medium text-gray-700">Estado del descuento
                        <select value={discountFilter} onChange={(event) => { setDiscountFilter(event.target.value); setPage(1); }} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                            <option value="">Todos</option>
                            <option value="none">Sin descuento</option>
                            <option value="with">Con descuento</option>
                            <option value="over50">Mayor a 50%</option>
                            <option value="negative">Precio sobre referencia</option>
                            <option value="missing">Sin precio editable</option>
                        </select>
                    </label>
                    </div>
                    <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
                    <label className="text-sm font-medium text-gray-700">Descuento
                        <div className="mt-1 flex"><input value={bulkDiscount} onChange={(event) => setBulkDiscount(event.target.value)} inputMode="decimal" className="min-w-0 flex-1 rounded-l-md border border-gray-300 px-3 py-2 text-right" /><span className="rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 py-2">%</span></div>
                    </label>
                    <button type="button" onClick={() => applyBulk('selected')} className="rounded-md border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Aplicar a seleccionados</button>
                    <button type="button" onClick={() => applyBulk('filtered')} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Aplicar a todos los filtrados</button>
                    </div>
                </section>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Summary label="Variantes cargadas" value={rows.length} />
                    <Summary label="Resultados filtrados" value={filteredRows.length} />
                    <Summary label="Seleccionadas" value={selected.size} />
                    <Summary label="Precios modificados" value={changedRows.length} />
                    <Summary label="Advertencias" value={riskyRows.length + invalidRows.length} warning={riskyRows.length + invalidRows.length > 0} />
                </div>

                <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                        <div className="flex gap-2">
                            <button type="button" onClick={selectFiltered} className="text-sm font-semibold text-blue-700 hover:underline">Seleccionar los {filteredRows.length} filtrados</button>
                            <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-gray-600 hover:underline">Limpiar selección</button>
                        </div>
                        <p className="text-sm text-gray-500">Página {page} de {pageCount}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-[1250px] w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr>
                                <th className="px-3 py-3">Sel.</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3">Producto / variante</th><th className="px-3 py-3">Familia</th><th className="px-3 py-3 text-right">Referencia</th><th className="px-3 py-3 text-right">Actual</th><th className="px-3 py-3 text-right">Descuento</th><th className="px-3 py-3 text-right">Nuevo precio</th><th className="px-3 py-3">Estado</th>
                            </tr></thead>
                            <tbody className="divide-y divide-gray-100">{visibleRows.map((row) => {
                                const discount = discountFor(row);
                                const risky = discount > 50 || discount < 0;
                                const invalid = row.newPrice <= 0 || !Number.isInteger(row.newPrice) || row.detailId == null;
                                const result = resultByVariant.get(row.variantId);
                                return <tr key={row.variantId} className={invalid ? 'bg-red-50' : risky ? 'bg-amber-50' : isChanged(row) ? 'bg-blue-50/40' : undefined}>
                                    <td className="px-3 py-3 align-top"><input type="checkbox" checked={selected.has(row.variantId)} onChange={() => toggleSelection(row.variantId)} aria-label={`Seleccionar ${row.sku}`} /></td>
                                    <td className="px-3 py-3 align-top font-medium text-gray-900">{row.sku}</td>
                                    <td className="px-3 py-3 align-top"><p className="font-medium text-gray-900">{row.productName}</p><p className="text-gray-500">{row.variantName || 'Sin descripción'}</p><button type="button" onClick={() => selectProduct(row.productId)} className="mt-1 text-xs font-semibold text-blue-700 hover:underline">Seleccionar todas sus variantes</button></td>
                                    <td className="px-3 py-3 align-top text-gray-600">{row.productTypeName}</td>
                                    <td className="px-3 py-3 text-right align-top tabular-nums">{money.format(row.referencePrice)}</td>
                                    <td className="px-3 py-3 text-right align-top tabular-nums">{row.currentPrice == null ? <span className="text-red-700">Sin detalle</span> : money.format(row.currentPrice)}</td>
                                    <td className="px-3 py-3 text-right align-top"><div className="flex justify-end"><input value={Number.isFinite(discount) ? Math.round(discount * 100) / 100 : ''} onChange={(event) => setRowDiscount(row.variantId, event.target.value)} className={`w-24 rounded-md border px-2 py-1.5 text-right tabular-nums ${risky ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`} /><span className="ml-1 py-1.5">%</span></div></td>
                                    <td className="px-3 py-3 text-right align-top"><input type="number" step="1" value={row.newPrice} onChange={(event) => setRowPrice(row.variantId, event.target.value)} className={`w-32 rounded-md border px-2 py-1.5 text-right tabular-nums ${invalid ? 'border-red-500 bg-red-50' : 'border-gray-300'}`} /></td>
                                    <td className="px-3 py-3 align-top text-xs">{result ? <span className={result.success ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>{result.success ? 'Actualizado' : result.error}</span> : invalid ? <span className="font-semibold text-red-700">No se puede enviar</span> : discount > 50 ? <span className="font-semibold text-amber-700">Descuento mayor a 50%</span> : discount < 0 ? <span className="font-semibold text-amber-700">Precio sobre referencia</span> : isChanged(row) ? <span className="font-semibold text-blue-700">Pendiente</span> : <span className="text-gray-500">Sin cambios</span>}</td>
                                </tr>;
                            })}</tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                        <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40">Anterior</button>
                        <button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40">Siguiente</button>
                    </div>
                </section>

                <section className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
                    <h2 className="font-semibold text-gray-900">Confirmar cambios en Bsale</h2>
                    <p className="mt-1 text-sm text-gray-600">Solo se enviarán precios distintos al valor actual de la lista editable. Los valores visibles incluyen IVA; Bsale recibirá el neto dividido por 1,19.</p>
                    {!previewOpen ? <button type="button" onClick={() => { setPreviewOpen(true); setRiskyConfirmed(false); }} disabled={changedRows.length === 0 || invalidRows.length > 0} className="mt-4 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Revisar {changedRows.length} cambios</button> : <div className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="grid gap-3 sm:grid-cols-3"><Summary label="A actualizar" value={changedRows.length} /><Summary label="Descuento mayor a 50%" value={changedRows.filter((row) => discountFor(row) > 50).length} warning /><Summary label="Sobre referencia" value={changedRows.filter((row) => discountFor(row) < 0).length} warning /></div>
                        <p className="text-sm text-gray-700">Lista de destino: <strong>#{editableList?.id} · {editableList?.name}</strong>. Esta operación modificará precios reales en Bsale.</p>
                        {riskyRows.length > 0 && <label className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900"><input type="checkbox" checked={riskyConfirmed} onChange={(event) => setRiskyConfirmed(event.target.checked)} className="mt-0.5" />Confirmo que revisé los descuentos superiores al 50% y los precios superiores a la referencia.</label>}
                        <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => handleSubmit(changedRows)} disabled={isPending || invalidRows.length > 0 || (riskyRows.length > 0 && !riskyConfirmed)} className="rounded-md bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40">{isPending ? 'Actualizando…' : 'Confirmar y actualizar Bsale'}</button><button type="button" onClick={() => setPreviewOpen(false)} disabled={isPending} className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700">Volver a editar</button>{progress && <span className="text-sm font-medium text-blue-700">{progress}</span>}</div>
                    </div>}
                    {invalidRows.length > 0 && <p className="mt-3 text-sm font-medium text-red-700">Corrige {invalidRows.length} filas con precio inválido o sin detalle en la lista editable.</p>}
                    {failedRows.length > 0 && <button type="button" onClick={() => handleSubmit(failedRows)} disabled={isPending} className="mt-4 rounded-md border border-red-600 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">Reintentar {failedRows.length} fallidos</button>}
                </section>
            </>}
        </div>
    );
}

function Summary({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
    return <div className={`rounded-lg border p-4 ${warning && value > 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p><p className={`mt-1 text-2xl font-bold ${warning && value > 0 ? 'text-amber-800' : 'text-gray-900'}`}>{value.toLocaleString('es-CL')}</p></div>;
}
