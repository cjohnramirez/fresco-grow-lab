import { describe, expect, it } from "vitest"

import { simulatedPacket } from "@/lib/simulation/temperature"

import {
  ESP32_PART_OFFSETS,
  inferFlashOffset,
  parseOffset,
  validateFlashPart,
  validatePartSet,
} from "./firmware"
import {
  classifySerialLine,
  createLineSplitter,
  encodeConfigCommand,
  kitConfigSchema,
} from "./serial-protocol"

describe("serial line splitter", () => {
  it("joins partial chunks and handles CRLF", () => {
    const split = createLineSplitter()
    expect(split('{"type":"temp')).toEqual([])
    expect(split('erature"}\r\nboot log\n')).toEqual(['{"type":"temperature"}', "boot log"])
  })
})

describe("classifySerialLine", () => {
  it("routes kit temperature packets", () => {
    const line = JSON.stringify(simulatedPacket(Date.parse("2026-07-01T04:00:00Z"), 7))
    const result = classifySerialLine(line)
    expect(result.kind).toBe("temperature")
    if (result.kind === "temperature") {
      expect(result.packet.channels).toHaveLength(5)
    }
  })

  it("routes rain packets, info and acks", () => {
    const rain = JSON.stringify({
      type: "rain_gauge",
      seq: 1,
      ms: 1000,
      edges: 3,
      tips: 1,
      lastEdgeMs: 900,
      rainfallMl: 2.37,
      rainfallMm: null,
      rateMlPerMin: 0,
      rateMmPerHr: null,
    })
    expect(classifySerialLine(rain).kind).toBe("rain")
    expect(
      classifySerialLine('{"type":"info","firmware":"fresco-temperature-kit","deviceId":"a"}').kind
    ).toBe("info")
    expect(classifySerialLine('{"type":"config_ack","ok":false,"message":"bad"}')).toMatchObject({
      kind: "config_ack",
      ok: false,
    })
  })

  it("treats plain text and malformed JSON as logs", () => {
    expect(classifySerialLine("Connecting to Wi-Fi...").kind).toBe("log")
    expect(classifySerialLine("{not json").kind).toBe("log")
  })
})

describe("kit config", () => {
  const valid = {
    deviceId: "bag-a",
    wifiSsid: "Farm",
    wifiPassword: "secret123",
    supabaseUrl: "https://abcd1234.supabase.co",
    supabaseKey: "sb_publishable_x",
  }

  it("encodes one newline-terminated command", () => {
    const line = encodeConfigCommand(valid)
    expect(line.endsWith("\n")).toBe(true)
    expect(JSON.parse(line)).toMatchObject({ cmd: "config", deviceId: "bag-a" })
  })

  it("rejects non-Supabase URLs and odd device ids", () => {
    expect(kitConfigSchema.safeParse({ ...valid, supabaseUrl: "http://example.com" }).success).toBe(false)
    expect(kitConfigSchema.safeParse({ ...valid, deviceId: "bad id!" }).success).toBe(false)
    expect(kitConfigSchema.safeParse({ ...valid, supabaseUrl: "", supabaseKey: "" }).success).toBe(true)
  })
})

describe("firmware parts", () => {
  it("infers PlatformIO offsets from file names", () => {
    expect(inferFlashOffset("bootloader.bin")).toBe(ESP32_PART_OFFSETS.bootloader)
    expect(inferFlashOffset("partitions.bin")).toBe(ESP32_PART_OFFSETS.partitions)
    expect(inferFlashOffset("boot_app0.bin")).toBe(ESP32_PART_OFFSETS.bootApp0)
    expect(inferFlashOffset("firmware.bin")).toBe(ESP32_PART_OFFSETS.app)
    expect(inferFlashOffset("temperature-kit-merged.bin")).toBe(0)
    expect(inferFlashOffset("random.bin")).toBeNull()
  })

  it("parses hex and decimal offsets", () => {
    expect(parseOffset("0x10000")).toBe(0x10000)
    expect(parseOffset("4096")).toBe(4096)
    expect(parseOffset("nope")).toBeNull()
  })

  it("checks image headers against the offset", () => {
    const app = new Uint8Array(64)
    app[0] = 0xe9
    expect(validateFlashPart(app, 0x10000)).toBeNull()
    expect(validateFlashPart(new Uint8Array(64), 0x10000)).toMatch(/0xE9/)

    const partitions = new Uint8Array([0xaa, 0x50, 0x01])
    expect(validateFlashPart(partitions, 0x8000)).toBeNull()
    expect(validateFlashPart(app, 0x8000)).toMatch(/partition table/)

    const merged = new Uint8Array(0x2000)
    merged[0x1000] = 0xe9
    expect(validateFlashPart(merged, 0)).toBeNull()
  })

  it("detects overlapping parts", () => {
    expect(
      validatePartSet([
        { name: "bootloader.bin", offset: 0x1000, size: 0x8000 },
        { name: "partitions.bin", offset: 0x8000, size: 0xc00 },
      ])
    ).toMatch(/overlaps/)
  })
})
