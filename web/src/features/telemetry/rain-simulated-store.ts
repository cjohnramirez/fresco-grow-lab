"use client"

import { normalizeRainGaugeReading } from "@/lib/rain-gauge/parser"
import type {
  RainGaugeReading,
  RainGaugeSession,
  RainGaugeStatusPacket,
} from "@/lib/rain-gauge/types"
import {
  SIMULATED_CATCHMENT_AREA_CM2,
  SIMULATED_ML_PER_TIP,
  createRainSimulator,
  simulateRainHistory,
} from "@/lib/simulation/rain"
import { createExternalStore } from "@/lib/telemetry/external-store"

export const SIMULATED_RAIN_SESSION_ID = "rain-simulated"
export const SIMULATED_RAIN_TICK_MS = 3_000
const MAX_RAW_PACKETS = 80

export type SimulatedRainState = {
  session: RainGaugeSession
  readings: RainGaugeReading[]
  rawPackets: string[]
  status: RainGaugeStatusPacket | null
  paused: boolean
}

function simulatedSession(startedAt: number): RainGaugeSession {
  return {
    id: SIMULATED_RAIN_SESSION_ID,
    label: "Simulated rain gauge",
    source: "sample",
    startedAt: new Date(startedAt).toISOString(),
    apBaseUrl: "simulated",
    mlPerTip: SIMULATED_ML_PER_TIP,
    catchmentAreaCm2: SIMULATED_CATCHMENT_AREA_CM2,
  }
}

const INITIAL_STATE: SimulatedRainState = {
  session: simulatedSession(0),
  readings: [],
  rawPackets: [],
  status: null,
  paused: false,
}

let simulator: ReturnType<typeof createRainSimulator> | null = null
let timer: ReturnType<typeof setInterval> | null = null

function toReading(packet: ReturnType<ReturnType<typeof createRainSimulator>["reading"]>, receivedAt: string) {
  return normalizeRainGaugeReading({
    packet,
    receivedAt,
    sessionId: SIMULATED_RAIN_SESSION_ID,
    source: "sample",
  })
}

// Two days of simulated rain so the Hourly and Daily views have showers in
// them from the first page load.
function seed(now = Date.now(), hours = 48) {
  const history = simulateRainHistory({ now, hours })
  simulator = history.simulator
  const readings = history.packets.map(({ packet, receivedAt }) => toReading(packet, receivedAt))
  simulatedRainStore.setState({
    session: simulatedSession(history.sessionStartMs),
    readings,
    rawPackets: readings.slice(-MAX_RAW_PACKETS).map((reading) => reading.raw).reverse(),
    status: simulator.status(now),
    paused: false,
  })
}

function tick() {
  const current = simulatedRainStore.getSnapshot()
  if (!simulator || current.paused) {
    return
  }
  const now = Date.now()
  const reading = toReading(simulator.reading(now), new Date(now).toISOString())
  simulatedRainStore.setState({
    ...current,
    readings: [...current.readings, reading],
    rawPackets: [reading.raw, ...current.rawPackets].slice(0, MAX_RAW_PACKETS),
    status: simulator.status(now),
  })
}

export const simulatedRainStore = createExternalStore<SimulatedRainState>(INITIAL_STATE, {
  onFirstSubscribe() {
    if (!simulator) {
      seed()
    }
    timer ??= setInterval(tick, SIMULATED_RAIN_TICK_MS)
  },
  onLastUnsubscribe() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  },
})

export function setSimulatedRainPaused(paused: boolean) {
  simulatedRainStore.setState((current) => ({ ...current, paused }))
}

// "Reset Session" on the simulated gauge: zero the counters and start fresh.
export function resetSimulatedRain() {
  const now = Date.now()
  simulator = createRainSimulator({ sessionStartMs: now })
  simulatedRainStore.setState({
    session: simulatedSession(now),
    readings: [],
    rawPackets: [],
    status: simulator.status(now),
    paused: false,
  })
}
