'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export async function getPickingDashboard() {
    try {
        const supabase = createAdminClient();
        const { data: organization, error: organizationError } = await supabase.from('organizations').select('id').eq('slug', 'facto-compartido').single();
        if (organizationError) throw new Error(organizationError.message);
        const { data, error } = await supabase.from('web_orders').select('id,bsale_checkout_id,document_number,pay_process,order_status,shipping_method,total,source_created_at,web_order_items(quantity,picked_quantity),print_jobs(status,attempts,last_error,printed_at)').eq('organization_id', organization.id).order('source_created_at', { ascending: false }).limit(100);
        if (error) throw new Error(error.message);
        return { success: true as const, orders: data ?? [] };
    } catch (error) {
        return { success: false as const, orders: [], error: error instanceof Error ? error.message : 'No pudimos cargar los pedidos.' };
    }
}

export async function getPickingOrder(documentNumber: number) {
    try {
        if (!Number.isInteger(documentNumber) || documentNumber <= 0) throw new Error('Número de preventa inválido.');
        const supabase = createAdminClient();
        const { data: organization, error: organizationError } = await supabase.from('organizations').select('id').eq('slug', 'facto-compartido').single();
        if (organizationError) throw new Error(organizationError.message);
        const { data, error } = await supabase.from('web_orders')
            .select('id,bsale_checkout_id,document_number,pay_process,order_status,shipping_method,total,source_created_at,web_order_items(id,sku,item_name,quantity,picked_quantity)')
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
