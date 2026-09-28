'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createCampaignList, getCampaignContext, loadCampaignItems, saveCampaignItems } from './campaign-actions';
import type { CampaignItemInput, CampaignListSummary } from './campaign-actions';
import { getActiveOffices, getPriceLists, loadOfficeStocks, loadPriceComparison, loadPriceListProducts, updatePrices } from './actions';
import type { BsaleOfficeOption, BsalePriceList, PriceCatalogRow, PriceComparisonRow, PriceUpdateResult, VariantStock } from './types';

type Mode = 'home' | 'quick' | 'campaigns';
type Section = 'home' | 'products' | 'discounts' | 'apply';
type PricedItem = CampaignItemInput & PriceComparisonRow & { newPrice: number };
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
    const [quickSelected, setQuickSelected] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState('');
    const [family, setFamily] = useState('');
    const [page, setPage] = useState(1);
    const [bulkDiscount, setBulkDiscount] = useState('');
    const [dirty, setDirty] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
    const [progress, setProgress] = useState('');
    const [results, setResults] = useState<PriceUpdateResult[]>([]);
    const [riskAccepted, setRiskAccepted] = useState(false);
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
    const filteredCatalog = useMemo(() => filterRows(catalog, search, family), [catalog, search, family]);
    const filteredPrices = useMemo(() => filterRows(priced, search, family), [priced, search, family]);
    const pageCount = Math.max(1, Math.ceil(filteredCatalog.length / PAGE_SIZE));
    const visibleCatalog = filteredCatalog.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const changed = priced.filter((item) => item.detailId != null && item.currentPrice != null && item.newPrice !== item.currentPrice);
    const risky = priced.filter((item) => item.discount > 50 || item.discount < 0);
    const invalid = priced.filter((item) => item.detailId == null || !Number.isInteger(item.newPrice) || item.newPrice <= 0);

    function enterMode(next: Mode) {
        if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres salir igualmente?')) return;
        setMode(next); setSection('home'); setCampaignId(''); setPriced([]); setCatalog([]); setSearch(''); setFamily(''); setDirty(false); setMessage(null); setResults([]); setRiskAccepted(false);
    }

    function openCampaign(id: string) {
        setCampaignId(id); setCampaignItems(new Map()); setPriced([]); setSection('home'); setDirty(false); setMessage(null);
        startTransition(async () => {
            const result = await loadCampaignItems(Number(id));
            if (!result.success) return setMessage({ error: true, text: result.error });
            setCampaignItems(new Map(result.items.map((item) => [item.variantId, item])));
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
                const discount = kind === 'campaign' ? saved?.discount ?? 0 : row.currentPrice == null || row.referencePrice <= 0 ? 0 : (1 - row.currentPrice / row.referencePrice) * 100;
                const newPrice = kind === 'campaign' ? Math.max(0, Math.round(row.referencePrice * (1 - discount / 100))) : row.currentPrice ?? row.referencePrice;
                return { ...(saved ?? { variantId: row.variantId, productId: row.productId, sku: row.sku, productName: row.productName, variantName: row.variantName, discount }), ...row, discount, newPrice };
            });
            setStocks(new Map(stockResult.stocks.map((stock) => [stock.variantId, stock]))); setPriced(next); setQuickSelected(new Set()); setDirty(false); setResults([]); setRiskAccepted(false);
            setMessage({ text: `${next.length.toLocaleString('es-CL')} productos comparados.` });
        });
    }

    function toggleProduct(row: PriceCatalogRow) {
        setCampaignItems((current) => { const next = new Map(current); if (next.has(row.variantId)) next.delete(row.variantId); else next.set(row.variantId, { variantId: row.variantId, productId: row.productId, sku: row.sku, productName: row.productName, variantName: row.variantName, discount: 0 }); return next; });
        setDirty(true);
    }

    function changeDiscount(variantId: number, value: string) {
        const discount = Number(value.replace(',', '.')); if (!Number.isFinite(discount)) return;
        setPriced((current) => current.map((item) => item.variantId === variantId ? { ...item, discount, newPrice: Math.max(0, Math.round(item.referencePrice * (1 - discount / 100))) } : item)); setDirty(true);
    }

    function applyBulkDiscount() {
        const discount = Number(bulkDiscount.replace(',', '.')); if (!Number.isFinite(discount)) return setMessage({ error: true, text: 'Ingresa un descuento válido.' });
        const selectedOnly = mode === 'quick' && quickSelected.size > 0;
        setPriced((current) => current.map((item) => selectedOnly && !quickSelected.has(item.variantId) ? item : { ...item, discount, newPrice: Math.max(0, Math.round(item.referencePrice * (1 - discount / 100))) })); setDirty(true);
    }

    function saveProducts() {
        startTransition(async () => {
            const items = [...campaignItems.values()]; const result = await saveCampaignItems(Number(campaignId), items, true);
            if (!result.success) return setMessage({ error: true, text: result.error });
            setCampaigns((current) => current.map((list) => list.id === Number(campaignId) ? { ...list, itemCount: items.length } : list)); setDirty(false); setMessage({ text: `Campaña guardada con ${items.length} productos.` });
        });
    }

    function saveDiscounts() {
        const items = priced.map(({ variantId, productId, sku, productName, variantName, discount }) => ({ variantId, productId, sku, productName, variantName, discount }));
        startTransition(async () => {
            const result = await saveCampaignItems(Number(campaignId), items, true);
            if (!result.success) return setMessage({ error: true, text: result.error });
            setCampaignItems(new Map(items.map((item) => [item.variantId, item]))); setDirty(false); setMessage({ text: 'Descuentos guardados. Puedes volver cuando quieras antes de aplicarlos.' });
        });
    }

    function applyToBsale() {
        setResults([]); setProgress('');
        startTransition(async () => {
            const updates = changed.map((item) => ({ variantId: item.variantId, detailId: item.detailId as number, grossPrice: item.newPrice })); const all: PriceUpdateResult[] = [];
            for (let start = 0; start < updates.length; start += 25) {
                const batch = updates.slice(start, start + 25); setProgress(`Actualizando ${Math.min(start + batch.length, updates.length)} de ${updates.length}…`);
                const result = await updatePrices(Number(targetId), batch); if ('error' in result && result.error) return setMessage({ error: true, text: result.error }); all.push(...result.results);
            }
            setResults(all); setProgress(''); setDirty(false); const failed = all.filter((item) => !item.success).length;
            setMessage(failed ? { error: true, text: `${all.length - failed} precios actualizados y ${failed} fallidos.` } : { text: `${all.length} precios actualizados correctamente en Bsale.` });
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
        {mode === 'quick' && <section className="space-y-5"><Title title="Cambio rápido" subtitle="Compara listas completas y aplica directamente los cambios cuando los confirmes." />{configuration}{priced.length > 0 && <PricingWorkspace items={filteredPrices} allItems={priced} stocks={stocks} selected={quickSelected} setSelected={setQuickSelected} search={search} setSearch={setSearch} family={family} setFamily={setFamily} families={families} bulkDiscount={bulkDiscount} setBulkDiscount={setBulkDiscount} applyBulk={applyBulkDiscount} onDiscount={changeDiscount} />}{priced.length > 0 && <ApplyPanel changed={changed} risky={risky} invalid={invalid} riskAccepted={riskAccepted} setRiskAccepted={setRiskAccepted} isPending={isPending} progress={progress} results={results} apply={applyToBsale} targetName={lists.find((list) => String(list.id) === targetId)?.name ?? ''} />}</section>}
        {mode === 'campaigns' && !campaignId && <CampaignList campaigns={campaigns} open={openCampaign} create={() => setCreateOpen(true)} />}
        {mode === 'campaigns' && campaignId && <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-3"><button onClick={() => leaveCampaign(setCampaignId, setSection, setPriced, setCatalog, setDirty, dirty)} className="rounded-md border px-3 py-2 text-sm">← Campañas</button><Title title={activeCampaign?.name ?? 'Campaña'} subtitle={`${campaignItems.size} productos guardados`} /></div>
            {section === 'home' && <CampaignMenu count={campaignItems.size} open={setSection} />}
            {section !== 'home' && <button onClick={() => { if (!dirty || window.confirm('Hay cambios sin guardar. ¿Quieres salir igualmente?')) { setSection('home'); setPriced([]); setCatalog([]); setDirty(false); } }} className="rounded-md border px-3 py-2 text-sm">← Menú de la campaña</button>}
            {section === 'products' && <div className="space-y-5"><Title title="Productos de la campaña" subtitle="Agrega o quita productos hoy y continúa cuando quieras." /><div className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-[1fr_1fr_auto]"><Select label="Lista base para buscar productos" value={referenceId} setValue={setReferenceId} options={lists.map((list) => [String(list.id), list.name])} /><Select label="Sucursal para stock" value={officeId} setValue={setOfficeId} options={offices.map((office) => [String(office.id), office.name])} /><button onClick={loadCatalog} disabled={isPending || !referenceId || !officeId} className="self-end rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Cargar productos</button></div>{catalog.length > 0 && <><Filters search={search} setSearch={setSearch} family={family} setFamily={setFamily} families={families} /><CatalogTable rows={visibleCatalog} selected={campaignItems} stocks={stocks} toggle={toggleProduct} /><Pager page={page} count={pageCount} total={filteredCatalog.length} setPage={setPage} /></>}<SaveBar text={`${campaignItems.size} productos`} dirty={dirty} disabled={!dirty || isPending} save={saveProducts} label="Guardar productos" /></div>}
            {(section === 'discounts' || section === 'apply') && <div className="space-y-5"><Title title={section === 'discounts' ? 'Preparar descuentos' : 'Revisar y aplicar'} subtitle={section === 'discounts' ? 'Guarda el trabajo sin modificar todavía Bsale.' : 'Elige el destino final y confirma antes de enviar.'} />{configuration}{priced.length > 0 && section === 'discounts' && <><PricingWorkspace items={filteredPrices} allItems={priced} stocks={stocks} search={search} setSearch={setSearch} family={family} setFamily={setFamily} families={families} bulkDiscount={bulkDiscount} setBulkDiscount={setBulkDiscount} applyBulk={applyBulkDiscount} onDiscount={changeDiscount} /><SaveBar text={`${priced.length} precios preparados`} dirty={dirty} disabled={!dirty || invalid.length > 0 || isPending} save={saveDiscounts} label="Guardar descuentos" /></>}{priced.length > 0 && section === 'apply' && <><Filters search={search} setSearch={setSearch} family={family} setFamily={setFamily} families={families} /><PriceTable items={filteredPrices} stocks={stocks} readonly onDiscount={changeDiscount} /><ApplyPanel changed={changed} risky={risky} invalid={invalid} riskAccepted={riskAccepted} setRiskAccepted={setRiskAccepted} isPending={isPending} progress={progress} results={results} apply={applyToBsale} targetName={lists.find((list) => String(list.id) === targetId)?.name ?? ''} /></>}</div>}
        </section>}
        {createOpen && <CampaignModal name={newName} setName={setNewName} close={() => setCreateOpen(false)} create={createCampaign} pending={isPending} />}
    </div>;
}

function filterRows<T extends { sku: string; productName: string; variantName: string; productTypeName: string }>(rows: T[], search: string, family: string) { const term = search.trim().toLowerCase(); return rows.filter((row) => (!family || row.productTypeName === family) && (!term || [row.sku, row.productName, row.variantName].some((value) => value.toLowerCase().includes(term)))); }
function leaveCampaign(setId: (v: string) => void, setSection: (v: Section) => void, setPriced: (v: PricedItem[]) => void, setCatalog: (v: PriceCatalogRow[]) => void, setDirty: (v: boolean) => void, dirty: boolean) { if (!dirty || window.confirm('Hay cambios sin guardar. ¿Quieres salir igualmente?')) { setId(''); setSection('home'); setPriced([]); setCatalog([]); setDirty(false); } }
function Home({ onQuick, onCampaigns }: { onQuick: () => void; onCampaigns: () => void }) { return <div className="grid gap-5 lg:grid-cols-2"><button onClick={onQuick} className="rounded-2xl border bg-white p-7 text-left shadow-sm hover:border-blue-400"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-blue-700">Cambios inmediatos</span><h2 className="mt-4 text-2xl font-bold">Cambio rápido</h2><p className="mt-2 text-gray-600">Compara dos listas completas, calcula descuentos y aplica los precios directamente.</p><p className="mt-5 font-semibold text-blue-700">Abrir cambio rápido →</p></button><button onClick={onCampaigns} className="rounded-2xl border bg-white p-7 text-left shadow-sm hover:border-violet-400"><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold uppercase text-violet-700">Trabajo guardado</span><h2 className="mt-4 text-2xl font-bold">Campañas especiales</h2><p className="mt-2 text-gray-600">Prepara Cyber Days por etapas y aplica los cambios cuando llegue el momento.</p><p className="mt-5 font-semibold text-violet-700">Ver campañas guardadas →</p></button></div>; }
function CampaignList({ campaigns, open, create }: { campaigns: CampaignListSummary[]; open: (id: string) => void; create: () => void }) { return <section className="space-y-4"><div className="flex items-center justify-between"><Title title="Campañas guardadas" subtitle="Puedes retomar productos, descuentos o aplicación en días distintos." /><button onClick={create} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white">Nueva campaña</button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{campaigns.map((campaign) => <button key={campaign.id} onClick={() => open(String(campaign.id))} className="rounded-xl border bg-white p-5 text-left shadow-sm hover:border-violet-400"><div className="flex items-start justify-between gap-3"><strong className="text-lg">{campaign.name}</strong><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{campaign.itemCount} productos</span></div><p className="mt-4 text-sm font-semibold text-violet-700">Abrir campaña →</p></button>)}</div></section>; }
function CampaignMenu({ count, open }: { count: number; open: (section: Section) => void }) { return <div className="grid gap-4 md:grid-cols-3"><CampaignAction title="1. Productos" text="Agrega o quita productos y consulta su stock." action="Administrar productos" onClick={() => open('products')} /><CampaignAction title="2. Descuentos" text="Compara referencia y destino; guarda descuentos." action="Preparar descuentos" disabled={!count} onClick={() => open('discounts')} /><CampaignAction title="3. Aplicar en Bsale" text="Revisa lo guardado y envíalo cuando decidas." action="Revisar y aplicar" disabled={!count} onClick={() => open('apply')} /></div>; }
function Title({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-xl font-bold text-gray-900">{title}</h2><p className="text-sm text-gray-600">{subtitle}</p></div>; }
function Select({ label, value, setValue, options }: { label: string; value: string; setValue: (value: string) => void; options: string[][] }) { return <label className="text-sm font-medium text-gray-700">{label}<select value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2"><option value="">Seleccionar…</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
function CampaignAction({ title, text, action, onClick, disabled = false }: { title: string; text: string; action: string; onClick: () => void; disabled?: boolean }) { return <button onClick={onClick} disabled={disabled} className="rounded-xl border bg-white p-5 text-left shadow-sm hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-40"><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 min-h-12 text-sm text-gray-600">{text}</p><p className="mt-4 text-sm font-semibold text-violet-700">{action} →</p></button>; }
function Filters({ search, setSearch, family, setFamily, families }: { search: string; setSearch: (value: string) => void; family: string; setFamily: (value: string) => void; families: string[] }) { return <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[1fr_240px]"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar SKU o producto" className="rounded-md border px-3 py-2" /><select value={family} onChange={(event) => setFamily(event.target.value)} className="rounded-md border px-3 py-2"><option value="">Todas las familias</option>{families.map((name) => <option key={name}>{name}</option>)}</select></div>; }
function Pager({ page, count, total, setPage }: { page: number; count: number; total: number; setPage: (value: number) => void }) { return <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Anterior</button><span className="text-sm">{total} resultados · Página {page} de {count}</span><button disabled={page >= count} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Siguiente</button></div>; }
function SaveBar({ text, dirty, disabled, save, label }: { text: string; dirty: boolean; disabled: boolean; save: () => void; label: string }) { return <div className="sticky bottom-3 flex items-center justify-between rounded-xl border bg-white/95 p-4 shadow-lg"><div><strong>{text}</strong><p className={`text-xs ${dirty ? 'text-amber-700' : 'text-green-700'}`}>{dirty ? 'Cambios sin guardar' : 'Todo guardado'}</p></div><button onClick={save} disabled={disabled} className="rounded-md bg-violet-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{label}</button></div>; }
function CatalogTable({ rows, selected, stocks, toggle }: { rows: PriceCatalogRow[]; selected: Map<number, CampaignItemInput>; stocks: Map<number, VariantStock>; toggle: (row: PriceCatalogRow) => void }) { return <div className="max-h-[55vh] overflow-auto rounded-xl border bg-white shadow-sm"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-3 py-3">Agregar</th><th>SKU</th><th>Producto</th><th>Familia</th><th className="text-right">Precio base</th><th className="px-3 text-right">Stock disponible</th></tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.variantId} className={selected.has(row.variantId) ? 'bg-violet-50' : ''}><td className="px-3 py-3"><input type="checkbox" checked={selected.has(row.variantId)} onChange={() => toggle(row)} /></td><td className="font-medium">{row.sku}</td><td><strong className="block">{row.productName}</strong><span className="text-gray-500">{row.variantName}</span></td><td>{row.productTypeName}</td><td className="text-right">{money.format(row.price)}</td><td className="px-3 text-right font-semibold">{stocks.get(row.variantId)?.available ?? 0}</td></tr>)}</tbody></table></div>; }
function PricingWorkspace({ items, allItems, stocks, selected, setSelected, search, setSearch, family, setFamily, families, bulkDiscount, setBulkDiscount, applyBulk, onDiscount }: { items: PricedItem[]; allItems: PricedItem[]; stocks: Map<number, VariantStock>; selected?: Set<number>; setSelected?: (value: Set<number>) => void; search: string; setSearch: (value: string) => void; family: string; setFamily: (value: string) => void; families: string[]; bulkDiscount: string; setBulkDiscount: (value: string) => void; applyBulk: () => void; onDiscount: (id: number, value: string) => void }) { return <div className="space-y-4"><Filters search={search} setSearch={setSearch} family={family} setFamily={setFamily} families={families} /><div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><label className="text-sm font-medium">Porcentaje de descuento<div className="mt-1 flex"><input inputMode="decimal" value={bulkDiscount} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setBulkDiscount(event.target.value)} className="w-28 rounded-l-md border px-3 py-2 text-right" /><span className="rounded-r-md border border-l-0 bg-gray-50 px-3 py-2">%</span></div></label><button onClick={applyBulk} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Aplicar {selected?.size ? `a ${selected.size} seleccionados` : `a los ${allItems.length}`}</button><span className="text-sm text-gray-500">El valor final siempre se calcula desde la lista base.</span></div><PriceTable items={items} stocks={stocks} selected={selected} setSelected={setSelected} onDiscount={onDiscount} /></div>; }
function PriceTable({ items, stocks, onDiscount, readonly = false, selected, setSelected }: { items: PricedItem[]; stocks: Map<number, VariantStock>; onDiscount: (id: number, value: string) => void; readonly?: boolean; selected?: Set<number>; setSelected?: (value: Set<number>) => void }) { return <div className="max-h-[58vh] overflow-auto rounded-xl border bg-white shadow-sm"><table className="w-full min-w-[1100px] text-sm"><thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500"><tr>{selected && <th className="px-3 py-3">Elegir</th>}<th className="px-3 py-3">SKU</th><th>Producto</th><th className="text-right">Precio base</th><th className="text-right">Precio destino actual</th><th className="text-right">Descuento %</th><th className="text-right">Nuevo precio</th><th className="px-3 text-right">Stock</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.variantId} className={item.discount > 50 || item.discount < 0 ? 'bg-amber-50' : ''}>{selected && <td className="px-3 py-3"><input type="checkbox" checked={selected.has(item.variantId)} onChange={() => { const next = new Set(selected); if (next.has(item.variantId)) next.delete(item.variantId); else next.add(item.variantId); setSelected?.(next); }} /></td>}<td className="px-3 py-3 font-medium">{item.sku}</td><td><strong className="block">{item.productName}</strong><span className="text-gray-500">{item.variantName}</span></td><td className="text-right">{money.format(item.referencePrice)}</td><td className="text-right">{item.currentPrice == null ? <span className="text-red-600">Sin precio</span> : money.format(item.currentPrice)}</td><td className="text-right">{readonly ? `${item.discount.toFixed(2)}%` : <div className="ml-auto flex w-24 overflow-hidden rounded-md border bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"><input aria-label={`Descuento porcentual para ${item.sku}`} inputMode="decimal" value={Math.round(item.discount * 100) / 100} onFocus={(event) => event.currentTarget.select()} onChange={(event) => onDiscount(item.variantId, event.target.value)} className="min-w-0 flex-1 px-2 py-1.5 text-right outline-none" /><span className="border-l bg-gray-50 px-2 py-1.5 text-gray-500">%</span></div>}</td><td className="text-right font-semibold">{money.format(item.newPrice)}</td><td className="px-3 text-right">{stocks.get(item.variantId)?.available ?? '—'}</td></tr>)}</tbody></table></div>; }
function ApplyPanel({ changed, risky, invalid, riskAccepted, setRiskAccepted, isPending, progress, results, apply, targetName }: { changed: PricedItem[]; risky: PricedItem[]; invalid: PricedItem[]; riskAccepted: boolean; setRiskAccepted: (value: boolean) => void; isPending: boolean; progress: string; results: PriceUpdateResult[]; apply: () => void; targetName: string }) { return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4"><Metric label="Cambios reales" value={changed.length} /><Metric label="Descuentos > 50%" value={risky.filter((item) => item.discount > 50).length} warning /><Metric label="Sobre precio base" value={risky.filter((item) => item.discount < 0).length} warning /><Metric label="Precios inválidos" value={invalid.length} warning /></div>{risky.length > 0 && <label className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} />Confirmo que revisé los descuentos mayores al 50% y los precios superiores a la referencia.</label>}<div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm"><h3 className="font-bold">Aplicar en {targetName || 'la lista seleccionada'}</h3><p className="mt-1 text-sm text-gray-600">Esta es la única acción que modifica Bsale. Se enviarán {changed.length} precios modificados.</p><button onClick={apply} disabled={isPending || changed.length === 0 || invalid.length > 0 || (risky.length > 0 && !riskAccepted)} className="mt-4 rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{isPending ? progress || 'Actualizando…' : 'Confirmar y actualizar Bsale'}</button>{results.length > 0 && <p className="mt-3 text-sm font-medium text-green-700">{results.filter((item) => item.success).length} actualizaciones correctas.</p>}</div></div>; }
function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) { return <div className={`rounded-xl border p-4 ${warning && value > 0 ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}><p className="text-xs font-medium uppercase text-gray-500">{label}</p><p className={`mt-1 text-2xl font-bold ${warning && value > 0 ? 'text-amber-800' : 'text-gray-900'}`}>{value}</p></div>; }
function CampaignModal({ name, setName, close, create, pending }: { name: string; setName: (value: string) => void; close: () => void; create: () => void; pending: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">Nueva campaña</h2><p className="mt-1 text-sm text-gray-600">Quedará guardada para continuarla cuando quieras.</p><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Cyber noviembre 2026" className="mt-5 w-full rounded-md border px-3 py-2" /><div className="mt-5 flex justify-end gap-2"><button onClick={close} className="rounded-md border px-4 py-2 text-sm font-semibold">Cancelar</button><button onClick={create} disabled={pending || name.trim().length < 2} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Crear campaña</button></div></div></div>; }
