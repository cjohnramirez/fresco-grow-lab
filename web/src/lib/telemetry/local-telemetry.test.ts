import { describe, expect, it } from "vitest"

import { cutoffAtForWatering } from "@/lib/experiment/irrigation"
import type { IrrigationEvent } from "@/lib/experiment/types"
import { simulateTemperatureHistory } from "@/lib/simulation/temperature"

import {
  createLocalIrrigationEvent,
  updateLocalIrrigationEvent,
} from "./local-irrigation"
import {
  localSummary,
  pageLocalReadings,
  rowsInRange,
} from "./local-temperature"

const NOW = Date.parse("2026-07-01T04:00:00.000Z")
const rows = simulateTemperatureHistory({ now: NOW, days: 2 })

describe("local temperature queries", () => {
  it("pages newest rows first like /api/readings", () => {
    const first = pageLocalReadings(
      rows,
      { channel: "all", page: 1, pageSize: 10, status: "all" },
      "s"
    )
    expect(first.totalRows).toBe(rows.length)
    expect(first.rowCount).toBe(10)
    expect(first.readings.at(-1)?.receivedAt).toBe(rows.at(-1)?.created_at)
  })

  it("filters by channel", () => {
    const page = pageLocalReadings(
      rows,
      { channel: "roots", page: 1, pageSize: 20, status: "all" },
      "s"
    )
    expect(page.readings.every((reading) => reading.channelId === "roots")).toBe(true)
  })

  it("selects rows by time range", () => {
    const ranged = rowsInRange(rows, NOW - 3_600_000, NOW)
    expect(ranged.length).toBe(61)
  })

  it("builds a summary for the selected chart range", () => {
    const summary = localSummary({
      bagId: "bag-1",
      chartRange: "1d",
      events: [],
      now: NOW,
      rows,
      sessionId: "s",
    })
    expect(summary.bucket).toBe("10m")
    expect(summary.temperatureSeries.length).toBeGreaterThan(100)
    expect(summary.temperatureStats.min).not.toBeNull()
  })
})

describe("local irrigation", () => {
  const wateredAt = "2026-07-01T00:00:00.000Z"
  const event: IrrigationEvent = {
    id: "e1",
    bagId: "bag-1",
    wateredAt,
    cutoffAt: cutoffAtForWatering(wateredAt),
    waterL: 2,
    waterTempC: null,
    weightLogs: [],
    note: "",
    createdAt: wateredAt,
    archivedAt: null,
  }

  it("rejects a second watering while a weigh window is open", () => {
    expect(() =>
      createLocalIrrigationEvent([event], { bagId: "bag-1", wateredAt }, new Date(NOW))
    ).toThrow(/Finish the current/)
  })

  it("merges a weight log into a valid slot", () => {
    const slotAt = "2026-07-01T00:10:00.000Z"
    const next = updateLocalIrrigationEvent(event, {
      weightLog: { slotAt, weighedAt: slotAt, massKg: 9.4, note: "" },
    })
    expect(next.weightLogs).toHaveLength(1)
  })

  it("rejects a weight log outside the schedule", () => {
    const slotAt = "2026-07-01T00:13:00.000Z"
    expect(() =>
      updateLocalIrrigationEvent(event, {
        weightLog: { slotAt, weighedAt: slotAt, massKg: 9.4, note: "" },
      })
    ).toThrow(/does not belong/)
  })
})
