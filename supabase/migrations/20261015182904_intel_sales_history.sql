begin;
-- Sales reuse Intel's records and revisions; there is no second backup database.
alter table public.intel_sync_runs
 add column kind text not null default 'catalog' check(kind in ('catalog','sales')),
 add column config jsonb not null default '{}'::jsonb,
 add column cursor jsonb not null default '{}'::jsonb;
alter table public.intel_sync_runs alter column office_id drop not null;
alter table public.intel_sync_runs alter column price_list_id drop not null;
alter table public.intel_sync_runs drop constraint intel_sync_runs_status_check;
alter table public.intel_sync_runs add constraint intel_sync_runs_status_check check(status in ('running','completed','cancelled'));
drop index public.intel_one_running_sync;
create unique index intel_one_running_sync on public.intel_sync_runs(organization_id,kind) where status='running';
create index intel_sales_date on public.intel_records(organization_id,(data->>'emissionDay'),id) where resource='sales_documents';
create index intel_sales_parent on public.intel_records(organization_id,(data->>'documentId'),resource,id) where resource like 'sales_%';

create function public.intel_commit_sales_page(p_org bigint,p_run uuid,p_revision integer,p_rows jsonb,p_cursor jsonb,p_done boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.intel_sync_runs; applied boolean;
begin
 select * into r from public.intel_sync_runs where id=p_run and organization_id=p_org for update;
 if not found or r.kind <> 'sales' or r.status <> 'running' or r.stage <> p_revision then return false; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where x->>'resource' not like 'sales_%') then
  raise exception 'Invalid sales resource';
 end if;
 applied := public.intel_commit_page(p_org,p_run,p_revision,0,p_rows,p_revision+1,0,p_done);
 if applied then update public.intel_sync_runs set cursor=p_cursor where id=p_run; end if;
 return applied;
end $$;
revoke all on function public.intel_commit_sales_page(bigint,uuid,integer,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.intel_commit_sales_page(bigint,uuid,integer,jsonb,jsonb,boolean) to service_role;
commit;
