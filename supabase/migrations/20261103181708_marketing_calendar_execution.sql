begin;
set local lock_timeout = '5s';
alter table public.marketing_calendar_entries add constraint marketing_entries_org_id unique(organization_id,id);
create table public.marketing_entry_workflow (
 organization_id bigint not null, entry_id uuid not null,
 stage text not null default 'proposed' check(stage in ('proposed','preparing','ready')),
 owner text not null default '' check(length(owner)<=120),
 asset_url text check(asset_url ~ '^https://' and length(asset_url)<=2000),
 notes text not null default '' check(length(notes)<=2000),
 version integer not null default 1 check(version>0),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 primary key(organization_id,entry_id),
 foreign key(organization_id,entry_id) references public.marketing_calendar_entries(organization_id,id)
);
create index marketing_workflow_actor on public.marketing_entry_workflow(updated_by);
alter table public.marketing_publications alter column idea_id drop not null;
alter table public.marketing_publications
 add column calendar_entry_id uuid,
 add column asset_url text check(asset_url ~ '^https://' and length(asset_url)<=2000),
 add column active_until timestamptz,
 add column execution_notes text not null default '' check(length(execution_notes)<=2000),
 add column content_snapshot jsonb check(jsonb_typeof(content_snapshot)='object' and octet_length(content_snapshot::text)<=32768),
 add constraint marketing_publications_origin check(num_nonnulls(idea_id,calendar_entry_id)=1),
 add constraint marketing_publications_calendar_fk foreign key(organization_id,calendar_entry_id) references public.marketing_calendar_entries(organization_id,id),
 add constraint marketing_publications_active_dates check(active_until is null or active_until>=published_at);
create index marketing_publications_entry on public.marketing_publications(organization_id,calendar_entry_id,published_at desc) where calendar_entry_id is not null;
create unique index marketing_publications_entry_channel on public.marketing_publications(organization_id,calendar_entry_id,channel) where calendar_entry_id is not null;
create table public.marketing_workflow_events (
 id bigint generated always as identity primary key, organization_id bigint not null, entry_id uuid not null,
 kind text not null check(kind in ('preparation','publication','planning')),
 detail jsonb not null check(jsonb_typeof(detail)='object' and octet_length(detail::text)<=12000),
 actor uuid not null references auth.users(id), occurred_at timestamptz not null default now(),
 foreign key(organization_id,entry_id) references public.marketing_calendar_entries(organization_id,id)
);
create index marketing_workflow_events_entry on public.marketing_workflow_events(organization_id,entry_id,id desc);
create index marketing_workflow_events_actor on public.marketing_workflow_events(actor);
alter table public.marketing_entry_workflow enable row level security;
alter table public.marketing_workflow_events enable row level security;
revoke all on public.marketing_entry_workflow,public.marketing_workflow_events from public,anon,authenticated;
grant select,insert,update on public.marketing_entry_workflow to service_role;
grant select,insert on public.marketing_workflow_events to service_role;
grant usage on sequence public.marketing_workflow_events_id_seq to service_role;
create function public.marketing_record_execution(p_org bigint,p_actor uuid,p_entry uuid,p_version integer,p_task jsonb,p_publication jsonb default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare e public.marketing_calendar_entries%rowtype; w public.marketing_entry_workflow%rowtype; result_id uuid; existing_entry uuid;
begin
 select * into e from public.marketing_calendar_entries where organization_id=p_org and id=p_entry for update;
 if not found then raise exception 'Entrada no encontrada' using errcode='P0002';end if;
 if p_publication is not null then
  select calendar_entry_id into existing_entry from public.marketing_publications where organization_id=p_org and id=(p_publication->>'id')::uuid;
  if found then
   if existing_entry is distinct from p_entry then raise exception 'Identificador ya utilizado';end if;
   return (p_publication->>'id')::uuid;
  end if;
 end if;
 select * into w from public.marketing_entry_workflow where organization_id=p_org and entry_id=p_entry;
 if coalesce(w.version,0)<>p_version then raise exception 'El trabajo cambió en otra sesión' using errcode='40001';end if;
 if p_publication is null then
  if p_task->>'stage'='ready' and (nullif(p_task->>'assetUrl','') is null or nullif(p_task->>'owner','') is null) then raise exception 'Falta pieza final o responsable';end if;
  insert into public.marketing_entry_workflow(organization_id,entry_id,stage,owner,asset_url,notes,version,updated_by)
  values(p_org,p_entry,p_task->>'stage',p_task->>'owner',nullif(p_task->>'assetUrl',''),p_task->>'notes',1,p_actor)
  on conflict(organization_id,entry_id) do update set stage=excluded.stage,owner=excluded.owner,asset_url=excluded.asset_url,notes=excluded.notes,version=marketing_entry_workflow.version+1,updated_by=p_actor,updated_at=now();
  insert into public.marketing_workflow_events(organization_id,entry_id,kind,detail,actor) values(p_org,p_entry,'preparation',jsonb_build_object('before',to_jsonb(w),'after',p_task),p_actor);
  return p_entry;
 end if;
 if e.product_id is null or e.status='skipped' then raise exception 'La entrada no es publicable';end if;
 if (p_publication->>'publishedAt')::timestamptz>now() then raise exception 'No se puede registrar una publicación futura';end if;
 if nullif(p_publication->>'assetUrl','') is null then raise exception 'Falta la pieza final';end if;
 insert into public.marketing_publications(id,organization_id,calendar_entry_id,channel,destination_url,publication_url,published_at,utm_source,utm_medium,utm_campaign,utm_content,created_by,asset_url,active_until,execution_notes,content_snapshot)
 values((p_publication->>'id')::uuid,p_org,p_entry,p_publication->>'channel',p_publication->>'destinationUrl',p_publication->>'publicationUrl',(p_publication->>'publishedAt')::timestamptz,p_publication->>'utm_source',p_publication->>'utm_medium',p_publication->>'utm_campaign',p_publication->>'utm_content',p_actor,p_publication->>'assetUrl',(p_publication->>'activeUntil')::timestamptz,p_publication->>'notes',p_publication->'snapshot') returning id into result_id;
 update public.marketing_calendar_entries set status='done',updated_by=p_actor where organization_id=p_org and id=p_entry;
 insert into public.marketing_workflow_events(organization_id,entry_id,kind,detail,actor) values(p_org,p_entry,'publication',jsonb_build_object('publicationId',result_id,'publishedAt',p_publication->>'publishedAt','channel',p_publication->>'channel'),p_actor);
 return result_id;
end $$;
revoke all on function public.marketing_record_execution(bigint,uuid,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.marketing_record_execution(bigint,uuid,uuid,integer,jsonb,jsonb) to service_role;
create function public.marketing_audit_planning() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status<>'done' and exists(select 1 from public.marketing_publications where organization_id=old.organization_id and calendar_entry_id=old.id) then raise exception 'La entrada tiene una publicación real y conserva el estado realizada';end if;
 if row(new.scheduled_on,new.title,new.brief,new.status) is distinct from row(old.scheduled_on,old.title,old.brief,old.status) then
  insert into public.marketing_workflow_events(organization_id,entry_id,kind,detail,actor)
  values(old.organization_id,old.id,'planning',jsonb_build_object('before',jsonb_build_object('date',old.scheduled_on,'title',old.title,'brief',old.brief,'status',old.status),'after',jsonb_build_object('date',new.scheduled_on,'title',new.title,'brief',new.brief,'status',new.status)),new.updated_by);
 end if;
 return new;
end $$;
revoke all on function public.marketing_audit_planning() from public,anon,authenticated;
create trigger marketing_audit_planning after update on public.marketing_calendar_entries for each row execute function public.marketing_audit_planning();
commit;
