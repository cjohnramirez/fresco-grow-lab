import { manilaHour } from "@/lib/simulation/clock"

import { formatManilaDay } from "./irrigation"
import { CHANNELS, type IrrigationEvent, type NormalizedReading } from "./types"

// Derived views over a bucketed temperature series (rows of
// { timestamp, control, surface, roots, bottom }) for the "Thermal Patterns"
// analytics cards. All functions are pure so they work the same on simulated,
// USB and Supabase data.

export type SeriesRow = Record<string, number | string | null>

function valueOf(row: SeriesRow, channelId: string) {
  const value = row[channelId]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function timestampOf(row: SeriesRow) {
  return typeof row.timestamp === "string" ? Date.parse(row.timestamp) : Number.NaN
}

export type HeatmapCell = { day: string; hour: number; value: number | null }

// Day x hour-of-day grid of mean temperature for one probe (Manila time).
export function thermalHeatmap(rows: SeriesRow[], channelId: string) {
  const sums = new Map<string, { sum: number; count: number }>()
  const days: string[] = []
  let min: number | null = null
  let max: number | null = null

  for (const row of rows) {
    const time = timestampOf(row)
    const value = valueOf(row, channelId)
    if (!Number.isFinite(time) || value === null) continue

    const day = formatManilaDay(new Date(time))
    const hour = Math.floor(manilaHour(time))
    if (!days.includes(day)) days.push(day)
    const key = `${day}|${hour}`
    const cell = sums.get(key) ?? { sum: 0, count: 0 }
    cell.sum += value
    cell.count += 1
    sums.set(key, cell)
  }

  const cells: HeatmapCell[] = []
  for (const day of days) {
    for (let hour = 0; hour < 24; hour++) {
      const cell = sums.get(`${day}|${hour}`)
      const value = cell ? Number((cell.sum / cell.count).toFixed(2)) : null
      if (value !== null) {
        min = min === null ? value : Math.min(min, value)
        max = max === null ? value : Math.max(max, value)
      }
      cells.push({ day, hour, value })
    }
  }

  return { cells, days, min, max }
}

const PROFILE_CHANNELS = ["surface", "roots", "bottom"] as const

// Temperature at each depth for the coolest hour, the hottest hour and the
// all-day mean, averaged over every day in the series. Shows how the bag damps
// and delays the daily heat wave with depth.
export function verticalProfile(rows: SeriesRow[]) {
  const byHour = new Map<number, Record<string, { sum: number; count: number }>>()

  for (const row of rows) {
    const time = timestampOf(row)
    if (!Number.isFinite(time)) continue
    const hour = Math.floor(manilaHour(time))
    const bucket = byHour.get(hour) ?? {}
    for (const channelId of [...PROFILE_CHANNELS, "control"]) {
      const value = valueOf(row, channelId)
      if (value === null) continue
      const stat = bucket[channelId] ?? { sum: 0, count: 0 }
      stat.sum += value
      stat.count += 1
      bucket[channelId] = stat
    }
    byHour.set(hour, bucket)
  }

  const controlByHour = Array.from(byHour.entries())
    .flatMap(([hour, bucket]) =>
      bucket.control ? [{ hour, value: bucket.control.sum / bucket.control.count }] : []
    )
    .toSorted((a, b) => a.value - b.value)
  if (controlByHour.length === 0) {
    return { coolestHour: null, hottestHour: null, points: [] }
  }

  const coolestHour = controlByHour[0].hour
  const hottestHour = controlByHour[controlByHour.length - 1].hour
  const mean = (channelId: string, hour?: number) => {
    let sum = 0
    let count = 0
    for (const [bucketHour, bucket] of byHour) {
      if (hour !== undefined && bucketHour !== hour) continue
      const stat = bucket[channelId]
      if (stat) {
        sum += stat.sum
        count += stat.count
      }
    }
    return count > 0 ? Number((sum / count).toFixed(2)) : null
  }

  return {
    coolestHour,
    hottestHour,
    points: PROFILE_CHANNELS.map((channelId) => ({
      channel: CHANNELS.find((channel) => channel.id === channelId)?.label ?? channelId,
      coolest: mean(channelId, coolestHour),
      mean: mean(channelId),
      hottest: mean(channelId, hottestHour),
    })),
  }
}

// How much warmer (+) or cooler (-) the bag is than ambient air over time.
export function bagControlDelta(rows: SeriesRow[]) {
  return rows.flatMap((row) => {
    const control = valueOf(row, "control")
    const surface = valueOf(row, "surface")
    const roots = valueOf(row, "roots")
    if (control === null || (surface === null && roots === null)) return []
    return [
      {
        time: row.time,
        timestamp: row.timestamp,
        surfaceDelta: surface === null ? null : Number((surface - control).toFixed(2)),
        rootsDelta: roots === null ? null : Number((roots - control).toFixed(2)),
      },
    ]
  })
}

function quantile(sorted: number[], q: number) {
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export type ProbeDistribution = {
  channelId: string
  label: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  count: number
}

export function probeDistributions(rows: SeriesRow[]): ProbeDistribution[] {
  return CHANNELS.flatMap((channel) => {
    const values = rows
      .map((row) => valueOf(row, channel.id))
      .filter((value): value is number => value !== null)
      .toSorted((a, b) => a - b)
    if (values.length === 0) return []
    const round = (value: number) => Number(value.toFixed(2))
    return [
      {
        channelId: channel.id,
        label: channel.label,
        min: round(values[0]),
        q1: round(quantile(values, 0.25)),
        median: round(quantile(values, 0.5)),
        q3: round(quantile(values, 0.75)),
        max: round(values[values.length - 1]),
        count: values.length,
      },
    ]
  })
}

// One point per watering: the irrigation water temperature against how much
// mass the bag lost across its logged checkpoints.
export function waterTempVsLoss(events: IrrigationEvent[]) {
  return events.flatMap((event) => {
    if (event.archivedAt !== null || event.waterTempC === null) return []
    const logs = event.weightLogs.toSorted(
      (a, b) => Date.parse(a.slotAt) - Date.parse(b.slotAt)
    )
    if (logs.length < 2) return []
    return [
      {
        day: formatManilaDay(event.wateredAt),
        waterTempC: event.waterTempC,
        lossKg: Number((logs[0].massKg - logs[logs.length - 1].massKg).toFixed(2)),
      },
    ]
  })
}

export type ChannelHealth = {
  channelId: string
  label: string
  ok: number
  readFailed: number
  missing: number
  total: number
  okPercent: number
}

// Status mix per probe over a set of readings (the current Monitor page).
export function channelHealth(readings: NormalizedReading[]): ChannelHealth[] {
  return [...CHANNELS, { id: "water", label: "Water", pin: 14 }].flatMap((channel) => {
    const channelReadings = readings.filter((reading) => reading.channelId === channel.id)
    if (channelReadings.length === 0) return []
    const ok = channelReadings.filter((reading) => reading.status === "ok").length
    const missing = channelReadings.filter((reading) => reading.status === "no_sensor").length
    const readFailed = channelReadings.length - ok - missing
    return [
      {
        channelId: channel.id,
        label: channel.label,
        ok,
        readFailed,
        missing,
        total: channelReadings.length,
        okPercent: Math.round((ok / channelReadings.length) * 1000) / 10,
      },
    ]
  })
}
