import { NextResponse } from "next/server"

import { normalizeSupabaseRows } from "../../../lib/experiment/parser"
import { createSupabaseServerClient, supabaseNotConfiguredResponse } from "../../../lib/supabase/server"

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient(request)

  if (!supabase) {
    return supabaseNotConfiguredResponse()
  }

  const url = new URL(request.url)
  const pageValue = Number(url.searchParams.get("page") ?? 1)
  const pageSizeValue = Number(
    url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? 100
  )
  const page = Number.isFinite(pageValue)
    ? Math.max(Math.trunc(pageValue), 1)
    : 1
  const pageSize = Number.isFinite(pageSizeValue)
    ? Math.min(Math.max(Math.trunc(pageSizeValue), 1), 250)
    : 100
  const sessionId = url.searchParams.get("sessionId") ?? "supabase-temperature"
  const channel = url.searchParams.get("channel")
  const status = url.searchParams.get("status")
  const offset = (page - 1) * pageSize

  const { count, data, error } = await supabase
    .from("temperature_readings")
    .select("id,created_at,payload", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "supabase_error",
        message: error.message,
      },
      { status: 502 }
    )
  }

  const rows = (data ?? []).slice().reverse()
  const readings = normalizeSupabaseRows(rows, sessionId).filter((reading) => {
    if (channel && channel !== "all" && reading.channelId !== channel) {
      return false
    }
    if (status && status !== "all" && reading.status !== status) {
      return false
    }
    return true
  })

  return NextResponse.json({
    ok: true,
    page,
    pageSize,
    rowCount: rows.length,
    totalRows: count ?? rows.length,
    readings,
  })
}
