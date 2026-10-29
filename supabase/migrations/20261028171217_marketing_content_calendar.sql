begin;
set local lock_timeout='5s';
create table public.marketing_calendars(
 id uuid primary key,
 organization_id bigint not null references public.organizations(id),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 period_from date not null, period_to date not null check(period_to>=period_from and period_to-period_from<=55),
 source_cutoff date not null, source_checked_at timestamptz not null,
 method_version text not null,
 config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=4096),
 summary jsonb not null check(jsonb_typeof(summary)='object' and octet_length(summary::text)<=262144),
 limitations jsonb not null check(jsonb_typeof(limitations)='array' and octet_length(limitations::text)<=16384),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,fingerprint)
);
create index marketing_calendars_org_date on public.marketing_calendars(organization_id,created_at desc,id);
create table public.marketing_calendar_entries(
 id uuid primary key default gen_random_uuid(),organization_id bigint not null,
 calendar_id uuid not null,slot_key text not null check(length(slot_key) between 1 and 120),
 scheduled_on date not null,
 format text not null check(format in ('historia','reel','email','banner','post','blog')),
 product_id text check(product_id ~ '^[0-9]+$'),type_id text check(type_id ~ '^[0-9]+$'),
 title text not null check(length(title) between 1 and 240),brief text not null check(length(brief) between 1 and 2000),
 status text not null check(status in ('pending','proposed','reviewed','done','skipped')),
 evidence jsonb not null check(jsonb_typeof(evidence)='object' and evidence ? 'targetWeek' and octet_length(evidence::text)<=32768),
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,calendar_id) references public.marketing_calendars(organization_id,id),
 unique(organization_id,calendar_id,slot_key),
 check(product_id is not null or status in ('pending','skipped')),
 check(scheduled_on>=(evidence->'targetWeek'->>'from')::date and scheduled_on<=(evidence->'targetWeek'->>'to')::date)
);
create index marketing_calendar_entries_org_plan_date on public.marketing_calendar_entries(organization_id,calendar_id,scheduled_on,id);
alter table public.marketing_calendars enable row level security;
alter table public.marketing_calendar_entries enable row level security;
revoke all on public.marketing_calendars,public.marketing_calendar_entries from public,anon,authenticated;
grant select,insert on public.marketing_calendars to service_role;
grant select,insert,update on public.marketing_calendar_entries to service_role;
create function public.marketing_calendar_keep_evidence() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.calendar_id is distinct from old.calendar_id
 or new.slot_key is distinct from old.slot_key or new.format is distinct from old.format or new.product_id is distinct from old.product_id
 or new.type_id is distinct from old.type_id or new.evidence is distinct from old.evidence or new.created_by is distinct from old.created_by
 or new.created_at is distinct from old.created_at then raise exception 'El calendario conserva su producto, formato y evidencia original';end if;
 new.updated_at=now();return new;
end $$;
revoke all on function public.marketing_calendar_keep_evidence() from public,anon,authenticated;
create trigger marketing_calendar_keep_evidence before update on public.marketing_calendar_entries for each row execute function public.marketing_calendar_keep_evidence();
create function public.marketing_create_calendar(p_org bigint,p_actor uuid,p_fingerprint text,p_plan jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid; item jsonb;
begin
 if jsonb_typeof(p_plan->'entries') is distinct from 'array' or jsonb_array_length(p_plan->'entries') not between 1 and 320 then raise exception 'Cantidad de espacios inválida';end if;
 insert into public.marketing_calendars(id,organization_id,fingerprint,period_from,period_to,source_cutoff,source_checked_at,method_version,config,summary,limitations,created_by)
 values((p_plan->>'id')::uuid,p_org,p_fingerprint,(p_plan->'period'->>'from')::date,(p_plan->'period'->>'to')::date,(p_plan->>'cutoff')::date,(p_plan->>'checkedAt')::timestamptz,p_plan->>'method',p_plan->'config',(p_plan->'summary')||jsonb_build_object('weeks',p_plan->'weeks'),p_plan->'limitations',p_actor)
 on conflict(organization_id,fingerprint) do nothing returning id into result_id;
 if result_id is null then select id into result_id from public.marketing_calendars where organization_id=p_org and fingerprint=p_fingerprint;return result_id;end if;
 for item in select value from jsonb_array_elements(p_plan->'entries') loop
  insert into public.marketing_calendar_entries(organization_id,calendar_id,slot_key,scheduled_on,format,product_id,type_id,title,brief,status,evidence,created_by,updated_by)
  values(p_org,result_id,item->>'key',(item->>'scheduledOn')::date,item->>'format',item->>'productId',item->>'typeId',item->>'title',item->>'brief',item->>'status',item->'evidence',p_actor,p_actor);
 end loop;
 return result_id;
end $$;
revoke all on function public.marketing_create_calendar(bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketing_create_calendar(bigint,uuid,text,jsonb) to service_role;
commit;
