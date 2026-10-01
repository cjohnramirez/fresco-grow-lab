import {
  bucketForChartRange,
  durationForChartRange,
} from "@/lib/experiment/irrigation"
import { normalizeSupabaseRows } from "@/lib/experiment/parser"
import { buildExperimentSummary, toWeekAnalysis } from "@/lib/experiment/summary"
import type {
  ChartRange,
  IrrigationEvent,
  NormalizedReading,
  SupabaseTemperatureRow,
} from "@/lib/experiment/types"

// Browser-side equivalents of the /api/readings, /api/experiment-summary and
// /api/week-analysis routes. Simulated and USB-device data never touch
// Supabase, so the dashboard runs the same shared analytics over local rows.

export type LocalReadingQuery = {
  channel: string
  page: number
  pageSize: number
  status: string
}

// Local rows are immutable once appended, so each row is parsed and flattened
// once per session id instead of on every live tick.
const normalizedCache = new WeakMap<SupabaseTemperatureRow, Map<string, NormalizedReading[]>>()

export function normalizeRowsCached(rows: SupabaseTemperatureRow[], sessionId: string) {
  const out: NormalizedReading[] = []
  for (const row of rows) {
    let bySession = normalizedCache.get(row)
    if (!bySession) {
      bySession = new Map()
      normalizedCache.set(row, bySession)
    }
    let readings = bySession.get(sessionId)
    if (!readings) {
      readings = normalizeSupabaseRows([row], sessionId) as NormalizedReading[]
      bySession.set(sessionId, readings)
    }
    for (const reading of readings) out.push(reading)
  }
  return out
}

// Mirrors /api/readings: newest rows first for paging, then oldest-first
// within the page, filtered after flattening to channel readings.
export function pageLocalReadings(
  rows: SupabaseTemperatureRow[],
  query: LocalReadingQuery,
  sessionId: string
) {
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize), 1), 250)
  const page = Math.max(Math.trunc(query.page), 1)
  const end = rows.length - (page - 1) * pageSize
  const start = Math.max(0, end - pageSize)
  const pageRows = end > 0 ? rows.slice(start, end) : []

  const readings = normalizeRowsCached(pageRows, sessionId).filter((reading) => {
    if (query.channel !== "all" && reading.channelId !== query.channel) {
      return false
    }
    if (query.status !== "all" && reading.status !== query.status) {
      return false
    }
    return true
  })

  return {
    ok: true as const,
    page,
    pageSize,
    readings,
    rowCount: pageRows.length,
    totalRows: rows.length,
  }
}

// Rows are kept sorted by created_at, so range selection is a binary search.
export function rowsInRange(
  rows: SupabaseTemperatureRow[],
  fromMs: number,
  toMs: number
) {
  const lowerBound = (target: number) => {
    let low = 0
    let high = rows.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (Date.parse(rows[mid].created_at) < target) low = mid + 1
      else high = mid
    }
    return low
  }

  return rows.slice(lowerBound(fromMs), lowerBound(toMs + 1))
}

export function eventsInRange(
  events: IrrigationEvent[],
  fromMs: number,
  toMs: number,
  bagId: string
) {
  return events
    .filter((event) => event.bagId === bagId && event.archivedAt === null)
    .filter((event) => {
      const wateredAt = Date.parse(event.wateredAt)
      return wateredAt >= fromMs && wateredAt <= toMs
    })
    .toSorted((a, b) => Date.parse(a.wateredAt) - Date.parse(b.wateredAt))
}

export function localSummary({
  bagId,
  chartRange,
  events,
  now = Date.now(),
  rows,
  sessionId,
}: {
  bagId: string
  chartRange: ChartRange
  events: IrrigationEvent[]
  now?: number
  rows: SupabaseTemperatureRow[]
  sessionId: string
}) {
  const fromMs = now - durationForChartRange(chartRange)
  const rangedRows = rowsInRange(rows, fromMs, now)

  return buildExperimentSummary({
    bucket: bucketForChartRange(chartRange),
    events: eventsInRange(events, fromMs, now, bagId),
    readings: normalizeRowsCached(rangedRows, sessionId),
    rowCount: rangedRows.length,
  })
}

export function localWeekAnalysis({
  bagId,
  events,
  from,
  rows,
  sessionId,
  to,
}: {
  bagId: string
  events: IrrigationEvent[]
  from: string
  rows: SupabaseTemperatureRow[]
  sessionId: string
  to: string
}) {
  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  const rangedRows = rowsInRange(rows, fromMs, toMs)
  const summary = buildExperimentSummary({
    bucket: "10m",
    events: eventsInRange(events, fromMs, toMs, bagId),
    readings: normalizeRowsCached(rangedRows, sessionId),
    rowCount: rangedRows.length,
  })

  return toWeekAnalysis(summary, from, to)
}
