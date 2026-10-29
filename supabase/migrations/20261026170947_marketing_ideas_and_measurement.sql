begin;
create table public.marketing_ideas (
 id uuid primary key, organization_id bigint not null references public.organizations(id), fingerprint text not null,
 product_id text not null, variant_id text not null, title text not null check(length(title) between 1 and 240),
 format text not null check(format in ('reel','historias','carrusel','banner','email')),
 status text not null check(status in ('draft','reviewed','discarded')),
 content jsonb not null check(jsonb_typeof(content)='object'), evidence jsonb not null check(jsonb_typeof(evidence)='object'),
 model text not null, prompt_version text not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null, updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,fingerprint)
);
create index marketing_ideas_page on public.marketing_ideas(organization_id,created_at desc,id);
create table public.marketing_publications (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 idea_id uuid not null, channel text not null check(length(channel) between 1 and 100),
 destination_url text not null, publication_url text, published_at timestamptz not null,
 utm_source text not null, utm_medium text not null, utm_campaign text not null, utm_content text not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,idea_id) references public.marketing_ideas(organization_id,id),
 unique(organization_id,utm_source,utm_medium,utm_campaign,utm_content)
);
create index marketing_publications_idea on public.marketing_publications(organization_id,idea_id,published_at desc);
-- Shared source observations, not a second copy of catalogue or sales. No user-level data.
create table public.intel_web_reports (
 id uuid primary key default gen_random_uuid(),organization_id bigint not null references public.organizations(id),
 source text not null check(source in ('ga4','search_console')),property_id text not null,
 report_kind text not null check(report_kind in ('campaign','landing','search_page')),
 period_from date not null,period_to date not null check(period_to>=period_from),
 rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=1000),
 metadata jsonb not null check(jsonb_typeof(metadata)='object'), observed_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,source,property_id,report_kind,period_from,period_to)
);
create index intel_web_reports_page on public.intel_web_reports(organization_id,observed_at desc,id);
create table public.marketing_results (
 id uuid primary key default gen_random_uuid(),organization_id bigint not null references public.organizations(id),
 publication_id uuid not null,period_from date not null,period_to date not null check(period_to>=period_from),
 source text not null check(source in ('manual','platform_export')),
 currency text check(currency ~ '^[A-Z]{3}$'),spend numeric(18,4) check(spend>=0),
 impressions bigint check(impressions>=0),reach bigint check(reach>=0),clicks bigint check(clicks>=0),
 purchases numeric(18,4) check(purchases>=0),revenue numeric(18,4) check(revenue>=0),
 attribution_basis text not null check(length(attribution_basis) between 1 and 1000),
 notes text not null default '',created_by uuid not null references auth.users(id),observed_at timestamptz not null default now(),
 foreign key(organization_id,publication_id) references public.marketing_publications(organization_id,id),
 check((spend is null and revenue is null) or currency is not null),
 unique(organization_id,publication_id,source,period_from,period_to)
);
create index marketing_results_publication on public.marketing_results(organization_id,publication_id,period_to desc);
create table public.marketing_product_links (
 organization_id bigint not null references public.organizations(id),product_id text not null,
 source text not null check(source in ('ga4','search_console')),property_id text not null,
 external_key text not null,verified_by uuid not null references auth.users(id),verified_at timestamptz not null default now(),
 primary key(organization_id,source,property_id,external_key)
);
create index marketing_links_product on public.marketing_product_links(organization_id,product_id);
create function public.marketing_keep_evidence() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id
 or new.fingerprint is distinct from old.fingerprint or new.evidence is distinct from old.evidence
 or new.product_id is distinct from old.product_id or new.variant_id is distinct from old.variant_id
 or new.format is distinct from old.format or new.model is distinct from old.model
 or new.prompt_version is distinct from old.prompt_version or new.created_by is distinct from old.created_by
 or new.created_at is distinct from old.created_at then raise exception 'La evidencia y procedencia original no se pueden sustituir';end if;
 new.updated_at=now();return new;
end $$;
revoke all on function public.marketing_keep_evidence() from public,anon,authenticated;
create trigger marketing_ideas_preserve before update on public.marketing_ideas for each row execute function public.marketing_keep_evidence();
alter table public.marketing_ideas enable row level security;
alter table public.marketing_publications enable row level security;
alter table public.marketing_results enable row level security;
alter table public.marketing_product_links enable row level security;
alter table public.intel_web_reports enable row level security;
revoke all on public.marketing_ideas,public.marketing_publications,public.marketing_results,public.marketing_product_links,public.intel_web_reports from public,anon,authenticated;
grant select,insert,update on public.marketing_ideas,public.marketing_publications,public.marketing_results,public.marketing_product_links,public.intel_web_reports to service_role;
commit;
