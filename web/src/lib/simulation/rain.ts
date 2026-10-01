import type {
  RainGaugeReadingPacket,
  RainGaugeStatusPacket,
} from "@/lib/rain-gauge/types"

import { HOUR_MS, MINUTE_MS, manilaHour } from "./clock"
import { SIMULATION_SEED, gaussian, unit } from "./prng"

// Calibration mean from the reference CSV and a 10 cm diameter funnel, so the
// simulated gauge reports both ml and mm like a fully configured unit.
export const SIMULATED_ML_PER_TIP = 2.3695
export const SIMULATED_CATCHMENT_AREA_CM2 = 78.54
const MM_PER_TIP = (SIMULATED_ML_PER_TIP / SIMULATED_CATCHMENT_AREA_CM2) * 10

const STEP_MS = 5_000
const RATE_WINDOW_MS = 60_000
const BLOCK_MS = 30 * MINUTE_MS

// Cagayan de Oro rain is mostly afternoon convective showers, with the odd
// overnight drizzle. Chance of rain per 30-minute block by hour of day.
function rainChance(hour: number) {
  if (hour >= 13 && hour < 18) return 0.34
  if (hour >= 18 && hour < 22) return 0.16
  return 0.06
}

// Rain intensity in mm/hr at `timeMs`. Each rainy block gets a lognormal peak
// intensity shaped by a smooth rise-and-fall envelope.
export function simulatedRainIntensity(timeMs: number, seed = SIMULATION_SEED) {
  const block = Math.floor(timeMs / BLOCK_MS)
  const blockStart = block * BLOCK_MS
  if (unit(seed, 500, block) >= rainChance(manilaHour(blockStart))) {
    return 0
  }

  const peak = Math.min(60, Math.exp(1.1 + 0.95 * gaussian(seed, 501, block)))
  const phase = (timeMs - blockStart) / BLOCK_MS
  return peak * Math.sin(Math.PI * phase) ** 2
}

function mlPerMinute(mmPerHr: number) {
  return (mmPerHr * SIMULATED_CATCHMENT_AREA_CM2) / 10 / 60
}

// Stateful tipping-bucket simulator. Water accumulates in the bucket; each
// full bucket produces one tip, i.e. two counted hall-sensor edges, exactly as
// the firmware counts them. Occasionally a reading is emitted between the two
// edges so the "pending half tip" state shows up.
export function createRainSimulator({
  sessionStartMs,
  seed = SIMULATION_SEED,
}: {
  sessionStartMs: number
  seed?: number
}) {
  let cursor = sessionStartMs
  let bucketMl = 0
  let edges = 0
  let pendingEdge = false
  let lastEdgeMs = 0
  let seq = 0
  const tipSamples: Array<{ time: number; tips: number }> = []

  function deviceMs(timeMs: number) {
    // Board booted a few seconds before the session started.
    return Math.floor(timeMs - sessionStartMs) + 4_200
  }

  function recordEdge(timeMs: number) {
    edges += 1
    lastEdgeMs = deviceMs(timeMs)
  }

  function advanceTo(timeMs: number) {
    while (cursor + STEP_MS <= timeMs) {
      cursor += STEP_MS
      if (pendingEdge) {
        recordEdge(cursor)
        pendingEdge = false
      }

      bucketMl += (mlPerMinute(simulatedRainIntensity(cursor, seed)) * STEP_MS) / MINUTE_MS
      while (bucketMl >= SIMULATED_ML_PER_TIP) {
        bucketMl -= SIMULATED_ML_PER_TIP
        recordEdge(cursor)
        if (unit(seed, 600, cursor) < 0.12) {
          pendingEdge = true
          break
        }
        recordEdge(cursor)
      }

      tipSamples.push({ time: cursor, tips: Math.floor(edges / 2) })
      while (tipSamples.length > 0 && cursor - tipSamples[0].time > RATE_WINDOW_MS) {
        tipSamples.shift()
      }
    }
  }

  function reading(timeMs: number): RainGaugeReadingPacket {
    advanceTo(timeMs)
    seq += 1
    const tips = Math.floor(edges / 2)
    const oldest = tipSamples[0]
    const windowMs = oldest ? cursor - oldest.time : 0
    const rateMlPerMin =
      oldest && windowMs > 0
        ? ((tips - oldest.tips) * SIMULATED_ML_PER_TIP) / (windowMs / MINUTE_MS)
        : 0

    return {
      type: "rain_gauge",
      seq,
      ms: deviceMs(timeMs),
      edges,
      tips,
      lastEdgeMs,
      rainfallMl: Number((tips * SIMULATED_ML_PER_TIP).toFixed(3)),
      rainfallMm: Number((tips * MM_PER_TIP).toFixed(3)),
      rateMlPerMin: Number(rateMlPerMin.toFixed(3)),
      rateMmPerHr: Number(((rateMlPerMin / SIMULATED_CATCHMENT_AREA_CM2) * 600).toFixed(3)),
    }
  }

  function status(timeMs: number): RainGaugeStatusPacket {
    advanceTo(timeMs)
    return {
      type: "rain_gauge",
      device: "simulated-nodemcu-32s",
      uptimeMs: deviceMs(timeMs),
      sessionStartMs: 4_200,
      ssid: "FrescoRainGauge (simulated)",
      ip: "simulated",
      clients: 1,
      sseClients: 1,
      tipPin: 34,
      debounceMs: 50,
      countsBothEdges: true,
      mlPerTip: SIMULATED_ML_PER_TIP,
      catchmentAreaCm2: SIMULATED_CATCHMENT_AREA_CM2,
      mmPerTip: Number(MM_PER_TIP.toFixed(4)),
      edges,
      tips: Math.floor(edges / 2),
    }
  }

  return { reading, status }
}

// Backfills a simulated session: one packet per minute from the session start
// until `now`, then hands back the simulator so live ticks can continue it.
export function simulateRainHistory({
  now,
  hours = 24,
  seed = SIMULATION_SEED,
}: {
  now: number
  hours?: number
  seed?: number
}) {
  const sessionStartMs = Math.floor((now - hours * HOUR_MS) / MINUTE_MS) * MINUTE_MS
  const simulator = createRainSimulator({ sessionStartMs, seed })
  const packets: Array<{ receivedAt: string; packet: RainGaugeReadingPacket }> = []

  for (let time = sessionStartMs + MINUTE_MS; time <= now; time += MINUTE_MS) {
    packets.push({ receivedAt: new Date(time).toISOString(), packet: simulator.reading(time) })
  }

  return { packets, sessionStartMs, simulator }
}
