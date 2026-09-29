-- The application now requires login. The shared campaign policies were
-- originally limited to anon, so authenticated users could no longer see the
-- workspace even though they were allowed into the app.
alter policy organizations_select_shared
on public.organizations
to authenticated;

alter policy campaign_lists_shared_select
on public.campaign_lists
to authenticated;

alter policy campaign_lists_shared_insert
on public.campaign_lists
to authenticated;

alter policy campaign_lists_shared_update
on public.campaign_lists
to authenticated;

alter policy campaign_lists_shared_delete
on public.campaign_lists
to authenticated;

alter policy campaign_items_shared_select
on public.campaign_items
to authenticated;

alter policy campaign_items_shared_insert
on public.campaign_items
to authenticated;

alter policy campaign_items_shared_update
on public.campaign_items
to authenticated;

alter policy campaign_items_shared_delete
on public.campaign_items
to authenticated;

revoke all on table public.organizations from anon;
revoke all on table public.campaign_lists from anon;
revoke all on table public.campaign_items from anon;
