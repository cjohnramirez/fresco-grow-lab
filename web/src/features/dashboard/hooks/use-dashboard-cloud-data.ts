"use client"

import * as React from "react"
import useSWR from "swr"

import type {
  CloudState,
  DashboardLoadingState,
  IrrigationEventsResponse,
  ReadingQuery,
  ReadingsResponse,
  SummaryResponse,
} from "@/features/dashboard/lib/dashboard-types"
import type { TemperatureDataSource } from "@/features/telemetry/data-source"
import {
  deviceTemperatureStore,
  simulatedTemperatureStore,
  type LocalTemperatureState,
} from "@/features/telemetry/temperature-stores"
import {
  chartSeries,
  latestByChannel,
  sensorHealth,
  temperatureSpread,
} from "@/lib/experiment/analytics"
import type { ChartRange } from "@/lib/experiment/types"
import {
  localSummary,
  pageLocalReadings,
} from "@/lib/telemetry/local-temperature"

import {
  EMPTY_EVENTS,
  EMPTY_READINGS,
} from "./dashboard-constants"
import {
  buildEventsKey,
  buildReadingsKey,
  buildSummaryKey,
  fetchJson,
  nextCloudState,
} from "./dashboard-api"

const EMPTY_LOCAL: LocalTemperatureState = {
  rows: [],
  events: [],
  seededBags: [],
  updatedAt: 0,
}
const noopSubscribe = () => () => {}
const EMPTY_SERIES: Array<Record<string, number | string | null>> = []

// Subscribes to the simulated or USB store only while that source is active,
// so the simulator's timer stops when the visitor switches to Supabase.
function useLocalTemperature(dataSource: TemperatureDataSource, live: boolean) {
  const store = !live
    ? null
    : dataSource === "simulated"
      ? simulatedTemperatureStore
      : dataSource === "device"
        ? deviceTemperatureStore
        : null

  return React.useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? (() => EMPTY_LOCAL),
    () => EMPTY_LOCAL
  )
}

function localCloudState(
  dataSource: TemperatureDataSource,
  local: LocalTemperatureState
): CloudState {
  const rowCount = local.rows.length
  return {
    status: rowCount > 0 || dataSource === "simulated" ? "ready" : "idle",
    message:
      dataSource === "simulated"
        ? `${rowCount} simulated rows (a new row every 10 s)`
        : rowCount > 0
          ? `${rowCount} rows streamed over USB`
          : "Waiting for a USB device. Use Connect Hardware to start streaming.",
    rowCount,
    latestFetchAt: local.updatedAt ? new Date(local.updatedAt).toISOString() : null,
  }
}

export function useDashboardCloudData({
  bagId,
  chartRange,
  dataSource,
  includeArchived,
  live,
  needWeek,
  readingQuery,
  sessionId,
}: {
  bagId: string
  chartRange: ChartRange
  dataSource: TemperatureDataSource
  includeArchived: boolean
  live: boolean
  needWeek: boolean
  readingQuery: ReadingQuery
  sessionId: string
}) {
  const localMode = dataSource !== "cloud"
  const readingsKey = buildReadingsKey({ readingQuery, localMode, sessionId })
  const eventsKey = buildEventsKey({ bagId, includeArchived, localMode })
  const summaryKey = buildSummaryKey({ bagId, chartRange, localMode })

  const readingsSWR = useSWR<ReadingsResponse>(readingsKey, fetchJson, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })
  const eventsSWR = useSWR<IrrigationEventsResponse>(eventsKey, fetchJson, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })
  const summarySWR = useSWR<SummaryResponse>(summaryKey, fetchJson, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })
  // The Thermal Patterns cards always look at the last 7 days, independent of
  // the chart range tabs. Reuse the main summary when it already covers 1w.
  const weekSummaryKey =
    chartRange === "1w" || !needWeek
      ? null
      : buildSummaryKey({ bagId, chartRange: "1w", localMode })
  const weekSummarySWR = useSWR<SummaryResponse>(weekSummaryKey, fetchJson, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  // While hidden, keep showing the last snapshot instead of dropping to empty.
  const liveLocal = useLocalTemperature(dataSource, live)
  const [frozenLocal, setFrozenLocal] = React.useState(liveLocal)
  if (live && frozenLocal !== liveLocal) {
    setFrozenLocal(liveLocal)
  }
  const local = live ? liveLocal : frozenLocal
  const localPage = React.useMemo(
    () => (localMode ? pageLocalReadings(local.rows, readingQuery, sessionId) : null),
    [local.rows, localMode, readingQuery, sessionId]
  )
  const localEvents = React.useMemo(
    () =>
      local.events
        .filter(
          (event) =>
            event.bagId === bagId && (includeArchived || event.archivedAt === null)
        )
        .toSorted((a, b) => Date.parse(b.wateredAt) - Date.parse(a.wateredAt)),
    [bagId, includeArchived, local.events]
  )
  const localSummaryResult = React.useMemo(
    () =>
      localMode
        ? localSummary({
            bagId,
            chartRange,
            events: local.events,
            // Stores stamp updatedAt on every append; 0 means no rows yet.
            now: local.updatedAt,
            rows: local.rows,
            sessionId,
          })
        : null,
    [bagId, chartRange, local.events, local.rows, local.updatedAt, localMode, sessionId]
  )

  // The 7-day view changes little between 10-second ticks; refresh it once a
  // minute to keep the Analytics view responsive on live data.
  const weekMinute = Math.floor((local.updatedAt || 0) / 60_000)
  const [weekInput, setWeekInput] = React.useState<{
    minute: number
    rows: LocalTemperatureState["rows"]
    events: LocalTemperatureState["events"]
    updatedAt: number
  } | null>(null)
  if (
    localMode &&
    needWeek &&
    chartRange !== "1w" &&
    (weekInput === null ||
      weekInput.minute !== weekMinute ||
      weekInput.events !== local.events ||
      weekInput.rows.length > local.rows.length ||
      weekInput.rows[0] !== local.rows[0])
  ) {
    setWeekInput({
      minute: weekMinute,
      rows: local.rows,
      events: local.events,
      updatedAt: local.updatedAt,
    })
  }
  const localWeekSummary = React.useMemo(
    () =>
      localMode && needWeek && chartRange !== "1w" && weekInput
        ? localSummary({
            bagId,
            chartRange: "1w",
            events: weekInput.events,
            now: weekInput.updatedAt,
            rows: weekInput.rows,
            sessionId,
          })
        : null,
    [bagId, chartRange, localMode, needWeek, sessionId, weekInput]
  )

  const readings = localMode
    ? localPage?.readings ?? EMPTY_READINGS
    : readingsSWR.data?.readings ?? EMPTY_READINGS
  const irrigationEvents = localMode
    ? localEvents
    : eventsSWR.data?.events ?? EMPTY_EVENTS
  const summary = localMode
    ? localSummaryResult
    : summarySWR.data?.ok
      ? summarySWR.data
      : null
  const weekSummary =
    chartRange === "1w"
      ? summary
      : localMode
        ? localWeekSummary
        : weekSummarySWR.data?.ok
          ? weekSummarySWR.data
          : null
  const cloudState = localMode
    ? localCloudState(dataSource, local)
    : nextCloudState({
        data: readingsSWR.data,
        error: readingsSWR.error,
        isLoading: readingsSWR.isLoading,
      })
  const loadingState = React.useMemo<DashboardLoadingState>(
    () => ({
      cloudRefreshing:
        !localMode &&
        (readingsSWR.isValidating ||
          eventsSWR.isValidating ||
          summarySWR.isValidating),
      eventsLoading: !localMode && eventsSWR.isLoading,
      eventsRefreshing:
        !localMode && eventsSWR.isValidating && !eventsSWR.isLoading,
      readingsLoading: !localMode && readingsSWR.isLoading,
      readingsRefreshing:
        !localMode && readingsSWR.isValidating && !readingsSWR.isLoading,
      summaryLoading: !localMode && summarySWR.isLoading,
      summaryRefreshing:
        !localMode && summarySWR.isValidating && !summarySWR.isLoading,
    }),
    [
      eventsSWR.isLoading,
      eventsSWR.isValidating,
      localMode,
      readingsSWR.isLoading,
      readingsSWR.isValidating,
      summarySWR.isLoading,
      summarySWR.isValidating,
    ]
  )
  const latest = React.useMemo(() => latestByChannel(readings), [readings])
  const health = React.useMemo(() => sensorHealth(readings), [readings])
  const spread = React.useMemo(() => temperatureSpread(readings), [readings])
  const tempData = summary?.temperatureSeries ?? chartSeries(readings)
  const pagination = React.useMemo(
    () => ({
      page: readingQuery.page,
      pageSize: readingQuery.pageSize,
      totalRows: localMode
        ? local.rows.length
        : readingsSWR.data?.totalRows ?? readingsSWR.data?.rowCount ?? 0,
    }),
    [
      local.rows.length,
      localMode,
      readingQuery.page,
      readingQuery.pageSize,
      readingsSWR.data?.rowCount,
      readingsSWR.data?.totalRows,
    ]
  )
  const mutateReadings = readingsSWR.mutate
  const mutateEvents = eventsSWR.mutate
  const mutateSummary = summarySWR.mutate
  const mutateCloudData = React.useCallback(async () => {
    await Promise.all([mutateReadings(), mutateEvents(), mutateSummary()])
  }, [mutateEvents, mutateReadings, mutateSummary])

  return {
    cloudState,
    eventsError: localMode ? undefined : eventsSWR.error,
    health,
    irrigationEvents,
    latest,
    localRows: local.rows,
    loadingState,
    mutateCloudData,
    pagination,
    readings,
    readingsError: localMode ? undefined : readingsSWR.error,
    spread,
    summary,
    summaryError: localMode ? undefined : summarySWR.error,
    tempData,
    weekLoading: !localMode && chartRange !== "1w" && weekSummarySWR.isLoading,
    weekSeries: weekSummary?.temperatureSeries ?? EMPTY_SERIES,
  }
}
