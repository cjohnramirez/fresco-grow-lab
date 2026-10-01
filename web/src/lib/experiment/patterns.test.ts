import { describe, expect, it } from "vitest"

import { simulateIrrigationEvents } from "@/lib/simulation/irrigation"
import { simulateTemperatureHistory } from "@/lib/simulation/temperature"

import { normalizeSupabaseRows } from "./parser"
import {
  bagControlDelta,
  channelHealth,
  probeDistributions,
  thermalHeatmap,
  verticalProfile,
  waterTempVsLoss,
} from "./patterns"
import { bucketedChartSeries } from "./summary"

const NOW = Date.parse("2026-07-01T04:00:00.000Z")
const rows = simulateTemperatureHistory({ now: NOW, days: 3 })
const readings = normalizeSupabaseRows(rows, "s")
const series = bucketedChartSeries(readings, "1h")

describe("thermal patterns", () => {
  it("builds a day x 24h heatmap", () => {
    const heatmap = thermalHeatmap(series, "surface")
    expect(heatmap.cells).toHaveLength(heatmap.days.length * 24)
    expect(heatmap.min).toBeLessThan(heatmap.max!)
  })

  it("finds a hot afternoon and cool pre-dawn hour", () => {
    const profile = verticalProfile(series)
    expect(profile.hottestHour).toBeGreaterThanOrEqual(12)
    expect(profile.hottestHour).toBeLessThanOrEqual(17)
    expect(profile.coolestHour).toBeLessThanOrEqual(7)
    const surface = profile.points.find((point) => point.channel === "Surface")!
    const bottom = profile.points.find((point) => point.channel === "Bottom")!
    expect(surface.hottest! - surface.coolest!).toBeGreaterThan(bottom.hottest! - bottom.coolest!)
  })

  it("computes bag minus control deltas", () => {
    const deltas = bagControlDelta(series)
    expect(deltas.length).toBeGreaterThan(0)
    expect(deltas.every((row) => row.surfaceDelta === null || Math.abs(row.surfaceDelta) < 8)).toBe(true)
  })

  it("orders quartiles within each probe", () => {
    for (const row of probeDistributions(series)) {
      expect(row.min).toBeLessThanOrEqual(row.q1)
      expect(row.q1).toBeLessThanOrEqual(row.median)
      expect(row.median).toBeLessThanOrEqual(row.q3)
      expect(row.q3).toBeLessThanOrEqual(row.max)
    }
  })

  it("pairs water temperature with checkpoint loss", () => {
    const points = waterTempVsLoss(simulateIrrigationEvents({ now: NOW }))
    expect(points.length).toBeGreaterThan(3)
    expect(points.every((point) => point.lossKg > 0)).toBe(true)
  })

  it("summarises per-channel status", () => {
    const health = channelHealth(readings.slice(-500))
    expect(health.map((row) => row.channelId)).toContain("water")
    for (const row of health) {
      expect(row.ok + row.readFailed + row.missing).toBe(row.total)
    }
  })
})
