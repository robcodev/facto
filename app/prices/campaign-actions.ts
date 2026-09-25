'use server';

import { createClient } from '@/lib/supabase/server';

export type CampaignListSummary = {
    id: number;
    name: string;
    description: string | null;
    defaultDiscount: number | null;
    itemCount: number;
};

export type CampaignItemInput = {
    variantId: number;
    productId: number;
    sku: string;
    productName: string;
    variantName: string;
    discount: number;
};

export type CampaignStoredItem = CampaignItemInput & { id: number };

async function context() {
    const supabase = await createClient();
    const { data: organization, error: organizationError } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', 'facto-compartido')
        .maybeSingle();
    if (organizationError) throw new Error(organizationError.message);
    if (!organization) throw new Error('Falta habilitar el espacio compartido en Supabase.');
    return { supabase, organizationId: Number(organization.id) };
}

export async function getCampaignContext() {
    try {
        const { supabase, organizationId } = await context();
        const { data, error } = await supabase
            .from('campaign_lists')
            .select('id, name, description, default_discount, campaign_items(count)')
            .eq('organization_id', organizationId)
            .order('updated_at', { ascending: false });
        if (error) throw new Error(error.message);
        const lists: CampaignListSummary[] = (data ?? []).map((row) => ({
            id: Number(row.id),
            name: String(row.name),
            description: row.description == null ? null : String(row.description),
            defaultDiscount: row.default_discount == null ? null : Number(row.default_discount),
            itemCount: Array.isArray(row.campaign_items) ? Number(row.campaign_items[0]?.count ?? 0) : 0,
        }));
        return { success: true as const, lists };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No pudimos cargar las listas.';
        return { success: false as const, error: message, lists: [] as CampaignListSummary[] };
    }
}

export async function createCampaignList(name: string) {
    try {
        const cleanName = name.trim();
        if (cleanName.length < 2 || cleanName.length > 120) throw new Error('El nombre debe tener entre 2 y 120 caracteres.');
        const { supabase, organizationId } = await context();
        const { data, error } = await supabase.from('campaign_lists').insert({
            organization_id: organizationId,
            name: cleanName,
            created_by: null,
            updated_by: null,
        }).select('id, name, description, default_discount').single();
        if (error) throw new Error(error.code === '23505' ? 'Ya existe una lista con ese nombre.' : error.message);
        return { success: true as const, list: { id: Number(data.id), name: String(data.name), description: null, defaultDiscount: null, itemCount: 0 } satisfies CampaignListSummary };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos crear la lista.' };
    }
}

export async function saveCampaignItems(listId: number, items: CampaignItemInput[], replaceAll = false) {
    try {
        if (!Number.isInteger(listId) || listId <= 0) throw new Error('Selecciona una lista válida.');
        if (!Array.isArray(items)) throw new Error('La selección no es válida.');
        if (items.length > 5000) throw new Error('La selección es demasiado grande.');
        const { supabase, organizationId } = await context();
        const { data: list, error: listError } = await supabase.from('campaign_lists').select('id').eq('id', listId).eq('organization_id', organizationId).maybeSingle();
        if (listError) throw new Error(listError.message);
        if (!list) throw new Error('La lista no existe o no pertenece a tu empresa.');

        const rows = items.map((item) => {
            if (!Number.isInteger(item.variantId) || !Number.isInteger(item.productId) || !Number.isFinite(item.discount)) throw new Error('Hay un producto inválido en la selección.');
            return {
                campaign_list_id: listId,
                scope: 'variant',
                bsale_product_id: item.productId,
                bsale_variant_id: item.variantId,
                sku: item.sku.trim(),
                product_name: item.productName.trim(),
                variant_name: item.variantName.trim() || null,
                discount_override: Math.round(item.discount * 100) / 100,
                added_by: null,
            };
        });
        const { data: existing, error: existingError } = await supabase
            .from('campaign_items')
            .select('id, bsale_variant_id')
            .eq('campaign_list_id', listId)
            .not('bsale_variant_id', 'is', null);
        if (existingError) throw new Error(existingError.message);
        const existingByVariant = new Map((existing ?? []).map((row) => [Number(row.bsale_variant_id), Number(row.id)]));
        if (replaceAll) {
            const retained = new Set(rows.map((row) => row.bsale_variant_id));
            const removedIds = [...existingByVariant.entries()].filter(([variantId]) => !retained.has(variantId)).map(([, id]) => id);
            if (removedIds.length > 0) {
                const { error: deleteError } = await supabase.from('campaign_items').delete().in('id', removedIds);
                if (deleteError) throw new Error(deleteError.message);
            }
        }
        const inserts = rows.filter((row) => !existingByVariant.has(row.bsale_variant_id));
        if (inserts.length > 0) {
            const { error: insertError } = await supabase.from('campaign_items').insert(inserts);
            if (insertError) throw new Error(insertError.message);
        }
        const updates = rows.filter((row) => existingByVariant.has(row.bsale_variant_id));
        for (let start = 0; start < updates.length; start += 10) {
            const batch = updates.slice(start, start + 10);
            const results = await Promise.all(batch.map((row) => supabase
                .from('campaign_items')
                .update({
                    sku: row.sku,
                    product_name: row.product_name,
                    variant_name: row.variant_name,
                    discount_override: row.discount_override,
                    added_by: row.added_by,
                })
                .eq('id', existingByVariant.get(row.bsale_variant_id)!)));
            const failed = results.find((result) => result.error);
            if (failed?.error) throw new Error(failed.error.message);
        }
        await supabase.from('campaign_lists').update({ updated_by: null }).eq('id', listId);
        return { success: true as const, saved: rows.length };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos guardar los productos.' };
    }
}

export async function loadCampaignItems(listId: number) {
    try {
        const { supabase, organizationId } = await context();
        const { data: list, error: listError } = await supabase.from('campaign_lists').select('id').eq('id', listId).eq('organization_id', organizationId).maybeSingle();
        if (listError) throw new Error(listError.message);
        if (!list) throw new Error('La lista no existe o no pertenece a tu empresa.');
        const { data, error } = await supabase.from('campaign_items').select('id, bsale_variant_id, bsale_product_id, sku, product_name, variant_name, discount_override').eq('campaign_list_id', listId).order('product_name');
        if (error) throw new Error(error.message);
        const items: CampaignStoredItem[] = (data ?? []).map((row) => ({
            id: Number(row.id),
            variantId: Number(row.bsale_variant_id),
            productId: Number(row.bsale_product_id),
            sku: String(row.sku ?? ''),
            productName: String(row.product_name),
            variantName: String(row.variant_name ?? ''),
            discount: Number(row.discount_override ?? 0),
        }));
        return { success: true as const, items };
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'No pudimos cargar los productos.' };
    }
}
