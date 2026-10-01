import {
  DEFAULT_BAG_ID,
  DEFAULT_WATER_L,
  cutoffAtForWatering,
  expectedWeightSlots,
} from "@/lib/experiment/irrigation"
import type { IrrigationEvent, IrrigationWeightLog } from "@/lib/experiment/types"

import { HOUR_MS, MINUTE_MS, manilaDayIndex } from "./clock"
import { SIMULATION_SEED, hashString, signedUnit, unit } from "./prng"
import {
  SIMULATED_PROBES,
  simulatedProbeCelsius,
  simulatedWateringTime,
} from "./temperature"

const controlProbe = SIMULATED_PROBES.find((probe) => probe.id === "control")!
const waterProbe = SIMULATED_PROBES.find((probe) => probe.id === "water")!

// Grow-bag mass model. After a 2 L watering the bag holds its dry mass plus the
// retained water; free water drains in the first hour, then evapotranspiration
// (driven by air temperature) slowly pulls mass down until the 6 PM cutoff.
function createMassModel(dayIndex: number, wateredAt: number, seed: number) {
  // Dry mass creeps up a little through the week as roots grow.
  const dryMass =
    7.45 + 0.015 * (((dayIndex % 7) + 7) % 7) + signedUnit(seed, 31, dayIndex) * 0.04
  const retained = 1.85 + signedUnit(seed, 32, dayIndex) * 0.08
  let etCursor = wateredAt
  let et = 0

  return (timeMs: number) => {
    // Integrate ET forward in 10-minute steps: faster when it's hot.
    while (etCursor < timeMs) {
      const step = Math.min(10 * MINUTE_MS, timeMs - etCursor)
      const airC = simulatedProbeCelsius(controlProbe, etCursor, SIMULATION_SEED)
      et += (0.028 + 0.016 * Math.max(0, airC - 24)) * (step / HOUR_MS)
      etCursor += step
    }
    const elapsedMin = Math.max(0, (timeMs - wateredAt) / MINUTE_MS)
    const drained = 0.42 * (1 - Math.exp(-elapsedMin / 28))
    return dryMass + retained - drained - et
  }
}

function simulatedEvent(dayIndex: number, now: number, bagId: string, seed: number) {
  // Every bag is watered on the shared schedule the temperature model uses.
  const wateredAtMs = simulatedWateringTime(dayIndex)
  const wateredAt = new Date(wateredAtMs).toISOString()
  const cutoffAt = cutoffAtForWatering(wateredAt)
  const slots = expectedWeightSlots({ wateredAt, cutoffAt })
  const massAt = createMassModel(dayIndex, wateredAtMs, seed)

  const weightLogs: IrrigationWeightLog[] = []
  for (const [index, slotAt] of slots.entries()) {
    const slotMs = Date.parse(slotAt)
    // Leave the newest slot unlogged so the "checkpoint due" state is visible.
    if (slotMs > now - 10 * MINUTE_MS) {
      break
    }
    // The operator misses roughly one checkpoint in eight.
    if (index > 0 && unit(seed, 40, dayIndex, index) < 0.12) {
      continue
    }

    const weighedMs = Math.min(
      slotMs + Math.floor(unit(seed, 41, dayIndex, index) * 4) * MINUTE_MS,
      now
    )
    weightLogs.push({
      slotAt,
      weighedAt: new Date(weighedMs).toISOString(),
      massKg: Number(massAt(weighedMs).toFixed(2)),
      note: "",
    })
  }

  return {
    id: `sim-${bagId}-${dayIndex}`,
    bagId,
    wateredAt,
    cutoffAt,
    waterL: DEFAULT_WATER_L,
    waterTempC: Number(simulatedProbeCelsius(waterProbe, wateredAtMs).toFixed(1)),
    weightLogs,
    note: "Simulated morning watering.",
    createdAt: wateredAt,
    archivedAt: null,
  } satisfies IrrigationEvent
}

// One watering per day for the last `days` days, including today once the
// morning watering time has passed. Newest first, matching the API route.
export function simulateIrrigationEvents({
  now,
  days = 7,
  bagId = DEFAULT_BAG_ID,
  seed = SIMULATION_SEED,
}: {
  now: number
  days?: number
  bagId?: string
  seed?: number
}) {
  const bagSeed = bagId === DEFAULT_BAG_ID ? seed : seed ^ hashString(bagId)
  const today = manilaDayIndex(now)
  const events: IrrigationEvent[] = []

  for (let dayIndex = today - days + 1; dayIndex <= today; dayIndex++) {
    if (simulatedWateringTime(dayIndex) > now) {
      continue
    }
    events.push(simulatedEvent(dayIndex, now, bagId, bagSeed))
  }

  return events.reverse()
}
