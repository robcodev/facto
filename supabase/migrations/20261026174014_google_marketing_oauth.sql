begin;
create table public.marketing_google_connections (
 organization_id bigint primary key references public.organizations(id),
 connected_by uuid not null references auth.users(id),
 refresh_ciphertext text not null,
 granted_scopes text[] not null,
 connected_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.marketing_google_connections enable row level security;
revoke all on public.marketing_google_connections from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_google_connections to service_role;
commit;
