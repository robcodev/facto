begin;
set local lock_timeout = '5s';
create table public.supplier_invoice_payments (
 organization_id bigint not null references public.organizations(id),
 invoice_key text not null check(length(invoice_key) between 3 and 160),
 bsale_id text not null check(bsale_id ~ '^[0-9]+$'),
 method text not null check(method in ('Cheque','Transferencia','Efectivo','Otro')),
 cheque text not null default '' check(length(cheque)<=80),
 paid_total numeric not null check(paid_total>=0),
 currency text not null check(length(currency) between 1 and 30),
 paid_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id),
 actor text not null check(length(actor) between 1 and 320),
 revision integer not null default 1 check(revision>0),
 primary key(organization_id,invoice_key),
 unique(organization_id,bsale_id),
 check((method='Cheque' and length(btrim(cheque))>0) or (method<>'Cheque' and cheque=''))
);
create table public.supplier_invoice_payment_events (
 id bigint generated always as identity primary key,
 organization_id bigint not null,
 invoice_key text not null,
 method text not null,
 cheque text not null,
 paid_total numeric not null,
 currency text not null,
 actor text not null,
 updated_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now(),
 revision integer not null,
 foreign key(organization_id,invoice_key) references public.supplier_invoice_payments(organization_id,invoice_key)
);
create index supplier_invoice_payment_events_invoice on public.supplier_invoice_payment_events(organization_id,invoice_key,id desc);
alter table public.supplier_invoice_payments enable row level security;
alter table public.supplier_invoice_payment_events enable row level security;
revoke all on public.supplier_invoice_payments,public.supplier_invoice_payment_events from public,anon,authenticated;
grant select,insert,update on public.supplier_invoice_payments to service_role;
grant select,insert on public.supplier_invoice_payment_events to service_role;
grant usage on sequence public.supplier_invoice_payment_events_id_seq to service_role;
create function public.supplier_invoice_payments_validate() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.organization_id is distinct from old.organization_id or new.invoice_key is distinct from old.invoice_key
   or new.bsale_id is distinct from old.bsale_id or new.paid_at is distinct from old.paid_at then
   raise exception 'La identidad y fecha original del pago no se modifican';
  end if;
  new.revision=old.revision+1;
 else
  new.revision=1;
  new.paid_at=now();
 end if;
 new.updated_at=now();
 return new;
end $$;
create function public.supplier_invoice_payments_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.supplier_invoice_payment_events(organization_id,invoice_key,method,cheque,paid_total,currency,actor,updated_by,revision)
 values(new.organization_id,new.invoice_key,new.method,new.cheque,new.paid_total,new.currency,new.actor,new.updated_by,new.revision);
 return new;
end $$;
revoke all on function public.supplier_invoice_payments_validate(),public.supplier_invoice_payments_audit() from public,anon,authenticated;
create trigger supplier_invoice_payments_validate before insert or update on public.supplier_invoice_payments for each row execute function public.supplier_invoice_payments_validate();
create trigger supplier_invoice_payments_audit after insert or update on public.supplier_invoice_payments for each row execute function public.supplier_invoice_payments_audit();
commit;
