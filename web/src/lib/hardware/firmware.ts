import { z } from "zod"

// Prebuilt kit firmware published by .github/workflows/firmware.yml into
// web/public/firmware. Each build is flashed as one or more parts; CI emits a
// single merged image at offset 0.
export const firmwarePartSchema = z.object({
  path: z.string().min(1),
  offset: z.number().int().nonnegative(),
})

export const firmwareBuildSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  chip: z.string().default("ESP32"),
  env: z.string().min(1),
  parts: z.array(firmwarePartSchema).min(1),
})

export const firmwareManifestSchema = z.object({
  version: z.string(),
  builtAt: z.string(),
  commit: z.string().default(""),
  builds: z.array(firmwareBuildSchema),
})

export type FirmwareManifest = z.infer<typeof firmwareManifestSchema>
export type FirmwareBuild = z.infer<typeof firmwareBuildSchema>

// Standard ESP32 Arduino flash layout, as printed by `pio run -t upload -v`.
export const ESP32_PART_OFFSETS = {
  bootloader: 0x1000,
  partitions: 0x8000,
  bootApp0: 0xe000,
  app: 0x10000,
  merged: 0x0,
} as const

// Guesses the flash offset from a PlatformIO/Arduino output file name.
export function inferFlashOffset(fileName: string): number | null {
  const name = fileName.toLowerCase()
  if (/(merged|factory|full)/.test(name)) return ESP32_PART_OFFSETS.merged
  if (name.includes("bootloader")) return ESP32_PART_OFFSETS.bootloader
  if (name.includes("partition")) return ESP32_PART_OFFSETS.partitions
  if (name.includes("boot_app0")) return ESP32_PART_OFFSETS.bootApp0
  if (name.endsWith("firmware.bin") || name.endsWith(".ino.bin")) return ESP32_PART_OFFSETS.app
  return null
}

export function parseOffset(value: string): number | null {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  const parsed = trimmed.startsWith("0x")
    ? Number.parseInt(trimmed.slice(2), 16)
    : Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 0x1000000 ? parsed : null
}

export function formatOffset(offset: number) {
  return `0x${offset.toString(16).padStart(offset === 0 ? 1 : 4, "0")}`
}

const ESP_IMAGE_MAGIC = 0xe9
const PARTITION_TABLE_MAGIC = [0xaa, 0x50]

// Sanity checks before writing to the chip, so a wrong file at a wrong offset
// fails in the browser instead of bricking the boot chain.
export function validateFlashPart(bytes: Uint8Array, offset: number): string | null {
  if (bytes.length === 0) {
    return "File is empty."
  }
  if (bytes.length > 16 * 1024 * 1024) {
    return "File is larger than 16 MB flash."
  }
  if (offset === ESP32_PART_OFFSETS.partitions) {
    return bytes[0] === PARTITION_TABLE_MAGIC[0] && bytes[1] === PARTITION_TABLE_MAGIC[1]
      ? null
      : "Offset 0x8000 expects a partition table (partitions.bin)."
  }
  if (offset === ESP32_PART_OFFSETS.bootApp0) {
    return null
  }
  if (offset === ESP32_PART_OFFSETS.merged) {
    // A merged image is padded before the bootloader at 0x1000.
    return bytes.length > 0x1000 && bytes[0x1000] === ESP_IMAGE_MAGIC
      ? null
      : "Offset 0x0 expects a merged image with a bootloader at 0x1000."
  }
  return bytes[0] === ESP_IMAGE_MAGIC
    ? null
    : "This does not look like an ESP32 app or bootloader image (missing 0xE9 header)."
}

export function validatePartSet(parts: Array<{ offset: number; size: number; name: string }>) {
  const sorted = parts.toSorted((a, b) => a.offset - b.offset)
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]
    if (previous.offset + previous.size > sorted[index].offset) {
      return `${previous.name} overlaps ${sorted[index].name}. Check the offsets.`
    }
  }
  return null
}
