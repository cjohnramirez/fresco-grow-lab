import type { RainGaugeReading } from "./types"

// Rain event segmentation and intensity statistics over a session's cumulative
// readings. A rain event is a run of tips with no dry gap longer than
// `dryGapMs`; intensity classes follow common mm/hr bands (light < 2.5,
// moderate < 7.5 per WMO, then PAGASA's heavy-rainfall advisory thresholds).

export const INTENSITY_CLASSES = [
  { id: "light", label: "Light", minMmHr: 0, maxMmHr: 2.5 },
  { id: "moderate", label: "Moderate", minMmHr: 2.5, maxMmHr: 7.5 },
  { id: "heavy", label: "Heavy", minMmHr: 7.5, maxMmHr: 15 },
  { id: "intense", label: "Intense", minMmHr: 15, maxMmHr: 30 },
  { id: "torrential", label: "Torrential", minMmHr: 30, maxMmHr: Infinity },
] as const

export type RainEvent = {
  id: string
  start: string
  end: string
  durationMin: number
  tips: number
  rainfallMl: number
  rainfallMm: number | null
  peakRateMlPerMin: number
  peakRateMmPerHr: number | null
}

function sortReadings(readings: RainGaugeReading[]) {
  return readings.toSorted((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
}

export function segmentRainEvents(
  readings: RainGaugeReading[],
  dryGapMs = 30 * 60_000
): RainEvent[] {
  const sorted = sortReadings(readings)
  const events: RainEvent[] = []
  let current: {
    startReading: RainGaugeReading
    baseline: RainGaugeReading
    last: RainGaugeReading
    lastTipAt: number
    peakMl: number
    peakMm: number | null
  } | null = null

  const close = () => {
    if (!current) return
    const { baseline, last, startReading } = current
    const tips = last.tips - baseline.tips
    if (tips > 0) {
      events.push({
        id: `${startReading.id}-event`,
        start: startReading.receivedAt,
        end: new Date(current.lastTipAt).toISOString(),
        durationMin: Math.max(
          1,
          Math.round((current.lastTipAt - Date.parse(startReading.receivedAt)) / 60_000)
        ),
        tips,
        rainfallMl: Number((last.rainfallMl - baseline.rainfallMl).toFixed(2)),
        rainfallMm:
          last.rainfallMm !== null && baseline.rainfallMm !== null
            ? Number((last.rainfallMm - baseline.rainfallMm).toFixed(2))
            : null,
        peakRateMlPerMin: current.peakMl,
        peakRateMmPerHr: current.peakMm,
      })
    }
    current = null
  }

  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]
    const reading = sorted[index]
    const time = Date.parse(reading.receivedAt)
    // A lower count means the gauge was reset; treat it as a new baseline.
    if (reading.tips < previous.tips) {
      close()
      continue
    }
    const tipped = reading.tips > previous.tips

    if (current && time - current.lastTipAt > dryGapMs) {
      close()
    }
    if (tipped) {
      if (!current) {
        current = {
          startReading: reading,
          baseline: previous,
          last: reading,
          lastTipAt: time,
          peakMl: 0,
          peakMm: null,
        }
      }
      current.last = reading
      current.lastTipAt = time
    }
    if (current) {
      current.peakMl = Math.max(current.peakMl, reading.rateMlPerMin)
      if (reading.rateMmPerHr !== null) {
        current.peakMm = Math.max(current.peakMm ?? 0, reading.rateMmPerHr)
      }
    }
  }
  close()

  return events.reverse()
}

const INTENSITY_WINDOW_MS = 10 * 60_000

// Minutes of rain and rainfall collected in each intensity class. Intensity is
// measured per 10-minute window rather than from the firmware's 60-second
// rate: one tip in a minute already reads as ~18 mm/h on a small funnel, so
// short windows would push every drizzle into the top bands. Needs mm, i.e. a
// configured catchment area; returns null otherwise.
export function intensityBreakdown(readings: RainGaugeReading[]) {
  const sorted = sortReadings(readings)
  if (!sorted.some((reading) => reading.rainfallMm !== null)) {
    return null
  }

  const rows = INTENSITY_CLASSES.map((intensity) => ({
    id: intensity.id,
    label: intensity.label,
    minutes: 0,
    rainfallMm: 0,
  }))

  const windows = new Map<number, number>()
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]
    const reading = sorted[index]
    if (reading.rainfallMm === null || previous.rainfallMm === null) continue
    // A drop means the gauge was reset.
    const delta = reading.rainfallMm - previous.rainfallMm
    if (delta <= 0) continue
    const window = Math.floor(Date.parse(reading.receivedAt) / INTENSITY_WINDOW_MS)
    windows.set(window, (windows.get(window) ?? 0) + delta)
  }

  const windowsPerHour = 3_600_000 / INTENSITY_WINDOW_MS
  for (const rainfallMm of windows.values()) {
    const rate = rainfallMm * windowsPerHour
    const row =
      rows[INTENSITY_CLASSES.findIndex((intensity) => rate < intensity.maxMmHr)] ??
      rows[rows.length - 1]
    row.minutes += INTENSITY_WINDOW_MS / 60_000
    row.rainfallMm += rainfallMm
  }

  return rows.map((row) => ({
    ...row,
    rainfallMm: Number(row.rainfallMm.toFixed(2)),
  }))
}

// Histogram of seconds between consecutive tips on a log scale: short
// intervals mean heavy rain, long ones drizzle.
export function tipIntervalHistogram(intervals: Array<{ intervalSeconds: number }>) {
  const bins = [
    { label: "< 10 s", max: 10 },
    { label: "10-30 s", max: 30 },
    { label: "30 s-1 min", max: 60 },
    { label: "1-5 min", max: 300 },
    { label: "5-30 min", max: 1800 },
    { label: "> 30 min", max: Infinity },
  ].map((bin) => ({ ...bin, count: 0 }))

  for (const { intervalSeconds } of intervals) {
    const bin = bins.find((candidate) => intervalSeconds < candidate.max)
    if (bin) bin.count += 1
  }

  return bins.map(({ label, count }) => ({ label, count }))
}
