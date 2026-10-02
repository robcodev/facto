'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { recoverPendingPrintJobs } from '@/lib/picking/service';
import { revalidatePath } from 'next/cache';

async function requireUser() {
    const authClient = await createClient();
    const { data: { user }, error } = await authClient.auth.getUser();
    if (error || !user) throw new Error('Debes iniciar sesión para realizar esta acción.');
}

export async function getPickingDashboard() {
    try {
        const supabase = createAdminClient();
        const { data: organization, error: organizationError } = await supabase.from('organizations').select('id').eq('slug', 'facto-compartido').single();
        if (organizationError) throw new Error(organizationError.message);
        const { data, error } = await supabase.from('web_orders').select('id,bsale_checkout_id,document_number,pay_process,order_status,shipping_method,total,source_created_at,web_order_items(quantity,picked_quantity),print_jobs(status,attempts,last_error,printed_at)').eq('organization_id', organization.id).order('source_created_at', { ascending: false }).limit(100);
        if (error) throw new Error(error.message);
        const { data: agents } = await supabase.from('printer_agents').select('device_name,agent_version,last_seen_at,last_error').eq('organization_id', organization.id).order('last_seen_at', { ascending: false }).limit(1);
        const agent = agents?.[0] ?? null;
        const agentConnected = Boolean(agent?.last_seen_at && Date.now() - new Date(agent.last_seen_at).getTime() < 20_000);
        return { success: true as const, orders: data ?? [], agent, agentConnected };
    } catch (error) {
        return { success: false as const, orders: [], agent: null, agentConnected: false, error: error instanceof Error ? error.message : 'No pudimos cargar los pedidos.' };
    }
}

export async function getPickingOrder(documentNumber: number) {
    try {
        if (!Number.isInteger(documentNumber) || documentNumber <= 0) throw new Error('Número de preventa inválido.');
        const supabase = createAdminClient();
        const { data: organization, error: organizationError } = await supabase.from('organizations').select('id').eq('slug', 'facto-compartido').single();
        if (organizationError) throw new Error(organizationError.message);
        const { data, error } = await supabase.from('web_orders')
            .select('id,bsale_checkout_id,document_number,pay_process,order_status,shipping_method,total,source_created_at,picking_status,picking_started_at,picking_completed_at,web_order_items(id,sku,barcode,item_name,quantity,picked_quantity)')
            .eq('organization_id', organization.id)
            .eq('document_number', documentNumber)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('No encontramos esa preventa entre los pedidos sincronizados.');
        return { success: true as const, order: data };
    } catch (error) {
        return { success: false as const, order: null, error: error instanceof Error ? error.message : 'No pudimos cargar el pedido.' };
    }
}

export async function scanPickingProduct(orderId: number, code: string) {
    try {
        const cleanCode = String(code).trim();
        if (!Number.isInteger(orderId) || orderId <= 0 || !cleanCode || cleanCode.length > 100) throw new Error('Código inválido.');
        const supabase = createAdminClient();
        const { data, error } = await supabase.rpc('scan_picking_item', { p_order_id: orderId, p_code: cleanCode });
        if (error) throw new Error(error.message);
        return { success: true as const, result: data as { status: string; itemId?: number; pickedQuantity?: number; quantity?: number; completed?: boolean } };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos validar el producto.' };
    }
}

export async function reprintPickingOrder(orderId: number) {
    try {
        await requireUser();
        if (!Number.isInteger(orderId) || orderId <= 0) throw new Error('Pedido inválido.');

        const supabase = createAdminClient();
        const { data: organization, error: organizationError } = await supabase
            .from('organizations')
            .select('id')
            .eq('slug', 'facto-compartido')
            .single();
        if (organizationError) throw new Error(organizationError.message);

        const { data: order, error: orderError } = await supabase
            .from('web_orders')
            .select('id')
            .eq('id', orderId)
            .eq('organization_id', organization.id)
            .maybeSingle();
        if (orderError) throw new Error(orderError.message);
        if (!order) throw new Error('No encontramos ese pedido.');

        const { data: job, error: jobError } = await supabase
            .from('print_jobs')
            .select('id,status')
            .eq('order_id', orderId)
            .eq('organization_id', organization.id)
            .maybeSingle();
        if (jobError) throw new Error(jobError.message);
        if (job?.status === 'pending') throw new Error('La preventa ya está esperando al agente.');
        if (job?.status === 'processing') throw new Error('La preventa ya fue enviada al agente.');

        if (job) {
            const { error } = await supabase
                .from('print_jobs')
                .update({
                    status: 'pending',
                    attempts: 0,
                    locked_by: null,
                    locked_at: null,
                    printed_at: null,
                    last_error: null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', job.id)
                .in('status', ['printed', 'failed']);
            if (error) throw new Error(error.message);
        } else {
            const { error } = await supabase.from('print_jobs').insert({
                organization_id: organization.id,
                order_id: orderId,
                status: 'pending',
            });
            if (error) throw new Error(error.message);
        }

        return { success: true as const };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos solicitar la reimpresión.' };
    }
}

export async function markPickingOrderPrinted(orderId: number) {
    try {
        await requireUser();
        if (!Number.isInteger(orderId) || orderId <= 0) throw new Error('Pedido inválido.');

        const supabase = createAdminClient();
        const { data: organization, error: organizationError } = await supabase
            .from('organizations')
            .select('id')
            .eq('slug', 'facto-compartido')
            .single();
        if (organizationError) throw new Error(organizationError.message);

        const now = new Date().toISOString();
        const { data: job, error } = await supabase
            .from('print_jobs')
            .update({
                status: 'printed',
                printed_at: now,
                locked_by: null,
                locked_at: null,
                last_error: null,
                updated_at: now,
            })
            .eq('order_id', orderId)
            .eq('organization_id', organization.id)
            .in('status', ['pending', 'processing', 'failed'])
            .select('id')
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!job) throw new Error('La preventa ya está marcada como impresa o no tiene un trabajo pendiente.');

        revalidatePath('/picking');
        return { success: true as const };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos marcar la preventa como impresa.' };
    }
}

export async function recoverPendingOrders() {
    try {
        await requireUser();
        const result = await recoverPendingPrintJobs();
        revalidatePath('/picking');
        return { success: true as const, ...result };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos recuperar los pedidos pendientes.' };
    }
}
