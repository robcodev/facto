'use client';

import { useMemo, useState, useTransition } from 'react';
import { createCampaignList, getCampaignContext, loadCampaignItems, saveCampaignItems } from './campaign-actions';
import type { CampaignItemInput, CampaignListSummary } from './campaign-actions';
import { getActiveOffices, loadOfficeStocks, loadPriceListProducts } from './actions';
import type { BsaleOfficeOption, BsalePriceList, PriceCatalogRow, VariantStock } from './types';

type DraftItem = CampaignItemInput & { price?: number; productTypeName?: string };
type Mode = 'products' | 'discounts';

export default function CampaignListsModal({ priceLists }: { priceLists: BsalePriceList[] }) {
    const [open, setOpen] = useState(false);
    const [campaigns, setCampaigns] = useState<CampaignListSummary[]>([]);
    const [campaignId, setCampaignId] = useState('');
    const [newName, setNewName] = useState('');
    const [sourceListId, setSourceListId] = useState('');
    const [catalog, setCatalog] = useState<PriceCatalogRow[]>([]);
    const [draft, setDraft] = useState<Map<number, DraftItem>>(new Map());
    const [search, setSearch] = useState('');
    const [family, setFamily] = useState('');
    const [mode, setMode] = useState<Mode>('products');
    const [offices, setOffices] = useState<BsaleOfficeOption[]>([]);
    const [officeId, setOfficeId] = useState('');
    const [stocks, setStocks] = useState<Map<number, VariantStock>>(new Map());
    const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
    const [isPending, startTransition] = useTransition();

    const families = useMemo(() => [...new Set(catalog.map((row) => row.productTypeName))].sort((a, b) => a.localeCompare(b, 'es')), [catalog]);
    const filtered = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('es-CL');
        return catalog.filter((row) => (!family || row.productTypeName === family)
            && (!term || [row.sku, row.productName, row.variantName].some((value) => value.toLocaleLowerCase('es-CL').includes(term))));
    }, [catalog, family, search]);

    function show() {
        setOpen(true);
        setMessage(null);
        setMode('products');
        startTransition(async () => {
            const [campaignResult, officeResult] = await Promise.all([getCampaignContext(), getActiveOffices()]);
            if (!campaignResult.success) return setMessage({ error: true, text: campaignResult.error });
            setCampaigns(campaignResult.lists);
            if (!officeResult.success) return setMessage({ error: true, text: officeResult.error });
            setOffices(officeResult.offices);
            const preferred = officeResult.offices.find((office) => office.name.toLocaleLowerCase('es-CL').includes('casa matriz')) ?? officeResult.offices[0];
            const preferredPriceList = activeLists.find((list) => list.base === 1) ?? activeLists[0];
            if (preferred) setOfficeId(String(preferred.id));
            if (preferredPriceList) setSourceListId(String(preferredPriceList.id));
            if (preferred && preferredPriceList) await loadSourceData(preferredPriceList.id, preferred.id);
        });
    }

    function createList() {
        startTransition(async () => {
            const result = await createCampaignList(newName);
            if (!result.success) return setMessage({ error: true, text: result.error });
            setCampaigns((current) => [result.list, ...current]);
            setCampaignId(String(result.list.id));
            setNewName('');
            setDraft(new Map());
            setMessage({ text: `Lista “${result.list.name}” creada. Ahora agrega sus productos.` });
        });
    }

    function selectCampaign(value: string) {
        setCampaignId(value);
        setDraft(new Map());
        setMessage(null);
        if (!value) return;
        startTransition(async () => {
            const result = await loadCampaignItems(Number(value));
            if (!result.success) return setMessage({ error: true, text: result.error });
            const catalogByVariant = new Map(catalog.map((row) => [row.variantId, row]));
            setDraft(new Map(result.items.map((item) => {
                const row = catalogByVariant.get(item.variantId);
                return [item.variantId, row ? { ...item, price: row.price, productTypeName: row.productTypeName } : item];
            })));
            setMessage({ text: `${result.items.length} productos cargados desde la lista guardada.` });
        });
    }

    async function loadSourceData(priceListId: number, selectedOfficeId: number) {
        const [catalogResult, stockResult] = await Promise.all([
            loadPriceListProducts(priceListId),
            loadOfficeStocks(selectedOfficeId),
        ]);
        if (!catalogResult.success) {
            setMessage({ error: true, text: catalogResult.error });
            return false;
        }
        if (!stockResult.success) {
            setMessage({ error: true, text: stockResult.error });
            return false;
        }
        setCatalog(catalogResult.rows);
        setStocks(new Map(stockResult.stocks.map((stock) => [stock.variantId, stock])));
        const catalogByVariant = new Map(catalogResult.rows.map((row) => [row.variantId, row]));
        setDraft((current) => new Map([...current].map(([variantId, item]) => {
            const row = catalogByVariant.get(variantId);
            return [variantId, row ? { ...item, price: row.price, productTypeName: row.productTypeName } : item];
        })));
        setMessage({ text: `${catalogResult.rows.length.toLocaleString('es-CL')} productos, precios y stock actualizados.` });
        return true;
    }

    function loadCatalog() {
        setMessage(null);
        startTransition(async () => {
            await loadSourceData(Number(sourceListId), Number(officeId));
        });
    }

    function changeSourceList(value: string) {
        setSourceListId(value);
        if (!value || !officeId) return;
        setMessage({ text: 'Actualizando precios y stock…' });
        startTransition(async () => { await loadSourceData(Number(value), Number(officeId)); });
    }

    function openDiscounts() {
        if (!sourceListId || !officeId) {
            setMessage({ error: true, text: 'Selecciona una lista de precios y una sucursal.' });
            return;
        }
        startTransition(async () => {
            const loaded = await loadSourceData(Number(sourceListId), Number(officeId));
            if (loaded) setMode('discounts');
        });
    }

    function refreshStocks(value: string) {
        setOfficeId(value);
        if (!value || catalog.length === 0) return;
        startTransition(async () => {
            const result = await loadOfficeStocks(Number(value));
            if (!result.success) return setMessage({ error: true, text: result.error });
            setStocks(new Map(result.stocks.map((stock) => [stock.variantId, stock])));
            setMessage({ text: 'Stock actualizado para la sucursal seleccionada.' });
        });
    }

    function toggle(row: PriceCatalogRow) {
        setDraft((current) => {
            const next = new Map(current);
            if (next.has(row.variantId)) next.delete(row.variantId);
            else next.set(row.variantId, {
                variantId: row.variantId,
                productId: row.productId,
                sku: row.sku,
                productName: row.productName,
                variantName: row.variantName,
                discount: 0,
                price: row.price,
                productTypeName: row.productTypeName,
            });
            return next;
        });
    }

    function changeDiscount(variantId: number, value: string) {
        const parsed = Number(value.replace(',', '.'));
        if (!Number.isFinite(parsed)) return;
        setDraft((current) => {
            const next = new Map(current);
            const item = next.get(variantId);
            if (item) next.set(variantId, { ...item, discount: parsed });
            return next;
        });
    }

    function save() {
        startTransition(async () => {
            const result = await saveCampaignItems(Number(campaignId), [...draft.values()], true);
            if (!result.success) return setMessage({ error: true, text: result.error });
            setCampaigns((current) => current.map((list) => list.id === Number(campaignId) ? { ...list, itemCount: draft.size } : list));
            setMessage({ text: `Lista guardada con ${draft.size} productos.` });
        });
    }

    const activeLists = priceLists.filter((list) => list.state === 0);
    const draftItems = [...draft.values()];

    return <>
        <button type="button" onClick={show} className="rounded-md bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">Administrar listas de productos</button>
        {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Listas de productos">
            <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
                <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                    <div><h2 className="text-xl font-bold text-gray-900">Listas de productos</h2><p className="text-sm text-gray-500">Primero selecciona productos; luego configura sus descuentos.</p></div>
                    <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm font-semibold text-gray-700">Cerrar</button>
                </header>
                <div className="flex gap-2 border-b border-gray-200 bg-white px-5 py-3">
                    <button type="button" onClick={() => setMode('products')} className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === 'products' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700'}`}>1. Administrar productos</button>
                    <button type="button" onClick={openDiscounts} disabled={!campaignId || isPending} className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 ${mode === 'discounts' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{isPending && mode === 'products' ? 'Cargando precios y stock…' : '2. Modificar descuentos'}</button>
                </div>
                <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_1fr]">
                    <aside className="space-y-5 overflow-y-auto border-b border-gray-200 bg-gray-50 p-4 lg:border-b-0 lg:border-r">
                        <div><label className="text-sm font-semibold text-gray-700">Lista guardada<select value={campaignId} onChange={(event) => selectCampaign(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-normal"><option value="">Seleccionar…</option>{campaigns.map((list) => <option key={list.id} value={list.id}>{list.name} · {list.itemCount}</option>)}</select></label></div>
                        <div className="border-t border-gray-200 pt-4"><p className="text-sm font-semibold text-gray-700">Crear una nueva</p><div className="mt-2 flex gap-2"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nombre de la lista" className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" /><button type="button" onClick={createList} disabled={isPending || newName.trim().length < 2} className="rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Crear</button></div></div>
                        <div className="space-y-3 border-t border-gray-200 pt-4"><label className="text-sm font-semibold text-gray-700">Origen en Bsale<select value={sourceListId} onChange={(event) => changeSourceList(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-normal"><option value="">Lista de precios…</option>{activeLists.map((list) => <option key={list.id} value={list.id}>#{list.id} · {list.name}</option>)}</select></label><label className="text-sm font-semibold text-gray-700">Sucursal para stock<select value={officeId} onChange={(event) => refreshStocks(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-normal"><option value="">Seleccionar…</option>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label><button type="button" onClick={loadCatalog} disabled={isPending || !sourceListId || !officeId} className="w-full rounded-md border border-violet-600 px-3 py-2 text-sm font-semibold text-violet-700 disabled:opacity-40">Actualizar productos y stock</button></div>
                        <div className="rounded-lg border border-violet-200 bg-white p-3"><p className="text-xs font-medium uppercase text-gray-500">Contenido actual</p><p className="mt-1 text-3xl font-bold text-violet-700">{draft.size}</p><p className="text-xs text-gray-500">productos seleccionados</p></div>
                        {message && <p className={`rounded-md px-3 py-2 text-sm ${message.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message.text}</p>}
                    </aside>
                    {mode === 'products' ? <main className="flex min-h-0 flex-col">
                        <div className="grid gap-3 border-b border-gray-200 p-4 sm:grid-cols-[1fr_220px]"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar SKU o producto" className="rounded-md border border-gray-300 px-3 py-2 text-sm" /><select value={family} onChange={(event) => setFamily(event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm"><option value="">Todas las familias</option>{families.map((name) => <option key={name}>{name}</option>)}</select></div>
                        <div className="grid min-h-0 flex-1 xl:grid-cols-2">
                            <section className="min-h-[260px] overflow-y-auto border-b border-gray-200 p-4 xl:border-b-0 xl:border-r"><h3 className="mb-3 font-semibold text-gray-900">Productos de Bsale <span className="font-normal text-gray-500">({filtered.length})</span></h3>{catalog.length === 0 ? <p className="text-sm text-gray-500">Selecciona una lista de precios, una sucursal y carga sus productos.</p> : <div className="space-y-2">{filtered.map((row) => { const stock = stocks.get(row.variantId); return <label key={row.variantId} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${draft.has(row.variantId) ? 'border-violet-400 bg-violet-50' : 'border-gray-200'}`}><input type="checkbox" checked={draft.has(row.variantId)} onChange={() => toggle(row)} /><span className="min-w-0 flex-1"><strong className="block text-gray-900">{row.sku} · {row.productName}</strong><span className="block text-gray-500">{row.variantName || 'Sin variante'} · {row.productTypeName}</span></span><span className="text-right"><strong className="block tabular-nums">${row.price.toLocaleString('es-CL')}</strong><span className={`text-xs ${stock && stock.available <= 0 ? 'font-semibold text-red-600' : 'text-gray-500'}`}>Stock: {stock?.available ?? 0}</span></span></label>; })}</div>}</section>
                            <section className="min-h-[260px] overflow-y-auto p-4"><h3 className="mb-3 font-semibold text-gray-900">Productos agregados <span className="font-normal text-gray-500">({draftItems.length})</span></h3>{draftItems.length === 0 ? <p className="text-sm text-gray-500">La lista está vacía. Agrega productos desde el catálogo.</p> : <div className="space-y-2">{draftItems.map((item) => <div key={item.variantId} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm"><div className="min-w-0"><strong className="block truncate text-gray-900">{item.sku} · {item.productName}</strong><span className="block truncate text-gray-500">{item.variantName || 'Sin variante'}</span></div><span className="text-xs text-gray-500">Stock: <strong className={(stocks.get(item.variantId)?.available ?? 0) <= 0 ? 'text-red-600' : 'text-gray-800'}>{stocks.get(item.variantId)?.available ?? '—'}</strong></span><button type="button" onClick={() => setDraft((current) => { const next = new Map(current); next.delete(item.variantId); return next; })} className="text-xs font-semibold text-red-600">Quitar</button></div>)}</div>}</section>
                        </div>
                    </main> : <main className="min-h-0 overflow-y-auto p-5"><div className="mb-4"><h3 className="text-lg font-semibold text-gray-900">Modificar descuentos</h3><p className="text-sm text-gray-500">Los productos de la lista no cambian en este paso. Ajusta el porcentaje y revisa el precio resultante.</p></div>{draftItems.length === 0 ? <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">Esta lista no tiene productos. Vuelve al paso 1 para agregarlos.</p> : <div className="overflow-x-auto rounded-lg border border-gray-200"><table className="w-full min-w-[760px] divide-y divide-gray-200 text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-3 py-3">SKU</th><th className="px-3 py-3">Producto</th><th className="px-3 py-3 text-right">Precio referencia</th><th className="px-3 py-3 text-right">Descuento</th><th className="px-3 py-3 text-right">Precio resultante</th><th className="px-3 py-3 text-right">Stock</th></tr></thead><tbody className="divide-y divide-gray-100">{draftItems.map((item) => { const finalPrice = item.price == null ? null : Math.round(item.price * (1 - item.discount / 100)); return <tr key={item.variantId}><td className="px-3 py-3 font-medium">{item.sku}</td><td className="px-3 py-3"><strong className="block">{item.productName}</strong><span className="text-gray-500">{item.variantName || 'Sin variante'}</span></td><td className="px-3 py-3 text-right tabular-nums">{item.price == null ? 'Carga la lista Bsale' : `$${item.price.toLocaleString('es-CL')}`}</td><td className="px-3 py-3 text-right"><div className="flex justify-end"><input value={item.discount} onChange={(event) => changeDiscount(item.variantId, event.target.value)} inputMode="decimal" className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-right" /><span className="ml-1 py-1.5">%</span></div></td><td className="px-3 py-3 text-right font-semibold tabular-nums">{finalPrice == null ? '—' : `$${finalPrice.toLocaleString('es-CL')}`}</td><td className="px-3 py-3 text-right tabular-nums">{stocks.get(item.variantId)?.available ?? '—'}</td></tr>; })}</tbody></table></div>}</main>}
                </div>
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4"><p className="text-sm text-gray-500">Guardar aquí no modifica todavía los precios de Bsale.</p><button type="button" onClick={save} disabled={isPending || !campaignId} className="rounded-md bg-green-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{isPending ? 'Guardando…' : `Guardar lista (${draft.size})`}</button></footer>
            </div>
        </div>}
    </>;
}
