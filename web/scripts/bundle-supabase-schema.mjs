// Concatenates supabase/migrations/*.sql (in order) into
// web/public/supabase/fresco-schema.sql, the file the dashboard offers under
// Connect Hardware > My Supabase for pasting into a project's SQL editor.
//
//   npm run supabase:bundle
//
// src/lib/supabase/schema-bundle.test.ts fails if the bundle is stale.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const migrationsDir = path.resolve(webDir, "..", "supabase", "migrations")
const outFile = path.join(webDir, "public", "supabase", "fresco-schema.sql")

export async function buildSchemaBundle() {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort()
  const parts = await Promise.all(
    files.map(async (file) => {
      const sql = await readFile(path.join(migrationsDir, file), "utf8")
      return `-- ===== ${file} =====\n\n${sql.trim()}\n`
    })
  )

  return [
    "-- Fresco Telemetry schema (generated from supabase/migrations; do not edit).",
    "-- Paste into your Supabase project's SQL editor and run it once.",
    "-- Personal projects used with only a publishable key may also want",
    "-- supabase/snippets/visitor-project-writes.sql from the repository.",
    "",
    parts.join("\n"),
  ].join("\n")
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bundle = await buildSchemaBundle()
  await mkdir(path.dirname(outFile), { recursive: true })
  await writeFile(outFile, bundle, "utf8")
  console.log(`wrote ${path.relative(webDir, outFile)}`)
}
