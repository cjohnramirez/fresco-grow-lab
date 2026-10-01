"use client"

import * as React from "react"

import {
  CUSTOM_SUPABASE_KEY_HEADER,
  CUSTOM_SUPABASE_URL_HEADER,
} from "@/lib/supabase/custom-headers"

// A visitor's own Supabase project (URL + publishable/anon key), kept only in
// this browser. When set, every dashboard API call forwards it so the server
// routes read and write that project instead of the site's default one.
export type CustomSupabase = { url: string; key: string }

const STORAGE_KEY = "fresco-custom-supabase"
const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cachedValue: CustomSupabase | null = null

export function readCustomSupabase(): CustomSupabase | null {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === cachedRaw) {
    return cachedValue
  }
  cachedRaw = raw
  try {
    const parsed = raw ? (JSON.parse(raw) as CustomSupabase) : null
    cachedValue = parsed?.url && parsed?.key ? parsed : null
  } catch {
    cachedValue = null
  }
  return cachedValue
}

export function writeCustomSupabase(value: CustomSupabase | null) {
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Storage blocked: nothing to persist.
  }
  for (const listener of listeners) listener()
}

export function customSupabaseHeaders(): Record<string, string> {
  if (typeof window === "undefined") {
    return {}
  }
  const custom = readCustomSupabase()
  return custom
    ? {
        [CUSTOM_SUPABASE_URL_HEADER]: custom.url,
        [CUSTOM_SUPABASE_KEY_HEADER]: custom.key,
      }
    : {}
}

export function useCustomSupabase() {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    readCustomSupabase,
    () => null
  )
}
