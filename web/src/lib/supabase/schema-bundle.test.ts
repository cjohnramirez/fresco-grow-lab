import { readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it, vi } from "vitest"

import { buildSchemaBundle } from "../../../scripts/bundle-supabase-schema.mjs"

import { CUSTOM_SUPABASE_KEY_HEADER, CUSTOM_SUPABASE_URL_HEADER } from "./custom-headers"
import { createSupabaseServerClient, supabaseEnv } from "./server"

describe("supabase schema bundle", () => {
  it("matches supabase/migrations (run `npm run supabase:bundle`)", async () => {
    const published = await readFile(
      path.resolve(__dirname, "../../../public/supabase/fresco-schema.sql"),
      "utf8"
    )
    expect(published).toBe(await buildSchemaBundle())
  })

  it("creates every table the app reads or writes", async () => {
    const bundle: string = await buildSchemaBundle()
    for (const table of [
      "temperature_readings",
      "irrigation_events",
      "rain_gauge_sessions",
      "rain_gauge_readings",
    ]) {
      expect(bundle).toContain(`create table if not exists public.${table}`)
    }
    // Columns written by lib/rain-gauge/sync.ts.
    expect(bundle).toMatch(/rain_gauge_readings[\s\S]*source text[\s\S]*payload jsonb/)
  })
})

describe("supabase env", () => {
  it("prefers the new secret key name and falls back to legacy names", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co")
    vi.stubEnv("SUPABASE_SECRET_KEY", "")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon")
    expect(supabaseEnv().key).toBe("legacy-service")

    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_new")
    expect(supabaseEnv().key).toBe("sb_secret_new")
    vi.unstubAllEnvs()
  })

  it("uses a visitor project only for *.supabase.co URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("SUPABASE_SECRET_KEY", "")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

    const forwarded = (url: string) =>
      new Request("http://localhost/api/readings", {
        headers: {
          [CUSTOM_SUPABASE_URL_HEADER]: url,
          [CUSTOM_SUPABASE_KEY_HEADER]: "sb_publishable_x",
        },
      })

    expect(createSupabaseServerClient(forwarded("https://abcd1234.supabase.co"))).not.toBeNull()
    expect(createSupabaseServerClient(forwarded("http://169.254.169.254"))).toBeNull()
    expect(createSupabaseServerClient(forwarded("https://evil.example.com"))).toBeNull()
    vi.unstubAllEnvs()
  })
})
