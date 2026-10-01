-- Local development seed (`supabase db reset`). A day of synthetic 5-minute
-- uploads with a tropical diurnal curve, plus this morning's watering, so the
-- dashboard's Supabase source has something to show. Not for production.

insert into public.temperature_readings (created_at, device_id, payload)
select
  ts,
  'seed-board',
  jsonb_build_object(
    'type', 'temperature',
    'seq', row_number() over (order by ts),
    'ms', extract(epoch from ts - date_trunc('day', ts))::bigint * 1000,
    'sensors', 4,
    'ts', 'ok',
    'channels', jsonb_build_array(
      jsonb_build_object('id', 'control', 'pin', 5, 'devices', 1, 'ts', 'ok',
        'tc', round((27.8 + 4.2 * cos(2 * pi() * (hour_of_day - 14.5) / 24))::numeric, 2)),
      jsonb_build_object('id', 'surface', 'pin', 4, 'devices', 1, 'ts', 'ok',
        'tc', round((28.7 + 5.2 * cos(2 * pi() * (hour_of_day - 14.9) / 24))::numeric, 2)),
      jsonb_build_object('id', 'roots', 'pin', 16, 'devices', 1, 'ts', 'ok',
        'tc', round((27.9 + 2.6 * cos(2 * pi() * (hour_of_day - 16.1) / 24))::numeric, 2)),
      jsonb_build_object('id', 'bottom', 'pin', 17, 'devices', 1, 'ts', 'ok',
        'tc', round((27.4 + 1.8 * cos(2 * pi() * (hour_of_day - 17.1) / 24))::numeric, 2))
    )
  )
from (
  select
    ts,
    extract(hour from ts at time zone 'Asia/Manila')
      + extract(minute from ts at time zone 'Asia/Manila') / 60.0 as hour_of_day
  from generate_series(now() - interval '24 hours', now(), interval '5 minutes') as ts
) samples;

insert into public.irrigation_events (bag_id, watered_at, cutoff_at, water_l, water_temp_c, weight_logs, note)
select
  'bag-1',
  watered_at,
  (((watered_at at time zone 'Asia/Manila')::date + time '18:00') at time zone 'Asia/Manila'),
  2.0,
  25.4,
  jsonb_build_array(
    jsonb_build_object('slotAt', watered_at + interval '10 minutes', 'weighedAt', watered_at + interval '11 minutes', 'massKg', 9.28, 'note', ''),
    jsonb_build_object('slotAt', watered_at + interval '20 minutes', 'weighedAt', watered_at + interval '21 minutes', 'massKg', 9.17, 'note', ''),
    jsonb_build_object('slotAt', watered_at + interval '30 minutes', 'weighedAt', watered_at + interval '31 minutes', 'massKg', 9.09, 'note', '')
  ),
  'Seed watering'
from (
  select ((((now() at time zone 'Asia/Manila')::date - 1) + time '07:10') at time zone 'Asia/Manila') as watered_at
) w;
