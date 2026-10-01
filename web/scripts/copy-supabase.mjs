// Copies Fresco data from one Supabase project to another over the REST API,
// for when you don't have the old project's database password (otherwise
// prefer pg_dump; see docs/data.md).
//
//   node --env-file=.env.local scripts/copy-supabase.mjs [--dry-run] [--tables a,b]
//
// Reads from .env.local:
//   OLD_SUPABASE_URL, OLD_SUPABASE_KEY   source project (secret key preferred;
//                                        a publishable key works for tables
//                                        anon can read)
//   NEW_SUPABASE_URL, NEW_SUPABASE_SECRET_KEY   destination (must be the secret
//                                        / service_role key: it bypasses RLS)
//
// Rows are upserted by primary key, so re-running is safe. Identity sequences
// are NOT advanced by the REST API: run the printed `setval` SQL in the new
// project's SQL editor afterwards.

import { createClient } from "@supabase/supabase-js"

const TABLES = [
  {
    name: "temperature_readings",
    key: "id",
    order: "id",
    identity: true,
    // Older projects have no device_id column; the new default fills it.
    columns: "id,created_at,payload",
  },
  {
    name: "irrigation_events",
    key: "id",
    order: "id",
    identity: true,
    columns:
      "id,bag_id,watered_at,cutoff_at,water_l,water_temp_c,weight_logs,note,created_at,archived_at",
  },
  { name: "rain_gauge_sessions", key: "id", order: "id", columns: "*" },
  {
    name: "rain_gauge_readings",
    key: "id",
    order: "id",
    // pending_half_tip is a generated column in the new schema.
    transform: (row) => {
      const { raw, payload, ...rest } = row
      delete rest.pending_half_tip
      return { ...rest, source: rest.source ?? "ap", payload: payload ?? raw ?? {} }
    },
    columns: "*",
  },
]

const PAGE = 1000

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name} in the environment (.env.local).`)
    process.exit(1)
  }
  return value
}

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const onlyIndex = args.indexOf("--tables")
const only = onlyIndex >= 0 ? new Set(args[onlyIndex + 1]?.split(",")) : null

const source = createClient(required("OLD_SUPABASE_URL"), required("OLD_SUPABASE_KEY"), {
  auth: { persistSession: false },
})
const target = createClient(required("NEW_SUPABASE_URL"), required("NEW_SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false },
})

async function copyTable(table) {
  let offset = 0
  let copied = 0

  while (true) {
    const { data, error } = await source
      .from(table.name)
      .select(table.columns)
      .order(table.order, { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error) {
      if (error.code === "42P01" || /does not exist/i.test(error.message)) {
        console.log(`  ${table.name}: not in source project, skipped`)
        return 0
      }
      throw new Error(`${table.name} read failed: ${error.message}`)
    }
    const rows = (data ?? []).map((row) => (table.transform ? table.transform(row) : row))
    if (rows.length === 0) break

    if (!dryRun) {
      const { error: writeError } = await target
        .from(table.name)
        .upsert(rows, { onConflict: table.key })
      if (writeError) {
        throw new Error(`${table.name} write failed at offset ${offset}: ${writeError.message}`)
      }
    }

    copied += rows.length
    offset += rows.length
    process.stdout.write(`\r  ${table.name}: ${copied} rows${dryRun ? " (dry run)" : ""}`)
    if (rows.length < PAGE) break
  }

  process.stdout.write("\n")
  return copied
}

console.log(`Copying ${dryRun ? "(dry run) " : ""}from ${process.env.OLD_SUPABASE_URL} to ${process.env.NEW_SUPABASE_URL}`)
const summary = []
for (const table of TABLES) {
  if (only && !only.has(table.name)) continue
  summary.push([table.name, await copyTable(table)])
}

console.log("\nDone:")
for (const [name, count] of summary) console.log(`  ${name.padEnd(22)} ${count}`)

const identityTables = TABLES.filter((table) => table.identity && (!only || only.has(table.name)))
if (!dryRun && identityTables.length > 0) {
  console.log("\nNow run this in the NEW project's SQL editor so new rows get fresh ids:\n")
  for (const table of identityTables) {
    console.log(
      `select setval(pg_get_serial_sequence('public.${table.name}', 'id'), coalesce((select max(id) from public.${table.name}), 0) + 1, false);`
    )
  }
}
