begin;
alter table public.intel_sync_runs drop constraint intel_sync_runs_kind_check;
alter table public.intel_sync_runs add constraint intel_sync_runs_kind_check check(kind in ('catalog','sales','inventory'));
create index intel_inventory_variant on public.intel_records(organization_id,resource,(data->>'variantId'),(data->>'officeId'),id)
 where resource like 'inventory_%';
create index intel_inventory_run on public.intel_records(organization_id,run_id,resource,id)
 where resource like 'inventory_%';
create function public.intel_commit_inventory_page(p_org bigint,p_run uuid,p_revision integer,p_rows jsonb,p_cursor jsonb,p_done boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.intel_sync_runs; applied boolean;
begin
 select * into r from public.intel_sync_runs where id=p_run and organization_id=p_org for update;
 if not found or r.kind <> 'inventory' or r.status <> 'running' or r.stage <> p_revision then return false; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where coalesce(x->>'resource','') not like 'inventory_%') then
  raise exception 'Invalid inventory resource';
 end if;
 applied := public.intel_commit_page(p_org,p_run,p_revision,0,p_rows,p_revision+1,0,p_done);
 if applied then update public.intel_sync_runs set cursor=p_cursor where id=p_run; end if;
 return applied;
end $$;
revoke all on function public.intel_commit_inventory_page(bigint,uuid,integer,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.intel_commit_inventory_page(bigint,uuid,integer,jsonb,jsonb,boolean) to service_role;
commit;
