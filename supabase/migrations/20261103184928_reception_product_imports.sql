-- Private workflow journal. Business data is accessed only through authenticated
-- server routes, scoped to the fixed company and the authenticated creator.
create table public.reception_product_imports (
    id uuid primary key default gen_random_uuid(),
    organization_id bigint not null references public.organizations(id),
    created_by uuid not null references auth.users(id),
    document jsonb not null check (jsonb_typeof(document) = 'object'),
    version integer not null default 0 check (version >= 0),
    lease_token uuid,
    lease_until timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint reception_import_lease check ((lease_token is null) = (lease_until is null))
);
create index reception_imports_owner_updated_idx on public.reception_product_imports (organization_id, created_by, updated_at desc);
alter table public.reception_product_imports enable row level security;
revoke all on public.reception_product_imports from public, anon, authenticated;
grant select, insert, update on public.reception_product_imports to service_role;
comment on table public.reception_product_imports is 'Reviewed product/variant imports and non-retryable external write intents. No automatic stock receipts.';
