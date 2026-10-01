-- Row Level Security.
--
-- Who writes what:
--   * ESP32 boards use the PUBLISHABLE (anon) key and may only INSERT
--     temperature rows (the key is readable off the chip, so it gets nothing else).
--   * The Next.js API routes use the SECRET (service_role) key, which bypasses
--     RLS, for irrigation writes and rain sync.
--   * Browsers never write directly; anon may read dashboard tables.
--
-- A visitor pointing the dashboard at their own project with only a
-- publishable key also needs supabase/snippets/visitor-project-writes.sql.

alter table public.temperature_readings enable row level security;
alter table public.irrigation_events enable row level security;
alter table public.rain_gauge_sessions enable row level security;
alter table public.rain_gauge_readings enable row level security;

-- Recreate policies idempotently (older projects used different names).
drop policy if exists "device can insert readings" on public.temperature_readings;
drop policy if exists "dashboard can read readings" on public.temperature_readings;
drop policy if exists "anon read irrigation" on public.irrigation_events;
drop policy if exists "anon write irrigation" on public.irrigation_events;
drop policy if exists "anon edit irrigation" on public.irrigation_events;
drop policy if exists "anon read rain sessions" on public.rain_gauge_sessions;
drop policy if exists "anon read rain readings" on public.rain_gauge_readings;

create policy "device can insert readings"
  on public.temperature_readings
  for insert
  to anon, authenticated
  with check (true);

create policy "dashboard can read readings"
  on public.temperature_readings
  for select
  to anon, authenticated
  using (true);

create policy "dashboard can read irrigation"
  on public.irrigation_events
  for select
  to anon, authenticated
  using (true);

create policy "dashboard can read rain sessions"
  on public.rain_gauge_sessions
  for select
  to anon, authenticated
  using (true);

create policy "dashboard can read rain readings"
  on public.rain_gauge_readings
  for select
  to anon, authenticated
  using (true);
