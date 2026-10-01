-- Relational views over the jsonb firmware packets, for the SQL editor,
-- BI tools and CSV exports. security_invoker makes them respect the caller's
-- RLS instead of the view owner's.

create or replace view public.temperature_channels
  with (security_invoker = true) as
select
  r.id as reading_id,
  r.created_at,
  r.device_id,
  (r.payload ->> 'seq')::bigint as seq,
  channel ->> 'id' as channel_id,
  (channel ->> 'pin')::int as pin,
  channel ->> 'ts' as status,
  (channel ->> 'tc')::numeric as celsius
from public.temperature_readings r
cross join lateral jsonb_array_elements(r.payload -> 'channels') as channel;

comment on view public.temperature_channels is
  'One row per probe per upload, flattened from temperature_readings.payload.';

create or replace view public.temperature_hourly
  with (security_invoker = true) as
select
  device_id,
  date_trunc('hour', created_at) as hour,
  channel_id,
  round(avg(celsius), 2) as mean_c,
  round(min(celsius), 2) as min_c,
  round(max(celsius), 2) as max_c,
  count(*) filter (where status = 'ok') as ok_count,
  count(*) as sample_count
from public.temperature_channels
group by device_id, date_trunc('hour', created_at), channel_id;

comment on view public.temperature_hourly is
  'Hourly per-probe statistics (UTC hours).';

create or replace view public.irrigation_checkpoints
  with (security_invoker = true) as
select
  e.id as event_id,
  e.bag_id,
  e.watered_at,
  e.cutoff_at,
  (log ->> 'slotAt')::timestamptz as slot_at,
  (log ->> 'weighedAt')::timestamptz as weighed_at,
  (log ->> 'massKg')::numeric as mass_kg,
  log ->> 'note' as note
from public.irrigation_events e
cross join lateral jsonb_array_elements(e.weight_logs) as log
where e.archived_at is null;

comment on view public.irrigation_checkpoints is
  'One row per logged checkpoint weight of active waterings.';
