alter table public.web_orders
    add column picking_status text not null default 'pending',
    add column picking_started_at timestamptz,
    add column picking_completed_at timestamptz;

alter table public.web_orders
    add constraint web_orders_picking_status_check
    check (picking_status in ('pending', 'in_progress', 'completed'));

alter table public.web_order_items
    add column barcode text;

create index web_order_items_barcode_idx
    on public.web_order_items (order_id, barcode)
    where barcode is not null and barcode <> '';

create or replace function public.scan_picking_item(p_order_id bigint, p_code text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    selected_item public.web_order_items%rowtype;
    is_complete boolean;
begin
    if nullif(trim(p_code), '') is null then
        return jsonb_build_object('status', 'invalid_code');
    end if;

    select * into selected_item
    from public.web_order_items
    where order_id = p_order_id
      and (sku = trim(p_code) or barcode = trim(p_code))
      and picked_quantity < quantity
    order by id
    for update
    limit 1;

    if not found then
        if exists (
            select 1 from public.web_order_items
            where order_id = p_order_id
              and (sku = trim(p_code) or barcode = trim(p_code))
        ) then
            return jsonb_build_object('status', 'already_complete');
        end if;
        return jsonb_build_object('status', 'not_in_order');
    end if;

    update public.web_order_items
    set picked_quantity = picked_quantity + 1
    where id = selected_item.id
    returning * into selected_item;

    update public.web_orders
    set picking_status = 'in_progress',
        picking_started_at = coalesce(picking_started_at, now()),
        updated_at = now()
    where id = p_order_id and picking_status = 'pending';

    select not exists (
        select 1 from public.web_order_items
        where order_id = p_order_id and picked_quantity < quantity
    ) into is_complete;

    if is_complete then
        update public.web_orders
        set picking_status = 'completed',
            picking_completed_at = now(),
            updated_at = now()
        where id = p_order_id;
    end if;

    return jsonb_build_object(
        'status', 'accepted',
        'itemId', selected_item.id,
        'pickedQuantity', selected_item.picked_quantity,
        'quantity', selected_item.quantity,
        'completed', is_complete
    );
end;
$$;

revoke all on function public.scan_picking_item(bigint, text) from public, anon, authenticated;
grant execute on function public.scan_picking_item(bigint, text) to service_role;
