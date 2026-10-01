import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import {
  CUSTOM_SUPABASE_KEY_HEADER,
  CUSTOM_SUPABASE_URL_HEADER,
  isSupabaseProjectUrl,
} from "./custom-headers"

// Prefers Supabase's current key names (publishable / secret) and falls back
// to the legacy anon / service_role names so older deployments keep working.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return { key, url }
}

// A visitor's own project, forwarded from their browser. Only public
// publishable/anon keys are expected here; writes then rely on that project's
// RLS policies (see supabase/snippets/visitor-project-writes.sql).
function customSupabaseEnv(request?: Request) {
  const url = request?.headers.get(CUSTOM_SUPABASE_URL_HEADER)?.trim()
  const key = request?.headers.get(CUSTOM_SUPABASE_KEY_HEADER)?.trim()

  if (!url || !key || !isSupabaseProjectUrl(url) || key.length > 400) {
    return null
  }
  return { key, url }
}

export function supabaseNotConfiguredResponse() {
  return NextResponse.json(
    {
      ok: false,
      code: "not_configured",
      message: "Supabase env vars are not configured.",
    },
    { status: 503 }
  )
}

export function createSupabaseServerClient(request?: Request) {
  const { key, url } = customSupabaseEnv(request) ?? supabaseEnv()

  if (!url || !key) {
    return null
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
