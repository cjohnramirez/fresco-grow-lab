-- Optional rain gauge sync. The dashboard stores rain sessions locally
-- (IndexedDB) and upserts them here on demand via POST /api/rain-gauge/sync.
-- Column names match web/src/lib/rain-gauge/sync.ts.

create table if not exists public.rain_gauge_sessions (
  id text primary key,
  label text not null,
  -- ap: ESP32 access point, usb: kit firmware over Web Serial, sample: demo
  source text not null default 'ap' check (source in ('ap', 'usb', 'sample')),
  started_at timestamptz not null,
  ended_at timestamptz,
  ap_base_url text,
  ml_per_tip numeric check (ml_per_tip is null or ml_per_tip > 0),
  catchment_area_cm2 numeric check (catchment_area_cm2 is null or catchment_area_cm2 > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.rain_gauge_readings (
  id text primary key,
  session_id text not null references public.rain_gauge_sessions (id) on delete cascade,
  received_at timestamptz not null,
  source text not null default 'ap' check (source in ('ap', 'usb', 'sample', 'import')),
  seq bigint,
  device_ms bigint,
  edges bigint not null check (edges >= 0),
  tips numeric not null check (tips >= 0),
  -- Firmware counts magnet-in and magnet-out edges; odd = mid-tip.
  pending_half_tip boolean generated always as (edges % 2 = 1) stored,
  last_edge_ms bigint,
  rainfall_ml numeric not null,
  rainfall_mm numeric,
  rate_ml_per_min numeric not null,
  rate_mm_per_hr numeric,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Upgrades tables created from the original schema, which lacked the
-- columns the sync route writes.
alter table public.rain_gauge_readings
  add column if not exists source text not null default 'ap',
  add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists rain_gauge_readings_session_received_idx
  on public.rain_gauge_readings (session_id, received_at);
