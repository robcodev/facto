create table if not exists public.product_research_drafts (
    id bigint generated always as identity primary key,
    organization_id bigint not null references public.organizations(id) on delete cascade,
    bsale_product_id bigint not null check (bsale_product_id > 0),
    product_name text not null check (length(trim(product_name)) between 2 and 240),
    brand_name text not null default '',
    product_snapshot jsonb not null default '{}'::jsonb,
    sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
    facts jsonb not null default '[]'::jsonb check (jsonb_typeof(facts) = 'array'),
    warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
    confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
    block_one_html text not null default '',
    block_two_html text not null default '',
    status text not null default 'draft' check (status in ('draft', 'needs_review', 'approved')),
    prompt_version text not null default 'multisport-v1',
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint product_research_drafts_org_product_unique unique (organization_id, bsale_product_id)
);

create index if not exists product_research_drafts_org_status_idx
    on public.product_research_drafts (organization_id, status, updated_at desc);

drop trigger if exists product_research_drafts_set_updated_at on public.product_research_drafts;
create trigger product_research_drafts_set_updated_at
before update on public.product_research_drafts
for each row execute function public.set_updated_at();

alter table public.product_research_drafts enable row level security;

revoke all on table public.product_research_drafts from public, anon, authenticated;
revoke all on sequence public.product_research_drafts_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.product_research_drafts to service_role;
grant usage, select on sequence public.product_research_drafts_id_seq to service_role;
