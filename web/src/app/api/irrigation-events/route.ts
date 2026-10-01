import { NextResponse } from "next/server"

import {
  cutoffAtForWatering,
  createIrrigationEventSchema,
  IRRIGATION_EVENT_SELECT,
  isBeforeWateringCutoff,
  normalizeIrrigationEventRow,
  toSupabaseIrrigationPayload,
  type SupabaseIrrigationEventRow,
} from "@/lib/experiment/irrigation"
import { createSupabaseServerClient, supabaseNotConfiguredResponse } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient(request)

  if (!supabase) {
    return supabaseNotConfiguredResponse()
  }

  const url = new URL(request.url)
  const bagId = url.searchParams.get("bagId") ?? "bag-1"
  const includeArchived = url.searchParams.get("includeArchived") === "true"

  let query = supabase
    .from("irrigation_events")
    .select(IRRIGATION_EVENT_SELECT)
    .eq("bag_id", bagId)
    .order("watered_at", { ascending: false })

  if (!includeArchived) {
    query = query.is("archived_at", null)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { ok: false, code: "supabase_error", message: error.message },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    events: ((data ?? []) as SupabaseIrrigationEventRow[]).map(
      normalizeIrrigationEventRow
    ),
  })
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient(request)

  if (!supabase) {
    return supabaseNotConfiguredResponse()
  }

  const raw = await request.json().catch(() => null)
  const parsed = createIrrigationEventSchema.safeParse(raw)

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Invalid event.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    )
  }

  if (!isBeforeWateringCutoff(parsed.data.wateredAt)) {
    return NextResponse.json(
      {
        ok: false,
        code: "after_cutoff",
        message: "Watering must be logged before 6 PM Manila time.",
      },
      { status: 400 }
    )
  }

  const open = await supabase
    .from("irrigation_events")
    .select("id")
    .eq("bag_id", parsed.data.bagId)
    .is("archived_at", null)
    .gt("cutoff_at", new Date().toISOString())
    .limit(1)

  if (open.error) {
    return NextResponse.json(
      { ok: false, code: "supabase_error", message: open.error.message },
      { status: 502 }
    )
  }

  if ((open.data ?? []).length > 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "open_event_exists",
        message: "Finish the current 10-minute weigh schedule before starting another watering.",
      },
      { status: 409 }
    )
  }

  const input = {
    ...parsed.data,
    cutoffAt: cutoffAtForWatering(parsed.data.wateredAt),
  }

  const { data, error } = await supabase
    .from("irrigation_events")
    .insert(toSupabaseIrrigationPayload(input))
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
