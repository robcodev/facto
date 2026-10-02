'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { downloadExcel } from '@/lib/xlsx';
import { getWebCatalogOffices, loadWebCatalogGaps } from './actions';
import type { WebCatalogGap, WebCatalogOffice } from './types';
import ResearchModal from './ResearchModal';

type ReasonFilter = 'all' | WebCatalogGap['reason'];
type SortKey = 'stock' | 'newest' | 'name';
const number = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

export default function WebCatalogPage() {
    const [offices, setOffices] = useState<WebCatalogOffice[]>([]);
    const [officeId, setOfficeId] = useState('');
    const [rows, setRows] = useState<WebCatalogGap[]>([]);
    const [search, setSearch] = useState('');
    const [reason, setReason] = useState<ReasonFilter>('all');
    const [type, setType] = useState('');
    const [sort, setSort] = useState<SortKey>('stock');
    const [page, setPage] = useState(1);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<WebCatalogGap | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        startTransition(async () => {
            const result = await getWebCatalogOffices();
            if (!result.success) { setError(result.error); return; }
            setOffices(result.offices);
            const matrix = result.offices.find((office) => office.name.toLocaleLowerCase('es').includes('casa matriz'));
            setOfficeId(String(matrix?.id ?? result.offices[0]?.id ?? ''));
        });
    }, []);

    function analyze() {
        const selectedOffice = Number(officeId);
        if (!Number.isInteger(selectedOffice) || selectedOffice <= 0) return;
        setError('');
        setLoaded(false);
        startTransition(async () => {
            const result = await loadWebCatalogGaps(selectedOffice);
            if (!result.success) { setRows([]); setError(result.error); return; }
            setRows(result.rows);
            setLoaded(true);
            setPage(1);
        });
    }

    const types = useMemo(() => [...new Set(rows.map((row) => row.productTypeName))].sort((a, b) => a.localeCompare(b, 'es')), [rows]);
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase('es');
        return rows.filter((row) => {
            if (reason !== 'all' && row.reason !== reason) return false;
            if (type && row.productTypeName !== type) return false;
            const searchable = [row.productName, row.brandName, row.productTypeName, ...row.variants.flatMap((variant) => [variant.sku, variant.name])];
            return !query || searchable.some((value) => value.toLocaleLowerCase('es').includes(query));
        }).sort((a, b) => sort === 'stock' ? b.available - a.available || b.productId - a.productId : sort === 'newest' ? b.productId - a.productId : a.productName.localeCompare(b.productName, 'es'));
    }, [rows, search, reason, type, sort]);

    const pageSize = 50;
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
    const withoutDescription = rows.filter((row) => row.reason === 'missing_description').length;
    const withoutCollection = rows.filter((row) => row.reason === 'missing_collection').length;

    function exportRows() {
        downloadExcel('productos-pendientes-web', 'Pendientes web', filtered, [
            { header: 'ID producto', value: (row) => row.productId, width: 14, numberFormat: 'integer' },
            { header: 'Producto', value: (row) => row.productName, width: 42 },
            { header: 'Marca', value: (row) => row.brandName, width: 22 },
            { header: 'Tipo de producto', value: (row) => row.productTypeName, width: 24 },
            { header: 'Stock disponible', value: (row) => row.available, width: 18, numberFormat: 'decimal' },
            { header: 'Motivo', value: (row) => row.reason === 'missing_description' ? 'Sin descripción web' : 'Sin colección', width: 22 },
            { header: 'SKU', value: (row) => row.variants.map((variant) => variant.sku).join(', '), width: 38 },
            { header: 'Variantes y stock', value: (row) => row.variants.map((variant) => `${variant.sku}: ${number.format(variant.available)}`).join(' · '), width: 50 },
        ]);
    }

    return <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
        <header><p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Catálogo web</p><h1 className="mt-1 text-3xl font-bold text-gray-900">Productos pendientes de publicación</h1><p className="mt-2 max-w-3xl text-sm text-gray-600">Productos activos con stock disponible que no tienen descripción web o todavía no pertenecen a una colección.</p></header>
        <section className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-end">
            <label className="text-sm font-medium text-gray-700">Sucursal<select value={officeId} onChange={(event) => setOfficeId(event.target.value)} className="mt-1 block min-w-64 rounded-md border px-3 py-2"><option value="">Seleccionar…</option>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>
            <button type="button" onClick={analyze} disabled={isPending || !officeId} className="rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{isPending ? 'Revisando Bsale…' : 'Revisar productos'}</button>
            {loaded && <button type="button" onClick={exportRows} disabled={filtered.length === 0} className="rounded-md border border-emerald-700 px-5 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-40">Descargar Excel</button>}
        </section>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {isPending && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><strong>Consultando el inventario y el catálogo web…</strong><p className="mt-1">Bsale contiene miles de variantes; esta revisión puede tardar algunos segundos.</p></div>}
        {loaded && <>
            <section className="grid gap-3 sm:grid-cols-3"><Metric label="Pendientes" value={rows.length} /><Metric label="Sin descripción web" value={withoutDescription} /><Metric label="Sin colección" value={withoutCollection} /></section>
            <section className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_240px_210px]">
                <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar producto, SKU, marca o variante" className="rounded-md border px-3 py-2" />
                <select value={reason} onChange={(event) => { setReason(event.target.value as ReasonFilter); setPage(1); }} className="rounded-md border px-3 py-2"><option value="all">Todos los motivos</option><option value="missing_description">Sin descripción web</option><option value="missing_collection">Sin colección</option></select>
                <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="rounded-md border px-3 py-2"><option value="">Todos los tipos de producto</option>{types.map((item) => <option key={item}>{item}</option>)}</select>
                <select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(1); }} className="rounded-md border px-3 py-2"><option value="stock">Mayor stock primero</option><option value="newest">ID más nuevo primero</option><option value="name">Nombre del producto</option></select>
            </section>
            {filtered.length === 0 ? <div className="rounded-xl border bg-white p-8 text-center text-gray-600">No hay productos que coincidan con los filtros.</div> : <ProductTable rows={visible} onResearch={setSelectedProduct} />}
            {filtered.length > pageSize && <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-3"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Anterior</button><span className="text-sm text-gray-600">{filtered.length} productos · Página {page} de {pageCount}</span><button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Siguiente</button></div>}
        </>}
        {selectedProduct && <ResearchModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
    </main>;
}

function ProductTable({ rows, onResearch }: { rows: WebCatalogGap[]; onResearch: (product: WebCatalogGap) => void }) {
    return <div className="overflow-auto rounded-xl border bg-white shadow-sm"><table className="w-full min-w-[1200px] text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">ID</th><th>Producto</th><th>Marca</th><th>Tipo</th><th>Motivo</th><th>SKU y variantes</th><th className="text-right">Stock</th><th className="px-4">Descripción</th></tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.productId} className="align-top"><td className="px-4 py-4 font-medium text-gray-500">{row.productId}</td><td className="py-4 font-semibold text-gray-900">{row.productName}</td><td className="py-4">{row.brandName}</td><td className="py-4">{row.productTypeName}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.reason === 'missing_description' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{row.reason === 'missing_description' ? 'Sin descripción web' : 'Sin colección'}</span></td><td className="py-4"><div className="max-w-md space-y-1">{row.variants.map((variant) => <div key={variant.id} className="flex justify-between gap-4"><span><strong>{variant.sku || 'Sin SKU'}</strong>{variant.name && <span className="text-gray-500"> · {variant.name}</span>}</span><span className="whitespace-nowrap text-gray-500">{number.format(variant.available)}</span></div>)}</div></td><td className="py-4 text-right text-lg font-bold text-gray-900">{number.format(row.available)}</td><td className="px-4 py-4"><button type="button" onClick={() => onResearch(row)} className="whitespace-nowrap rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Investigar y redactar</button></td></tr>)}</tbody></table></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
    return <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs font-medium uppercase text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>;
}
