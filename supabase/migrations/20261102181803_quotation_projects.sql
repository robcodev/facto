-- Quotation workspaces follow Facto's existing authenticated shared-company access.
-- No service-role bypass is used by the module. No access to other companies is granted.
create table public.quotation_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  document jsonb not null check (jsonb_typeof(document) = 'object' and document ? 'name'),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotation_projects_org_updated_idx on public.quotation_projects(organization_id, updated_at desc);
alter table public.quotation_projects enable row level security;
revoke all on public.quotation_projects from public, anon, authenticated;
grant select, insert, update on public.quotation_projects to authenticated;
grant all on public.quotation_projects to service_role;
create policy quotations_select_shared on public.quotation_projects for select to authenticated
using (organization_id in (select id from public.organizations where slug = 'facto-compartido'));
create policy quotations_insert_shared on public.quotation_projects for insert to authenticated
with check (created_by = (select auth.uid()) and organization_id in (select id from public.organizations where slug = 'facto-compartido'));
create policy quotations_update_shared on public.quotation_projects for update to authenticated
using (organization_id in (select id from public.organizations where slug = 'facto-compartido'))
with check (organization_id in (select id from public.organizations where slug = 'facto-compartido'));
-- Project identity and creator are immutable, even for direct authenticated Data API requests.
create function public.quotation_project_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id <> old.id or new.organization_id <> old.organization_id or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'Quotation identity is immutable';
  end if;
  if new.version <> old.version + 1 then raise exception 'Quotation version must advance once'; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.quotation_project_guard() from public, anon, authenticated;
create trigger quotation_project_guard before update on public.quotation_projects for each row execute function public.quotation_project_guard();
