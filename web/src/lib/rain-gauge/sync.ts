import { z } from "zod"

import { rainGaugeReadingSchema } from "./parser"

export const rainGaugeSyncSchema = z.object({
  session: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    source: z.enum(["ap", "sample", "usb"]),
    startedAt: z.string().datetime(),
    apBaseUrl: z.string().url(),
    mlPerTip: z.number().finite().positive().nullable(),
    catchmentAreaCm2: z.number().finite().positive().nullable(),
  }),
  readings: z
    .array(
      rainGaugeReadingSchema.extend({
        id: z.string().min(1),
        sessionId: z.string().min(1),
        receivedAt: z.string().datetime(),
        source: z.enum(["ap", "import", "sample", "usb"]),
        raw: z.string(),
      })
    )
    .max(5000),
})

export type RainGaugeSyncPayload = z.infer<typeof rainGaugeSyncSchema>

export function toSupabaseRainGaugeSession(session: RainGaugeSyncPayload["session"]) {
  return {
    id: session.id,
    label: session.label,
    source: session.source,
    started_at: session.startedAt,
    ap_base_url: session.apBaseUrl,
    ml_per_tip: session.mlPerTip,
    catchment_area_cm2: session.catchmentAreaCm2,
  }
}

export function toSupabaseRainGaugeReading(
  reading: RainGaugeSyncPayload["readings"][number]
) {
  return {
    id: reading.id,
    session_id: reading.sessionId,
    received_at: reading.receivedAt,
    source: reading.source,
    seq: reading.seq,
    device_ms: reading.ms,
    edges: reading.edges,
    tips: reading.tips,
    last_edge_ms: reading.lastEdgeMs,
    rainfall_ml: reading.rainfallMl,
    rainfall_mm: reading.rainfallMm,
    rate_ml_per_min: reading.rateMlPerMin,
    rate_mm_per_hr: reading.rateMmPerHr,
    payload: JSON.parse(reading.raw),
  }
}

// The sync route accepts at most 5000 readings per request; stay well under it.
export const SYNC_CHUNK_SIZE = 1000

// Splits a session's readings into request-sized chunks. An empty session
// still yields one empty chunk so the session row itself gets upserted.
export function chunkReadings<T>(readings: T[], size = SYNC_CHUNK_SIZE) {
  const chunks: T[][] = []
  for (let index = 0; index < readings.length; index += size) {
    chunks.push(readings.slice(index, index + size))
  }
  return chunks.length > 0 ? chunks : [[]]
}
