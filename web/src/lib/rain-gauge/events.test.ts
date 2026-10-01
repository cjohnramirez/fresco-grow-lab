import { describe, expect, it } from "vitest"

import { simulateRainHistory } from "@/lib/simulation/rain"

import { buildRainGaugeSummary } from "./analytics"
import {
  intensityBreakdown,
  segmentRainEvents,
  tipIntervalHistogram,
} from "./events"
import { normalizeRainGaugeReading } from "./parser"
import { chunkReadings } from "./sync"
import type { RainGaugeReading } from "./types"

const NOW = Date.parse("2026-07-01T09:00:00.000Z")
const readings: RainGaugeReading[] = simulateRainHistory({ now: NOW, hours: 48 }).packets.map(
  ({ packet, receivedAt }) =>
    normalizeRainGaugeReading({ packet, receivedAt, sessionId: "s", source: "sample" })
)

function reading(minute: number, tips: number): RainGaugeReading {
  return normalizeRainGaugeReading({
    packet: {
      type: "rain_gauge",
      seq: minute,
      ms: minute * 60_000,
      edges: tips * 2,
      tips,
      lastEdgeMs: 0,
      rainfallMl: tips * 2,
      rainfallMm: tips * 0.25,
      rateMlPerMin: tips > 0 ? 2 : 0,
      rateMmPerHr: tips > 0 ? 15 : 0,
    },
    receivedAt: new Date(NOW + minute * 60_000).toISOString(),
    sessionId: "t",
  })
}

describe("rain events", () => {
  it("splits showers on a 30 minute dry gap", () => {
    const events = segmentRainEvents([
      reading(0, 0),
      reading(1, 1),
      reading(2, 3),
      reading(3, 3),
      reading(50, 4),
      reading(51, 6),
    ])
    expect(events).toHaveLength(2)
    // Newest first.
    expect(events[0].tips).toBe(3)
    expect(events[1].tips).toBe(3)
    expect(events[1].rainfallMm).toBeCloseTo(0.75)
  })

  it("accounts for every tip across simulated events", () => {
    const events = segmentRainEvents(readings)
    const total = events.reduce((sum, event) => sum + event.tips, 0)
    expect(total).toBe(readings.at(-1)!.tips)
  })

  it("bins minutes of rain by intensity", () => {
    const rows = intensityBreakdown(readings)!
    expect(rows.map((row) => row.id)).toEqual(["light", "moderate", "heavy", "intense", "torrential"])
    expect(rows.reduce((sum, row) => sum + row.minutes, 0)).toBeGreaterThan(0)
  })

  it("needs mm/h to classify intensity", () => {
    const noMm = readings.map((row) => ({ ...row, rateMmPerHr: null, rainfallMm: null }))
    expect(intensityBreakdown(noMm)).toBeNull()
  })

  it("histograms tip intervals", () => {
    const summary = buildRainGaugeSummary(readings, "1w")
    const bins = tipIntervalHistogram(summary.tipIntervals)
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(summary.tipIntervals.length)
  })
})

describe("sync chunking", () => {
  it("splits large sessions under the route limit", () => {
    const chunks = chunkReadings(Array.from({ length: 2500 }, (_, index) => index))
    expect(chunks.map((chunk) => chunk.length)).toEqual([1000, 1000, 500])
    expect(chunkReadings([])).toEqual([[]])
  })
})
