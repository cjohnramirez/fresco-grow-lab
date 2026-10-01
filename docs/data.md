# Data

## Sources

| Source | Temperature | Rain |
| --- | --- | --- |
| Simulated (default) | Generated in the browser | Generated in the browser |
| Supabase / Access Point | `temperature_readings` via `/api/*` | ESP32 AP via `/api/rain-gauge/*` |
| USB Device | Kit board over Web Serial | Kit board over Web Serial |

Simulated and USB waterings stay in the browser. Rain sessions are kept in
IndexedDB and can be exported as CSV or synced to Supabase.

## Supabase setup

```bash
supabase link --project-ref <ref>
supabase db push                 # or paste web/public/supabase/fresco-schema.sql
```

| Table | Written by |
| --- | --- |
| `temperature_readings` (`payload` jsonb, `device_id`) | Boards, using the publishable key |
| `irrigation_events` (`weight_logs` jsonb) | API routes, using the secret key |
| `rain_gauge_sessions`, `rain_gauge_readings` | Rain sync, using the secret key |

Views: `temperature_channels`, `temperature_hourly`, `irrigation_checkpoints`.

`web/.env.local` (also set on Vercel):

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # legacy: NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY=                    # legacy: SUPABASE_SERVICE_ROLE_KEY (server only)
```

## Moving to a new project

1. Create the project and run `supabase db push`.
2. Copy the data, using either:
   - `pg_dump --data-only --column-inserts --table=public.temperature_readings --table=public.irrigation_events "$OLD" | psql "$NEW"`, or
   - set `OLD_SUPABASE_URL/KEY` and `NEW_SUPABASE_URL/SECRET_KEY` in
     `.env.local`, then run `npm run supabase:copy`. It prints the `setval` SQL
     to run afterwards.
3. Compare row counts, point boards and Vercel at the new project, then pause
   the old one.

## Rotating leaked keys

The old Wi-Fi password and anon key are in git history.

1. Change the router password and update `secrets.h` (or re-save over USB).
2. In Supabase **API Keys**, create publishable + secret keys, update env vars
   and firmware, then **disable the legacy JWT keys**. On a fresh project, just
   pause the old one.
3. Optional: scrub history with `git filter-repo --replace-text`.

Firmware gets only the publishable key; the secret key lives only in server env vars.

## Packets

Temperature (one row's `payload`):

```json
{ "type": "temperature", "seq": 42, "ms": 123456, "sensors": 5, "ts": "ok",
  "channels": [{ "id": "roots", "pin": 16, "devices": 1, "ts": "ok", "tc": 27.4, "tf": 81.3 }] }
```

Rain (`/api/readings`, SSE `reading`, or a USB line):

```json
{ "type": "rain_gauge", "seq": 12, "ms": 123456, "edges": 84, "tips": 42, "lastEdgeMs": 120000,
  "rainfallMl": 99.52, "rainfallMm": null, "rateMlPerMin": 3.2, "rateMmPerHr": null }
```

Statuses: `ok`, `boot`, `partial`, `no_sensor`, `read_failed` (`parse_error` added by the app).

## API routes

| Route | Purpose |
| --- | --- |
| `GET /api/readings` | Paged readings (`page`, `pageSize`, `channel`, `status`) |
| `GET/POST /api/irrigation-events`, `PATCH/DELETE …/[id]` | Waterings and checkpoint weights |
| `GET /api/experiment-summary?range=1h\|1d\|1w` | Bucketed chart data |
| `POST /api/week-analysis` | Full-resolution 7-day analysis |
| `/api/rain-gauge/{status,readings,events,reset}` | AP proxy (`baseUrl` allowlisted) |
| `POST /api/rain-gauge/sync` | Upsert a rain session |

Every Supabase route also accepts `x-fresco-supabase-url` / `x-fresco-supabase-key`
(only `*.supabase.co` URLs) for **Connect Hardware → My Supabase**.
