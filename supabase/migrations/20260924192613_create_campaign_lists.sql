create table public.organizations (
    id bigint generated always as identity primary key,
    name text not null check (length(trim(name)) between 2 and 120),
    slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.organization_members (
    organization_id bigint not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'editor' check (role in ('owner', 'admin', 'editor', 'viewer')),
    created_at timestamptz not null default now(),
    primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members(user_id);

create table public.campaign_lists (
    id bigint generated always as identity primary key,
    organization_id bigint not null references public.organizations(id) on delete cascade,
    name text not null check (length(trim(name)) between 2 and 120),
    description text,
    default_discount numeric(7, 2) check (default_discount > -1000 and default_discount < 100),
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, name)
);

create index campaign_lists_organization_id_idx on public.campaign_lists(organization_id);

create table public.campaign_items (
    id bigint generated always as identity primary key,
    campaign_list_id bigint not null references public.campaign_lists(id) on delete cascade,
    scope text not null check (scope in ('product', 'variant')),
    bsale_product_id bigint not null,
    bsale_variant_id bigint,
    sku text,
    product_name text not null,
    variant_name text,
    discount_override numeric(7, 2) check (discount_override > -1000 and discount_override < 100),
    added_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint campaign_items_scope_fields_check check (
        (scope = 'product' and bsale_variant_id is null)
        or (scope = 'variant' and bsale_variant_id is not null and sku is not null)
    )
);

create index campaign_items_campaign_list_id_idx on public.campaign_items(campaign_list_id);
create index campaign_items_bsale_product_id_idx on public.campaign_items(bsale_product_id);
create index campaign_items_bsale_variant_id_idx on public.campaign_items(bsale_variant_id) where bsale_variant_id is not null;
create unique index campaign_items_unique_product_idx
    on public.campaign_items(campaign_list_id, bsale_product_id)
    where scope = 'product';
create unique index campaign_items_unique_variant_idx
    on public.campaign_items(campaign_list_id, bsale_variant_id)
    where scope = 'variant';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger campaign_lists_set_updated_at
before update on public.campaign_lists
for each row execute function public.set_updated_at();

create trigger campaign_items_set_updated_at
before update on public.campaign_items
for each row execute function public.set_updated_at();

revoke execute on function public.set_updated_at() from public, anon, authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.campaign_lists enable row level security;
alter table public.campaign_items enable row level security;

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;
revoke all on table public.campaign_lists from anon, authenticated;
revoke all on table public.campaign_items from anon, authenticated;
grant select, insert, update, delete on table public.organizations to authenticated;
grant select, insert, update, delete on table public.organization_members to authenticated;
grant select, insert, update, delete on table public.campaign_lists to authenticated;
grant select, insert, update, delete on table public.campaign_items to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy organizations_select_members
on public.organizations for select to authenticated
using (
    created_by = (select auth.uid())
    or exists (
        select 1 from public.organization_members m
        where m.organization_id = organizations.id
          and m.user_id = (select auth.uid())
    )
);

create policy organizations_insert_creator
on public.organizations for insert to authenticated
with check (created_by = (select auth.uid()));

create policy organizations_update_admins
on public.organizations for update to authenticated
using (exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
))
with check (exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
));

create policy organization_members_select_self
on public.organization_members for select to authenticated
using (user_id = (select auth.uid()));

create policy organization_members_insert_bootstrap_or_admin
on public.organization_members for insert to authenticated
with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
        select 1 from public.organizations o
        where o.id = organization_id
          and o.created_by = (select auth.uid())
    )
);

create policy campaign_lists_select_members
on public.campaign_lists for select to authenticated
using (exists (
    select 1 from public.organization_members m
    where m.organization_id = campaign_lists.organization_id
      and m.user_id = (select auth.uid())
));

create policy campaign_lists_insert_editors
on public.campaign_lists for insert to authenticated
with check (
    created_by = (select auth.uid())
    and exists (
        select 1 from public.organization_members m
        where m.organization_id = campaign_lists.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin', 'editor')
    )
);

create policy campaign_lists_update_editors
on public.campaign_lists for update to authenticated
using (exists (
    select 1 from public.organization_members m
    where m.organization_id = campaign_lists.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
))
with check (exists (
    select 1 from public.organization_members m
    where m.organization_id = campaign_lists.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
));

create policy campaign_lists_delete_admins
on public.campaign_lists for delete to authenticated
using (exists (
    select 1 from public.organization_members m
    where m.organization_id = campaign_lists.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
));

create policy campaign_items_select_members
on public.campaign_items for select to authenticated
using (exists (
    select 1
    from public.campaign_lists c
    join public.organization_members m on m.organization_id = c.organization_id
    where c.id = campaign_items.campaign_list_id
      and m.user_id = (select auth.uid())
));

create policy campaign_items_insert_editors
on public.campaign_items for insert to authenticated
with check (
    added_by = (select auth.uid())
    and exists (
        select 1
        from public.campaign_lists c
        join public.organization_members m on m.organization_id = c.organization_id
        where c.id = campaign_items.campaign_list_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin', 'editor')
    )
);

create policy campaign_items_update_editors
on public.campaign_items for update to authenticated
using (exists (
    select 1
    from public.campaign_lists c
    join public.organization_members m on m.organization_id = c.organization_id
    where c.id = campaign_items.campaign_list_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
))
with check (exists (
    select 1
    from public.campaign_lists c
    join public.organization_members m on m.organization_id = c.organization_id
    where c.id = campaign_items.campaign_list_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
));

create policy campaign_items_delete_editors
on public.campaign_items for delete to authenticated
using (exists (
    select 1
    from public.campaign_lists c
    join public.organization_members m on m.organization_id = c.organization_id
    where c.id = campaign_items.campaign_list_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
));
