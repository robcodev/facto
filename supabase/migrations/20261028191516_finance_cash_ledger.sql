begin;
set local lock_timeout='5s';

create table public.finance_cash_withdrawals (
 id uuid primary key, organization_id bigint not null references public.organizations(id),
 movement_date date not null,
 kind text not null check(kind in ('advance','bank_deposit','transfer','supplier_payment','other')),
 amount bigint not null check(amount between 1 and 10000000000),
 recipient text not null check(length(btrim(recipient)) between 1 and 160),
 purpose text not null check(length(btrim(purpose)) between 1 and 500),
 reference text not null default '' check(length(reference)<=160),
 cash_box text not null default 'Casa matriz' check(length(btrim(cash_box)) between 1 and 120),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'active' check(status in ('active','void')),
 created_by uuid not null references auth.users(id), created_by_label text not null,
 created_at timestamptz not null default now(),
 void_reason text, voided_by uuid references auth.users(id), voided_at timestamptz,
 check((status='active' and void_reason is null and voided_by is null and voided_at is null)
  or (status='void' and length(btrim(void_reason)) between 3 and 500 and voided_by is not null and voided_at is not null)),
 unique(organization_id,id)
);
create index finance_cash_withdrawals_org_date on public.finance_cash_withdrawals(organization_id,movement_date desc,created_at desc,id);
create table public.finance_cash_entries (
 id uuid primary key, organization_id bigint not null,
 withdrawal_id uuid not null,
 foreign key(organization_id,withdrawal_id) references public.finance_cash_withdrawals(organization_id,id),
 entry_date date not null,
 kind text not null check(kind in ('expense','return')),
 amount bigint not null check(amount between 1 and 10000000000),
 category text not null default '', description text not null check(length(btrim(description)) between 1 and 500),
 merchant text not null default '' check(length(merchant)<=160),
 receipt_reference text not null default '' check(length(receipt_reference)<=160),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'active' check(status in ('active','void')),
 created_by uuid not null references auth.users(id),created_by_label text not null,
 created_at timestamptz not null default now(),
 void_reason text,voided_by uuid references auth.users(id),voided_at timestamptz,
 check((kind='expense' and category in ('Aseo','Embalaje','Transporte','Oficina','Mantención','Otros')) or (kind='return' and category='')),
 check((status='active' and void_reason is null and voided_by is null and voided_at is null)
  or (status='void' and length(btrim(void_reason)) between 3 and 500 and voided_by is not null and voided_at is not null)),
 unique(organization_id,id)
);
create index finance_cash_entries_org_parent on public.finance_cash_entries(organization_id,withdrawal_id,created_at,id);
create index finance_cash_entries_org_date on public.finance_cash_entries(organization_id,entry_date desc,created_at desc,id);
alter table public.finance_cash_withdrawals enable row level security;
alter table public.finance_cash_entries enable row level security;
revoke all on public.finance_cash_withdrawals,public.finance_cash_entries from public,anon,authenticated;
grant select,insert,update on public.finance_cash_withdrawals,public.finance_cash_entries to service_role;

-- Only the authenticated server calls these invoker functions. Lock the parent
-- for every mutation so concurrent expenses/returns cannot overdraw an advance.
create function public.finance_cash_mutate(p_org bigint,p_actor uuid,p_actor_label text,p_action text,p_id uuid,p_hash text,p_data jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare w public.finance_cash_withdrawals; e public.finance_cash_entries; used bigint; reason text;
begin
 if p_org is null or p_actor is null or length(p_actor_label) not between 1 and 200 then raise exception 'Usuario inválido';end if;
 if p_action='withdrawal' then
  insert into public.finance_cash_withdrawals(id,organization_id,movement_date,kind,amount,recipient,purpose,reference,cash_box,request_hash,created_by,created_by_label)
  values(p_id,p_org,(p_data->>'date')::date,p_data->>'kind',(p_data->>'amount')::bigint,p_data->>'recipient',p_data->>'purpose',p_data->>'reference',p_data->>'cashBox',p_hash,p_actor,p_actor_label)
  on conflict(id) do nothing;
  select * into w from public.finance_cash_withdrawals where id=p_id and organization_id=p_org;
  if w.id is null or w.request_hash is distinct from p_hash then raise exception 'El identificador corresponde a otro retiro';end if;
  if w.movement_date>(now() at time zone 'America/Santiago')::date then raise exception 'La salida no puede tener una fecha futura';end if;
  return p_id;
 end if;
 if p_action='entry' then
  select * into w from public.finance_cash_withdrawals where id=(p_data->>'withdrawalId')::uuid and organization_id=p_org for update;
 else
  if p_action='void_entry' then
   select * into e from public.finance_cash_entries where id=p_id and organization_id=p_org;
   if e.id is null then raise exception 'No encontramos la rendición';end if;
   select * into w from public.finance_cash_withdrawals where id=e.withdrawal_id and organization_id=p_org for update;
  elsif p_action='void_withdrawal' then
   select * into w from public.finance_cash_withdrawals where id=p_id and organization_id=p_org for update;
  else raise exception 'Acción inválida';end if;
 end if;
 if w.id is null then raise exception 'No encontramos el retiro';end if;
 if p_action='entry' then
  select * into e from public.finance_cash_entries where id=p_id;
  if e.id is not null then
   if e.organization_id<>p_org or e.withdrawal_id<>w.id or e.request_hash is distinct from p_hash then raise exception 'El identificador corresponde a otra rendición';end if;
   return p_id;
  end if;
  if w.status<>'active' or w.kind<>'advance' then raise exception 'Solo puedes rendir una salida para compras vigente';end if;
  if (p_data->>'date')::date<w.movement_date or (p_data->>'date')::date>(now() at time zone 'America/Santiago')::date then raise exception 'La fecha debe estar entre la salida y hoy';end if;
  select coalesce(sum(amount),0) into used from public.finance_cash_entries where organization_id=p_org and withdrawal_id=w.id and status='active';
  if used+(p_data->>'amount')::bigint>w.amount then raise exception 'El monto supera el saldo pendiente de rendir';end if;
  insert into public.finance_cash_entries(id,organization_id,withdrawal_id,entry_date,kind,amount,category,description,merchant,receipt_reference,request_hash,created_by,created_by_label)
  values(p_id,p_org,w.id,(p_data->>'date')::date,p_data->>'kind',(p_data->>'amount')::bigint,p_data->>'category',p_data->>'description',p_data->>'merchant',p_data->>'receiptReference',p_hash,p_actor,p_actor_label);
  return p_id;
 end if;
 reason=btrim(p_data->>'reason');
 if reason is null or length(reason) not between 3 and 500 then raise exception 'Indica el motivo de anulación';end if;
 if p_action='void_entry' then
  update public.finance_cash_entries set status='void',void_reason=reason,voided_by=p_actor,voided_at=now() where id=p_id and organization_id=p_org and status='active';
 else
  if exists(select 1 from public.finance_cash_entries where organization_id=p_org and withdrawal_id=w.id and status='active') then raise exception 'Anula primero los gastos y vueltos asociados';end if;
  update public.finance_cash_withdrawals set status='void',void_reason=reason,voided_by=p_actor,voided_at=now() where id=p_id and organization_id=p_org and status='active';
 end if;
 return p_id;
end $$;
revoke all on function public.finance_cash_mutate(bigint,uuid,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_cash_mutate(bigint,uuid,text,text,uuid,text,jsonb) to service_role;

create function public.finance_cash_report(p_org bigint,p_from date,p_to date,p_view text,p_status text,p_search text,p_category text,p_page integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_page not between 0 and 5000
 or p_view not in ('withdrawals','expenses') or p_status not in ('','pending','partial','settled','void','recorded') or length(p_search)>160 then raise exception 'Filtros inválidos';end if;
 with totals as (
  select w.*,coalesce(sum(e.amount) filter(where e.kind='expense' and e.status='active'),0) as spent,
   coalesce(sum(e.amount) filter(where e.kind='return' and e.status='active'),0) as returned
  from public.finance_cash_withdrawals w left join public.finance_cash_entries e on e.organization_id=w.organization_id and e.withdrawal_id=w.id
  where w.organization_id=p_org group by w.id
 ), classified as (
  select t.*,case when status='void' then 'void' when kind<>'advance' then 'recorded' when spent+returned=0 then 'pending' when spent+returned<amount then 'partial' else 'settled' end as settlement,
  case when status='active' and kind='advance' then amount-spent-returned else 0 end as pending from totals t
 ), filtered as (
  select * from classified where movement_date between p_from and p_to and (p_status='' or settlement=p_status)
  and (p_search='' or position(lower(p_search) in lower(recipient||' '||purpose||' '||reference||' '||cash_box))>0)
 ), expenses as (
  select e.*,w.recipient,w.purpose,w.cash_box,w.movement_date
  from public.finance_cash_entries e join public.finance_cash_withdrawals w on w.organization_id=e.organization_id and w.id=e.withdrawal_id
  where e.organization_id=p_org and e.kind='expense' and e.status='active' and w.status='active' and e.entry_date between p_from and p_to
 ), expense_filtered as (
  select * from expenses where (p_category='' or category=p_category)
   and (p_search='' or position(lower(p_search) in lower(recipient||' '||description||' '||merchant||' '||receipt_reference))>0)
 ), page_withdrawals as (
  select * from filtered order by movement_date desc,created_at desc,id limit 20 offset p_page*20
 ), page_expenses as (
  select * from expense_filtered order by entry_date desc,created_at desc,id limit 20 offset p_page*20
 ) select jsonb_build_object(
  'summary',jsonb_build_object(
   'withdrawn',coalesce((select sum(amount) from classified where status='active' and movement_date between p_from and p_to),0),
   'expenses',coalesce((select sum(amount) from expenses),0),
   'returned',coalesce((select sum(e.amount) from public.finance_cash_entries e join public.finance_cash_withdrawals w on w.organization_id=e.organization_id and w.id=e.withdrawal_id where e.organization_id=p_org and e.kind='return' and e.status='active' and w.status='active' and e.entry_date between p_from and p_to),0),
   'pendingAllDates',coalesce((select sum(pending) from classified),0),
   'categories',coalesce((select jsonb_agg(x) from (select category,sum(amount) as amount from expenses group by category order by sum(amount) desc) x),'[]'::jsonb)),
  'withdrawals',coalesce((select jsonb_agg(x order by x.movement_date desc,x.created_at desc,x.id) from (select id,movement_date,kind,amount,recipient,purpose,reference,cash_box,status,created_at,created_by_label,void_reason,voided_at,spent,returned,pending,settlement from page_withdrawals) x),'[]'::jsonb),
  'expenses',coalesce((select jsonb_agg(x order by x.entry_date desc,x.created_at desc,x.id) from (select id,withdrawal_id,entry_date,amount,category,description,merchant,receipt_reference,recipient,created_at,created_by_label from page_expenses) x),'[]'::jsonb),
  'total',case when p_view='withdrawals' then (select count(*) from filtered) else (select count(*) from expense_filtered) end,
  'page',p_page) into result;
 return result;
end $$;
revoke all on function public.finance_cash_report(bigint,date,date,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.finance_cash_report(bigint,date,date,text,text,text,text,integer) to service_role;
commit;
