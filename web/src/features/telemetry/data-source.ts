"use client"

import * as React from "react"

// Where a dashboard's data comes from. Simulated is the default so the
// portfolio build is alive for every visitor; the other sources need a
// database or real hardware.
export type TemperatureDataSource = "simulated" | "cloud" | "device"
export type RainDataSource = "simulated" | "ap" | "device"

export const TEMPERATURE_SOURCES: Array<{
  id: TemperatureDataSource
  label: string
  description: string
}> = [
  { id: "simulated", label: "Simulated", description: "Generated grow-bag data" },
  { id: "cloud", label: "Supabase", description: "Rows uploaded by the ESP32" },
  { id: "device", label: "USB Device", description: "Live Web Serial stream" },
]

export const RAIN_SOURCES: Array<{
  id: RainDataSource
  label: string
  description: string
}> = [
  { id: "simulated", label: "Simulated", description: "Generated rain showers" },
  { id: "ap", label: "Access Point", description: "ESP32 SoftAP at 192.168.4.1" },
  { id: "device", label: "USB Device", description: "Live Web Serial stream" },
]

const listeners = new Set<() => void>()

function readSource<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key)
    return allowed.includes(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

function usePersistedSource<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
) {
  const subscribe = React.useCallback((listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  const source = React.useSyncExternalStore(
    subscribe,
    () => readSource(key, allowed, fallback),
    () => fallback
  )
  const setSource = React.useCallback(
    (value: T) => {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // Private windows can block storage; the choice then lasts the session.
      }
      for (const listener of listeners) {
        listener()
      }
    },
    [key]
  )

  return [source, setSource] as const
}

const TEMPERATURE_IDS = TEMPERATURE_SOURCES.map((source) => source.id)
const RAIN_IDS = RAIN_SOURCES.map((source) => source.id)

export function useTemperatureDataSource() {
  return usePersistedSource<TemperatureDataSource>(
    "fresco-temperature-source",
    TEMPERATURE_IDS,
    "simulated"
  )
}

export function useRainDataSource() {
  return usePersistedSource<RainDataSource>("fresco-rain-source", RAIN_IDS, "simulated")
}
