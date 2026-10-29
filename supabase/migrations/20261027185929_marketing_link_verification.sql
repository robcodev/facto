begin;
alter table public.marketing_product_links add column verification jsonb not null default '{}'::jsonb check(jsonb_typeof(verification)='object' and octet_length(verification::text)<=4096);
commit;
