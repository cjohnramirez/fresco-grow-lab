"use client"

import * as React from "react"
import { toast } from "sonner"

import { customSupabaseHeaders } from "@/features/hardware/custom-supabase"
import { chunkReadings } from "@/lib/rain-gauge/sync"
import {
  getRainGaugeReadings,
  getRainGaugeSyncQueue,
  queueRainGaugeSync,
  removeRainGaugeSyncQueueEntry,
} from "@/lib/rain-gauge/storage"
import type {
  RainGaugeReading,
  RainGaugeSession,
  RainGaugeSyncState,
} from "@/lib/rain-gauge/types"

const INITIAL_SYNC_STATE: RainGaugeSyncState = {
  status: "idle",
  queued: 0,
  synced: 0,
  failed: 0,
  message: "Not synced.",
}

class NotConfiguredError extends Error {}

type SyncResponse = {
  ok: boolean
  code?: string
  message?: string
  synced?: number
  failed?: number
}

async function uploadSession(
  session: RainGaugeSession,
  readings: RainGaugeReading[],
  onProgress: (synced: number) => void
) {
  let synced = 0
  for (const chunk of chunkReadings(readings)) {
    const response = await fetch("/api/rain-gauge/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...customSupabaseHeaders() },
      body: JSON.stringify({ session, readings: chunk }),
    })
    const payload = (await response.json()) as SyncResponse

    if (!response.ok || !payload.ok) {
      if (payload.code === "not_configured") {
        throw new NotConfiguredError("Supabase is not configured for rain gauge sync.")
      }
      throw new Error(payload.message ?? "Rain gauge sync failed.")
    }
    synced += payload.synced ?? chunk.length
    onProgress(synced)
  }
  return synced
}

// Owns the optional, manual push of local readings to Supabase. Large sessions
// upload in chunks; a failed session is parked in the IndexedDB `syncQueue`
// store and retried when the browser comes back online or on request. A
// missing server config is a first-class `not_configured` state.
export function useRainGaugeSync({
  readings,
  session,
  simulated,
}: {
  readings: RainGaugeReading[]
  session: RainGaugeSession
  simulated: boolean
}) {
  const [syncState, setSyncState] =
    React.useState<RainGaugeSyncState>(INITIAL_SYNC_STATE)
  const [loadingSync, setLoadingSync] = React.useState(false)
  const [queuedSessions, setQueuedSessions] = React.useState(0)

  const refreshQueueCount = React.useCallback(async () => {
    try {
      setQueuedSessions((await getRainGaugeSyncQueue()).length)
    } catch {
      setQueuedSessions(0)
    }
  }, [])

  const runSync = React.useCallback(
    async (target: RainGaugeSession, targetReadings: RainGaugeReading[], attempts = 0) => {
      setSyncState({
        status: "syncing",
        queued: targetReadings.length,
        synced: 0,
        failed: 0,
        message: `Syncing ${targetReadings.length} readings...`,
      })

      try {
        const synced = await uploadSession(target, targetReadings, (count) =>
          setSyncState((current) => ({
            ...current,
            queued: targetReadings.length - count,
            synced: count,
            message: `Synced ${count} of ${targetReadings.length} readings...`,
          }))
        )
        await removeRainGaugeSyncQueueEntry(target.id)
        setSyncState({
          status: "synced",
          queued: 0,
          synced,
          failed: 0,
          message: "Rain gauge readings synced.",
        })
        return true
      } catch (syncError) {
        if (syncError instanceof NotConfiguredError) {
          setSyncState({
            status: "not_configured",
            queued: targetReadings.length,
            synced: 0,
            failed: 0,
            message: syncError.message,
          })
          return false
        }

        const message =
          syncError instanceof Error ? syncError.message : "Rain gauge sync failed."
        await queueRainGaugeSync({
          id: target.id,
          session: target,
          attempts: attempts + 1,
          lastError: message,
          queuedAt: new Date().toISOString(),
        }).catch(() => {})
        setSyncState((current) => ({
          status: "error",
          queued: targetReadings.length - current.synced,
          synced: current.synced,
          failed: targetReadings.length - current.synced,
          message: `${message} Queued for retry.`,
        }))
        return false
      }
    },
    []
  )

  const syncToSupabase = React.useCallback(async () => {
    if (simulated) {
      toast.message("Simulated readings are not synced. Switch to a real gauge first.")
      return
    }
    setLoadingSync(true)
    try {
      const ok = await runSync(session, readings)
      if (ok) toast.success("Rain gauge readings synced")
    } finally {
      setLoadingSync(false)
      await refreshQueueCount()
    }
  }, [readings, refreshQueueCount, runSync, session, simulated])

  const retryQueuedSync = React.useCallback(async () => {
    let queue
    try {
      queue = await getRainGaugeSyncQueue()
    } catch {
      return
    }
    if (queue.length === 0) return

    setLoadingSync(true)
    try {
      let recovered = 0
      for (const entry of queue) {
        const stored = await getRainGaugeReadings(entry.session.id)
        if (await runSync(entry.session, stored, entry.attempts)) recovered++
      }
      if (recovered > 0) {
        toast.success(`Synced ${recovered} queued rain session${recovered > 1 ? "s" : ""}`)
      }
    } finally {
      setLoadingSync(false)
      await refreshQueueCount()
    }
  }, [refreshQueueCount, runSync])

  React.useEffect(() => {
    let cancelled = false
    getRainGaugeSyncQueue()
      .then((queue) => {
        if (!cancelled) setQueuedSessions(queue.length)
      })
      .catch(() => {})
    const onOnline = () => void retryQueuedSync()
    window.addEventListener("online", onOnline)
    return () => {
      cancelled = true
      window.removeEventListener("online", onOnline)
    }
  }, [retryQueuedSync])

  const effectiveState = simulated
    ? {
        ...INITIAL_SYNC_STATE,
        message: "Simulated data stays in the browser.",
      }
    : syncState

  return {
    loadingSync,
    queuedSessions,
    retryQueuedSync,
    syncState: effectiveState,
    syncToSupabase,
  }
}
