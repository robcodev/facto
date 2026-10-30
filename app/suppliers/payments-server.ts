import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { validateChoice, type Invoice, type PaidRecord, type PaymentChoice } from './core';

export class PaymentError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function paymentContext() {
    const auth = await createClient();
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) throw new PaymentError('Debes iniciar sesión.', 401);
    const db = createAdminClient();
    const { data: org, error: orgError } = await db.from('organizations').select('id').eq('slug', 'facto-compartido').single();
    if (orgError || !org) throw new PaymentError('No encontramos la empresa de Facto.', 403);
    // Same owner-authorized shared-company access as Intel and Caja. No org or actor from the client.
    return { db, orgId: Number(org.id), userId: user.id, actor: user.email || user.id };
}
type Context = Awaited<ReturnType<typeof paymentContext>>;
type PaymentRow = { invoice_key: string; method: PaidRecord['method']; cheque: string; paid_total: number | string; currency: string; paid_at: string; updated_at: string; actor: string; revision: number };
const columns = 'invoice_key,method,cheque,paid_total,currency,paid_at,updated_at,actor,revision';
function mapped(row: PaymentRow): PaidRecord { return { method: row.method, cheque: row.cheque, paidAt: row.paid_at, updatedAt: row.updated_at, actor: row.actor, revision: row.revision, total: Number(row.paid_total), currency: row.currency }; }
function setupMissing(error: { code?: string }) { return ['42P01', 'PGRST205'].includes(error.code || ''); }
export async function readPayments(ctx: Context, invoices: Invoice[]) {
    if (!invoices.length) return { payments: {} as Record<string, PaidRecord>, paymentStorage: 'shared' as 'shared' | 'local' };
    const { data, error } = await ctx.db.from('supplier_invoice_payments').select(columns).eq('organization_id', ctx.orgId).in('invoice_key', invoices.map(i => i.key));
    if (error) {
        if (setupMissing(error)) return { payments: {} as Record<string, PaidRecord>, paymentStorage: 'local' as const };
        throw new PaymentError('No pudimos consultar los pagos guardados. No se puede determinar cuáles están pagadas. Reintenta.', 503);
    }
    return { payments: Object.fromEntries((data as PaymentRow[]).map(row => [row.invoice_key, mapped(row)])), paymentStorage: 'shared' as const };
}
export async function writePayment(ctx: Context, invoice: Invoice, choice: PaymentChoice, revision: number) {
    const valid = validateChoice(choice);
    if (!valid.method) throw new PaymentError('Selecciona una forma de pago para marcar la factura como pagada.');
    const existing = await ctx.db.from('supplier_invoice_payments').select(`${columns},bsale_id`).eq('organization_id', ctx.orgId).eq('invoice_key', invoice.key).maybeSingle();
    if (existing.error) throw new PaymentError(setupMissing(existing.error) ? 'Falta habilitar el registro compartido de pagos.' : 'No pudimos consultar el registro de pago.', 503);
    if ((existing.data?.revision || 0) !== revision) throw new PaymentError('Otra persona actualizó este pago. Actualiza Bsale antes de guardar.', 409);
    const values = { method: valid.method, cheque: valid.cheque, paid_total: invoice.total, currency: invoice.currency, updated_by: ctx.userId, actor: ctx.actor };
    if (existing.data && existing.data.method === valid.method && existing.data.cheque === valid.cheque && Number(existing.data.paid_total) === invoice.total && existing.data.currency === invoice.currency) return mapped(existing.data as PaymentRow);
    const result = existing.data
        ? await ctx.db.from('supplier_invoice_payments').update(values).eq('organization_id', ctx.orgId).eq('invoice_key', invoice.key).eq('revision', revision).select(columns).maybeSingle()
        : await ctx.db.from('supplier_invoice_payments').insert({ ...values, organization_id: ctx.orgId, invoice_key: invoice.key, bsale_id: invoice.id }).select(columns).single();
    if (result.error?.code === '23505' || (!result.error && !result.data)) throw new PaymentError('El pago cambió mientras guardabas. Actualiza y revisa su estado.', 409);
    if (result.error) throw new PaymentError('No se guardó el pago. Reintenta; la factura no se marcará como pagada.', 503);
    return mapped(result.data as PaymentRow);
}
