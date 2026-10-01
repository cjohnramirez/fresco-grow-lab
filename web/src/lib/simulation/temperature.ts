import type {
  FirmwareChannel,
  FirmwarePacket,
  SensorStatus,
  SupabaseTemperatureRow,
} from "@/lib/experiment/types"

import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  manilaDayIndex,
  manilaHour,
  manilaMidnight,
} from "./clock"
import { SIMULATION_SEED, signedUnit, unit, valueNoise } from "./prng"

// Simulated grow bag in Cagayan de Oro: humid tropical climate, ~24 C before
// dawn, ~32 C mid-afternoon. Each probe is modelled as a damped, lagged copy
// of the ambient curve, which is how heat actually moves down through a
// substrate-filled grow bag.
type ProbeModel = {
  id: string
  pin: number
  // Offset from the ambient daily mean, C.
  offset: number
  // Fraction of the ambient diurnal swing this probe sees.
  amplitude: number
  // How far behind the ambient curve the probe peaks, hours.
  lagHours: number
  // Peak cooling right after a watering, C, and its decay constant, minutes.
  wateringDrop: number
  wateringTauMin: number
}

export const SIMULATED_PROBES: ProbeModel[] = [
  { id: "control", pin: 5, offset: 0, amplitude: 1, lagHours: 0, wateringDrop: 0, wateringTauMin: 1 },
  { id: "surface", pin: 4, offset: 0.9, amplitude: 1.25, lagHours: 0.4, wateringDrop: 2.6, wateringTauMin: 40 },
  { id: "roots", pin: 16, offset: 0.1, amplitude: 0.62, lagHours: 1.6, wateringDrop: 1.7, wateringTauMin: 75 },
  { id: "bottom", pin: 17, offset: -0.35, amplitude: 0.42, lagHours: 2.6, wateringDrop: 0.9, wateringTauMin: 110 },
  // Irrigation-water tank probe: shaded, big thermal mass, slow.
  { id: "water", pin: 14, offset: -1.6, amplitude: 0.35, lagHours: 3, wateringDrop: 0, wateringTauMin: 1 },
]

const BASE_MEAN_C = 27.8
const BASE_SWING_C = 4.2
// Ambient peaks around 2-3 PM Manila time.
const PEAK_HOUR = 14.5

// The simulated farm waters once each morning between 07:00 and 07:40.
export function simulatedWateringTime(dayIndex: number, seed = SIMULATION_SEED) {
  return manilaMidnight(dayIndex) + 7 * HOUR_MS + Math.floor(unit(seed, 77, dayIndex) * 40) * MINUTE_MS
}

// Cloud cover factor for a day, 0.55 (overcast) to 1 (clear).
function dayClarity(dayIndex: number, seed: number) {
  return 0.55 + 0.45 * unit(seed, 11, dayIndex)
}

function dayMeanShift(dayIndex: number, seed: number) {
  return signedUnit(seed, 12, dayIndex) * 0.9
}

// Day-level weather eases into the next day's instead of jumping at
// midnight (a jump would show as a step in every probe's trace).
function blendDays(timeMs: number, value: (dayIndex: number) => number) {
  const dayIndex = manilaDayIndex(timeMs)
  const fraction = (timeMs - manilaMidnight(dayIndex)) / DAY_MS
  const eased = fraction * fraction * (3 - 2 * fraction)
  const today = value(dayIndex)
  return today + (value(dayIndex + 1) - today) * eased
}

function diurnal(timeMs: number, lagHours: number) {
  const hour = manilaHour(timeMs - lagHours * HOUR_MS)
  return Math.cos(((hour - PEAK_HOUR) / 24) * 2 * Math.PI)
}

function wateringCooling(timeMs: number, probe: ProbeModel, seed: number) {
  if (probe.wateringDrop === 0) {
    return 0
  }

  const today = manilaDayIndex(timeMs)
  let cooling = 0
  for (const dayIndex of [today - 1, today]) {
    const wateredAt = simulatedWateringTime(dayIndex, seed)
    const elapsedMin = (timeMs - wateredAt) / MINUTE_MS
    if (elapsedMin >= 0 && elapsedMin < probe.wateringTauMin * 6) {
      // Water takes a few minutes to soak in, then the bag slowly re-warms.
      const onset = 1 - Math.exp(-elapsedMin / 4)
      cooling += probe.wateringDrop * onset * Math.exp(-elapsedMin / probe.wateringTauMin)
    }
  }
  return cooling
}

// DS18B20 at 12-bit resolution reports in 0.0625 C steps.
function quantize(celsius: number) {
  return Math.round(celsius / 0.0625) * 0.0625
}

export function simulatedProbeCelsius(
  probe: ProbeModel,
  timeMs: number,
  seed = SIMULATION_SEED
) {
  const lagged = timeMs - probe.lagHours * HOUR_MS
  const clarity = blendDays(lagged, (day) => dayClarity(day, seed))
  const mean =
    BASE_MEAN_C + blendDays(lagged, (day) => dayMeanShift(day, seed)) - (1 - clarity) * 1.6
  // Passing clouds: slow noise that mostly matters in daylight.
  const daylight = Math.max(0, Math.cos(((manilaHour(lagged) - 12.5) / 24) * 2 * Math.PI))
  const clouds = valueNoise(seed + 3, lagged, 45 * MINUTE_MS) * 0.8 * daylight
  const drift = valueNoise(seed + probe.pin, timeMs, 3 * HOUR_MS) * 0.25
  const sensorNoise = signedUnit(seed, probe.pin, Math.floor(timeMs / 1000)) * 0.08

  const value =
    mean +
    probe.offset +
    BASE_SWING_C * clarity * probe.amplitude * diurnal(timeMs, probe.lagHours) +
    (clouds + drift) * probe.amplitude +
    sensorNoise -
    wateringCooling(timeMs, probe, seed)

  return quantize(value)
}

// Rare sensor faults so the health card and status filters have something to
// show: a missing probe for a minute, or a CRC/read failure.
function simulatedStatus(
  probe: ProbeModel,
  timeMs: number,
  seed: number
): SensorStatus {
  const minute = Math.floor(timeMs / MINUTE_MS)
  const roll = unit(seed, 900 + probe.pin, minute)
  if (roll < 0.0015) {
    return "no_sensor"
  }
  if (roll < 0.004) {
    return "read_failed"
  }
  return "ok"
}

function overallStatus(channels: FirmwareChannel[]): SensorStatus {
  const ok = channels.filter((channel) => channel.ts === "ok").length
  if (ok === channels.length) return "ok"
  if (ok > 0) return "partial"
  return "read_failed"
}

export function simulatedPacket(
  timeMs: number,
  seq: number,
  seed = SIMULATION_SEED
): FirmwarePacket {
  const channels = SIMULATED_PROBES.map<FirmwareChannel>((probe) => {
    const status = simulatedStatus(probe, timeMs, seed)
    const celsius = status === "ok" ? simulatedProbeCelsius(probe, timeMs, seed) : null
    return {
      id: probe.id,
      pin: probe.pin,
      devices: status === "no_sensor" ? 0 : 1,
      ts: status,
      tc: celsius === null ? null : Number(celsius.toFixed(4)),
      tf: celsius === null ? null : Number((celsius * 1.8 + 32).toFixed(4)),
    }
  })

  return {
    type: "temperature",
    seq,
    // Pretend the board booted at local midnight so `ms` stays realistic.
    ms: Math.floor((timeMs - manilaMidnight(manilaDayIndex(timeMs))) % DAY_MS),
    sensors: channels.reduce((total, channel) => total + (channel.devices ?? 0), 0),
    ts: overallStatus(channels),
    channels,
  }
}

export function simulatedRow(timeMs: number, seed = SIMULATION_SEED): SupabaseTemperatureRow {
  const seq = Math.floor(timeMs / 1000)
  return {
    id: seq,
    created_at: new Date(timeMs).toISOString(),
    payload: simulatedPacket(timeMs, seq, seed),
  }
}

// History with graded resolution: 1-minute rows for the most recent day,
// 5-minute rows before that. Keeps a full week light enough to analyze in the
// browser on every live tick.
export function simulateTemperatureHistory({
  now,
  days = 7,
  seed = SIMULATION_SEED,
}: {
  now: number
  days?: number
  seed?: number
}) {
  const rows: SupabaseTemperatureRow[] = []
  const recentFrom = now - DAY_MS
  const start = Math.floor((now - days * DAY_MS) / (5 * MINUTE_MS)) * 5 * MINUTE_MS

  for (let time = start; time < recentFrom; time += 5 * MINUTE_MS) {
    rows.push(simulatedRow(time, seed))
  }
  const recentStart = Math.ceil(recentFrom / MINUTE_MS) * MINUTE_MS
  for (let time = recentStart; time <= now; time += MINUTE_MS) {
    rows.push(simulatedRow(time, seed))
  }

  return rows
}
