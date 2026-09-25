insert into public.organizations (name, slug, created_by)
values ('Facto compartido', 'facto-compartido', null)
on conflict (slug) do nothing;

grant select on table public.organizations to anon;
grant select, insert, update, delete on table public.campaign_lists to anon;
grant select, insert, update, delete on table public.campaign_items to anon;
grant usage, select on all sequences in schema public to anon;

create policy organizations_select_shared
on public.organizations for select to anon
using (slug = 'facto-compartido');

create policy campaign_lists_shared_select
on public.campaign_lists for select to anon
using (
    organization_id = (
        select id from public.organizations where slug = 'facto-compartido'
    )
);

create policy campaign_lists_shared_insert
on public.campaign_lists for insert to anon
with check (
    created_by is null
    and updated_by is null
    and organization_id = (
        select id from public.organizations where slug = 'facto-compartido'
    )
);

create policy campaign_lists_shared_update
on public.campaign_lists for update to anon
using (
    organization_id = (
        select id from public.organizations where slug = 'facto-compartido'
    )
)
with check (
    created_by is null
    and updated_by is null
    and organization_id = (
        select id from public.organizations where slug = 'facto-compartido'
    )
);

create policy campaign_lists_shared_delete
on public.campaign_lists for delete to anon
using (
    organization_id = (
        select id from public.organizations where slug = 'facto-compartido'
    )
);

create policy campaign_items_shared_select
on public.campaign_items for select to anon
using (
    exists (
        select 1
        from public.campaign_lists c
        join public.organizations o on o.id = c.organization_id
        where c.id = campaign_items.campaign_list_id
          and o.slug = 'facto-compartido'
    )
);

create policy campaign_items_shared_insert
on public.campaign_items for insert to anon
with check (
    added_by is null
    and exists (
        select 1
        from public.campaign_lists c
        join public.organizations o on o.id = c.organization_id
        where c.id = campaign_items.campaign_list_id
          and o.slug = 'facto-compartido'
    )
);

create policy campaign_items_shared_update
on public.campaign_items for update to anon
using (
    exists (
        select 1
        from public.campaign_lists c
        join public.organizations o on o.id = c.organization_id
        where c.id = campaign_items.campaign_list_id
          and o.slug = 'facto-compartido'
    )
)
with check (
    added_by is null
    and exists (
        select 1
        from public.campaign_lists c
        join public.organizations o on o.id = c.organization_id
        where c.id = campaign_items.campaign_list_id
          and o.slug = 'facto-compartido'
    )
);

create policy campaign_items_shared_delete
on public.campaign_items for delete to anon
using (
    exists (
        select 1
        from public.campaign_lists c
        join public.organizations o on o.id = c.organization_id
        where c.id = campaign_items.campaign_list_id
          and o.slug = 'facto-compartido'
    )
);
