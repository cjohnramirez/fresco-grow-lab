import { describe, expect, it } from "vitest"

import { expectedWeightSlots } from "@/lib/experiment/irrigation"
import { normalizeSupabaseRows } from "@/lib/experiment/parser"
import { parseRainGaugeReading } from "@/lib/rain-gauge/parser"

import { simulateIrrigationEvents } from "./irrigation"
import { createRainSimulator, simulateRainHistory } from "./rain"
import {
  SIMULATED_PROBES,
  simulateTemperatureHistory,
  simulatedProbeCelsius,
  simulatedRow,
} from "./temperature"

// 2026-07-01 12:00 Manila.
const NOON = Date.parse("2026-07-01T04:00:00.000Z")
const DAWN = Date.parse("2026-06-30T21:00:00.000Z")

describe("temperature simulator", () => {
  it("is deterministic for the same timestamp", () => {
    expect(simulatedRow(NOON)).toEqual(simulatedRow(NOON))
  })

  it("produces rows the firmware parser accepts", () => {
    const readings = normalizeSupabaseRows([simulatedRow(NOON)], "test")
    expect(readings.map((reading) => reading.channelId)).toEqual([
      "control",
      "surface",
      "roots",
      "bottom",
      "water",
    ])
  })

  it("keeps probes in a tropical range and warmer at noon than dawn", () => {
    const control = SIMULATED_PROBES[0]
    for (let hour = 0; hour < 72; hour++) {
      const value = simulatedProbeCelsius(control, NOON + hour * 3_600_000)
      expect(value).toBeGreaterThan(20)
      expect(value).toBeLessThan(37)
    }
    expect(simulatedProbeCelsius(control, NOON)).toBeGreaterThan(
      simulatedProbeCelsius(control, DAWN)
    )
  })

  it("damps the diurnal swing deeper in the bag", () => {
    const swing = (id: string) => {
      const probe = SIMULATED_PROBES.find((candidate) => candidate.id === id)!
      const values = Array.from({ length: 24 * 6 }, (_, index) =>
        simulatedProbeCelsius(probe, DAWN + index * 600_000)
      )
      return Math.max(...values) - Math.min(...values)
    }
    expect(swing("surface")).toBeGreaterThan(swing("roots"))
    expect(swing("roots")).toBeGreaterThan(swing("bottom"))
  })

  it("has no step jumps across Manila midnight", () => {
    for (const probe of SIMULATED_PROBES) {
      let previous = simulatedProbeCelsius(probe, DAWN - 12 * 3_600_000)
      for (let minute = 1; minute < 48 * 60; minute++) {
        const value = simulatedProbeCelsius(probe, DAWN - 12 * 3_600_000 + minute * 60_000)
        // Noise, quantization and the watering dip move < 1 C per minute;
        // a day-boundary discontinuity would not.
        expect(Math.abs(value - previous)).toBeLessThan(1)
        previous = value
      }
    }
  })

  it("builds a week of sorted history", () => {
    const rows = simulateTemperatureHistory({ now: NOON })
    const times = rows.map((row) => Date.parse(row.created_at))
    expect(times).toEqual(times.toSorted((a, b) => a - b))
    expect(NOON - times[0]).toBeGreaterThanOrEqual(7 * 86_400_000 - 300_000)
    expect(times.at(-1)).toBe(NOON)
  })
})

describe("irrigation simulator", () => {
  it("waters once per day and logs weights on schedule slots", () => {
    const events = simulateIrrigationEvents({ now: NOON })
    expect(events).toHaveLength(7)

    for (const event of events) {
      const slots = new Set(expectedWeightSlots(event))
      expect(event.weightLogs.length).toBeGreaterThan(0)
      for (const log of event.weightLogs) {
        expect(slots.has(log.slotAt)).toBe(true)
        expect(log.massKg).toBeGreaterThan(5)
        expect(log.massKg).toBeLessThan(12)
      }
    }
  })

  it("loses mass through the day after watering", () => {
    const [today] = simulateIrrigationEvents({ now: NOON })
    const masses = today.weightLogs.map((log) => log.massKg)
    expect(masses[0]).toBeGreaterThan(masses.at(-1)!)
  })

  it("leaves the newest checkpoint due on the open event", () => {
    const [today] = simulateIrrigationEvents({ now: NOON })
    const latest = Date.parse(today.weightLogs.at(-1)!.slotAt)
    expect(NOON - latest).toBeGreaterThanOrEqual(10 * 60_000)
  })
})

describe("rain simulator", () => {
  it("emits valid firmware packets with monotonically rising counters", () => {
    const { packets } = simulateRainHistory({ now: NOON, hours: 48 })
    let previousEdges = 0
    for (const { packet } of packets) {
      expect(() => parseRainGaugeReading(packet)).not.toThrow()
      expect(packet.edges).toBeGreaterThanOrEqual(previousEdges)
      expect(packet.tips).toBe(Math.floor(packet.edges / 2))
      previousEdges = packet.edges
    }
    expect(packets.at(-1)!.packet.tips).toBeGreaterThan(0)
  })

  it("is reproducible from the same session start", () => {
    const a = createRainSimulator({ sessionStartMs: DAWN })
    const b = createRainSimulator({ sessionStartMs: DAWN })
    expect(a.reading(NOON)).toEqual(b.reading(NOON))
  })
})
