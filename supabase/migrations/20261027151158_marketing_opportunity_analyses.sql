begin;
create table public.marketing_analyses (
 id uuid primary key,
 organization_id bigint not null references public.organizations(id),
 created_by uuid not null references auth.users(id),
 period_from date not null,
 period_to date not null check(period_to>=period_from),
 model text not null,
 prompt_version text not null,
 snapshot_hash text not null check(length(snapshot_hash)=64),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=220000),
 result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=100000),
 created_at timestamptz not null default now()
);
create index marketing_analyses_org_date on public.marketing_analyses(organization_id,created_at desc,id);
alter table public.marketing_analyses enable row level security;
revoke all on public.marketing_analyses from public,anon,authenticated;
grant select,insert on public.marketing_analyses to service_role;
commit;