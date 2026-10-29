-- Keep one current source record. Historical business events and sync cursors
-- remain in their existing tables/resources. No existing versions are deleted.
begin;
set local lock_timeout = '5s';

create or replace function public.intel_commit_page(p_org bigint, p_run uuid, p_stage integer, p_offset integer,
 p_rows jsonb, p_next_stage integer, p_next_offset integer, p_done boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.intel_sync_runs; item jsonb;
begin
 select * into r from public.intel_sync_runs where id=p_run and organization_id=p_org for update;
 if not found or r.status <> 'running' or r.stage <> p_stage or r.page_offset <> p_offset then return false; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  insert into public.intel_records(organization_id,resource,external_id,name,product_id,category_id,data,raw,content_hash,run_id)
  values(p_org,item->>'resource',item->>'external_id',item->>'name',item->>'product_id',item->>'category_id',item->'data',item->'raw',item->>'content_hash',p_run)
  on conflict(organization_id,source,resource,external_id) do update set
   name=excluded.name,product_id=excluded.product_id,category_id=excluded.category_id,
   data=excluded.data,raw=excluded.raw,content_hash=excluded.content_hash,run_id=p_run,observed_at=now();
  -- No full-row version on insert/update. A new sale, movement or dated stock
  -- observation still has its own identity in intel_records.
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
commit;
