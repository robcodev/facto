begin;
set local lock_timeout = '5s';
-- Match note-related Bsale detail IDs without scanning every historical line.
create index intel_sales_detail_original_id on public.intel_records(organization_id,(raw->>'id')) where source='bsale' and resource='sales_details';
create table public.commercial_actions (
 id uuid primary key default gen_random_uuid(),
 organization_id bigint not null references public.organizations(id),
 product_id text not null check(product_id ~ '^[0-9]+$'),
 related_product_id text check(related_product_id is null or related_product_id ~ '^[0-9]+$'),
 action_type text not null check(action_type in ('content','cross_sell','replenishment','investigation')),
 title text not null check(length(title) between 1 and 240),
 hypothesis text not null check(length(hypothesis) between 1 and 1200),
 status text not null default 'planned' check(status in ('planned','done','evaluated')),
 baseline jsonb not null check(jsonb_typeof(baseline)='object' and octet_length(baseline::text)<=6144),
 executed_on date,
 outcome jsonb not null default '{}'::jsonb check(jsonb_typeof(outcome)='object' and octet_length(outcome::text)<=4096),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status='planned' or executed_on is not null),
 check(related_product_id is null or related_product_id<>product_id)
);
create index commercial_actions_org_product_date on public.commercial_actions(organization_id,product_id,created_at desc,id);
create index commercial_actions_org_date on public.commercial_actions(organization_id,created_at desc,id);
alter table public.commercial_actions enable row level security;
revoke all on public.commercial_actions from public,anon,authenticated;
grant select,insert,update on public.commercial_actions to service_role;
create function public.commercial_actions_keep_baseline() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
 or new.product_id is distinct from old.product_id or new.related_product_id is distinct from old.related_product_id
 or new.action_type is distinct from old.action_type or new.baseline is distinct from old.baseline
 or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by
 then raise exception 'La acción conserva su empresa, producto y evidencia original'; end if;
 return new;
end;
$$;
revoke all on function public.commercial_actions_keep_baseline() from public,anon,authenticated;
create trigger commercial_actions_keep_baseline before update on public.commercial_actions for each row execute function public.commercial_actions_keep_baseline();
create table public.commercial_brand_names (
 organization_id bigint not null references public.organizations(id),
 brand_id text not null check(brand_id ~ '^[0-9]+$'),
 name text not null check(length(name) between 1 and 160),
 source text not null check(source in ('manual','bsale')),
 basis text not null check(length(basis) between 1 and 600),
 declared_by uuid not null references auth.users(id),
 observed_at timestamptz not null default now(),
 primary key(organization_id,brand_id)
);
alter table public.commercial_brand_names enable row level security;
revoke all on public.commercial_brand_names from public,anon,authenticated;
grant select,insert,update on public.commercial_brand_names to service_role;
commit;
