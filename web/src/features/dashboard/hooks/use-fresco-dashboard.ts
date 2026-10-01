"use client"

import * as React from "react"
import { toast } from "sonner"

import { usableWaterTempC } from "@/lib/experiment/analytics"
import {
  DEFAULT_BAG_ID,
  DEFAULT_CHART_RANGE,
} from "@/lib/experiment/irrigation"
import { createSessionId } from "@/lib/experiment/storage"
import type { ChartRange } from "@/lib/experiment/types"
import type {
  ReadingsResponse,
  View,
} from "@/features/dashboard/lib/dashboard-types"
import {
  useTemperatureDataSource,
  type TemperatureDataSource,
} from "@/features/telemetry/data-source"
import {
  seedSimulatedBag,
  simulatedTemperatureStore,
} from "@/features/telemetry/temperature-stores"
import { simulatedRow } from "@/lib/simulation/temperature"

import { fetchJson } from "./dashboard-api"
import { INITIAL_SESSION_ID } from "./dashboard-constants"
import { useDashboardCloudData } from "./use-dashboard-cloud-data"
import { useIrrigationActions } from "./use-irrigation-actions"
import { useReadingQuery } from "./use-reading-query"
import { useWateringStatus } from "./use-watering-status"
import { useWeekAnalysis } from "./use-week-analysis"

export function useFrescoDashboard({ live = true }: { live?: boolean } = {}) {
  const [sessionId, setSessionId] = React.useState(INITIAL_SESSION_ID)
  const [activeView, setActiveView] = React.useState<View>("dashboard")
  const [bagId, setBagIdState] = React.useState<string>(DEFAULT_BAG_ID)
  const [chartRange, setChartRange] =
    React.useState<ChartRange>(DEFAULT_CHART_RANGE)
  const [includeArchived, setIncludeArchived] = React.useState(false)
  const [dataSource, setDataSourceState] = useTemperatureDataSource()
  const { readingQuery, resetReadingQuery, updateReadingQuery } =
    useReadingQuery()
  const {
    cloudState,
    eventsError,
    health,
    irrigationEvents,
    latest,
    localRows,
    loadingState,
    mutateCloudData,
    pagination,
    readings,
    readingsError,
    spread,
    summary,
    summaryError,
    tempData,
    weekLoading,
    weekSeries,
  } = useDashboardCloudData({
    bagId,
    chartRange,
    dataSource,
    includeArchived,
    live,
    needWeek: activeView === "analytics",
    readingQuery,
    sessionId,
  })
  const {
    resetWeekAnalysis,
    runWeekAnalysis,
    setWeekRange,
    weekAnalysis,
    weekAnalysisState,
    weekRange,
  } = useWeekAnalysis({ bagId, dataSource, localRows })
  const wateringStatus = useWateringStatus(irrigationEvents)
  const {
    archiveIrrigationEvent,
    createIrrigationEvent,
    updateIrrigationEvent,
  } = useIrrigationActions({ bagId, dataSource, mutateCloudData })

  // Latest irrigation-water probe (GPIO 14). Weigh-context only: sourced here to
  // prefill the Log Watering dialog, never rendered as a grow-bag channel.
  const latestWaterTempC = usableWaterTempC(latest.get("water"))

  const refreshWaterTemp = React.useCallback(async (): Promise<
    number | null
  > => {
    if (dataSource !== "cloud") {
      return usableWaterTempC(latest.get("water"))
    }

    try {
      const query = new URLSearchParams({
        channel: "water",
        status: "ok",
        page: "1",
        pageSize: "1",
        sessionId,
      }).toString()
      const payload = await fetchJson<ReadingsResponse>(`/api/readings?${query}`)
      const readings = payload.readings ?? []
      return usableWaterTempC(readings[readings.length - 1])
    } catch {
      return null
    }
  }, [dataSource, latest, sessionId])

  const setDataSource = React.useCallback(
    (source: TemperatureDataSource) => {
      setDataSourceState(source)
      resetReadingQuery()
      resetWeekAnalysis()
    },
    [resetReadingQuery, resetWeekAnalysis, setDataSourceState]
  )

  const setBagId = React.useCallback((value: string) => {
    seedSimulatedBag(value)
    setBagIdState(value)
  }, [])

  const refreshFromSupabase = React.useCallback(async () => {
    if (dataSource === "simulated") {
      // Force an immediate simulated upload instead of waiting for the ticker.
      const now = Date.now()
      simulatedTemperatureStore.setState((current) => ({
        ...current,
        rows: [...current.rows, simulatedRow(now)],
        updatedAt: now,
      }))
      toast.success("Simulated reading received")
      return
    }
    if (dataSource === "device") {
      toast.message("USB readings stream in automatically while connected")
      return
    }
    await mutateCloudData()
    toast.success("Supabase data refreshed")
  }, [dataSource, mutateCloudData])

  const loadSample = React.useCallback(() => {
    setDataSource("simulated")
    toast.success("Switched to simulated data")
  }, [setDataSource])

  const resetSession = React.useCallback(() => {
    setSessionId(createSessionId())
    resetReadingQuery()
    resetWeekAnalysis()
    toast.message("Started a fresh dashboard session")
  }, [resetReadingQuery, resetWeekAnalysis])

  return {
    activeView,
    archiveIrrigationEvent,
    bagId,
    chartRange,
    cloudState,
    createIrrigationEvent,
    dataSource,
    eventsError,
    health,
    includeArchived,
    irrigationEvents,
    latest,
    latestWaterTempC,
    loadingState,
    loadSample,
    localRows,
    pagination,
    refreshWaterTemp,
    readingQuery,
    readings,
    readingsError,
    refreshFromSupabase,
    resetSession,
    runWeekAnalysis,
    setActiveView,
    setBagId,
    setChartRange,
    setDataSource,
    setIncludeArchived,
    setWeekRange,
    sessionId,
    spread,
    summary,
    summaryError,
    tempData,
    updateIrrigationEvent,
    updateReadingQuery,
    wateringStatus,
    weekAnalysis,
    weekAnalysisState,
    weekLoading,
    weekRange,
    weekSeries,
  }
}
