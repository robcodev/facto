-- Read-only. Returns counts and field names, never customer/document values.
-- Run before considering any cleanup; do not equate all versions with duplicates.
select r.resource, count(*) as versions,
 count(*) filter(where v.data=r.data and v.raw=r.raw) as exact_current_copies,
 count(*) filter(where v.raw=r.raw and v.data<>r.data) as same_source_different_data,
 count(*) filter(where v.raw<>r.raw) as different_source
from public.intel_record_versions v
join public.intel_records r on r.id=v.record_id and r.organization_id=v.organization_id
group by r.resource order by versions desc;

select count(*) as orphan_versions
from public.intel_record_versions v
left join public.intel_records r on r.id=v.record_id and r.organization_id=v.organization_id
where r.id is null;

-- Field-level differences; materialize only changed rows before expanding keys.
with changed as materialized (
 select r.resource,v.data as old_data,r.data as current_data
 from public.intel_record_versions v join public.intel_records r
 on r.id=v.record_id and r.organization_id=v.organization_id
 where v.data<>r.data
)
select c.resource,k.key,count(*)
from changed c cross join lateral jsonb_object_keys(c.old_data || c.current_data) k(key)
where c.old_data->k.key is distinct from c.current_data->k.key
group by c.resource,k.key order by c.resource,k.key;

-- Explicitly prove that non-exact copies are incomplete document imports,
-- not lost business changes. Missing fields must fail this classification.
select count(*) as non_exact_versions,
 count(*) filter(where r.resource='sales_documents' and v.raw=r.raw
   and v.data->'complete'='false'::jsonb and r.data->'complete'='true'::jsonb
   and v.data->'sellers'='[]'::jsonb and jsonb_typeof(r.data->'sellers')='array'
   and (v.data-'complete'-'sellers')=(r.data-'complete'-'sellers')) as intermediate_only
from public.intel_record_versions v join public.intel_records r
on r.id=v.record_id and r.organization_id=v.organization_id
where v.data<>r.data or v.raw<>r.raw;

select proname from pg_proc where pronamespace='public'::regnamespace
and prokind='f' and prosrc ilike '%intel_record_versions%';
select viewname from pg_views where schemaname='public'
and definition ilike '%intel_record_versions%';
select conname from pg_constraint where contype='f'
and confrelid='public.intel_record_versions'::regclass;
select tgname from pg_trigger where tgrelid='public.intel_record_versions'::regclass
and not tgisinternal;
