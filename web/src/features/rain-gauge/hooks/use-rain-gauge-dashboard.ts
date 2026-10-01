"use client"

import * as React from "react"

import {
  useRainDataSource,
  type RainDataSource,
} from "@/features/telemetry/data-source"
import {
  resetSimulatedRain,
  setSimulatedRainPaused,
  simulatedRainStore,
  type SimulatedRainState,
} from "@/features/telemetry/rain-simulated-store"
import { buildRainGaugeSummary } from "@/lib/rain-gauge/analytics"
import { createRainGaugeSessionId } from "@/lib/rain-gauge/storage"
import type {
  RainGaugeChartRange,
  RainGaugeSession,
} from "@/lib/rain-gauge/types"

import {
  createSession,
  readLocalStorage,
  writeLocalStorage,
} from "./rain-gauge-api"
import {
  AP_URL_KEY,
  DEFAULT_AP_BASE_URL,
  PAGE_SIZE,
  SESSION_ID_KEY,
} from "./rain-gauge-constants"
import { useRainGaugeCalibration } from "./use-rain-gauge-calibration"
import { useRainGaugeConnection } from "./use-rain-gauge-connection"
import { useRainGaugeExport } from "./use-rain-gauge-export"
import { useRainGaugeReadings } from "./use-rain-gauge-readings"
import { useRainGaugeSync } from "./use-rain-gauge-sync"

const noopSubscribe = () => () => {}

// The simulated gauge lives in a module store so it keeps raining while the
// visitor browses other views; subscribe only while it is the active source.
function useSimulatedRain(active: boolean, live: boolean): SimulatedRainState | null {
  const state = React.useSyncExternalStore(
    active && live ? simulatedRainStore.subscribe : noopSubscribe,
    simulatedRainStore.getSnapshot,
    simulatedRainStore.getSnapshot
  )
  return active ? state : null
}

// Composition root for the rain gauge dashboard. It owns the state shared across
// concerns (data source, AP URL, session, chart range, error surface) and wires
// the focused hooks together; each sub-hook owns one slice of behavior.
export function useRainGaugeDashboard({ live = true }: { live?: boolean } = {}) {
  const [dataSource, setDataSourceState] = useRainDataSource()
  const [simulatedPage, setSimulatedPage] = React.useState(1)
  const [apBaseUrl, setApBaseUrlState] = React.useState(() =>
    readLocalStorage(AP_URL_KEY, DEFAULT_AP_BASE_URL)
  )
  const [chartRange, setChartRange] = React.useState<RainGaugeChartRange>("1d")
  const [error, setError] = React.useState<string | null>(null)
  const [storedSession, setSession] = React.useState<RainGaugeSession>(() => {
    const storedUrl = readLocalStorage(AP_URL_KEY, DEFAULT_AP_BASE_URL)
    const storedSessionId = readLocalStorage(
      SESSION_ID_KEY,
      createRainGaugeSessionId()
    )
    return createSession(storedUrl, storedSessionId)
  })

  const setApBaseUrl = React.useCallback((value: string) => {
    setApBaseUrlState(value)
    writeLocalStorage(AP_URL_KEY, value)
  }, [])

  React.useEffect(() => {
    writeLocalStorage(SESSION_ID_KEY, storedSession.id)
  }, [storedSession.id])

  const local = useRainGaugeReadings({ session: storedSession, setError })
  const liveConnection = useRainGaugeConnection({
    apBaseUrl,
    appendReading: local.appendReading,
    dataSource,
    resetReadings: local.resetReadings,
    session: storedSession,
    setError,
    setSession,
  })

  const simulated = useSimulatedRain(dataSource === "simulated", live)
  const simulatedPageCount = Math.max(
    1,
    Math.ceil((simulated?.readings.length ?? 0) / PAGE_SIZE)
  )
  const simulatedPagedReadings = React.useMemo(() => {
    if (!simulated) return []
    const start = (simulatedPage - 1) * PAGE_SIZE
    return simulated.readings.slice(start, start + PAGE_SIZE)
  }, [simulated, simulatedPage])

  const session = simulated?.session ?? storedSession
  const readings = simulated?.readings ?? local.readings
  const rawPackets = simulated?.rawPackets ?? local.rawPackets
  const page = simulated ? simulatedPage : local.page
  const setPage = simulated ? setSimulatedPage : local.setPage
  const pagedReadings = simulated ? simulatedPagedReadings : local.pagedReadings
  const totalPages = simulated ? simulatedPageCount : local.totalPages
  const loadingInitial = simulated ? false : local.loadingInitial
  const status = simulated?.status ?? liveConnection.status
  const connectionState = simulated
    ? simulated.paused
      ? "idle"
      : "connected"
    : liveConnection.connectionState
  const loadingStatus = simulated ? false : liveConnection.loadingStatus
  const loadingReset = simulated ? false : liveConnection.loadingReset
  const refreshStatus = liveConnection.refreshStatus

  const {
    connect: connectLive,
    disconnect: disconnectLive,
    resetGauge: resetLive,
  } = liveConnection

  const connect = React.useCallback(async () => {
    if (dataSource === "simulated") {
      setSimulatedRainPaused(false)
      return
    }
    await connectLive()
  }, [connectLive, dataSource])
  const disconnect = React.useCallback(() => {
    if (dataSource === "simulated") {
      setSimulatedRainPaused(true)
      return
    }
    disconnectLive()
  }, [dataSource, disconnectLive])
  const resetGauge = React.useCallback(async () => {
    if (dataSource === "simulated") {
      resetSimulatedRain()
      setSimulatedPage(1)
      return
    }
    await resetLive()
  }, [dataSource, resetLive])

  const setDataSource = React.useCallback(
    (source: RainDataSource) => {
      disconnectLive()
      setError(null)
      setDataSourceState(source)
    },
    [disconnectLive, setDataSourceState]
  )

  const {
    addCalibrationTrial,
    calibration,
    calibrationSummary,
    calibrationTrials,
    importCalibrationCsv,
    loadingCalibration,
    removeCalibrationTrial,
    resetCalibration,
  } = useRainGaugeCalibration({ setError })

  const summary = React.useMemo(
    () => buildRainGaugeSummary(readings, chartRange),
    [chartRange, readings]
  )

  const { loadingSync, queuedSessions, retryQueuedSync, syncState, syncToSupabase } =
    useRainGaugeSync({
      readings,
      session,
      simulated: dataSource === "simulated",
    })

  const {
    exportAllReadings,
    exportAnalytics,
    exportCalibration,
    exportCurrentReadings,
  } = useRainGaugeExport({
    calibrationSummary,
    calibrationTrials,
    page,
    pagedReadings,
    readings,
    session,
    summary,
  })

  const loading = React.useMemo(
    () => ({
      initial: loadingInitial,
      status: loadingStatus,
      reset: loadingReset,
      sync: loadingSync,
      calibration: loadingCalibration,
    }),
    [loadingCalibration, loadingInitial, loadingReset, loadingStatus, loadingSync]
  )

  return {
    addCalibrationTrial,
    apBaseUrl,
    calibration,
    calibrationSummary,
    calibrationTrials,
    chartRange,
    connect,
    connectionState,
    dataSource,
    disconnect,
    error,
    exportAllReadings,
    exportAnalytics,
    exportCalibration,
    exportCurrentReadings,
    importCalibrationCsv,
    loading,
    page,
    pagedReadings,
    rawPackets,
    queuedSessions,
    readings,
    refreshStatus,
    removeCalibrationTrial,
    resetCalibration,
    resetGauge,
    retryQueuedSync,
    session,
    setApBaseUrl,
    setChartRange,
    setDataSource,
    setPage,
    status,
    summary,
    syncState,
    syncToSupabase,
    totalPages,
  }
}

export type RainGaugeDashboardState = ReturnType<typeof useRainGaugeDashboard>
