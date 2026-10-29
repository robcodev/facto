begin;
set local lock_timeout='5s';
-- Keep existing reports; calendar snapshots use their own page-aggregate kinds.
alter table public.intel_web_reports
 drop constraint intel_web_reports_report_kind_check,
 add constraint intel_web_reports_report_kind_check
 check(report_kind in ('campaign','landing','search_page','calendar_landing_v1','calendar_search_v1'));
commit;
