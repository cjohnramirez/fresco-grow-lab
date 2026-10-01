import { z } from "zod"

import { parseFirmwareLine } from "@/lib/experiment/parser"
import type { FirmwarePacket } from "@/lib/experiment/types"
import { rainGaugeReadingSchema } from "@/lib/rain-gauge/parser"

// Kit firmware (`-DFRESCO_KIT=1` builds) speaks newline-delimited JSON over USB
// serial at 115200 baud:
//   board -> browser: one telemetry packet per line, plus `{"type":"info"}` and
//                     `{"type":"config_ack"}` replies; anything else is a log.
//   browser -> board: `{"cmd":"info"}` and `{"cmd":"config", ...}` lines.

export const KIT_BAUD_RATE = 115200

export type SerialLine =
  | { kind: "temperature"; packet: FirmwarePacket; raw: string }
  | { kind: "rain"; raw: string }
  | { kind: "info"; info: KitInfo; raw: string }
  | { kind: "config_ack"; ok: boolean; message: string; raw: string }
  | { kind: "log"; raw: string }

export const kitInfoSchema = z.object({
  type: z.literal("info"),
  firmware: z.string(),
  version: z.string().default("unknown"),
  deviceId: z.string().default(""),
  wifiSsid: z.string().default(""),
  wifiConnected: z.boolean().default(false),
  supabaseConfigured: z.boolean().default(false),
  ip: z.string().default(""),
})

export type KitInfo = z.infer<typeof kitInfoSchema>

const configAckSchema = z.object({
  type: z.literal("config_ack"),
  ok: z.boolean().default(true),
  message: z.string().default(""),
})

// Splits a byte-decoded stream into complete lines; partial trailing text is
// kept until the next chunk arrives.
export function createLineSplitter() {
  let buffer = ""
  return (chunk: string) => {
    buffer += chunk
    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop() ?? ""
    // Guard against a device that never sends a newline.
    if (buffer.length > 8192) {
      buffer = buffer.slice(-8192)
    }
    return parts.map((line) => line.trim()).filter(Boolean)
  }
}

export function classifySerialLine(raw: string): SerialLine {
  if (!raw.startsWith("{")) {
    return { kind: "log", raw }
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { kind: "log", raw }
  }
  const type = (value as { type?: unknown })?.type

  if (type === "temperature") {
    const parsed = parseFirmwareLine(raw, "usb")
    return parsed?.ok ? { kind: "temperature", packet: parsed.packet, raw } : { kind: "log", raw }
  }
  if (type === "rain_gauge" && rainGaugeReadingSchema.safeParse(value).success) {
    return { kind: "rain", raw }
  }
  if (type === "info") {
    const info = kitInfoSchema.safeParse(value)
    return info.success ? { kind: "info", info: info.data, raw } : { kind: "log", raw }
  }
  if (type === "config_ack") {
    const ack = configAckSchema.safeParse(value)
    return ack.success
      ? { kind: "config_ack", ok: ack.data.ok, message: ack.data.message, raw }
      : { kind: "log", raw }
  }
  return { kind: "log", raw }
}

export const kitConfigSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .max(32)
    .regex(/^[a-zA-Z0-9_-]*$/, "Use letters, numbers, - or _ only."),
  wifiSsid: z.string().max(32),
  wifiPassword: z.string().max(63),
  supabaseUrl: z
    .string()
    .trim()
    .max(120)
    .refine(
      (value) => value === "" || /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value),
      "Use your project URL, e.g. https://abcd1234.supabase.co"
    ),
  supabaseKey: z.string().trim().max(400),
})

export type KitConfig = z.infer<typeof kitConfigSchema>

export function encodeConfigCommand(config: KitConfig) {
  return `${JSON.stringify({ cmd: "config", ...kitConfigSchema.parse(config) })}\n`
}

export function encodeInfoCommand() {
  return `${JSON.stringify({ cmd: "info" })}\n`
}
