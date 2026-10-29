import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CashFilters, CashMutation } from './cash-core';

export class CashError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function cashContext() {
    const auth = await createClient();
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) throw new CashError('Debes iniciar sesión.', 401);
    const db = createAdminClient();
    const org = await db.from('organizations').select('id').eq('slug', 'facto-compartido').single();
    if (org.error || !org.data) throw new CashError('No encontramos la empresa de Facto.', 403);
    // Current owner-authorized shared workspace: every signed-in employee can use
    // this company. Never accept an organization or actor supplied by the browser.
    return { db, orgId: Number(org.data.id), userId: user.id, actor: user.email || user.id };
}
type Context = Awaited<ReturnType<typeof cashContext>>;
function checked<T>(result: { data: T; error: { code?: string; message?: string } | null }): T {
    if (result.error) {
        if (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(result.error.code || '')) throw new CashError('Falta habilitar Caja y gastos en la base de datos.', 503);
        if (result.error.code === 'P0001') throw new CashError(result.error.message || 'Revisa los datos de la rendición.', 409);
        if (['23505', '23514', '23503', '22007', '22008', '22003'].includes(result.error.code || '')) throw new CashError('Los datos no son válidos o el movimiento ya existe. Actualiza y revisa el registro.', 409);
        console.error('Caja: fallo de almacenamiento', result.error.code);
        throw new CashError('No pudimos consultar o guardar Caja y gastos. Puedes reintentar.', 503);
    }
    return result.data;
}
export async function report(ctx: Context, filters: CashFilters) {
    return checked(await ctx.db.rpc('finance_cash_report', { p_org: ctx.orgId, p_from: filters.from, p_to: filters.to, p_view: filters.view, p_status: filters.status, p_search: filters.search, p_category: filters.category, p_page: filters.page }));
}
export async function entries(ctx: Context, id: string, page: number) {
    const parent = checked(await ctx.db.from('finance_cash_withdrawals').select('id').eq('organization_id', ctx.orgId).eq('id', id).maybeSingle());
    if (!parent) throw new CashError('No encontramos el retiro.', 404);
    const data = checked(await ctx.db.from('finance_cash_entries').select('id,withdrawal_id,entry_date,kind,amount,category,description,merchant,receipt_reference,status,created_at,created_by_label,void_reason,voided_at').eq('organization_id', ctx.orgId).eq('withdrawal_id', id).order('created_at', { ascending: false }).order('id').range(page * 25, page * 25 + 25)) || [];
    return { entries: data.slice(0, 25), hasMore: data.length > 25, page };
}
export async function mutate(ctx: Context, input: CashMutation) {
    const { action, id, ...data } = input;
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const saved = checked(await ctx.db.rpc('finance_cash_mutate', { p_org: ctx.orgId, p_actor: ctx.userId, p_actor_label: ctx.actor, p_action: action, p_id: id, p_hash: hash, p_data: data }));
    return { id: saved };
}
export function cashError(error: unknown) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || 'Revisa los datos.' }, { status: 422 });
    if (error instanceof CashError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Caja: error inesperado', error instanceof Error ? error.name : 'unknown');
    return Response.json({ error: 'No pudimos completar la operación. Revisa la conexión y reintenta.' }, { status: 500 });
}
