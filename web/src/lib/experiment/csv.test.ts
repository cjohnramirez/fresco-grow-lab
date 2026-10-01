import { afterEach, describe, expect, it, vi } from "vitest"

import {
  csvFilename,
  downloadCsv,
  irrigationEventsToCsv,
  irrigationWeightLogsToCsv,
  readingsToCsv,
  weekAnalysisToCsv,
} from "./csv"
import type {
  IrrigationEvent,
  NormalizedReading,
  WeekAnalysisResult,
} from "./types"

describe("csv export", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("exports one row per normalized reading", () => {
    const csv = readingsToCsv([
      {
        id: "r",
        sessionId: "s",
        receivedAt: "2026-07-02T00:00:00.000Z",
        seq: 1,
        deviceMs: 1000,
        channelId: "surface",
        pin: 4,
        devices: 1,
        status: "ok",
        celsius: 25,
        fahrenheit: 77,
        raw: "{}",
      },
    ] as NormalizedReading[])

    expect(csv.split("\n")).toHaveLength(2)
    expect(csv).toContain("session_id,received_at,seq")
  })

  it("exports active irrigation events and escapes notes", () => {
    const csv = irrigationEventsToCsv([
      {
        id: "event-1",
        bagId: "bag-1",
        wateredAt: "2026-07-02T00:00:00.000Z",
        cutoffAt: "2026-07-02T10:00:00.000Z",
        waterL: 2,
        waterTempC: 24.5,
        weightLogs: [
          {
            slotAt: "2026-07-02T00:10:00.000Z",
            weighedAt: "2026-07-02T00:10:00.000Z",
            massKg: 9.5,
            note: "first",
          },
          {
            slotAt: "2026-07-02T00:20:00.000Z",
            weighedAt: "2026-07-02T00:21:00.000Z",
            massKg: 9.3,
            note: "",
          },
        ],
        note: 'watered, then "weighed"',
        createdAt: "2026-07-02T00:00:00.000Z",
        archivedAt: null,
      },
      {
        id: "archived",
        bagId: "bag-1",
        wateredAt: "2026-07-01T00:00:00.000Z",
        cutoffAt: "2026-07-01T10:00:00.000Z",
        waterL: 2,
        waterTempC: null,
        weightLogs: [],
        note: "",
        createdAt: "2026-07-01T00:00:00.000Z",
        archivedAt: "2026-07-01T02:00:00.000Z",
      },
    ] as IrrigationEvent[])

    expect(csv.split("\n")).toHaveLength(2)
    expect(csv).toContain('"watered, then ""weighed"""')
    expect(csv).not.toContain("2026-07-01T00:00:00.000Z")
  })

  it("exports one row per irrigation weight log", () => {
    const csv = irrigationWeightLogsToCsv([
      {
        id: "event-1",
        bagId: "bag-1",
        wateredAt: "2026-07-02T00:00:00.000Z",
        cutoffAt: "2026-07-02T10:00:00.000Z",
        waterL: 2,
        waterTempC: null,
        weightLogs: [
          {
            slotAt: "2026-07-02T00:10:00.000Z",
            weighedAt: "2026-07-02T00:11:00.000Z",
            massKg: 9.5,
            note: "first checkpoint",
          },
        ],
        note: "",
        createdAt: "2026-07-02T00:00:00.000Z",
        archivedAt: null,
      },
    ] as IrrigationEvent[])

    expect(csv.split("\n")).toHaveLength(2)
    expect(csv).toContain("event_id,bag_id,slot_at")
    expect(csv).toContain("first checkpoint")
  })

  it("exports compact full-week analysis metrics", () => {
    const csv = weekAnalysisToCsv({
      ok: true,
      bucket: "10m",
      rowCount: 100,
      readingCount: 400,
      generatedAt: "2026-07-02T00:00:00.000Z",
      temperatureSeries: [],
      gradientData: [],
      swingData: [{ day: "2026-07-02", swing: 4, min: 24, max: 28 }],
      irrigationMarkers: [],
      baseline: {
        points: [],
        slopeKgPerDay: -0.1,
        verdict: "needs_more",
      },
      dailyWaterUse: [
        {
          day: "2026-07-02",
          fromWateredAt: "2026-07-01T00:00:00.000Z",
          toWateredAt: "2026-07-02T00:00:00.000Z",
          waterUseKg: 1.2,
        },
      ],
      checkpointDrainage: [],
      wateringRecovery: [],
      weighCompletion: { completed: 1, total: 1, due: 0, skipped: 0, percent: 100 },
      temperatureStats: { min: 24, max: 28 },
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-08T00:00:00.000Z",
      fullResolution: true,
    } satisfies WeekAnalysisResult)

    expect(csv).toContain("baseline_slope")
    expect(csv).toContain("daily_water_use")
    expect(csv).toContain("root_temp_swing")
  })

  it("downloads csv through an attached anchor and delayed URL cleanup", () => {
    vi.useFakeTimers()

    const click = vi.fn()
    const remove = vi.fn()
    const appendChild = vi.fn()
    const revokeObjectURL = vi.fn()
    const anchor = {
      click,
      download: "",
      href: "",
      remove,
      style: { display: "" },
    }

    vi.stubGlobal("document", {
      body: { appendChild },
      createElement: vi.fn(() => anchor),
    })
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:csv"),
      revokeObjectURL,
    })

    downloadCsv("readings.csv", "a,b\n1,2")

    expect(anchor.href).toBe("blob:csv")
    expect(anchor.download).toBe("readings.csv")
    expect(anchor.style.display).toBe("none")
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runOnlyPendingTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv")
  })

  it("always produces a safe .csv filename", () => {
    expect(csvFilename("session-supabase-irrigation-events.csv")).toBe(
      "session-supabase-irrigation-events.csv"
    )
    expect(csvFilename("rain gauge: page 2")).toBe("rain-gauge-page-2.csv")
    expect(csvFilename("")).toBe("export.csv")
  })
})
