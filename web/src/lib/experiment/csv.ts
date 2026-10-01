import type {
  IrrigationEvent,
  NormalizedReading,
  WeekAnalysisResult,
} from "./types"

const readingHeaders = [
  "session_id",
  "received_at",
  "seq",
  "device_ms",
  "channel_id",
  "pin",
  "devices",
  "status",
  "celsius",
  "fahrenheit",
]

const irrigationEventHeaders = [
  "id",
  "bag_id",
  "watered_at",
  "cutoff_at",
  "water_l",
  "water_temp_c",
  "weight_log_count",
  "latest_weight_kg",
  "weight_logs",
  "note",
  "created_at",
  "archived_at",
]

const irrigationWeightLogHeaders = [
  "event_id",
  "bag_id",
  "slot_at",
  "weighed_at",
  "mass_kg",
  "note",
  "watered_at",
  "cutoff_at",
  "archived_at",
]

const weekAnalysisHeaders = [
  "metric",
  "day",
  "value",
  "unit",
  "from",
  "to",
  "notes",
]

function cell(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function rows(headers: string[], values: unknown[][]) {
  return [headers, ...values].map((row) => row.map(cell).join(",")).join("\n")
}

export function readingsToCsv(readings: NormalizedReading[]) {
  return rows(
    readingHeaders,
    readings.map((reading) => [
      reading.sessionId,
      reading.receivedAt,
      reading.seq,
      reading.deviceMs,
      reading.channelId,
      reading.pin,
      reading.devices,
      reading.status,
      reading.celsius,
      reading.fahrenheit,
    ])
  )
}

export function irrigationEventsToCsv(
  events: IrrigationEvent[],
  includeArchived = false
) {
  return rows(
    irrigationEventHeaders,
    events
      .filter((event) => includeArchived || event.archivedAt === null)
      .map((event) => {
        const latest = event.weightLogs[event.weightLogs.length - 1] ?? null

        return [
          event.id,
          event.bagId,
          event.wateredAt,
          event.cutoffAt,
          event.waterL,
          event.waterTempC,
          event.weightLogs.length,
          latest?.massKg ?? null,
          JSON.stringify(event.weightLogs),
          event.note,
          event.createdAt,
          event.archivedAt,
        ]
      })
  )
}

export function irrigationWeightLogsToCsv(
  events: IrrigationEvent[],
  includeArchived = false
) {
  return rows(
    irrigationWeightLogHeaders,
    events
      .filter((event) => includeArchived || event.archivedAt === null)
      .flatMap((event) =>
        event.weightLogs.map((weightLog) => [
          event.id,
          event.bagId,
          weightLog.slotAt,
          weightLog.weighedAt,
          weightLog.massKg,
          weightLog.note,
          event.wateredAt,
          event.cutoffAt,
          event.archivedAt,
        ])
      )
  )
}

export function weekAnalysisToCsv(analysis: WeekAnalysisResult) {
  const values: unknown[][] = [
    [
      "baseline_slope",
      "",
      analysis.baseline.slopeKgPerDay,
      "kg/day",
      analysis.from,
      analysis.to,
      analysis.baseline.verdict,
    ],
    [
      "temperature_min",
      "",
      analysis.temperatureStats.min,
      "C",
      analysis.from,
      analysis.to,
      "",
    ],
    [
      "temperature_max",
      "",
      analysis.temperatureStats.max,
      "C",
      analysis.from,
      analysis.to,
      "",
    ],
  ]

  for (const row of analysis.dailyWaterUse) {
    values.push([
      "daily_water_use",
      row.day,
      row.waterUseKg,
      "kg",
      row.fromWateredAt,
      row.toWateredAt,
      "",
    ])
  }

  for (const row of analysis.checkpointDrainage) {
    values.push([
      "checkpoint_weight_change",
      row.day,
      row.drainageKg,
      "kg",
      row.wateredAt,
      "",
      "",
    ])
  }

  for (const row of analysis.swingData) {
    values.push(["root_temp_swing", row.day, row.swing, "C", "", "", ""])
  }

  return rows(weekAnalysisHeaders, values)
}

// Filesystem-safe name that always ends in .csv.
export function csvFilename(name: string) {
  const base = name
    .replace(/\.csv$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${base || "export"}.csv`
}

export function downloadCsv(filename: string, content: string) {
  // The BOM makes Excel open UTF-8 (e.g. the degree sign) correctly.
  const blob = new Blob(["﻿", content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = csvFilename(filename)
  anchor.rel = "noopener"
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking right away can make Chromium drop the `download` name and save
  // the file under the blob's UUID with no extension. Give it time to start.
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
