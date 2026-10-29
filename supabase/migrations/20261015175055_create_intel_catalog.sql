-- Intel keeps source identifiers and full source responses independently of the UI.
-- Service-only writes; every server endpoint checks the authenticated organization.
begin;
create table public.intel_sync_runs (
 id uuid primary key default gen_random_uuid(),
 organization_id bigint not null references public.organizations(id),
 status text not null default 'running' check (status in ('running','completed')),
 office_id bigint not null, price_list_id bigint not null,
 stage integer not null default 0, page_offset integer not null default 0,
 processed integer not null default 0, last_error text,
 started_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create unique index intel_one_running_sync on public.intel_sync_runs(organization_id) where status = 'running';
create index intel_runs_org_date on public.intel_sync_runs(organization_id,started_at desc);
create table public.intel_records (
 id bigint generated always as identity primary key,
 organization_id bigint not null references public.organizations(id),
 source text not null default 'bsale', resource text not null, external_id text not null,
 name text not null default '', product_id text, category_id text,
 data jsonb not null, raw jsonb not null, content_hash text not null,
 first_seen_at timestamptz not null default now(), observed_at timestamptz not null default now(),
 run_id uuid not null references public.intel_sync_runs(id),
 unique(organization_id,source,resource,external_id)
);
create index intel_records_catalog on public.intel_records(organization_id,resource,product_id);
create index intel_records_category on public.intel_records(organization_id,resource,category_id);
create table public.intel_record_versions (
 id bigint generated always as identity primary key,
 organization_id bigint not null references public.organizations(id),
 record_id bigint not null references public.intel_records(id),
 run_id uuid not null references public.intel_sync_runs(id),
 data jsonb not null, raw jsonb not null, content_hash text not null,
 observed_at timestamptz not null default now()
);
create index intel_versions_record on public.intel_record_versions(organization_id,record_id,observed_at desc);
create table public.intel_category_settings (
 organization_id bigint not null references public.organizations(id),
 category_id text not null, included boolean not null default true,
 editorial_name text not null default '', parent_name text not null default '',
 responsible text not null default '', priority integer not null default 2 check(priority between 1 and 3),
 updated_at timestamptz not null default now(),
 primary key(organization_id,category_id)
);
create table public.intel_stock_daily (
 organization_id bigint not null references public.organizations(id),
 office_id bigint not null, variant_id text not null, day date not null,
 available numeric not null, observed_at timestamptz not null default now(),
 run_id uuid not null references public.intel_sync_runs(id),
 primary key(organization_id,office_id,variant_id,day)
);
-- Apply one page and advance the checkpoint atomically. Concurrent/replayed pages are harmless.
create function public.intel_commit_page(p_org bigint, p_run uuid, p_stage integer, p_offset integer,
 p_rows jsonb, p_next_stage integer, p_next_offset integer, p_done boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.intel_sync_runs; item jsonb; saved_id bigint; old_hash text;
begin
 select * into r from public.intel_sync_runs where id=p_run and organization_id=p_org for update;
 if not found or r.status <> 'running' or r.stage <> p_stage or r.page_offset <> p_offset then return false; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  old_hash := null;
  select content_hash into old_hash from public.intel_records
   where organization_id=p_org and source='bsale' and resource=item->>'resource' and external_id=item->>'external_id';
  insert into public.intel_records(organization_id,resource,external_id,name,product_id,category_id,data,raw,content_hash,run_id)
  values(p_org,item->>'resource',item->>'external_id',item->>'name',item->>'product_id',item->>'category_id',item->'data',item->'raw',item->>'content_hash',p_run)
  on conflict(organization_id,source,resource,external_id) do update set
   name=excluded.name,product_id=excluded.product_id,category_id=excluded.category_id,
   data=excluded.data,raw=excluded.raw,content_hash=excluded.content_hash,run_id=p_run,observed_at=now()
  returning id into saved_id;
  if old_hash is distinct from item->>'content_hash' then
   insert into public.intel_record_versions(organization_id,record_id,run_id,data,raw,content_hash)
    values(p_org,saved_id,p_run,item->'data',item->'raw',item->>'content_hash');
  end if;
  if item->>'resource'='stocks' then
   insert into public.intel_stock_daily(organization_id,office_id,variant_id,day,available,run_id)
    values(p_org,r.office_id,item->'data'->>'variantId',(now() at time zone 'America/Santiago')::date,(item->'data'->>'available')::numeric,p_run)
    on conflict(organization_id,office_id,variant_id,day) do update set available=excluded.available,observed_at=now(),run_id=p_run;
  end if;
 end loop;
 update public.intel_sync_runs set stage=p_next_stage,page_offset=p_next_offset,processed=processed+jsonb_array_length(p_rows),
 last_error=null,updated_at=now(),status=case when p_done then 'completed' else 'running' end,
 completed_at=case when p_done then now() else null end where id=p_run;
 return true;
end $$;
revoke all on function public.intel_commit_page(bigint,uuid,integer,integer,jsonb,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.intel_commit_page(bigint,uuid,integer,integer,jsonb,integer,integer,boolean) to service_role;
alter table public.intel_sync_runs enable row level security;
alter table public.intel_records enable row level security;
alter table public.intel_record_versions enable row level security;
alter table public.intel_category_settings enable row level security;
alter table public.intel_stock_daily enable row level security;
revoke all on public.intel_sync_runs,public.intel_records,public.intel_record_versions,public.intel_category_settings,public.intel_stock_daily from public,anon,authenticated;
grant select,insert,update,delete on public.intel_sync_runs,public.intel_records,public.intel_record_versions,public.intel_category_settings,public.intel_stock_daily to service_role;
revoke all on sequence public.intel_records_id_seq,public.intel_record_versions_id_seq from public,anon,authenticated;
grant usage,select on sequence public.intel_records_id_seq,public.intel_record_versions_id_seq to service_role;
commit;
