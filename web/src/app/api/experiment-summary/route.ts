import { NextResponse } from "next/server"

import {
  BUCKET_SIZES,
  DEFAULT_BAG_ID,
  DEFAULT_CHART_RANGE,
  bucketForChartRange,
  durationForChartRange,
  isChartRange,
} from "@/lib/experiment/irrigation"
import {
  fetchIrrigationEventsInRange,
  fetchTemperatureRowsInRange,
} from "@/lib/experiment/supabase-fetch"
import { buildExperimentSummary } from "@/lib/experiment/summary"
import type { BucketSize, ChartRange } from "@/lib/experiment/types"
import { createSupabaseServerClient, supabaseNotConfiguredResponse } from "@/lib/supabase/server"

function chartRangeFromUrl(url: URL): ChartRange {
  const range = url.searchParams.get("range")

  return isChartRange(range) ? range : DEFAULT_CHART_RANGE
}

function rangeFromUrl(url: URL, chartRange: ChartRange) {
  const to = url.searchParams.get("to") ?? new Date().toISOString()
  const from =
    url.searchParams.get("from") ??
    new Date(Date.parse(to) - durationForChartRange(chartRange)).toISOString()

  return { from, to }
}

function bucketFromUrl(url: URL, chartRange: ChartRange): BucketSize {
  const bucket = url.searchParams.get("bucket")
  return BUCKET_SIZES.includes(bucket as BucketSize)
    ? (bucket as BucketSize)
    : bucketForChartRange(chartRange)
}

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient(request)

  if (!supabase) {
    return supabaseNotConfiguredResponse()
  }

  const url = new URL(request.url)
  const bagId = url.searchParams.get("bagId") ?? DEFAULT_BAG_ID
  const chartRange = chartRangeFromUrl(url)
  const bucket = bucketFromUrl(url, chartRange)
  const { from, to } = rangeFromUrl(url, chartRange)

  try {
    const temperaturePromise = fetchTemperatureRowsInRange({
      from,
      sessionId: "supabase-temperature",
      supabase,
      to,
    })
    const eventsPromise = fetchIrrigationEventsInRange({
      bagId,
      from,
      supabase,
      to,
    })
    const [temperature, events] = await Promise.all([
      temperaturePromise,
      eventsPromise,
    ])

    return NextResponse.json(
      buildExperimentSummary({
        bucket,
        events,
        readings: temperature.readings,
        rowCount: temperature.rows.length,
      })
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Experiment summary failed."
    return NextResponse.json(
      { ok: false, code: "supabase_error", message },
      { status: 502 }
    )
  }
}
