-- OPTIONAL. Only for a personal project used through the dashboard's
-- "Connect Hardware > My Supabase" tab, where the browser forwards only a
-- publishable key. It lets that key log waterings and sync rain sessions.
-- Do NOT run this on a shared/production project: anyone holding the
-- publishable key could then edit these tables.

drop policy if exists "publishable key can log irrigation" on public.irrigation_events;
drop policy if exists "publishable key can edit irrigation" on public.irrigation_events;
drop policy if exists "publishable key can sync rain sessions" on public.rain_gauge_sessions;
drop policy if exists "publishable key can update rain sessions" on public.rain_gauge_sessions;
drop policy if exists "publishable key can sync rain readings" on public.rain_gauge_readings;
drop policy if exists "publishable key can update rain readings" on public.rain_gauge_readings;

create policy "publishable key can log irrigation"
  on public.irrigation_events for insert to anon with check (true);
create policy "publishable key can edit irrigation"
  on public.irrigation_events for update to anon using (true) with check (true);

-- Upserts need both insert and update.
create policy "publishable key can sync rain sessions"
  on public.rain_gauge_sessions for insert to anon with check (true);
create policy "publishable key can update rain sessions"
  on public.rain_gauge_sessions for update to anon using (true) with check (true);
create policy "publishable key can sync rain readings"
  on public.rain_gauge_readings for insert to anon with check (true);
create policy "publishable key can update rain readings"
  on public.rain_gauge_readings for update to anon using (true) with check (true);
