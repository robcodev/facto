create table public.catalog_reading_jobs (
    id uuid primary key default gen_random_uuid(),
    organization_id bigint not null references public.organizations(id),
    created_by uuid not null references auth.users(id),
    source_hash text not null,
    pipeline_version integer not null,
    generation uuid not null,
    status text not null check (status in ('queued','reading','grouping','completed','failed')),
    sources jsonb not null check (jsonb_typeof(sources) = 'array'),
    progress jsonb not null check (jsonb_typeof(progress) = 'object'),
    run_id text,
    project_id uuid references public.reception_product_imports(id),
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, created_by, source_hash, pipeline_version)
);
create index catalog_reading_owner_updated_idx on public.catalog_reading_jobs (organization_id, created_by, updated_at desc);
alter table public.catalog_reading_jobs enable row level security;
revoke all on public.catalog_reading_jobs from public, anon, authenticated, service_role;
grant select, insert, update on public.catalog_reading_jobs to service_role;
-- Private originals. Only authenticated server routes use the admin storage client.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-reading', 'catalog-reading', false, 4194304, array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']);
