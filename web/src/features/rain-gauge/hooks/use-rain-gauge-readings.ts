"use client"

import * as React from "react"

import {
  normalizeRainGaugeReading,
  parseRainGaugeReadingJson,
} from "@/lib/rain-gauge/parser"
import {
  getRainGaugeReadings,
  saveRainGaugeReadings,
} from "@/lib/rain-gauge/storage"
import type { RainGaugeReading, RainGaugeSession } from "@/lib/rain-gauge/types"

import { EMPTY_PACKETS, EMPTY_READINGS, PAGE_SIZE } from "./rain-gauge-constants"

const MAX_RAW_PACKETS = 80

// Owns the locally-stored readings for the active session: hydration from
// IndexedDB, live appends from the SSE stream, the raw packet log, and paging.
export function useRainGaugeReadings({
  session,
  setError,
}: {
  session: RainGaugeSession
  setError: (message: string | null) => void
}) {
  const [readings, setReadings] =
    React.useState<RainGaugeReading[]>(EMPTY_READINGS)
  const [rawPackets, setRawPackets] = React.useState<string[]>(EMPTY_PACKETS)
  const [page, setPage] = React.useState(1)
  const [loadingInitial, setLoadingInitial] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    getRainGaugeReadings(session.id)
      .then((storedReadings) => {
        if (!cancelled) {
          setReadings(storedReadings)
        }
      })
      .catch((storageError) => {
        if (!cancelled) {
          setError(
            storageError instanceof Error
              ? storageError.message
              : "Rain gauge local storage could not be read."
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingInitial(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session.id, setError])

  const appendReading = React.useCallback(
    async (raw: string) => {
      const packet = parseRainGaugeReadingJson(raw)
      const reading = normalizeRainGaugeReading({
        packet,
        raw,
        sessionId: session.id,
        source: session.source === "usb" ? "usb" : "ap",
      })

      setReadings((current) => {
        if (current.some((existing) => existing.id === reading.id)) {
          return current
        }
        return [...current, reading]
      })
      setRawPackets((current) => [raw, ...current].slice(0, MAX_RAW_PACKETS))
      await saveRainGaugeReadings([reading])
    },
    [session.id, session.source]
  )

  const resetReadings = React.useCallback(() => {
    setReadings(EMPTY_READINGS)
    setRawPackets(EMPTY_PACKETS)
  }, [])

  const totalPages = Math.max(1, Math.ceil(readings.length / PAGE_SIZE))
  const pagedReadings = React.useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return readings.slice(start, start + PAGE_SIZE)
  }, [page, readings])

  return {
    appendReading,
    loadingInitial,
    page,
    pagedReadings,
    rawPackets,
    readings,
    resetReadings,
    setPage,
    totalPages,
  }
}
