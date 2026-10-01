import type {
  CloudState,
  ReadingQuery,
  ReadingsResponse,
} from "@/features/dashboard/lib/dashboard-types"
import { customSupabaseHeaders } from "@/features/hardware/custom-supabase"
import { toManilaDatetimeLocalValue } from "@/lib/experiment/irrigation"
import type { ChartRange } from "@/lib/experiment/types"

const WEEK_MS = 7 * 24 * 60 * 60_000

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: customSupabaseHeaders(),
  })
  const payload = (await response.json()) as T & { message?: string }

  if (!response.ok) {
    throw new Error(payload.message ?? "Request failed.")
  }

  return payload
}

export async function sendJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...customSupabaseHeaders(),
      ...(init.headers ?? {}),
    },
  })
  const payload = (await response.json()) as T & {
    ok?: boolean
    message?: string
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message ?? "Request failed.")
  }

  return payload
}

export function buildReadingsKey({
  readingQuery,
  localMode,
  sessionId,
}: {
  readingQuery: ReadingQuery
  localMode: boolean
  sessionId: string
}) {
  if (localMode) {
    return null
  }

  return `/api/readings?${new URLSearchParams({
    channel: readingQuery.channel,
    page: String(readingQuery.page),
    pageSize: String(readingQuery.pageSize),
    sessionId,
    status: readingQuery.status,
  }).toString()}`
}

export function buildEventsKey({
  bagId,
  includeArchived,
  localMode,
}: {
  bagId: string
  includeArchived: boolean
  localMode: boolean
}) {
  if (localMode) {
    return null
  }

  return `/api/irrigation-events?${new URLSearchParams({
    bagId,
    includeArchived: String(includeArchived),
  }).toString()}`
}

export function buildSummaryKey({
  bagId,
  chartRange,
  localMode,
}: {
  bagId: string
  chartRange: ChartRange
  localMode: boolean
}) {
  if (localMode) {
    return null
  }

  return `/api/experiment-summary?${new URLSearchParams({
    bagId,
    range: chartRange,
  }).toString()}`
}

export function initialWeekRange() {
  const to = new Date()
  const from = new Date(to.getTime() - WEEK_MS)

  return {
    from: toManilaDatetimeLocalValue(from),
    to: toManilaDatetimeLocalValue(to),
  }
}

export function nextCloudState({
  data,
  error,
  isLoading,
}: {
  data?: ReadingsResponse
  error: unknown
  isLoading: boolean
}): CloudState {
  if (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Supabase read failed.",
      rowCount: 0,
      latestFetchAt: null,
    }
  }

  if (isLoading) {
    return {
      status: "loading",
      message: "Loading Supabase rows",
      rowCount: 0,
      latestFetchAt: null,
    }
  }

  return {
    status: "ready",
    message: `${data?.totalRows ?? data?.rowCount ?? 0} Supabase rows available`,
    rowCount: data?.totalRows ?? data?.rowCount ?? 0,
    latestFetchAt: new Date().toISOString(),
  }
}
