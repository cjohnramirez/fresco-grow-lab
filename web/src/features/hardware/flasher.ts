"use client"

import { disconnectSerial, serialStore } from "./serial-connection"

export type FlashPart = {
  name: string
  offset: number
  data: Uint8Array
}

export type FlashProgress = {
  stage: "connecting" | "erasing" | "writing" | "resetting" | "done"
  percent: number
  message: string
}

// esptool-js is only needed when someone actually flashes a board, so it is
// loaded on demand instead of shipping in the dashboard bundle.
export async function flashParts({
  eraseAll,
  onLog,
  onProgress,
  parts,
}: {
  eraseAll: boolean
  onLog: (line: string) => void
  onProgress: (progress: FlashProgress) => void
  parts: FlashPart[]
}) {
  if (serialStore.getSnapshot().status === "connected") {
    // The flasher needs exclusive access to the port.
    await disconnectSerial()
  }

  const { ESPLoader, Transport } = await import("esptool-js")
  onProgress({ stage: "connecting", percent: 0, message: "Choose the board's serial port..." })
  const port = await navigator.serial.requestPort()
  const transport = new Transport(port, false)

  const terminal = {
    clean() {},
    writeLine(data: string) {
      onLog(data)
    },
    write(data: string) {
      if (data.trim()) onLog(data)
    },
  }

  try {
    const loader = new ESPLoader({
      transport,
      baudrate: 460800,
      romBaudrate: 115200,
      terminal,
    })
    onProgress({
      stage: "connecting",
      percent: 0,
      message: "Entering bootloader. Hold BOOT if it does not connect.",
    })
    const chip = await loader.main()
    onLog(`Connected to ${chip}`)

    if (eraseAll) {
      onProgress({ stage: "erasing", percent: 0, message: "Erasing flash (about 10 s)..." })
    }

    const totalBytes = parts.reduce((sum, part) => sum + part.data.length, 0)
    const writtenBefore = parts.map((_, index) =>
      parts.slice(0, index).reduce((sum, part) => sum + part.data.length, 0)
    )

    await loader.writeFlash({
      fileArray: parts.map((part) => ({ data: part.data, address: part.offset })),
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll,
      compress: true,
      reportProgress(fileIndex, written, total) {
        const part = parts[fileIndex]
        const done = writtenBefore[fileIndex] + (written / total) * part.data.length
        onProgress({
          stage: "writing",
          percent: Math.min(100, Math.round((done / totalBytes) * 100)),
          message: `Writing ${part.name}...`,
        })
      },
    })

    onProgress({ stage: "resetting", percent: 100, message: "Restarting the board..." })
    await loader.after("hard_reset")
    onProgress({ stage: "done", percent: 100, message: `Flashed ${chip}.` })
    return chip
  } finally {
    await transport.disconnect().catch(() => {})
  }
}
