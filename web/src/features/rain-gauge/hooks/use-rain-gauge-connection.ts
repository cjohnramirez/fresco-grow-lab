"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  serialStore,
  subscribeSerialRain,
} from "@/features/hardware/serial-connection"
import type { RainDataSource } from "@/features/telemetry/data-source"
import { saveRainGaugeSession } from "@/lib/rain-gauge/storage"
import type {
  RainGaugeConnectionState,
  RainGaugeSession,
  RainGaugeStatusPacket,
} from "@/lib/rain-gauge/types"

import {
  buildEventsUrl,
  buildReadingsUrl,
  buildResetUrl,
  buildStatusUrl,
  createSession,
  readJson,
  writeLocalStorage,
} from "./rain-gauge-api"
import { SESSION_ID_KEY } from "./rain-gauge-constants"

// Owns the live link to the gauge: one-shot status/snapshot fetches, the SSE
// subscription to the AP, or the USB serial stream from kit firmware, plus
// the firmware session reset. Reading appends and local clearing are
// delegated to the readings hook via the passed callbacks. The simulated
// source is handled by the dashboard hook and never reaches this one.
export function useRainGaugeConnection({
  apBaseUrl,
  appendReading,
  dataSource,
  resetReadings,
  session,
  setError,
  setSession,
}: {
  apBaseUrl: string
  appendReading: (raw: string) => Promise<void>
  dataSource: RainDataSource
  resetReadings: () => void
  session: RainGaugeSession
  setError: (message: string | null) => void
  setSession: React.Dispatch<React.SetStateAction<RainGaugeSession>>
}) {
  const [connectionState, setConnectionState] =
    React.useState<RainGaugeConnectionState>("idle")
  const [status, setStatus] = React.useState<RainGaugeStatusPacket | null>(null)
  const [loadingStatus, setLoadingStatus] = React.useState(false)
  const [loadingReset, setLoadingReset] = React.useState(false)
  const eventSourceRef = React.useRef<EventSource | null>(null)
  const serialUnsubscribeRef = React.useRef<(() => void) | null>(null)

  const statusUrl = React.useMemo(() => buildStatusUrl(apBaseUrl), [apBaseUrl])
  const readingsUrl = React.useMemo(
    () => buildReadingsUrl(apBaseUrl),
    [apBaseUrl]
  )
  const eventsUrl = React.useMemo(() => buildEventsUrl(apBaseUrl), [apBaseUrl])
  const resetUrl = React.useMemo(() => buildResetUrl(apBaseUrl), [apBaseUrl])

  const refreshStatus = React.useCallback(async () => {
    setLoadingStatus(true)
    try {
      const payload = await readJson<{ status: RainGaugeStatusPacket }>(statusUrl)
      setStatus(payload.status)
      setError(null)
      return payload.status
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Rain gauge status could not be fetched."
      setError(message)
      throw requestError
    } finally {
      setLoadingStatus(false)
    }
  }, [statusUrl, setError])

  const disconnect = React.useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    serialUnsubscribeRef.current?.()
    serialUnsubscribeRef.current = null
    setConnectionState("idle")
  }, [])

  const connectSerialStream = React.useCallback(async () => {
    if (serialStore.getSnapshot().status !== "connected") {
      setConnectionState("error")
      const message =
        "Connect the rain gauge over USB first (Connect Hardware > Connect over USB)."
      setError(message)
      toast.error(message)
      return
    }
    await saveRainGaugeSession({ ...session, source: "usb", apBaseUrl: "usb://serial" })
    setSession((current) => ({ ...current, source: "usb", apBaseUrl: "usb://serial" }))
    serialUnsubscribeRef.current = subscribeSerialRain((raw) => {
      setConnectionState("connected")
      appendReading(raw).catch((eventError) => {
        setError(
          eventError instanceof Error
            ? eventError.message
            : "Rain gauge reading could not be parsed."
        )
      })
    })
    setConnectionState("connecting")
    toast.message("Listening for rain packets over USB")
  }, [appendReading, session, setError, setSession])

  const connect = React.useCallback(async () => {
    disconnect()
    setConnectionState("connecting")
    setError(null)
    if (dataSource === "device") {
      await connectSerialStream()
      return
    }
    await saveRainGaugeSession(session)

    try {
      const currentStatus = await refreshStatus()
      setSession((current) => ({
        ...current,
        catchmentAreaCm2: currentStatus.catchmentAreaCm2,
        mlPerTip: currentStatus.mlPerTip,
      }))
      const snapshot = await readJson<{ reading: unknown }>(readingsUrl)
      await appendReading(JSON.stringify(snapshot.reading))

      const events = new EventSource(eventsUrl)
      eventSourceRef.current = events
      events.addEventListener("open", () => setConnectionState("connected"))
      events.addEventListener("reading", (event) => {
        appendReading((event as MessageEvent<string>).data).catch((eventError) => {
          setError(
            eventError instanceof Error
              ? eventError.message
              : "Rain gauge reading could not be parsed."
          )
        })
      })
      events.addEventListener("error", () => setConnectionState("reconnecting"))
    } catch (connectError) {
      setConnectionState("error")
      const message =
        connectError instanceof Error
          ? connectError.message
          : "Rain gauge connection failed."
      setError(message)
      toast.error(message)
    }
  }, [
    appendReading,
    connectSerialStream,
    dataSource,
    disconnect,
    eventsUrl,
    readingsUrl,
    refreshStatus,
    session,
    setError,
    setSession,
  ])

  React.useEffect(() => disconnect, [disconnect])

  const resetGauge = React.useCallback(async () => {
    setLoadingReset(true)
    try {
      disconnect()
      // Kit firmware resets its counters on the next reboot; the AP firmware
      // exposes an explicit reset endpoint.
      if (dataSource === "ap") {
        await readJson(resetUrl, { method: "POST" })
      }
      const nextSession = createSession(apBaseUrl)
      writeLocalStorage(SESSION_ID_KEY, nextSession.id)
      setSession(nextSession)
      resetReadings()
      await saveRainGaugeSession(nextSession)
      toast.success("Rain gauge session reset")
    } catch (resetError) {
      const message =
        resetError instanceof Error ? resetError.message : "Reset failed."
      setError(message)
      toast.error(message)
    } finally {
      setLoadingReset(false)
    }
  }, [apBaseUrl, dataSource, disconnect, resetReadings, resetUrl, setError, setSession])

  return {
    connect,
    connectionState,
    disconnect,
    loadingReset,
    loadingStatus,
    refreshStatus,
    resetGauge,
    status,
  }
}
