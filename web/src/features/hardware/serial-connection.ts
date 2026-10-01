"use client"

import * as React from "react"

import { appendDevicePacket } from "@/features/telemetry/temperature-stores"
import {
  KIT_BAUD_RATE,
  classifySerialLine,
  createLineSplitter,
  encodeConfigCommand,
  encodeInfoCommand,
  type KitConfig,
  type KitInfo,
} from "@/lib/hardware/serial-protocol"
import { createExternalStore } from "@/lib/telemetry/external-store"

export type SerialStatus = "unsupported" | "idle" | "connecting" | "connected" | "error"

export type SerialState = {
  status: SerialStatus
  message: string
  consoleLines: string[]
  info: KitInfo | null
  lastAck: { ok: boolean; message: string; at: string } | null
  packetCount: number
}

const MAX_CONSOLE_LINES = 200

const INITIAL_STATE: SerialState = {
  status: "idle",
  message: "Not connected.",
  consoleLines: [],
  info: null,
  lastAck: null,
  packetCount: 0,
}

export const serialStore = createExternalStore<SerialState>(INITIAL_STATE)

export function isWebSerialSupported() {
  return typeof navigator !== "undefined" && "serial" in navigator
}

let port: SerialPort | null = null
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
let readLoop: Promise<void> | null = null
const rainListeners = new Set<(raw: string) => void>()

// Rain dashboards subscribe to rain packets from the USB kit firmware.
export function subscribeSerialRain(listener: (raw: string) => void) {
  rainListeners.add(listener)
  return () => {
    rainListeners.delete(listener)
  }
}

function patch(update: Partial<SerialState>) {
  serialStore.setState((current) => ({ ...current, ...update }))
}

function pushConsole(line: string) {
  serialStore.setState((current) => ({
    ...current,
    consoleLines: [...current.consoleLines, line].slice(-MAX_CONSOLE_LINES),
  }))
}

function handleLine(raw: string) {
  const line = classifySerialLine(raw)
  switch (line.kind) {
    case "temperature":
      appendDevicePacket(line.packet)
      serialStore.setState((current) => ({
        ...current,
        packetCount: current.packetCount + 1,
      }))
      return
    case "rain":
      for (const listener of rainListeners) listener(line.raw)
      serialStore.setState((current) => ({
        ...current,
        packetCount: current.packetCount + 1,
      }))
      return
    case "info":
      patch({ info: line.info })
      pushConsole(line.raw)
      return
    case "config_ack":
      patch({
        lastAck: { ok: line.ok, message: line.message, at: new Date().toISOString() },
      })
      pushConsole(line.raw)
      return
    default:
      pushConsole(line.raw)
  }
}

async function runReadLoop(activePort: SerialPort) {
  const decoder = new TextDecoder()
  const split = createLineSplitter()

  while (activePort.readable && port === activePort) {
    reader = activePort.readable.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        for (const line of split(decoder.decode(value, { stream: true }))) {
          handleLine(line)
        }
      }
    } catch (error) {
      // A read error (e.g. the board reset) ends this reader; loop to reopen.
      pushConsole(`[serial] ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      reader.releaseLock()
      reader = null
    }
  }
}

export async function connectSerial(baudRate = KIT_BAUD_RATE) {
  if (!isWebSerialSupported()) {
    patch({
      status: "unsupported",
      message: "Web Serial needs Chrome or Edge on desktop.",
    })
    return false
  }
  if (port) {
    return true
  }

  patch({ status: "connecting", message: "Choose your ESP32's serial port..." })
  try {
    const selected = await navigator.serial.requestPort()
    await selected.open({ baudRate })
    port = selected
    patch({ status: "connected", message: `Connected at ${baudRate} baud.`, packetCount: 0 })
    readLoop = runReadLoop(selected)
    // Ask kit firmware to identify itself; plain firmware just ignores it.
    setTimeout(() => {
      void sendSerialText(encodeInfoCommand())
    }, 1500)
    return true
  } catch (error) {
    port = null
    const message =
      error instanceof Error && error.name === "NotFoundError"
        ? "No port selected."
        : error instanceof Error
          ? error.message
          : "Could not open the serial port."
    patch({ status: error instanceof Error && error.name === "NotFoundError" ? "idle" : "error", message })
    return false
  }
}

export async function disconnectSerial() {
  const activePort = port
  port = null
  try {
    await reader?.cancel()
  } catch {
    // Already closed.
  }
  await readLoop?.catch(() => {})
  readLoop = null
  try {
    await activePort?.close()
  } catch {
    // Port may already be gone (unplugged).
  }
  patch({ status: "idle", message: "Disconnected." })
}

export async function sendSerialText(text: string) {
  if (!port?.writable) {
    throw new Error("Connect to the board over USB first.")
  }
  const writer = port.writable.getWriter()
  try {
    await writer.write(new TextEncoder().encode(text))
  } finally {
    writer.releaseLock()
  }
}

export async function sendKitConfig(config: KitConfig) {
  patch({ lastAck: null })
  await sendSerialText(encodeConfigCommand(config))
}

export function requestKitInfo() {
  return sendSerialText(encodeInfoCommand())
}

export function clearSerialConsole() {
  patch({ consoleLines: [] })
}

export function useSerialState() {
  return React.useSyncExternalStore(
    serialStore.subscribe,
    serialStore.getSnapshot,
    () => INITIAL_STATE
  )
}
