'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createCampaignList, getCampaignContext, loadCampaignItems, saveCampaignItems } from './campaign-actions';
import type { CampaignItemInput, CampaignListSummary } from './campaign-actions';
import { getActiveOffices, getPriceLists, loadOfficeStocks, loadPriceComparison, loadPriceListProducts, updatePrices } from './actions';
import type { BsaleOfficeOption, BsalePriceList, PriceCatalogRow, PriceComparisonRow, PriceUpdateResult, VariantStock } from './types';
import { downloadExcel } from '@/lib/xlsx';

type Mode = 'home' | 'quick' | 'campaigns';
type Section = 'home' | 'products' | 'discounts' | 'apply';
type PricedItem = CampaignItemInput & PriceComparisonRow & { newPrice: number };
type SortKey = 'product' | 'sku' | 'newest' | 'finalPrice' | 'discount' | 'stock';
type SortDirection = 'asc' | 'desc';
type DiscountFilter = 'all' | 'without' | 'with' | 'over50' | 'negative' | 'new';
type CatalogFilter = 'all' | 'selected' | 'notSelected' | 'new';
const PAGE_SIZE = 100;
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export default function PricesPage() {
    const [mode, setMode] = useState<Mode>('home');
    const [section, setSection] = useState<Section>('home');
    const [campaigns, setCampaigns] = useState<CampaignListSummary[]>([]);
    const [campaignId, setCampaignId] = useState('');
    const [campaignItems, setCampaignItems] = useState<Map<number, CampaignItemInput>>(new Map());
    const [lists, setLists] = useState<BsalePriceList[]>([]);
    const [offices, setOffices] = useState<BsaleOfficeOption[]>([]);
    const [referenceId, setReferenceId] = useState('');
    const [targetId, setTargetId] = useState('');
    const [officeId, setOfficeId] = useState('');
    const [catalog, setCatalog] = useState<PriceCatalogRow[]>([]);
    const [stocks, setStocks] = useState<Map<number, VariantStock>>(new Map());
    const [priced, setPriced] = useState<PricedItem[]>([]);
    const [search, setSearch] = useState('');
    const [family, setFamily] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('product');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [discountFilter, setDiscountFilter] = useState<DiscountFilter>('all');
    const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all');
    const [page, setPage] = useState(1);
    const [dirty, setDirty] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
    const [progress, setProgress] = useState('');
    const [results, setResults] = useState<PriceUpdateResult[]>([]);
    const [riskAccepted, setRiskAccepted] = useState(false);
    const [bulkDiscount, setBulkDiscount] = useState('');
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        startTransition(async () => {
            const [campaignResult, listResult, officeResult] = await Promise.all([getCampaignContext(), getPriceLists(), getActiveOffices()]);
            if (!campaignResult.success) return setMessage({ error: true, text: campaignResult.error });
            if (!listResult.success) return setMessage({ error: true, text: listResult.error });
            if (!officeResult.success) return setMessage({ error: true, text: officeResult.error });
            const activeLists = listResult.lists.filter((list) => list.state === 0);
            setCampaigns(campaignResult.lists); setLists(activeLists); setOffices(officeResult.offices);
            const base = activeLists.find((list) => list.base === 1) ?? activeLists[0];
            const main = officeResult.offices.find((office) => office.name.toLowerCase().includes('casa matriz')) ?? officeResult.offices[0];
            if (base) setReferenceId(String(base.id));
            if (main) setOfficeId(String(main.id));
        });
    }, []);

    const activeCampaign = campaigns.find((item) => item.id === Number(campaignId));
    const families = useMemo(() => [...new Set((catalog.length ? catalog : priced).map((row) => row.productTypeName))].sort((a, b) => a.localeCompare(b, 'es')), [catalog, priced]);
    const filteredCatalog = useMemo(() => sortCatalogRows(filterRows(catalog, search, family).filter((row) => catalogFilter === 'all' || (catalogFilter === 'selected' && campaignItems.has(row.variantId)) || (catalogFilter === 'notSelected' && !campaignItems.has(row.variantId)) || (catalogFilter === 'new' && campaignItems.get(row.variantId)?.isNew)), campaignItems, stocks, sortKey, sortDirection), [catalog, search, family, catalogFilter, campaignItems, stocks, sortKey, sortDirection]);
    const filteredPrices = useMemo(() => sortPriceRows(filterRows(priced, search, family).filter((item) => discountFilter === 'all' || (discountFilter === 'without' && Math.abs(item.discount) < 0.005) || (discountFilter === 'with' && item.discount > 0) || (discountFilter === 'over50' && item.discount > 50) || (discountFilter === 'negative' && item.discount < 0) || (discountFilter === 'new' && item.isNew)), stocks, sortKey, sortDirection), [priced, search, family, discountFilter, stocks, sortKey, sortDirection]);
    const pageCount = Math.max(1, Math.ceil(filteredCatalog.length / PAGE_SIZE));
    const visibleCatalog = filteredCatalog.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const changed = priced.filter((item) => item.detailId != null && item.currentPrice != null && item.newPrice !== item.currentPrice);
    const risky = priced.filter((item) => item.discount > 50 || item.discount < 0);
    const invalid = priced.filter((item) => item.detailId == null || !Number.isInteger(item.newPrice) || item.newPrice <= 0);

    function enterMode(next: Mode) {
        if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres salir igualmente?')) return;
        setMode(next); setSection('home'); setCampaignId(''); setPriced([]); setCatalog([]); setSearch(''); setFamily(''); setDiscountFilter('all'); setCatalogFilter('all'); setSortKey('product'); setSortDirection('asc'); setPage(1); setDirty(false); setMessage(null); setResults([]); setRiskAccepted(false);
    }

    function openCampaign(id: string) {
        setCampaignId(id); setCampaignItems(new Map()); setPriced([]); setSection('home'); setSearch(''); setFamily(''); setDiscountFilter('all'); setCatalogFilter('all'); setSortKey('product'); setSortDirection('asc'); setPage(1); setDirty(false); setMessage(null);
        startTransition(async () => {
            const result = await loadCampaignItems(Number(id));
            if (!result.success) return setMessage({ error: true, text: result.error });
            setCampaignItems(new Map(result.items.map((item) => [item.variantId, { ...item, isNew: isRecentlyAdded(item.createdAt) }])));
        });
    }

    function createCampaign() {
        startTransition(async () => {
            const result = await createCampaignList(newName);
            if (!result.success) return setMessage({ error: true, text: result.error });
            setCampaigns((current) => [result.list, ...current]); setNewName(''); setCreateOpen(false); openCampaign(String(result.list.id));
        });
    }

    function loadCatalog() {
        setMessage({ text: 'Cargando productos y stock disponible…' });
        startTransition(async () => {
            const [productResult, stockResult] = await Promise.all([loadPriceListProducts(Number(referenceId)), loadOfficeStocks(Number(officeId))]);
            if (!productResult.success) return setMessage({ error: true, text: productResult.error });
            if (!stockResult.success) return setMessage({ error: true, text: stockResult.error });
            setCatalog(productResult.rows); setStocks(new Map(stockResult.stocks.map((stock) => [stock.variantId, stock]))); setPage(1);
            setMessage({ text: `${productResult.rows.length.toLocaleString('es-CL')} productos cargados.` });
        });
    }

    function loadPricing(kind: 'quick' | 'campaign') {
        setMessage({ text: 'Comparando lista base, lista destino y stock…' });
        startTransition(async () => {
            const [priceResult, stockResult] = await Promise.all([loadPriceComparison(Number(referenceId), Number(targetId)), loadOfficeStocks(Number(officeId))]);
            if (!priceResult.success) return setMessage({ error: true, text: priceResult.error });
            if (!stockResult.success) return setMessage({ error: true, text: stockResult.error });
            const rows = kind === 'quick' ? priceResult.rows : priceResult.rows.filter((row) => campaignItems.has(row.variantId));
            const next = rows.map((row) => {
                const saved = campaignItems.get(row.variantId);
                const targetPrice = row.currentPrice ?? row.referencePrice;
                const targetDiscount = row.referencePrice > 0 ? (1 - targetPrice / row.referencePrice) * 100 : 0;
                const hasSavedCampaignDiscount = kind === 'campaign' && saved != null && Math.abs(saved.discount) >= 0.005;
                const discount = hasSavedCampaignDiscount ? saved.discount : targetDiscount;
                const newPrice = hasSavedCampaignDiscount ? Math.max(0, Math.round(row.referencePrice * (1 - discount / 100))) : targetPrice;
                return { ...(saved ?? { variantId: row.variantId, productId: row.productId, sku: row.sku, productName: row.productName, variantName: row.variantName, discount }), ...row, discount, newPrice };
            });
            setStocks(new Map(stockResult.stocks.map((stock) => [stock.variantId, stock]))); setPriced(next); setDirty(false); setResults([]); setRiskAccepted(false);
            setMessage({ text: `${next.length.toLocaleString('es-CL')} productos comparados.` });
        });
    }

    function toggleProduct(row: PriceCatalogRow) {
        setCampaignItems((current) => { const next = new Map(current); if (next.has(row.variantId)) next.delete(row.variantId); else next.set(row.variantId, { variantId: row.variantId, productId: row.productId, sku: row.sku, productName: row.productName, variantName: row.variantName, discount: 0, isNew: true }); return next; });
        setDirty(true);
    }

    function changeDiscount(variantId: number, value: string) {
        const discount = Number(value.replace(',', '.')); if (!Number.isFinite(discount)) return;
        setPriced((current) => current.map((item) => item.variantId === variantId ? { ...item, discount, newPrice: Math.max(0, Math.round(item.referencePrice * (1 - discount / 100))) } : item)); setDirty(true);
    }

    function changeFinalPrice(variantId: number, value: string) {
        const newPrice = Math.round(Number(value.replace(/[^0-9,-]/g, '').replace(',', '.'))); if (!Number.isFinite(newPrice)) return;
        setPriced((current) => current.map((item) => item.variantId === variantId ? { ...item, newPrice, discount: item.referencePrice > 0 ? (1 - newPrice / item.referencePrice) * 100 : 0 } : item)); setDirty(true);
    }

    function applyBulkDiscountToZero() {
        const discount = Number(bulkDiscount.replace(',', '.'));
        if (!Number.isFinite(discount) || discount <= 0 || discount >= 100) return;
        const zeroDiscountIds = new Set(priced.filter((item) => Math.abs(item.discount) < 0.005).map((item) => item.variantId));
        if (zeroDiscountIds.size === 0) return;
        setPriced((current) => current.map((item) => zeroDiscountIds.has(item.variantId)
            ? { ...item, discount, newPrice: Math.max(1, Math.round(item.referencePrice * (1 - discount / 100))) }
            : item));
        setResults([]); setDirty(true); setMessage({ text: `Descuento de ${discount}% preparado para todos los ${zeroDiscountIds.size} productos que estaban en 0%. Revisa los precios antes de enviarlos.` });
    }

    function saveProducts() {
        startTransition(async () => {
            const items = [...campaignItems.values()]; const result = await saveCampaignItems(Number(campaignId), items, true);
            if (!result.success) return setMessage({ error: true, text: result.error });
            const inserted = new Set(result.insertedVariantIds);
            setCampaignItems((current) => new Map([...current].map(([id, item]) => [id, { ...item, createdAt: item.createdAt ?? new Date().toISOString(), isNew: inserted.has(id) || item.isNew }])));
            setCampaigns((current) => current.map((list) => list.id === Number(campaignId) ? { ...list, itemCount: items.length } : list)); setDirty(false); setMessage({ text: `Campaña guardada con ${items.length} productos. ${inserted.size ? `${inserted.size} nuevos quedaron identificados.` : ''}`.trim() });
        });
    }

    function exportCampaign() {
        const rows = sortPriceRows(priced, stocks, sortKey, sortDirection);
        downloadExcel(activeCampaign?.name ?? 'lista-descuentos', 'Descuentos', rows, [
            { header: 'SKU', value: (item) => item.sku, width: 18 },
            { header: 'Producto', value: (item) => item.productName, width: 38 },
            { header: 'Variante', value: (item) => item.variantName, width: 26 },
            { header: 'Familia', value: (item) => item.productTypeName, width: 24 },
            { header: 'Precio base', value: (item) => item.referencePrice, width: 16, numberFormat: 'integer' },
            { header: 'Precio actual', value: (item) => item.currentPrice ?? '', width: 16, numberFormat: 'integer' },
            { header: 'Descuento', value: (item) => item.discount, width: 14, numberFormat: 'percent' },
            { header: 'Precio final', value: (item) => item.newPrice, width: 16, numberFormat: 'integer' },
            { header: 'Stock disponible', value: (item) => stocks.get(item.variantId)?.available ?? 0, width: 18, numberFormat: 'integer' },
            { header: 'Agregado recientemente', value: (item) => item.isNew ? 'Sí' : 'No', width: 22 },
        ]);
    }

    function exportCampaignProducts() {
        const rows = [...campaignItems.values()].sort((a, b) => a.productName.localeCompare(b.productName, 'es') || a.variantName.localeCompare(b.variantName, 'es') || a.sku.localeCompare(b.sku, 'es', { numeric: true }));
        downloadExcel(activeCampaign?.name ?? 'productos-cyber', 'Productos Cyber', rows, [
            { header: 'SKU', value: (item) => item.sku, width: 18 },
            { header: 'Producto', value: (item) => item.productName, width: 42 },
            { header: 'Variante', value: (item) => item.variantName, width: 28 },
            { header: 'Descuento guardado', value: (item) => item.discount, width: 20, numberFormat: 'percent' },
            { header: 'Agregado recientemente', value: (item) => item.isNew ? 'Sí' : 'No', width: 22 },
            { header: 'Fecha de incorporación', value: (item) => item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-CL') : '', width: 22 },
        ]);
    }

    function saveDiscounts() {
        const items = priced.map(({ variantId, productId, sku, productName, variantName, discount, createdAt, isNew }) => ({ variantId, productId, sku, productName, variantName, discount, createdAt, isNew }));
        startTransition(async () => {
            const result = await saveCampaignItems(Number(campaignId), items, true);
            if (!result.success) return setMessage({ error: true, text: result.error });
            setCampaignItems(new Map(items.map((item) => [item.variantId, item]))); setDirty(false); setMessage({ text: 'Descuentos guardados. Puedes volver cuando quieras antes de aplicarlos.' });
        });
    }

    function applyToBsale(retryFailed = false) {
        const previousResults = retryFailed ? results : [];
        const failedIds = new Set(previousResults.filter((item) => !item.success).map((item) => item.detailId));
        const itemsToSend = retryFailed ? changed.filter((item) => item.detailId != null && failedIds.has(item.detailId)) : changed;
        setResults(retryFailed ? previousResults : []); setProgress('');
        startTransition(async () => {
            const updates = itemsToSend.map((item) => ({ variantId: item.variantId, detailId: item.detailId as number, grossPrice: item.newPrice })); const retried: PriceUpdateResult[] = [];
            for (let start = 0; start < updates.length; start += 25) {
                const batch = updates.slice(start, start + 25); setProgress(`Actualizando ${Math.min(start + batch.length, updates.length)} de ${updates.length}…`);
                const result = await updatePrices(Number(targetId), batch); if ('error' in result && result.error) return setMessage({ error: true, text: result.error }); retried.push(...result.results);
            }
            const retriedByDetail = new Map(retried.map((item) => [item.detailId, item]));
            const all = retryFailed ? previousResults.map((item) => retriedByDetail.get(item.detailId) ?? item) : retried;
            setResults(all); setProgress(''); setDirty(false); const failed = all.filter((item) => !item.success).length;
            const firstError = all.find((item) => !item.success)?.error;
            setMessage(failed ? { error: true, text: `${all.length - failed} precios actualizados y ${failed} fallidos.${firstError ? ` Bsale respondió: ${firstError}` : ''}` } : { text: `${all.length} precios actualizados correctamente en Bsale.` });
        });
    }

    const configuration = <div className="grid gap-4 rounded-xl border bg-white p-5 shadow-sm md:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <Select label="Lista base de referencia" value={referenceId} setValue={(value) => { setReferenceId(value); setPriced([]); }} options={lists.map((list) => [String(list.id), `${list.base === 1 ? 'Base · ' : ''}${list.name}`])} />
        <Select label="Lista que se modificará" value={targetId} setValue={(value) => { setTargetId(value); setPriced([]); }} options={lists.map((list) => [String(list.id), list.name])} />
        <Select label="Sucursal para stock" value={officeId} setValue={(value) => { setOfficeId(value); setPriced([]); }} options={offices.map((office) => [String(office.id), office.name])} />
        <button onClick={() => loadPricing(mode === 'quick' ? 'quick' : 'campaign')} disabled={isPending || !referenceId || !targetId || !officeId || referenceId === targetId || (mode === 'campaigns' && campaignItems.size === 0)} className="self-end rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{isPending ? 'Cargando…' : 'Comparar precios'}</button>
    </div>;

    return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        <header><p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Precios y campañas</p><h1 className="mt-1 text-3xl font-bold text-gray-900">Gestión de precios</h1><p className="mt-2 text-sm text-gray-600">Compara siempre contra la lista base antes de guardar o enviar cambios a Bsale.</p></header>
        {mode !== 'home' && <button onClick={() => enterMode('home')} className="rounded-md border bg-white px-3 py-2 text-sm font-semibold text-gray-700">← Volver al inicio</button>}
        {message && <div className={`rounded-lg px-4 py-3 text-sm ${message.error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{message.text}</div>}
        {mode === 'home' && <Home onQuick={() => enterMode('quick')} onCampaigns={() => enterMode('campaigns')} />}
        {mode === 'quick' && <section className="space-y-5"><Title title="Cambio rápido" subtitle="Compara listas completas y aplica directamente los cambios cuando los confirmes." />{configuration}{priced.length > 0 && <><PricingWorkspace items={filteredPrices} stocks={stocks} search={search} setSearch={setSearch} family={family} setFamily={setFamily} families={families} discountFilter={discountFilter} setDiscountFilter={setDiscountFilter} sortKey={sortKey} setSortKey={setSortKey} sortDirection={sortDirection} setSortDirection={setSortDirection} onDiscount={changeDiscount} onPrice={changeFinalPrice} /><QuickBulkDiscount value={bulkDiscount} setValue={setBulkDiscount} count={priced.filter((item) => Math.abs(item.discount) < 0.005).length} apply={applyBulkDiscountToZero} /></>}{priced.length > 0 && <ApplyPanel changed={changed} risky={risky} invalid={invalid} riskAccepted={riskAccepted} setRiskAccepted={setRiskAccepted} isPending={isPending} progress={progress} results={results} apply={() => applyToBsale(false)} retryFailed={() => applyToBsale(true)} targetName={lists.find((list) => String(list.id) === targetId)?.name ?? ''} />}</section>}
        {mode === 'campaigns' && !campaignId && <CampaignList campaigns={campaigns} open={openCampaign} create={() => setCreateOpen(true)} />}
        {mode === 'campaigns' && campaignId && <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-3"><button onClick={() => leaveCampaign(setCampaignId, setSection, setPriced, setCatalog, setDirty, dirty)} className="rounded-md border px-3 py-2 text-sm">← Campañas</button><Title title={activeCampaign?.name ?? 'Campaña'} subtitle={`${campaignItems.size} productos guardados`} /><button type="button" onClick={exportCampaignProducts} disabled={campaignItems.size === 0 || isPending} className="ml-auto rounded-md border border-green-600 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40">Descargar lista en Excel</button></div>
            {section === 'home' && <CampaignMenu count={campaignItems.size} open={setSection} />}
            {section !== 'home' && <button onClick={() => { if (!dirty || window.confirm('Hay cambios sin guardar. ¿Quieres salir igualmente?')) { setSection('home'); setPriced([]); setCatalog([]); setDirty(false); } }} className="rounded-md border px-3 py-2 text-sm">← Menú de la campaña</button>}
            {section === 'products' && <div className="space-y-5"><Title title="Productos de la campaña" subtitle="Agrega o quita productos hoy y continúa cuando quieras." /><div className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-[1fr_1fr_auto]"><Select label="Lista base para buscar productos" value={referenceId} setValue={setReferenceId} options={lists.map((list) => [String(list.id), list.name])} /><Select label="Sucursal para stock" value={officeId} setValue={setOfficeId} options={offices.map((office) => [String(office.id), office.name])} /><button onClick={loadCatalog} disabled={isPending || !referenceId || !officeId} className="self-end rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Cargar productos</button></div>{catalog.length > 0 && <><Filters search={search} setSearch={(value) => { setSearch(value); setPage(1); }} family={family} setFamily={(value) => { setFamily(value); setPage(1); }} families={families} catalogFilter={catalogFilter} setCatalogFilter={(value) => { setCatalogFilter(value); setPage(1); }} sortKey={sortKey} setSortKey={(value) => { setSortKey(value); setPage(1); }} sortDirection={sortDirection} setSortDirection={(value) => { setSortDirection(value); setPage(1); }} /><CatalogTable rows={visibleCatalog} selected={campaignItems} stocks={stocks} toggle={toggleProduct} /><Pager page={page} count={pageCount} total={filteredCatalog.length} setPage={setPage} /></>}<SaveBar text={`${campaignItems.size} productos`} dirty={dirty} disabled={!dirty || isPending} save={saveProducts} label="Guardar productos" /></div>}
            {(section === 'discounts' || section === 'apply') && <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><Title title={section === 'discounts' ? 'Preparar descuentos' : 'Revisar y aplicar'} subtitle={section === 'discounts' ? 'Guarda el trabajo sin modificar todavía Bsale.' : 'Elige el destino final y confirma antes de enviar.'} />{priced.length > 0 && <button onClick={exportCampaign} className="rounded-md border border-green-600 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">Descargar Excel</button>}</div>{configuration}{priced.length > 0 && section === 'discounts' && <><PricingWorkspace items={filteredPrices} stocks={stocks} search={search} setSearch={setSearch} family={family} setFamily={setFamily} families={families} discountFilter={discountFilter} setDiscountFilter={setDiscountFilter} sortKey={sortKey} setSortKey={setSortKey} sortDirection={sortDirection} setSortDirection={setSortDirection} onDiscount={changeDiscount} onPrice={changeFinalPrice} /><SaveBar text={`${priced.length} precios preparados`} dirty={dirty} disabled={!dirty || invalid.length > 0 || isPending} save={saveDiscounts} label="Guardar descuentos" /></>}{priced.length > 0 && section === 'apply' && <><Filters search={search} setSearch={setSearch} family={family} setFamily={setFamily} families={families} discountFilter={discountFilter} setDiscountFilter={setDiscountFilter} sortKey={sortKey} setSortKey={setSortKey} sortDirection={sortDirection} setSortDirection={setSortDirection} /><PriceTable items={filteredPrices} stocks={stocks} readonly onDiscount={changeDiscount} onPrice={changeFinalPrice} /><ApplyPanel changed={changed} risky={risky} invalid={invalid} riskAccepted={riskAccepted} setRiskAccepted={setRiskAccepted} isPending={isPending} progress={progress} results={results} apply={() => applyToBsale(false)} retryFailed={() => applyToBsale(true)} targetName={lists.find((list) => String(list.id) === targetId)?.name ?? ''} /></>}</div>}
        </section>}
        {createOpen && <CampaignModal name={newName} setName={setNewName} close={() => setCreateOpen(false)} create={createCampaign} pending={isPending} />}
    </div>;
}

function filterRows<T extends { sku: string; productName: string; variantName: string; productTypeName: string }>(rows: T[], search: string, family: string) { const term = search.trim().toLowerCase(); return rows.filter((row) => (!family || row.productTypeName === family) && (!term || [row.sku, row.productName, row.variantName].some((value) => value.toLowerCase().includes(term)))); }
function isRecentlyAdded(createdAt?: string) { return Boolean(createdAt && Date.now() - new Date(createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000); }
function directionValue(value: number, direction: SortDirection) { return direction === 'asc' ? value : -value; }
function sortCatalogRows(rows: PriceCatalogRow[], selected: Map<number, CampaignItemInput>, stocks: Map<number, VariantStock>, key: SortKey, direction: SortDirection) {
    return [...rows].sort((a, b) => {
        let result = 0;
        if (key === 'sku') result = a.sku.localeCompare(b.sku, 'es', { numeric: true });
        else if (key === 'newest') result = a.productId - b.productId || a.variantId - b.variantId;
        else if (key === 'finalPrice') result = a.price - b.price;
        else if (key === 'stock') result = (stocks.get(a.variantId)?.available ?? 0) - (stocks.get(b.variantId)?.available ?? 0);
        else result = a.productName.localeCompare(b.productName, 'es') || a.variantName.localeCompare(b.variantName, 'es');
        result = directionValue(result, direction);
        return result || Number(selected.get(b.variantId)?.isNew) - Number(selected.get(a.variantId)?.isNew);
    });
}
function sortPriceRows(rows: PricedItem[], stocks: Map<number, VariantStock>, key: SortKey, direction: SortDirection) {
    return [...rows].sort((a, b) => {
        let result = 0;
        if (key === 'sku') result = a.sku.localeCompare(b.sku, 'es', { numeric: true });
        else if (key === 'newest') result = a.productId - b.productId || a.variantId - b.variantId;
        else if (key === 'finalPrice') result = a.newPrice - b.newPrice;
        else if (key === 'discount') result = a.discount - b.discount;
        else if (key === 'stock') result = (stocks.get(a.variantId)?.available ?? 0) - (stocks.get(b.variantId)?.available ?? 0);
        else result = a.productName.localeCompare(b.productName, 'es') || a.variantName.localeCompare(b.variantName, 'es');
        return directionValue(result, direction);
    });
}
function leaveCampaign(setId: (v: string) => void, setSection: (v: Section) => void, setPriced: (v: PricedItem[]) => void, setCatalog: (v: PriceCatalogRow[]) => void, setDirty: (v: boolean) => void, dirty: boolean) { if (!dirty || window.confirm('Hay cambios sin guardar. ¿Quieres salir igualmente?')) { setId(''); setSection('home'); setPriced([]); setCatalog([]); setDirty(false); } }
function Home({ onQuick, onCampaigns }: { onQuick: () => void; onCampaigns: () => void }) { return <div className="grid gap-5 lg:grid-cols-2"><button onClick={onQuick} className="rounded-2xl border bg-white p-7 text-left shadow-sm hover:border-blue-400"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-blue-700">Cambios inmediatos</span><h2 className="mt-4 text-2xl font-bold">Cambio rápido</h2><p className="mt-2 text-gray-600">Compara dos listas completas, calcula descuentos y aplica los precios directamente.</p><p className="mt-5 font-semibold text-blue-700">Abrir cambio rápido →</p></button><button onClick={onCampaigns} className="rounded-2xl border bg-white p-7 text-left shadow-sm hover:border-violet-400"><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold uppercase text-violet-700">Trabajo guardado</span><h2 className="mt-4 text-2xl font-bold">Campañas especiales</h2><p className="mt-2 text-gray-600">Prepara Cyber Days por etapas y aplica los cambios cuando llegue el momento.</p><p className="mt-5 font-semibold text-violet-700">Ver campañas guardadas →</p></button></div>; }
function CampaignList({ campaigns, open, create }: { campaigns: CampaignListSummary[]; open: (id: string) => void; create: () => void }) { return <section className="space-y-4"><div className="flex items-center justify-between"><Title title="Campañas guardadas" subtitle="Puedes retomar productos, descuentos o aplicación en días distintos." /><button onClick={create} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white">Nueva campaña</button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{campaigns.map((campaign) => <button key={campaign.id} onClick={() => open(String(campaign.id))} className="rounded-xl border bg-white p-5 text-left shadow-sm hover:border-violet-400"><div className="flex items-start justify-between gap-3"><strong className="text-lg">{campaign.name}</strong><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{campaign.itemCount} productos</span></div><p className="mt-4 text-sm font-semibold text-violet-700">Abrir campaña →</p></button>)}</div></section>; }
function CampaignMenu({ count, open }: { count: number; open: (section: Section) => void }) { return <div className="grid gap-4 md:grid-cols-3"><CampaignAction title="1. Productos" text="Agrega o quita productos y consulta su stock." action="Administrar productos" onClick={() => open('products')} /><CampaignAction title="2. Descuentos" text="Compara referencia y destino; guarda descuentos." action="Preparar descuentos" disabled={!count} onClick={() => open('discounts')} /><CampaignAction title="3. Aplicar en Bsale" text="Revisa lo guardado y envíalo cuando decidas." action="Revisar y aplicar" disabled={!count} onClick={() => open('apply')} /></div>; }
function Title({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-xl font-bold text-gray-900">{title}</h2><p className="text-sm text-gray-600">{subtitle}</p></div>; }
function Select({ label, value, setValue, options }: { label: string; value: string; setValue: (value: string) => void; options: string[][] }) { return <label className="text-sm font-medium text-gray-700">{label}<select value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2"><option value="">Seleccionar…</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
function CampaignAction({ title, text, action, onClick, disabled = false }: { title: string; text: string; action: string; onClick: () => void; disabled?: boolean }) { return <button onClick={onClick} disabled={disabled} className="rounded-xl border bg-white p-5 text-left shadow-sm hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-40"><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 min-h-12 text-sm text-gray-600">{text}</p><p className="mt-4 text-sm font-semibold text-violet-700">{action} →</p></button>; }
function Filters({ search, setSearch, family, setFamily, families, discountFilter, setDiscountFilter, catalogFilter, setCatalogFilter, sortKey, setSortKey, sortDirection, setSortDirection }: { search: string; setSearch: (value: string) => void; family: string; setFamily: (value: string) => void; families: string[]; discountFilter?: DiscountFilter; setDiscountFilter?: (value: DiscountFilter) => void; catalogFilter?: CatalogFilter; setCatalogFilter?: (value: CatalogFilter) => void; sortKey: SortKey; setSortKey: (value: SortKey) => void; sortDirection: SortDirection; setSortDirection: (value: SortDirection) => void }) { return <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_210px_210px_150px]"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar SKU o producto" className="rounded-md border px-3 py-2" /><select value={family} onChange={(event) => setFamily(event.target.value)} className="rounded-md border px-3 py-2"><option value="">Todas las familias</option>{families.map((name) => <option key={name}>{name}</option>)}</select>{discountFilter && setDiscountFilter && <select value={discountFilter} onChange={(event) => setDiscountFilter(event.target.value as DiscountFilter)} className="rounded-md border px-3 py-2"><option value="all">Todos los descuentos</option><option value="without">Sin descuento</option><option value="with">Con descuento</option><option value="new">Agregados recientemente</option><option value="over50">Descuento mayor a 50%</option><option value="negative">Precio sobre la referencia</option></select>}{catalogFilter && setCatalogFilter && <select value={catalogFilter} onChange={(event) => setCatalogFilter(event.target.value as CatalogFilter)} className="rounded-md border px-3 py-2"><option value="all">Todos los productos</option><option value="selected">Agregados a la lista</option><option value="notSelected">Sin agregar</option><option value="new">Agregados recientemente</option></select>}<select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="rounded-md border px-3 py-2"><option value="product">Ordenar por producto</option><option value="sku">Ordenar por SKU</option><option value="newest">Productos más nuevos</option><option value="finalPrice">{catalogFilter ? 'Precio base' : 'Precio final'}</option>{discountFilter && <option value="discount">Porcentaje descuento</option>}<option value="stock">Stock disponible</option></select><button type="button" onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')} className="rounded-md border px-3 py-2 text-sm font-semibold">{sortDirection === 'asc' ? 'Ascendente ↑' : 'Descendente ↓'}</button></div>; }
function Pager({ page, count, total, setPage }: { page: number; count: number; total: number; setPage: (value: number) => void }) { return <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Anterior</button><span className="text-sm">{total} resultados · Página {page} de {count}</span><button disabled={page >= count} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Siguiente</button></div>; }
function SaveBar({ text, dirty, disabled, save, label }: { text: string; dirty: boolean; disabled: boolean; save: () => void; label: string }) { return <div className="sticky bottom-3 flex items-center justify-between rounded-xl border bg-white/95 p-4 shadow-lg"><div><strong>{text}</strong><p className={`text-xs ${dirty ? 'text-amber-700' : 'text-green-700'}`}>{dirty ? 'Cambios sin guardar' : 'Todo guardado'}</p></div><button onClick={save} disabled={disabled} className="rounded-md bg-violet-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{label}</button></div>; }
function QuickBulkDiscount({ value, setValue, count, apply }: { value: string; setValue: (value: string) => void; count: number; apply: () => void }) { const numeric = Number(value.replace(',', '.')); const invalid = !Number.isFinite(numeric) || numeric <= 0 || numeric >= 100; return <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="flex flex-wrap items-end justify-between gap-4"><div><h3 className="font-bold text-blue-950">Descuento para todos los productos en 0%</h3><p className="mt-1 text-sm text-blue-800">Se aplicará a los {count} productos que están en 0%, independientemente de los filtros. Todavía no modifica Bsale.</p></div><div className="flex items-end gap-2"><label className="text-sm font-medium text-blue-950">Descuento<div className="mt-1 flex overflow-hidden rounded-md border border-blue-300 bg-white"><input value={value} onChange={(event) => setValue(event.target.value)} onFocus={(event) => event.currentTarget.select()} inputMode="decimal" placeholder="Ej. 10" className="w-24 px-3 py-2 text-right outline-none" /><span className="border-l bg-blue-100 px-3 py-2">%</span></div></label><button type="button" onClick={apply} disabled={invalid || count === 0} className="rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Aplicar a todos en 0%</button></div></div></div>; }
function CatalogTable({ rows, selected, stocks, toggle }: { rows: PriceCatalogRow[]; selected: Map<number, CampaignItemInput>; stocks: Map<number, VariantStock>; toggle: (row: PriceCatalogRow) => void }) { return <div className="max-h-[55vh] overflow-auto rounded-xl border bg-white shadow-sm"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-3 py-3">Agregar</th><th>SKU</th><th>Producto</th><th>Familia</th><th className="text-right">Precio base</th><th className="px-3 text-right">Stock disponible</th></tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.variantId} className={selected.has(row.variantId) ? 'bg-violet-50' : ''}><td className="px-3 py-3"><input type="checkbox" checked={selected.has(row.variantId)} onChange={() => toggle(row)} /></td><td className="font-medium">{row.sku}</td><td><div className="flex items-center gap-2"><strong>{row.productName}</strong>{selected.get(row.variantId)?.isNew && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold uppercase text-green-700">Nuevo</span>}</div><span className="text-gray-500">{row.variantName}</span></td><td>{row.productTypeName}</td><td className="text-right">{money.format(row.price)}</td><td className="px-3 text-right font-semibold">{stocks.get(row.variantId)?.available ?? 0}</td></tr>)}</tbody></table></div>; }
function PricingWorkspace({ items, stocks, search, setSearch, family, setFamily, families, discountFilter, setDiscountFilter, sortKey, setSortKey, sortDirection, setSortDirection, onDiscount, onPrice }: { items: PricedItem[]; stocks: Map<number, VariantStock>; search: string; setSearch: (value: string) => void; family: string; setFamily: (value: string) => void; families: string[]; discountFilter: DiscountFilter; setDiscountFilter: (value: DiscountFilter) => void; sortKey: SortKey; setSortKey: (value: SortKey) => void; sortDirection: SortDirection; setSortDirection: (value: SortDirection) => void; onDiscount: (id: number, value: string) => void; onPrice: (id: number, value: string) => void }) { return <div className="space-y-4"><Filters search={search} setSearch={setSearch} family={family} setFamily={setFamily} families={families} discountFilter={discountFilter} setDiscountFilter={setDiscountFilter} sortKey={sortKey} setSortKey={setSortKey} sortDirection={sortDirection} setSortDirection={setSortDirection} /><PriceTable items={items} stocks={stocks} onDiscount={onDiscount} onPrice={onPrice} /></div>; }
function PriceTable({ items, stocks, onDiscount, onPrice, readonly = false }: { items: PricedItem[]; stocks: Map<number, VariantStock>; onDiscount: (id: number, value: string) => void; onPrice: (id: number, value: string) => void; readonly?: boolean }) { return <div className="max-h-[58vh] overflow-auto rounded-xl border bg-white shadow-sm"><table className="w-full min-w-[950px] text-sm"><thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-3 py-3">SKU</th><th>Producto</th><th className="text-right">Precio base</th><th className="text-right">Descuento %</th><th className="text-right">Precio final</th><th className="px-3 text-right">Stock</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.variantId} className={item.discount > 50 || item.discount < 0 ? 'bg-amber-50' : item.isNew ? 'bg-green-50' : ''}><td className="px-3 py-3 font-medium">{item.sku}</td><td><div className="flex items-center gap-2"><strong>{item.productName}</strong>{item.isNew && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold uppercase text-green-700">Nuevo</span>}</div><span className="text-gray-500">{item.variantName}</span></td><td className="text-right">{money.format(item.referencePrice)}</td><td className="text-right">{readonly ? `${item.discount.toFixed(2)}%` : <PercentInput sku={item.sku} value={item.discount} change={(value) => onDiscount(item.variantId, value)} />}</td><td className="text-right">{readonly ? <strong>{money.format(item.newPrice)}</strong> : <PriceInput sku={item.sku} value={item.newPrice} change={(value) => onPrice(item.variantId, value)} />}</td><td className="px-3 text-right">{stocks.get(item.variantId)?.available ?? '—'}</td></tr>)}</tbody></table></div>; }
function PercentInput({ sku, value, change }: { sku: string; value: number; change: (value: string) => void }) { return <div className="ml-auto flex w-24 overflow-hidden rounded-md border bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"><input aria-label={`Descuento porcentual para ${sku}`} inputMode="decimal" value={Math.round(value * 100) / 100} onFocus={(event) => event.currentTarget.select()} onChange={(event) => change(event.target.value)} className="min-w-0 flex-1 px-2 py-1.5 text-right outline-none" /><span className="border-l bg-gray-50 px-2 py-1.5 text-gray-500">%</span></div>; }
function PriceInput({ sku, value, change }: { sku: string; value: number; change: (value: string) => void }) { return <div className="ml-auto flex w-32 overflow-hidden rounded-md border bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"><span className="border-r bg-gray-50 px-2 py-1.5 text-gray-500">$</span><input aria-label={`Precio final para ${sku}`} inputMode="numeric" value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => change(event.target.value)} className="min-w-0 flex-1 px-2 py-1.5 text-right font-semibold outline-none" /></div>; }
function ApplyPanel({ changed, risky, invalid, riskAccepted, setRiskAccepted, isPending, progress, results, apply, retryFailed, targetName }: { changed: PricedItem[]; risky: PricedItem[]; invalid: PricedItem[]; riskAccepted: boolean; setRiskAccepted: (value: boolean) => void; isPending: boolean; progress: string; results: PriceUpdateResult[]; apply: () => void; retryFailed: () => void; targetName: string }) { const failed = results.filter((item) => !item.success); return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4"><Metric label="Cambios reales" value={changed.length} /><Metric label="Descuentos > 50%" value={risky.filter((item) => item.discount > 50).length} warning /><Metric label="Sobre precio base" value={risky.filter((item) => item.discount < 0).length} warning /><Metric label="Precios inválidos" value={invalid.length} warning /></div>{risky.length > 0 && <label className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} />Confirmo que revisé los descuentos mayores al 50% y los precios superiores a la referencia.</label>}<div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm"><h3 className="font-bold">Aplicar en {targetName || 'la lista seleccionada'}</h3><p className="mt-1 text-sm text-gray-600">Esta es la única acción que modifica Bsale. Se enviarán {changed.length} precios modificados.</p><div className="mt-4 flex flex-wrap gap-3"><button onClick={apply} disabled={isPending || changed.length === 0 || invalid.length > 0 || (risky.length > 0 && !riskAccepted)} className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{isPending ? progress || 'Actualizando…' : 'Confirmar y actualizar Bsale'}</button>{failed.length > 0 && <button onClick={retryFailed} disabled={isPending} className="rounded-md border border-red-600 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-40">Reintentar {failed.length} fallidos</button>}</div>{results.length > 0 && <p className={`mt-3 text-sm font-medium ${failed.length ? 'text-red-700' : 'text-green-700'}`}>{results.filter((item) => item.success).length} correctos · {failed.length} fallidos.</p>}</div></div>; }
function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) { return <div className={`rounded-xl border p-4 ${warning && value > 0 ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}><p className="text-xs font-medium uppercase text-gray-500">{label}</p><p className={`mt-1 text-2xl font-bold ${warning && value > 0 ? 'text-amber-800' : 'text-gray-900'}`}>{value}</p></div>; }
function CampaignModal({ name, setName, close, create, pending }: { name: string; setName: (value: string) => void; close: () => void; create: () => void; pending: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">Nueva campaña</h2><p className="mt-1 text-sm text-gray-600">Quedará guardada para continuarla cuando quieras.</p><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Cyber noviembre 2026" className="mt-5 w-full rounded-md border px-3 py-2" /><div className="mt-5 flex justify-end gap-2"><button onClick={close} className="rounded-md border px-4 py-2 text-sm font-semibold">Cancelar</button><button onClick={create} disabled={pending || name.trim().length < 2} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Crear campaña</button></div></div></div>; }
