"use client"

import * as React from "react"
import { toast } from "sonner"

import type {
  CloudState,
  WeekAnalysisResponse,
} from "@/features/dashboard/lib/dashboard-types"
import type { TemperatureDataSource } from "@/features/telemetry/data-source"
import {
  deviceTemperatureStore,
  simulatedTemperatureStore,
} from "@/features/telemetry/temperature-stores"
import { manilaLocalInputToIso } from "@/lib/experiment/irrigation"
import type {
  SupabaseTemperatureRow,
  WeekAnalysisResult,
} from "@/lib/experiment/types"
import { localWeekAnalysis } from "@/lib/telemetry/local-temperature"

import { INITIAL_WEEK_ANALYSIS_STATE } from "./dashboard-constants"
import { initialWeekRange, sendJson } from "./dashboard-api"

export function useWeekAnalysis({
  bagId,
  dataSource,
  localRows,
}: {
  bagId: string
  dataSource: TemperatureDataSource
  localRows: SupabaseTemperatureRow[]
}) {
  const [weekRange, setWeekRange] = React.useState(initialWeekRange)
  const [weekAnalysis, setWeekAnalysis] =
    React.useState<WeekAnalysisResult | null>(null)
  const [weekAnalysisState, setWeekAnalysisState] = React.useState<CloudState>(
    INITIAL_WEEK_ANALYSIS_STATE
  )

  const resetWeekAnalysis = React.useCallback(() => {
    setWeekAnalysis(null)
    setWeekAnalysisState(INITIAL_WEEK_ANALYSIS_STATE)
  }, [])

  const runWeekAnalysis = React.useCallback(async () => {
    setWeekAnalysisState({
      status: "loading",
      message: "Parsing full week",
      rowCount: 0,
      latestFetchAt: null,
    })

    try {
      const from = manilaLocalInputToIso(weekRange.from)
      const to = manilaLocalInputToIso(weekRange.to)
      const payload: WeekAnalysisResponse =
        dataSource === "cloud"
          ? await sendJson<WeekAnalysisResponse>("/api/week-analysis", {
              method: "POST",
              body: JSON.stringify({ bagId, from, to }),
            })
          : localWeekAnalysis({
              bagId,
              events: (dataSource === "simulated"
                ? simulatedTemperatureStore
                : deviceTemperatureStore
              ).getSnapshot().events,
              from,
              rows: localRows,
              sessionId: `${dataSource}-week`,
              to,
            })

      if (!payload.ok) {
        throw new Error(payload.message)
      }

      setWeekAnalysis(payload)
      setWeekAnalysisState({
        status: "ready",
        message: "Full week parsed",
        rowCount: payload.rowCount,
        latestFetchAt: payload.generatedAt,
      })
      toast.success("Full week parsed")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Full week parse failed."
      setWeekAnalysisState({
        status: "error",
        message,
        rowCount: 0,
        latestFetchAt: null,
      })
      toast.error(message)
    }
  }, [bagId, dataSource, localRows, weekRange])

  return {
    resetWeekAnalysis,
    runWeekAnalysis,
    setWeekRange,
    weekAnalysis,
    weekAnalysisState,
    weekRange,
  }
}
