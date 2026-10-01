import { NextResponse } from "next/server"

import {
  cutoffAtForWatering,
  IRRIGATION_EVENT_SELECT,
  isBeforeWateringCutoff,
  mergeWeightLog,
  normalizeIrrigationEventRow,
  toSupabaseIrrigationPayload,
  updateIrrigationEventSchema,
  type SupabaseIrrigationEventRow,
} from "@/lib/experiment/irrigation"
import { createSupabaseServerClient, supabaseNotConfiguredResponse } from "@/lib/supabase/server"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const supabase = createSupabaseServerClient(request)

  if (!supabase) {
    return supabaseNotConfiguredResponse()
  }

  const { id } = await context.params
  const raw = await request.json().catch(() => null)
  const parsed = updateIrrigationEventSchema.safeParse(raw)

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Invalid event update.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    )
  }

  const existing = await supabase
    .from("irrigation_events")
    .select(IRRIGATION_EVENT_SELECT)
    .eq("id", id)
    .single()

  if (existing.error) {
    return NextResponse.json(
      { ok: false, code: "supabase_error", message: existing.error.message },
      { status: 502 }
    )
  }

  const event = normalizeIrrigationEventRow(
    existing.data as SupabaseIrrigationEventRow
  )
  const nextInput = { ...parsed.data }

  if (nextInput.wateredAt !== undefined) {
    if (!isBeforeWateringCutoff(nextInput.wateredAt)) {
      return NextResponse.json(
        {
          ok: false,
          code: "after_cutoff",
          message: "Watering must be logged before 6 PM Manila time.",
        },
        { status: 400 }
      )
    }

    nextInput.cutoffAt = cutoffAtForWatering(nextInput.wateredAt)
  }

  if (nextInput.weightLog) {
    const scheduleEvent = {
      ...event,
      wateredAt: nextInput.wateredAt ?? event.wateredAt,
      cutoffAt: nextInput.cutoffAt ?? event.cutoffAt,
      weightLogs: nextInput.weightLogs ?? event.weightLogs,
    }

    try {
      nextInput.weightLogs = mergeWeightLog(scheduleEvent, nextInput.weightLog)
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          code: "invalid_weight_slot",
          message:
            error instanceof Error ? error.message : "Invalid weight slot.",
        },
        { status: 400 }
      )
    }
  }

  const { data, error } = await supabase
    .from("irrigation_events")
    .update(toSupabaseIrrigationPayload(nextInput))
    .eq("id", id)
    .select(IRRIGATION_EVENT_SELECT)
    .single()

  if (error) {
    return NextResponse.json(
      { ok: false, code: "supabase_error", message: error.message },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    event: normalizeIrrigationEventRow(data as SupabaseIrrigationEventRow),
  })
}

export async function DELETE(request: Request, context: RouteContext) {
  const supabase = createSupabaseServerClient(request)

  if (!supabase) {
    return supabaseNotConfiguredResponse()
  }

  const { id } = await context.params
  const { data, error } = await supabase
    .from("irrigation_events")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select(IRRIGATION_EVENT_SELECT)
    .single()

  if (error) {
    return NextResponse.json(
      { ok: false, code: "supabase_error", message: error.message },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    event: normalizeIrrigationEventRow(data as SupabaseIrrigationEventRow),
  })
}
