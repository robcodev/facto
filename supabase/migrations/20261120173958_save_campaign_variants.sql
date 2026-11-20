create function public.save_campaign_variants(
    p_list_id bigint,
    p_organization_id bigint,
    p_items jsonb,
    p_replace_all boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    result jsonb;
begin
    if jsonb_typeof(p_items) is distinct from 'array' then
        raise exception 'La selección no es válida.';
    end if;
    if jsonb_array_length(p_items) > 5000 then
        raise exception 'La selección es demasiado grande.';
    end if;

    -- The list update checks edit permissions through RLS and serializes saves to the same list.
    update public.campaign_lists
    set updated_by = null
    where id = p_list_id and organization_id = p_organization_id;

    if not found then
        raise exception 'La lista no existe o no tienes permiso para editarla.';
    end if;

    with submitted as (
        select distinct on (item.bsale_variant_id)
            item.bsale_variant_id, item.bsale_product_id, item.sku,
            item.product_name, item.variant_name, item.discount_override
        from jsonb_array_elements(p_items) with ordinality as input(value, position)
        cross join lateral jsonb_to_record(input.value) as item(
            bsale_variant_id bigint,
            bsale_product_id bigint,
            sku text,
            product_name text,
            variant_name text,
            discount_override numeric
        )
        order by item.bsale_variant_id, input.position desc
    ), saved as (
        insert into public.campaign_items (
            campaign_list_id, scope, bsale_variant_id, bsale_product_id,
            sku, product_name, variant_name, discount_override, added_by
        )
        select p_list_id, 'variant', bsale_variant_id, bsale_product_id,
            sku, product_name, variant_name, discount_override, null
        from submitted
        on conflict (campaign_list_id, bsale_variant_id) where scope = 'variant'
        do update set
            sku = excluded.sku,
            product_name = excluded.product_name,
            variant_name = excluded.variant_name,
            discount_override = excluded.discount_override,
            added_by = excluded.added_by
        returning id, bsale_variant_id
    ), removed as (
        delete from public.campaign_items as item
        where p_replace_all and item.campaign_list_id = p_list_id and item.scope = 'variant'
          and not exists (
              select 1 from submitted where submitted.bsale_variant_id = item.bsale_variant_id
          )
    )
    select jsonb_build_object(
        'saved', count(*),
        'inserted_variant_ids', coalesce(
            jsonb_agg(saved.bsale_variant_id order by saved.bsale_variant_id) filter (where previous.id is null),
            '[]'::jsonb
        )
    )
    into result
    from saved
    -- The base table read uses the snapshot from before the writes in this statement.
    left join public.campaign_items as previous on previous.id = saved.id;

    return result;
end;
$$;

revoke execute on function public.save_campaign_variants(bigint, bigint, jsonb, boolean) from public, anon;
grant execute on function public.save_campaign_variants(bigint, bigint, jsonb, boolean) to authenticated;
