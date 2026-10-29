-- MANUAL, DESTRUCTIVE: only after explicit approval of the audited copy cleanup.
-- Not a migration; never run automatically at startup/deployment.
-- Deletes version metadata too (observation time/run), not primary source records.
-- With the new writer deployed, this should free the version table's disk space
-- without VACUUM FULL. Any failed guard rolls the entire transaction back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.intel_records in share mode;
lock table public.intel_record_versions in access exclusive mode;
do $$
declare target_org bigint;
begin
 select id into strict target_org from public.organizations where slug='facto-compartido';
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and prokind='f'
   and prosrc ilike '%intel_record_versions%') then
  raise exception 'History still referenced by a public function; inspect before cleanup';
 end if;
 if exists(select 1 from pg_trigger where tgrelid='public.intel_record_versions'::regclass and not tgisinternal) then
  raise exception 'History has custom triggers; inspect before cleanup';
 end if;
 if exists(select 1 from public.intel_record_versions where organization_id<>target_org) then
  raise exception 'History contains another organization; no cleanup performed';
 end if;
 if exists(
  select 1 from public.intel_record_versions v
  left join public.intel_records r on r.id=v.record_id and r.organization_id=v.organization_id
  where r.id is null or (
   v.raw=r.raw and (
    v.data=r.data or (
     r.resource='sales_documents' and v.data->'complete'='false'::jsonb
     and r.data->'complete'='true'::jsonb and v.data->'sellers'='[]'::jsonb
     and jsonb_typeof(r.data->'sellers')='array'
     and (v.data-'complete'-'sellers')=(r.data-'complete'-'sellers')
    )
   )
  ) is not true
 ) then
  raise exception 'History contains an orphan or unique/unverified data; no cleanup performed';
 end if;
end $$;
-- No CASCADE: unexpected dependencies must cause failure rather than data loss.
truncate table public.intel_record_versions;
select (select count(*) from public.intel_records) as retained_records,
       (select count(*) from public.intel_record_versions) as remaining_versions,
       pg_size_pretty(pg_total_relation_size('public.intel_record_versions')) as version_table_size;
commit;
