// Headers a visitor's browser sends when they point the dashboard at their own
// Supabase project (Connect Hardware > Use my Supabase). Shared by the client
// fetch helpers and the server routes, so it must stay free of server imports.
export const CUSTOM_SUPABASE_URL_HEADER = "x-fresco-supabase-url"
export const CUSTOM_SUPABASE_KEY_HEADER = "x-fresco-supabase-key"

const SUPABASE_PROJECT_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i

export function isSupabaseProjectUrl(value: string) {
  return SUPABASE_PROJECT_URL.test(value)
}
