'use client';

import ReceptionDetails from './ReceptionDetails';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { calendarDays, daySummary, isPaid, money, monthShift, monthsBetween, today, validateChoice, type Invoice, type PaymentChoice, type PaidRecord, type SourcePage } from './core';

const input = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
const primary = 'rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50';
const emptyChoice: PaymentChoice = { method: '', cheque: '' };
type Choices = Record<string, PaidRecord>;

function PaymentEditor({ invoice, initial, draft, onSave, disabled }: { invoice: Invoice; initial?: PaidRecord; draft?: PaymentChoice; onSave: (choice: PaymentChoice) => Promise<void>; disabled: boolean }) {
    const [choice, setChoice] = useState<PaymentChoice>(initial || draft || emptyChoice), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false);
    async function save(e: FormEvent) {
        e.preventDefault(); setNotice(''); setSaving(true);
        try { if (!choice.method) throw new Error('Selecciona una forma de pago.'); await onSave(validateChoice(choice)); setNotice('Factura marcada como pagada.'); }
        catch (e) { setNotice(e instanceof Error ? e.message : 'No se guardó el pago.'); }
        finally { setSaving(false); }
    }
    return <form onSubmit={save} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        {!initial && draft?.method && <p className="text-xs text-slate-500">Forma de pago guardada anteriormente: {draft.method}{draft.cheque ? ` · Cheque n.º ${draft.cheque}` : ''}. Guarda para marcar la factura como pagada.</p>}
        {initial && <div className={isPaid(invoice, initial) ? 'rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950' : 'rounded-lg bg-amber-50 p-3 text-sm text-amber-900'}><strong>{isPaid(invoice, initial) ? 'Pagada en Facto' : 'El importe cambió en Bsale: revisar pago'}</strong><p>Forma de pago: {initial.method}{initial.cheque ? ` · Cheque n.º ${initial.cheque}` : ''}</p><p className="mt-1 text-xs">Registrada: {new Date(initial.paidAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })} · {initial.actor}</p>{initial.revision > 1 && <p className="mt-1 text-xs">Última actualización: {new Date(initial.updatedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>}</div>}
        <fieldset disabled={saving || disabled} className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs font-medium text-slate-600">Forma de pago<select required aria-label={`Forma de pago factura ${invoice.folio}`} className={input} value={choice.method} onChange={e => { setChoice({ method: e.target.value as PaymentChoice['method'], cheque: '' }); setNotice(''); }}><option value="" disabled>Selecciona una forma</option>{['Cheque', 'Transferencia', 'Efectivo', 'Otro'].map(m => <option key={m}>{m}</option>)}</select></label>
        {choice.method === 'Cheque' && <label className="grid gap-1 text-xs font-medium text-slate-600">Número de cheque<input aria-label={`Número de cheque factura ${invoice.folio}`} required maxLength={80} className={input} value={choice.cheque} onChange={e => setChoice({ ...choice, cheque: e.target.value })} placeholder="Ej.: 00001234" /></label>}
        <button className={button} disabled={saving || disabled || !choice.method} type="submit">{saving ? 'Guardando…' : initial ? 'Actualizar datos del pago' : 'Guardar y marcar pagada'}</button></fieldset>
        {notice && <p role="status" className="text-xs text-blue-800">{notice}</p>}
    </form>;
}

function DetailModal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        const overflow = document.body.style.overflow;
        dialog?.showModal();
        document.body.style.overflow = 'hidden';
        return () => { dialog?.close(); document.body.style.overflow = overflow; };
    }, []);
    return <dialog ref={ref} aria-labelledby="supplier-day-detail-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4"><h2 id="supplier-day-detail-title" className="text-lg font-semibold sm:text-xl">{title}</h2><button autoFocus type="button" className={button} aria-label="Cerrar detalle del calendario" onClick={close}>Cerrar ✕</button></div>
        <div className="space-y-4 p-4 sm:p-6">{children}</div>
    </dialog>;
}

export default function SuppliersPage() {
    const [month, setMonth] = useState(''), [selected, setSelected] = useState('');
    const [from, setFrom] = useState(''), [to, setTo] = useState('');
    const [query, setQuery] = useState<{ from: string; to: string; revision: number } | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]), [choices, setChoices] = useState<Choices>({});
    const [scope, setScope] = useState(''), [supplier, setSupplier] = useState(''), [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [progress, setProgress] = useState(''), [excluded, setExcluded] = useState(0), [checkedAt, setCheckedAt] = useState('');
    const [showUnknown, setShowUnknown] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, PaymentChoice>>({});
    const [paymentStorage, setPaymentStorage] = useState<'checking' | 'local' | 'shared'>('checking');
    const [paymentStatus, setPaymentStatus] = useState('all'), [methodFilter, setMethodFilter] = useState('');
    const [showPaidList, setShowPaidList] = useState(false);
    useEffect(() => {
        let alive = true;
        queueMicrotask(() => {
            if (!alive) return;
            const d = today(), m = d.slice(0, 7), start = monthShift(m, -1);
            setMonth(m); setSelected(d); setFrom(start); setTo(m); setQuery({ from: start, to: m, revision: 0 });
        });
        return () => { alive = false; };
    }, []);
    useEffect(() => {
        if (!query) return;
        const abort = new AbortController(); let alive = true;
        async function run() {
            await Promise.resolve();
            if (!alive || !query) return;
            setLoading(true); setPaymentStorage('checking'); setChoices({}); setError(''); setInvoices([]); setExcluded(0); setCheckedAt(''); setNotice('');
            const recorded: Choices = {}; let localRecords: Choices | null = null;
            const collected = new Map<string, Invoice>(); let skip = 0; let sourceScope = '';
            try {
                for (const period of monthsBetween(query.from, query.to)) {
                    let offset: number | null = 0, expected: number | null = null;
                    do {
                        setProgress(`Consultando Bsale · ${period} · ${offset} documentos revisados`);
                        const r = await fetch(`/api/suppliers?month=${period}&offset=${offset}`, { cache: 'no-store', signal: abort.signal });
                        const page = await r.json() as SourcePage & { error?: string; scope: string; payments: Choices; paymentStorage: 'local' | 'shared' };
                        if (!r.ok) throw new Error(page.error || 'No se pudo consultar Bsale.');
                        if (!Array.isArray(page.invoices) || !page.scope || (expected !== null && page.count !== expected)) throw new Error('Los documentos de Bsale cambiaron durante la consulta. Actualiza para revisarlos.');
                        expected = page.count;
                        if (sourceScope && sourceScope !== page.scope) throw new Error('La sesión cambió. Actualiza el módulo.');
                        if (!sourceScope) {
                            sourceScope = page.scope; setScope(sourceScope);
                            const legacy: Record<string, PaymentChoice> = {};
                            try { const saved = JSON.parse(sessionStorage.getItem(`facto-supplier-methods-v2:${sourceScope}`) || '{}'); if (saved && typeof saved === 'object') for (const [key, value] of Object.entries(saved)) { try { const v = value as PaymentChoice; if (v && typeof v.cheque === 'string') legacy[key] = validateChoice(v); } catch { /* Invalid legacy draft. */ } } } catch { /* Legacy drafts are optional. */ }
                            setDrafts(legacy);
                        }
                        if (page.paymentStorage === 'local' && localRecords === null) {
                            localRecords = {};
                            try {
                                const stored = JSON.parse(sessionStorage.getItem(`facto-supplier-paid-v3:${sourceScope}`) || '{}');
                                if (stored && typeof stored === 'object') for (const [key, value] of Object.entries(stored)) {
                                    const v = value as PaidRecord;
                                    try { if (v && v.method && typeof v.cheque === 'string' && Number.isFinite(v.total) && typeof v.currency === 'string' && typeof v.actor === 'string' && Number.isFinite(Date.parse(v.paidAt)) && Number.isFinite(Date.parse(v.updatedAt)) && Number.isInteger(v.revision) && v.revision > 0) localRecords[key] = { ...v, ...validateChoice(v) }; } catch { /* Ignore invalid local records. */ }
                                }
                            } catch { setNotice('El navegador no pudo recuperar el registro local de pagos.'); }
                        }
                        for (const item of page.invoices) { const saved = page.paymentStorage === 'local' ? localRecords?.[item.key] : page.payments?.[item.key]; if (saved) recorded[item.key] = saved; }
                        if (alive) { setPaymentStorage(localRecords !== null ? 'local' : 'shared'); setChoices({ ...recorded }); }
                        for (const invoice of page.invoices) {
                            const previous = collected.get(invoice.key);
                            if (previous && (previous.total !== invoice.total || previous.received !== invoice.received)) throw new Error('Bsale entregó versiones distintas de una factura. Actualiza la consulta.');
                            collected.set(invoice.key, invoice);
                        }
                        skip += page.excluded;
                        if (alive) { setInvoices([...collected.values()]); setExcluded(skip); }
                        if (page.nextOffset !== null && page.nextOffset <= Number(offset)) throw new Error('No se pudo avanzar en la consulta de Bsale.');
                        offset = page.nextOffset;
                    } while (offset !== null && alive);
                    if (!alive) return;
                }
                if (alive) { setCheckedAt(new Date().toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' })); setProgress(''); }
            } catch (e) { if (alive && !abort.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo consultar Bsale.'); }
            finally { if (alive) setLoading(false); }
        }
        void run(); return () => { alive = false; abort.abort(); };
    }, [query]);

    const suppliers = [...new Map(invoices.map(i => [i.rut, i.supplier])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
    const matched = invoices.filter(i => (!supplier || i.rut === supplier) && (!search || `${i.supplier} ${i.rut} ${i.folio}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))));
    const filtered = matched.filter(i => (paymentStatus === 'all' || (paymentStatus === 'paid' ? isPaid(i, choices[i.key]) : !isPaid(i, choices[i.key]))) && (!methodFilter || choices[i.key]?.method === methodFilter));
    const paidMatches = matched.filter(i => isPaid(i, choices[i.key]) && (!methodFilter || choices[i.key]?.method === methodFilter)).sort((a, b) => choices[b.key].paidAt.localeCompare(choices[a.key].paidAt));
    const unknown = filtered.filter(i => !i.dues.length || !i.received || i.currency !== 'CLP');
    const receivedMonth = filtered.filter(i => i.received?.startsWith(month));
    const dueMonth = filtered.flatMap(i => i.currency === 'CLP' && !isPaid(i, choices[i.key]) ? i.dues.filter(d => d.date.startsWith(month)) : []);
    const day = daySummary(filtered, selected, choices);
    const dayInvoices = [...new Map([...day.received, ...day.due.map(d => d.invoice), ...day.paid].map(i => [i.key, i])).values()];
    const displayed = showPaidList ? paidMatches : showUnknown ? unknown : dayInvoices;
    const incomplete = loading || !!error;
    const label = month ? new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`)) : '';
    async function saveChoice(invoice: Invoice, choice: PaymentChoice) {
        if (!choice.method) throw new Error('Selecciona una forma de pago.');
        if (paymentStorage === 'checking' || loading) throw new Error('Espera a que termine la consulta de facturas y pagos.');
        let payment: PaidRecord;
        if (paymentStorage === 'shared') {
            const response = await fetch('/api/suppliers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: invoice.id, method: choice.method, cheque: choice.cheque, revision: choices[invoice.key]?.revision || 0, sourceTotal: invoice.total }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'No se guardó el pago.');
            payment = result.payment;
        } else {
            const now = new Date().toISOString();
            payment = { ...choice, paidAt: choices[invoice.key]?.paidAt || now, updatedAt: now, actor: 'Usuario de esta pestaña · prueba local', revision: (choices[invoice.key]?.revision || 0) + 1, total: invoice.total, currency: invoice.currency };
            const next = { ...choices, [invoice.key]: payment };
            try { sessionStorage.setItem(`facto-supplier-paid-v3:${scope}`, JSON.stringify(next)); }
            catch { throw new Error('El navegador no permitió guardar. La factura no se marcó como pagada.'); }
        }
        setChoices(current => ({ ...current, [invoice.key]: payment }));
    }
    function refresh(e: FormEvent) {
        e.preventDefault();
        if (!from || !to || from > to || monthShift(from, 11) < to) { setNotice('Selecciona un rango de hasta 12 meses, desde el más antiguo al más reciente.'); return; }
        setQuery({ from, to, revision: Date.now() });
    }
    function move(n: number) { const next = monthShift(month, n); setMonth(next); setSelected(`${next}-01`); setShowUnknown(false); }

    return <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-8">
        <header><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Finanzas · Bsale</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Calendario de facturas y pagos</h1><p className="mt-2 text-sm text-slate-600">Proveedores y facturas consultados directamente desde Bsale. Selecciona un día para ver cuáles llegaron y cuáles vencen.</p></header>
        <form onSubmit={refresh} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <label className="grid gap-1 text-xs font-medium text-slate-600">Mes contable desde<input required type="month" className={input} value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">Mes contable hasta<input required type="month" className={input} value={to} onChange={e => setTo(e.target.value)} /></label>
            <button type="submit" className={primary} disabled={loading}>{loading ? 'Consultando Bsale…' : 'Actualizar desde Bsale'}</button>
            <p className="text-xs text-slate-500">{checkedAt ? `Última consulta: ${checkedAt}` : 'Consulta de solo lectura'} · Sin importaciones a la base de datos</p>
        </form>
        {paymentStorage === 'local' && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Registro de prueba en esta pestaña.</strong> Falta habilitar la tabla de pagos en Supabase para conservar los pagos y compartirlos entre equipos. Los registros previos de forma de pago no se convierten automáticamente en facturas pagadas.</p>}
        {notice && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} Los datos visibles son parciales; no representan el total del periodo.</p>}
        {loading && <p role="status" className="text-sm text-blue-700">{progress}. Los totales se completan al terminar.</p>}
        <div className="flex flex-wrap gap-3"><label className="grid flex-1 gap-1 text-xs font-medium text-slate-600">Proveedor de Bsale<select className={`${input} min-w-48`} value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">Todos los proveedores ({suppliers.length})</option>{suppliers.map(([rut, name]) => <option key={rut} value={rut}>{name} · {rut}</option>)}</select></label><label className="grid flex-1 gap-1 text-xs font-medium text-slate-600">Buscar proveedor, RUT o folio<input className={input} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar en las facturas consultadas" /></label></div>
        <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs font-medium text-slate-600">Estado de pago<select className={input} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}><option value="all">Todas las facturas</option><option value="pending">Pendientes de registrar pago</option><option value="paid">Pagadas</option></select></label><label className="grid gap-1 text-xs font-medium text-slate-600">Forma de pago registrada<select className={input} value={methodFilter} onChange={e => setMethodFilter(e.target.value)}><option value="">Todas las formas</option>{['Cheque', 'Transferencia', 'Efectivo', 'Otro'].map(m => <option key={m}>{m}</option>)}</select></label><button className={button} onClick={() => { setShowPaidList(true); setShowUnknown(false); setDetailsOpen(true); }}>Ver facturas pagadas ({paidMatches.length})</button></div>
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-5" aria-label="Calendario mensual">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><button className={button} disabled={!month} onClick={() => move(-1)} aria-label="Mes anterior">←</button><h2 className="text-xl font-semibold capitalize">{label}</h2><button className={button} disabled={!month} onClick={() => move(1)} aria-label="Mes siguiente">→</button></div><button className={button} onClick={() => { setMonth(today().slice(0, 7)); setSelected(today()); setShowUnknown(false); }}>Hoy</button></div>
            <div className="flex flex-wrap gap-4 text-xs"><span className="text-blue-700">● Recibidas en SII: {receivedMonth.length} · {money(receivedMonth.filter(i => i.currency === 'CLP').reduce((s, i) => s + i.total, 0))}</span><span className="text-amber-800">● Vencimientos pendientes de registrar: {dueMonth.length} · {money(dueMonth.reduce((s, d) => s + d.amount, 0))}</span>{incomplete && <strong className="text-slate-500">Datos parciales</strong>}</div>
            <div className="overflow-x-auto"><div className="min-w-[490px]"><div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="py-3">{d}</div>)}</div><div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">{month && calendarDays(month).map(date => {
                const summary = daySummary(filtered, date, choices), isSelected = selected === date && !showUnknown;
                return <button key={date} aria-label={`${date}: ${summary.received.length} facturas recibidas, ${summary.due.length} vencimientos, total ${money(summary.dueTotal)}, ${summary.paid.length} pagadas`} aria-pressed={isSelected} onClick={() => { setSelected(date); setShowUnknown(false); setShowPaidList(false); setDetailsOpen(true); }} className={`min-h-32 p-2 text-left align-top transition focus-visible:outline-2 focus-visible:outline-blue-700 ${isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-600' : date.startsWith(month) ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 text-slate-400'}`}>
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${date === today() ? 'bg-blue-700 text-white' : ''}`}>{Number(date.slice(-2))}</span>
                    {summary.received.length > 0 && <span className="mt-1 block rounded bg-blue-50 px-1.5 py-1 text-[10px] leading-4 text-blue-800">Recib.: {summary.received.length}<strong className="block">{money(summary.receivedTotal)}</strong></span>}
                    {summary.paid.length > 0 && <span className="mt-1 block rounded bg-emerald-50 px-1.5 py-1 text-[10px] leading-4 text-emerald-900">Pagadas: {summary.paid.length}<strong className="block">{money(summary.paidTotal)}</strong></span>}
                    {summary.due.length > 0 && <span className="mt-1 block rounded bg-amber-50 px-1.5 py-1 text-[10px] leading-4 text-amber-900">Vence: {summary.due.length}<strong className="block">{money(summary.dueTotal)}</strong></span>}
                </button>;
            })}</div></div></div>
            <p className="text-xs leading-5 text-slate-500">Recibida = recepción en el SII, no llegada física de mercadería. Vencimientos = fechas y montos del XML; no confirman que siga impaga. Los vencimientos excluyen las facturas marcadas como pagadas en Facto. Sin registro de pago no equivale a deuda confirmada. No se descuentan notas de crédito.</p>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Pincha un día del calendario para ver sus facturas y vencimientos.</p><button className={button} onClick={() => { setShowUnknown(true); setShowPaidList(false); setDetailsOpen(true); }}>Sin fecha / revisar ({unknown.length})</button></div>
        {detailsOpen && <DetailModal title={showPaidList ? 'Facturas pagadas del periodo consultado' : showUnknown ? 'Facturas con datos de calendario incompletos' : `Facturas y vencimientos · ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${selected}T12:00:00Z`))}`} close={() => setDetailsOpen(false)}>
            {!showUnknown && !showPaidList && <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-medium text-blue-800">Recibidas en SII · {day.received.length} facturas</p><p className="mt-1 text-2xl font-bold text-blue-950">{money(day.receivedTotal)}</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-medium text-amber-900">Vencimientos sin pago registrado · {day.due.length}</p><p className="mt-1 text-2xl font-bold text-amber-950">{money(day.dueTotal)}</p></div></div>}
            <p className="text-xs leading-5 text-slate-500">Los vencimientos provienen del XML y no confirman que las facturas sigan impagas. Las facturas marcadas como pagadas se excluyen de los vencimientos pendientes. No se descuentan notas de crédito.{incomplete ? ' La consulta todavía está incompleta; los totales son parciales.' : ''}</p>
            {!displayed.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{loading ? 'Buscando facturas en Bsale…' : showPaidList ? 'No hay facturas pagadas con estos filtros.' : showUnknown ? 'No hay facturas con fechas pendientes en la consulta.' : 'No hay facturas recibidas ni vencimientos este día dentro del periodo consultado.'}</div>}
            <div className="grid gap-4 xl:grid-cols-2">{displayed.map(invoice => <article key={invoice.key} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{invoice.supplier}</h3><p className="mt-1 text-xs text-slate-500">{invoice.rut} · Factura {invoice.folio} · Tipo {invoice.type}</p></div><p className="whitespace-nowrap text-lg font-bold">{invoice.currency === 'CLP' ? money(invoice.total) : `${invoice.total} ${invoice.currency}`}</p></div>
                {!showUnknown && !showPaidList && <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">{invoice.received === selected && <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">Recibida este día</span>}{invoice.dues.some(d => d.date === selected) && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">Vence este día: {invoice.currency === 'CLP' ? money(invoice.dues.filter(d => d.date === selected).reduce((sum, d) => sum + d.amount, 0)) : invoice.currency}</span>}</div>}
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Emisión</dt><dd>{invoice.issued || 'Sin fecha'}</dd></div><div><dt className="text-xs text-slate-500">Recibida en SII</dt><dd>{invoice.received || 'Sin fecha informada'}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Vencimientos del XML</dt><dd>{invoice.dues.length ? invoice.dues.map((d, n) => <span className="mr-3 inline-block" key={`${d.date}-${n}`}>{d.date} · {invoice.currency === 'CLP' ? money(d.amount) : `${d.amount} ${invoice.currency}`}</span>) : invoice.dueIssue}</dd></div></dl>
                {invoice.declaredPayment && <p className="mt-3 text-xs text-slate-500">{invoice.declaredPayment}. No acredita pago bancario.</p>}
                {invoice.currency !== 'CLP' && <p className="mt-2 text-xs text-amber-800">Moneda distinta de CLP: excluida de los totales en pesos.</p>}
                {invoice.pdf && <a href={invoice.pdf} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-blue-700 underline">Ver factura en Bsale ↗</a>}
                <ReceptionDetails key={`reception:${invoice.id}`} invoice={invoice} />
                <PaymentEditor key={`${invoice.key}:${scope}:${choices[invoice.key]?.revision || 0}`} invoice={invoice} initial={choices[invoice.key]} draft={drafts[invoice.key]} disabled={loading || paymentStorage === 'checking'} onSave={choice => saveChoice(invoice, choice)} />
            </article>)}</div>
        </DetailModal>}
        <footer className="space-y-2 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500"><p>Consulta de meses contables {query?.from} a {query?.to}: {invoices.length} facturas y {suppliers.length} proveedores. No incluye documentos fuera de ese rango, aunque venzan en el calendario visible. {excluded > 0 ? `${excluded} documentos anulados, excluidos u otros tipos no se suman como facturas.` : ''}</p><p>Guardar una forma de pago marca la factura como pagada en Facto. {paymentStorage === 'shared' ? 'Registro compartido en Supabase, con responsable y fecha.' : 'Prueba local: el registro se guarda solo en esta pestaña; el guardado compartido todavía no está habilitado.'} Los proveedores y facturas se vuelven a consultar desde Bsale al abrir o actualizar. No modifica Bsale, stock ni deuda en producción.</p></footer>
    </div>;
}
