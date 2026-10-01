"use client"

import { DEFAULT_BAG_ID } from "@/lib/experiment/irrigation"
import type {
  FirmwarePacket,
  IrrigationEvent,
  SupabaseTemperatureRow,
} from "@/lib/experiment/types"
import { simulateIrrigationEvents } from "@/lib/simulation/irrigation"
import { simulateTemperatureHistory, simulatedRow } from "@/lib/simulation/temperature"
import { createExternalStore } from "@/lib/telemetry/external-store"

export type LocalTemperatureState = {
  rows: SupabaseTemperatureRow[]
  events: IrrigationEvent[]
  seededBags: string[]
  updatedAt: number
}

const EMPTY_STATE: LocalTemperatureState = {
  rows: [],
  events: [],
  seededBags: [],
  updatedAt: 0,
}

// How often the simulated board "uploads" a new row while someone is watching.
export const SIMULATED_TICK_MS = 10_000
// Cap on rows kept for a USB session (about 12 h at 1 row/s).
const MAX_DEVICE_ROWS = 43_200

let simulatedTimer: ReturnType<typeof setInterval> | null = null

function ensureSimulatedSeed() {
  const current = simulatedTemperatureStore.getSnapshot()
  if (current.rows.length > 0) {
    return
  }
  const now = Date.now()
  simulatedTemperatureStore.setState({
    rows: simulateTemperatureHistory({ now }),
    events: simulateIrrigationEvents({ now, bagId: DEFAULT_BAG_ID }),
    seededBags: [DEFAULT_BAG_ID],
    updatedAt: now,
  })
}

function tickSimulated() {
  const now = Date.now()
  simulatedTemperatureStore.setState((current) => ({
    ...current,
    rows: [...current.rows, simulatedRow(now)],
    updatedAt: now,
  }))
}

export const simulatedTemperatureStore = createExternalStore<LocalTemperatureState>(
  EMPTY_STATE,
  {
    onFirstSubscribe() {
      ensureSimulatedSeed()
      simulatedTimer ??= setInterval(tickSimulated, SIMULATED_TICK_MS)
    },
    onLastUnsubscribe() {
      if (simulatedTimer) {
        clearInterval(simulatedTimer)
        simulatedTimer = null
      }
    },
  }
)

// Simulated history for extra bags is generated on first selection.
export function seedSimulatedBag(bagId: string) {
  const current = simulatedTemperatureStore.getSnapshot()
  if (current.seededBags.includes(bagId)) {
    return
  }
  simulatedTemperatureStore.setState({
    ...current,
    events: [...current.events, ...simulateIrrigationEvents({ now: Date.now(), bagId })],
    seededBags: [...current.seededBags, bagId],
  })
}

export const deviceTemperatureStore =
  createExternalStore<LocalTemperatureState>(EMPTY_STATE)

let deviceRowId = 0

// Called by the Web Serial reader for every temperature packet the kit
// firmware prints. The receive time stands in for Supabase `created_at`.
export function appendDevicePacket(packet: FirmwarePacket, receivedAt = new Date()) {
  deviceRowId += 1
  const row: SupabaseTemperatureRow = {
    id: `usb-${deviceRowId}`,
    created_at: receivedAt.toISOString(),
    payload: packet,
  }
  deviceTemperatureStore.setState((current) => ({
    ...current,
    rows: [...current.rows, row].slice(-MAX_DEVICE_ROWS),
    updatedAt: receivedAt.getTime(),
  }))
}

export function clearDeviceTemperature() {
  deviceTemperatureStore.setState(EMPTY_STATE)
}

export function updateLocalEvents(
  store: typeof simulatedTemperatureStore,
  update: (events: IrrigationEvent[]) => IrrigationEvent[]
) {
  store.setState((current) => ({ ...current, events: update(current.events) }))
}
