'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { categories, filtersSchema, money, mutationSchema, settlements, today, withdrawalKinds, type CashEntry, type CashFilters, type CashMutation, type CashReport, type Withdrawal } from '@/lib/finance/cash-core';

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100';
const button = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-40';
const primary = 'rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40';
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-medium text-gray-700">{label}{children}</label>; }
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
    return <dialog ref={ref} onCancel={event => { event.preventDefault(); close(); }} aria-label={title} className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 text-gray-900 shadow-xl backdrop:bg-gray-950/40"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{title}</h2><button autoFocus className={button} onClick={close}>Cerrar</button></div>{children}</dialog>;
}
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const result = await fetch(url, { ...options, cache: 'no-store', signal: options.signal || AbortSignal.timeout(25000) });
    const body = await result.json().catch(() => null);
    if (!result.ok || body === null) throw new RequestError(body?.error || 'No pudimos confirmar la operación. Reintenta el mismo envío.', result.status || 503);
    return body as T;
}
const dayLabel = (date: string) => date.split('-').reverse().join('-');
const stamp = (at: string) => new Date(at).toLocaleString('es-CL', { timeZone: 'America/Santiago' });
type Draft = { action: 'withdrawal' | 'entry'; id: string; withdrawalId?: string; date: string; amount: string; kind: string; recipient: string; purpose: string; reference: string; cashBox: string; category: string; description: string; merchant: string; receiptReference: string };
type Detail = { withdrawal: Withdrawal; entries: CashEntry[]; hasMore: boolean; page: number };

export default function CashPage() {
    const [filters, setFilters] = useState<CashFilters | null>(null);
    const [formFilters, setFormFilters] = useState({ from: '', to: '', search: '', status: '', category: '' });
    const [data, setData] = useState<CashReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [draft, setDraft] = useState<Draft | null>(null);
    const [detail, setDetail] = useState<Detail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const [retry, setRetry] = useState<CashMutation | null>(null);
    const [voidForm, setVoidForm] = useState<{ id: string; action: 'void_entry' | 'void_withdrawal'; reason: string } | null>(null);
    const mutationLock = useRef(false);
    const readSequence = useRef(0);
    const detailSequence = useRef(0);

    useEffect(() => {
        const day = today();
        queueMicrotask(() => {
            const initial = { from: `${day.slice(0, 7)}-01`, to: day, search: '', status: '' as const, category: '' as const };
            setFormFilters(initial);
            setFilters({ ...initial, view: 'withdrawals', page: 0 });
        });
    }, []);
    const load = useCallback(async (value: CashFilters, signal?: AbortSignal) => {
        const sequence = ++readSequence.current;
        setLoading(true); setError('');
        try {
            const result = await request<CashReport>(`/api/finance/cash?${new URLSearchParams(Object.entries(value).map(([key, val]) => [key, String(val)]))}`, { signal });
            if (readSequence.current === sequence && !signal?.aborted) setData(result);
        } catch (e) { if (readSequence.current === sequence && !signal?.aborted) { setData(null); setError(e instanceof Error ? e.message : 'No pudimos cargar Caja y gastos.'); } }
        finally { if (readSequence.current === sequence && !signal?.aborted) setLoading(false); }
    }, []);
    useEffect(() => { if (!filters) return; const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void load(filters, controller.signal); }); return () => controller.abort(); }, [filters, load]);

    async function openDetail(withdrawal: Withdrawal, page = 0) {
        const sequence = ++detailSequence.current;
        setDetailLoading(true); setDetailError('');
        setDetail(previous => ({ withdrawal, entries: page === 0 ? [] : previous?.entries || [], hasMore: false, page }));
        try {
            const result = await request<{ entries: CashEntry[]; hasMore: boolean; page: number }>(`/api/finance/cash?withdrawalId=${withdrawal.id}&page=${page}`);
            if (sequence === detailSequence.current) setDetail({ withdrawal, ...result });
        } catch (e) { if (sequence === detailSequence.current) setDetailError(e instanceof Error ? e.message : 'No pudimos cargar la rendición.'); }
        finally { if (sequence === detailSequence.current) setDetailLoading(false); }
    }
    function closeForms() {
        if (busy) return;
        if (retry && !window.confirm('El envío quedó sin confirmación. Antes de crear otro registro, revisa si aparece guardado. ¿Cerrar el formulario?')) return;
        setDraft(null); setVoidForm(null); setRetry(null); setFormError('');
    }
    function newDraft(withdrawal?: Withdrawal) {
        setFormError(''); setRetry(null);
        setDraft({ action: withdrawal ? 'entry' : 'withdrawal', id: crypto.randomUUID(), withdrawalId: withdrawal?.id, date: today(), amount: '', kind: withdrawal ? 'expense' : 'advance', recipient: '', purpose: '', reference: '', cashBox: 'Casa matriz', category: 'Aseo', description: '', merchant: '', receiptReference: '' });
    }
    async function save(raw: unknown) {
        if (mutationLock.current) return;
        const parsed = mutationSchema.safeParse(retry || raw);
        if (!parsed.success) { setFormError(parsed.error.issues[0]?.message || 'Revisa los datos.'); return; }
        mutationLock.current = true; setBusy(true); setFormError('');
        let confirmed = false;
        try {
            await request('/api/finance/cash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
            confirmed = true;
            setDraft(null); setVoidForm(null); setRetry(null); setDetail(null);
            ++detailSequence.current;
            setNotice('Registro guardado en el espacio compartido.');
        } catch (e) {
            const uncertain = !(e instanceof RequestError) || e.status >= 500 || e.status === 408;
            setRetry(uncertain ? parsed.data : null);
            setFormError(uncertain ? 'No recibimos confirmación. Reintenta el mismo envío: se conserva su identificador para evitar duplicados.' : e.message);
        } finally { mutationLock.current = false; setBusy(false); }
        // A refresh failure must never be presented as a failed financial write.
        if (confirmed && filters) await load(filters);
    }
    const draftPayload = () => draft?.action === 'withdrawal'
        ? { action: draft.action, id: draft.id, date: draft.date, amount: Number(draft.amount), kind: draft.kind, recipient: draft.recipient, purpose: draft.purpose, reference: draft.reference, cashBox: draft.cashBox }
        : { action: 'entry', id: draft?.id, withdrawalId: draft?.withdrawalId, date: draft?.date, amount: Number(draft?.amount), kind: draft?.kind, category: draft?.kind === 'return' ? '' : draft?.category, description: draft?.description, merchant: draft?.merchant || '', receiptReference: draft?.receiptReference || '' };
    const view = filters?.view || 'withdrawals';

    return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-sm font-medium text-blue-700">Finanzas</p><h1 className="mt-1 text-2xl font-bold text-gray-900">Caja y gastos</h1><p className="mt-2 max-w-2xl text-sm text-gray-600">Consulta salidas de efectivo, gastos y rendiciones. La importación de movimientos desde Bsale está pendiente.</p></div>
            <div className="flex flex-wrap gap-2"><Link href="/suppliers" className={button}>Proveedores y pagos</Link><button className={primary} onClick={() => newDraft()} disabled={loading || !data}>Registrar salida</button></div>
        </header>
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">Registro manual compartido · Fechas y horas de Chile. Los movimientos de Bsale todavía no se importan. Este registro de salidas y gastos no calcula el saldo total de la caja ni incluye automáticamente ventas o aperturas.</p>
        {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button></div>}
        <form onSubmit={event => { event.preventDefault(); const result = filtersSchema.safeParse({ ...formFilters, view, page: 0 }); if (result.success) { setFilters(result.data); setNotice(''); } else setError(result.error.issues[0]?.message || 'Revisa las fechas.'); }} className="grid items-end gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Desde"><input type="date" required className={input} value={formFilters.from} onChange={e => setFormFilters({ ...formFilters, from: e.target.value })} /></Field>
            <Field label="Hasta"><input type="date" required className={input} value={formFilters.to} onChange={e => setFormFilters({ ...formFilters, to: e.target.value })} /></Field>
            <Field label={view === 'withdrawals' ? 'Buscar responsable o motivo' : 'Buscar comercio o comprobante'}><input className={input} maxLength={160} value={formFilters.search} onChange={e => setFormFilters({ ...formFilters, search: e.target.value })} /></Field>
            {view === 'withdrawals' ? <Field label="Estado"><select className={input} value={formFilters.status} onChange={e => setFormFilters({ ...formFilters, status: e.target.value })}><option value="">Todos</option>{Object.entries(settlements).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field> : <Field label="Categoría"><select className={input} value={formFilters.category} onChange={e => setFormFilters({ ...formFilters, category: e.target.value })}><option value="">Todas</option>{categories.map(c => <option key={c}>{c}</option>)}</select></Field>}
            <button className={button} disabled={loading}>Consultar</button>
        </form>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button className={`${button} ml-3`} disabled={loading || !filters} onClick={() => filters && void load(filters)}>Reintentar</button></div>}
        {loading && <p role="status" className="py-5 text-sm text-gray-500">Cargando registros…</p>}
        {data && !loading && <>
            <p className="text-xs text-gray-500">Resumen del {dayLabel(filters!.from)} al {dayLabel(filters!.to)}. Los totales del período incluyen todas las categorías y responsables, aunque filtres la tabla.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Efectivo retirado · período', data.summary.withdrawn], ['Gastos rendidos · período', data.summary.expenses], ['Vuelto recibido · período', data.summary.returned], ['Pendiente de rendir · todas las fechas', data.summary.pendingAllDates]].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{money(Number(value))}</p></div>)}</div>
            <div className="flex flex-wrap gap-2">{(['withdrawals', 'expenses'] as const).map(tab => <button key={tab} aria-pressed={view === tab} className={view === tab ? primary : button} onClick={() => filters && setFilters({ ...filters, view: tab, page: 0, status: '', category: '' })}>{tab === 'withdrawals' ? 'Salidas y rendiciones' : 'Gastos por categoría'}</button>)}</div>
            {view === 'withdrawals' ? <section className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr>{['Fecha / destino', 'Responsable / motivo', 'Retirado', 'Gastado', 'Vuelto', 'Por rendir', 'Estado', ''].map((h, i) => <th key={i} className="p-3">{h}</th>)}</tr></thead><tbody>{data.withdrawals.map(w => <tr key={w.id} className={`border-t ${w.status === 'void' ? 'text-gray-400' : ''}`}><td className="p-3 whitespace-nowrap">{dayLabel(w.movement_date)}<p className="mt-1 text-xs text-gray-500">{withdrawalKinds[w.kind]}</p></td><td className="min-w-44 p-3"><p className="font-medium">{w.recipient}</p><p className="mt-1 text-xs text-gray-500">{w.purpose}</p></td><td className="p-3 tabular-nums">{money(w.amount)}</td><td className="p-3 tabular-nums">{money(w.spent)}</td><td className="p-3 tabular-nums">{money(w.returned)}</td><td className="p-3 tabular-nums">{w.status === 'void' || w.kind !== 'advance' ? '—' : money(w.pending)}</td><td className="p-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${w.settlement === 'settled' ? 'bg-green-50 text-green-700' : w.settlement === 'void' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-800'}`}>{settlements[w.settlement]}</span></td><td className="p-3"><button className={button} onClick={() => void openDetail(w)}>Ver / rendir</button></td></tr>)}</tbody></table>{!data.withdrawals.length && <p className="p-8 text-center text-gray-500">No hay salidas con estos filtros. Los movimientos de Bsale todavía no se importan.</p>}</section> : <>
                <div className="grid gap-3 sm:grid-cols-3">{data.summary.categories.map(c => <div key={c.category} className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">{c.category}</p><p className="mt-1 text-xl font-semibold">{money(c.amount)}</p></div>)}</div>
                <section className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr>{['Fecha', 'Categoría / detalle', 'Comercio / comprobante', 'Responsable', 'Monto'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.expenses.map(e => <tr key={e.id} className="border-t"><td className="p-3 whitespace-nowrap">{dayLabel(e.entry_date)}</td><td className="p-3"><p className="font-medium">{e.category}</p><p className="mt-1 text-gray-500">{e.description}</p></td><td className="p-3">{e.merchant || 'Sin comercio'}<p className="mt-1 text-xs text-gray-500">{e.receipt_reference || 'Sin referencia de comprobante'}</p></td><td className="p-3">{e.recipient}</td><td className="p-3 tabular-nums">{money(e.amount)}</td></tr>)}</tbody></table>{!data.expenses.length && <p className="p-8 text-center text-gray-500">No hay gastos rendidos con estos filtros.</p>}</section>
                <p className="text-xs text-gray-500">Los gastos se filtran por la fecha de compra, aunque el retiro sea anterior. Depósitos, traslados y pagos a proveedores no se suman como gastos de compras diarias.</p>
            </>}
            <div className="flex items-center justify-between gap-3 text-sm text-gray-500"><p>{data.total} registros · Página {data.page + 1}</p><div className="flex gap-2"><button className={button} disabled={!data.page} onClick={() => filters && setFilters({ ...filters, page: filters.page - 1 })}>Anterior</button><button className={button} disabled={(data.page + 1) * 20 >= data.total} onClick={() => filters && setFilters({ ...filters, page: filters.page + 1 })}>Siguiente</button></div></div>
        </>}
        {detail && !draft && !voidForm && <Modal title="Salida y rendición" close={() => { ++detailSequence.current; setDetail(null); }}>
            <div className="space-y-4"><div><p className="font-semibold">{detail.withdrawal.recipient} · {money(detail.withdrawal.amount)}</p><p className="mt-1 text-sm text-gray-600">{dayLabel(detail.withdrawal.movement_date)} · {withdrawalKinds[detail.withdrawal.kind]} · {detail.withdrawal.cash_box}</p><p className="mt-2 text-sm">{detail.withdrawal.purpose}</p><p className="mt-1 text-xs text-gray-500">Referencia: {detail.withdrawal.reference || 'Sin referencia'} · Registró {detail.withdrawal.created_by_label} · {stamp(detail.withdrawal.created_at)}</p></div>
                {detail.withdrawal.status === 'void' ? <p className="rounded-lg bg-gray-100 p-3 text-sm">Anulada: {detail.withdrawal.void_reason}</p> : <div className="flex flex-wrap gap-2">{detail.withdrawal.kind === 'advance' && detail.withdrawal.pending > 0 && <button className={primary} onClick={() => newDraft(detail.withdrawal)}>Agregar gasto o vuelto</button>}<button className={button} onClick={() => { setFormError(''); setRetry(null); setVoidForm({ id: detail.withdrawal.id, action: 'void_withdrawal', reason: '' }); }}>Anular salida</button></div>}
                <p className="text-sm">Gastado: {money(detail.withdrawal.spent)} · Vuelto: {money(detail.withdrawal.returned)}{detail.withdrawal.kind === 'advance' && ` · Por rendir: ${money(detail.withdrawal.pending)}`}</p>
                {detailLoading && <p role="status">Cargando rendiciones…</p>}{detailError && <div role="alert" className="text-sm text-red-700">{detailError}<button className={`${button} ml-2`} onClick={() => void openDetail(detail.withdrawal, detail.page)}>Reintentar</button></div>}
                {!detailLoading && detail.entries.map(e => <article key={e.id} className={`rounded-lg border p-3 ${e.status === 'void' ? 'bg-gray-50 text-gray-500' : ''}`}><div className="flex justify-between gap-3"><p className="font-medium">{e.kind === 'return' ? 'Vuelto recibido' : e.category} · {money(e.amount)}</p><span className="text-xs">{dayLabel(e.entry_date)}</span></div><p className="mt-1 text-sm">{e.description}</p><p className="mt-1 text-xs text-gray-500">{[e.merchant, e.receipt_reference, e.created_by_label, stamp(e.created_at)].filter(Boolean).join(' · ')}</p>{e.status === 'void' ? <p className="mt-2 text-xs">Anulado: {e.void_reason}</p> : <button className={`${button} mt-2`} onClick={() => { setFormError(''); setRetry(null); setVoidForm({ id: e.id, action: 'void_entry', reason: '' }); }}>Anular registro</button>}</article>)}
                {!detailLoading && !detailError && !detail.entries.length && <p className="rounded-lg bg-gray-50 p-5 text-sm text-gray-500">Todavía no hay gastos ni vuelto registrados.</p>}
                <div className="flex justify-between gap-2"><button className={button} disabled={detailLoading || detail.page === 0} onClick={() => void openDetail(detail.withdrawal, detail.page - 1)}>Anterior</button><button className={button} disabled={detailLoading || !detail.hasMore} onClick={() => void openDetail(detail.withdrawal, detail.page + 1)}>Siguiente</button></div>
            </div>
        </Modal>}
        {draft && <Modal title={draft.action === 'withdrawal' ? 'Registrar salida de efectivo' : 'Agregar gasto o vuelto'} close={closeForms}>
            <form onSubmit={e => { e.preventDefault(); void save(draftPayload()); }} className="space-y-4">
                {formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
                <fieldset disabled={busy || Boolean(retry)} className="grid gap-4 sm:grid-cols-2">
                    <Field label={draft.action === 'withdrawal' ? 'Destino del retiro' : 'Tipo de rendición'}><select className={input} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>{draft.action === 'withdrawal' ? Object.entries(withdrawalKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>) : <><option value="expense">Gasto realizado</option><option value="return">Vuelto devuelto a caja</option></>}</select></Field>
                    <Field label="Fecha"><input required type="date" max={today()} min={draft.action === 'entry' ? detail?.withdrawal.movement_date : undefined} className={input} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></Field>
                    <Field label="Monto en pesos CLP"><input required type="number" min="1" max="10000000000" step="1" inputMode="numeric" className={input} value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} /></Field>
                    {draft.action === 'withdrawal' ? <>
                        <Field label="Persona que recibe / responsable"><input required maxLength={160} className={input} value={draft.recipient} onChange={e => setDraft({ ...draft, recipient: e.target.value })} /></Field>
                        <Field label="Caja de origen"><input required maxLength={120} className={input} value={draft.cashBox} onChange={e => setDraft({ ...draft, cashBox: e.target.value })} /></Field>
                        <Field label="Referencia del retiro (opcional)"><input maxLength={160} className={input} value={draft.reference} onChange={e => setDraft({ ...draft, reference: e.target.value })} /></Field>
                        <div className="sm:col-span-2"><Field label="Motivo o destino"><textarea required maxLength={500} rows={3} className={input} value={draft.purpose} onChange={e => setDraft({ ...draft, purpose: e.target.value })} /></Field></div>
                    </> : <>
                        {draft.kind === 'expense' && <><Field label="Categoría"><select className={input} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Comercio (opcional)"><input maxLength={160} className={input} value={draft.merchant} onChange={e => setDraft({ ...draft, merchant: e.target.value })} /></Field><Field label="Folio o referencia de comprobante (opcional)"><input maxLength={160} className={input} placeholder="Ej. Boleta 000123" value={draft.receiptReference} onChange={e => setDraft({ ...draft, receiptReference: e.target.value })} /></Field></>}
                        <div className="sm:col-span-2"><Field label={draft.kind === 'expense' ? 'Qué se compró' : 'Detalle de la devolución'}><textarea required maxLength={500} rows={3} className={input} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></Field></div>
                    </>}
                </fieldset>
                <p className="text-xs text-gray-500">{draft.action === 'withdrawal' ? draft.kind === 'advance' ? 'La salida quedará pendiente de rendición hasta registrar los gastos y el vuelto.' : 'Este retiro mueve efectivo y no se clasifica como gasto de compras diarias. Un pago a proveedor no actualiza automáticamente el módulo de Proveedores.' : `Pendiente al abrir el formulario: ${money(detail?.withdrawal.pending || 0)}. El saldo se valida nuevamente al guardar.`}</p>
                <button type="submit" disabled={busy} className={primary}>{busy ? 'Guardando…' : retry ? 'Reintentar mismo envío' : 'Guardar registro'}</button>
            </form>
        </Modal>}
        {voidForm && <Modal title="Anular registro" close={closeForms}><form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(voidForm); }}><p className="text-sm text-gray-600">El registro conservará su historial y dejará de afectar los totales. Para corregir un monto, anula el registro y crea uno nuevo. Una salida con rendiciones vigentes exige anularlas primero.</p>{formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{formError}</p>}<Field label="Motivo de anulación"><textarea required minLength={3} maxLength={500} disabled={busy || Boolean(retry)} className={input} value={voidForm.reason} onChange={e => setVoidForm({ ...voidForm, reason: e.target.value })} /></Field><button className={primary} disabled={busy}>{busy ? 'Guardando…' : retry ? 'Reintentar mismo envío' : 'Confirmar anulación'}</button></form></Modal>}
    </div>;
}
