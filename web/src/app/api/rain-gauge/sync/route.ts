import { NextResponse } from "next/server"

import {
  rainGaugeSyncSchema,
  toSupabaseRainGaugeReading,
  toSupabaseRainGaugeSession,
} from "@/lib/rain-gauge/sync"
import {
  createSupabaseServerClient,
  supabaseNotConfiguredResponse,
} from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient(request)
  if (!supabase) {
    return supabaseNotConfiguredResponse()
  }

  const parsed = rainGaugeSyncSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Invalid rain gauge payload.",
      },
      { status: 400 }
    )
  }

  const payload = parsed.data
  const session = toSupabaseRainGaugeSession(payload.session)
  const readings = payload.readings.map(toSupabaseRainGaugeReading)

  const sessionResult = await supabase
    .from("rain_gauge_sessions")
    .upsert(session, { onConflict: "id" })

  if (sessionResult.error) {
    return NextResponse.json(
      {
        ok: false,
        code: "supabase_error",
        message: sessionResult.error.message,
        synced: 0,
        failed: readings.length,
      },
      { status: 502 }
    )
  }

  if (readings.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, failed: 0 })
  }

  const readingsResult = await supabase
    .from("rain_gauge_readings")
    .upsert(readings, { onConflict: "id" })

  if (readingsResult.error) {
    return NextResponse.json(
      {
        ok: false,
        code: "supabase_error",
        message: readingsResult.error.message,
        synced: 0,
        failed: readings.length,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    synced: readings.length,
    failed: 0,
  })
}
