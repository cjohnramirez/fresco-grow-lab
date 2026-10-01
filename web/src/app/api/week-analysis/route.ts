import { NextResponse } from "next/server"
import { z } from "zod"

import { DEFAULT_BAG_ID } from "@/lib/experiment/irrigation"
import {
  fetchIrrigationEventsInRange,
  fetchTemperatureRowsInRange,
} from "@/lib/experiment/supabase-fetch"
import { buildExperimentSummary, toWeekAnalysis } from "@/lib/experiment/summary"
import { createSupabaseServerClient, supabaseNotConfiguredResponse } from "@/lib/supabase/server"

const MAX_WEEK_MS = 7 * 24 * 60 * 60_000

const weekAnalysisSchema = z.object({
  bagId: z.string().trim().min(1).default(DEFAULT_BAG_ID),
  from: z.string().datetime(),
  to: z.string().datetime(),
})

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient(request)

  if (!supabase) {
    return supabaseNotConfiguredResponse()
  }

  const raw = await request.json().catch(() => null)
  const parsed = weekAnalysisSchema.safeParse(raw)

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Invalid week range.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    )
  }

  const from = new Date(parsed.data.from).toISOString()
  const to = new Date(parsed.data.to).toISOString()
  const rangeMs = Date.parse(to) - Date.parse(from)

  if (rangeMs <= 0 || rangeMs > MAX_WEEK_MS) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_range",
        message: "Choose a range greater than 0 days and no longer than 7 days.",
      },
      { status: 400 }
    )
  }

  try {
    const temperaturePromise = fetchTemperatureRowsInRange({
      from,
      sessionId: "week-analysis",
      supabase,
      to,
    })
    const eventsPromise = fetchIrrigationEventsInRange({
      bagId: parsed.data.bagId,
      from,
      supabase,
      to,
    })
    const [temperature, events] = await Promise.all([
      temperaturePromise,
      eventsPromise,
    ])
    const summary = buildExperimentSummary({
      bucket: "10m",
      events,
      readings: temperature.readings,
      rowCount: temperature.rows.length,
    })

    return NextResponse.json(toWeekAnalysis(summary, from, to))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Week analysis failed."
    return NextResponse.json(
      { ok: false, code: "supabase_error", message },
      { status: 502 }
    )
  }
}
