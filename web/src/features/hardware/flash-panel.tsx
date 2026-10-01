"use client"

import * as React from "react"
import {
  CpuIcon,
  FileUpIcon,
  PackageIcon,
  TrashIcon,
  ZapIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  firmwareManifestSchema,
  formatOffset,
  inferFlashOffset,
  parseOffset,
  validateFlashPart,
  validatePartSet,
  type FirmwareManifest,
} from "@/lib/hardware/firmware"

import { flashParts, type FlashProgress } from "./flasher"
import { isWebSerialSupported } from "./serial-connection"

type OwnFile = {
  id: string
  name: string
  data: Uint8Array
  offsetText: string
}

type ManifestState =
  | { status: "loading" }
  | { status: "ready"; manifest: FirmwareManifest }
  | { status: "missing" }

function useFirmwareManifest() {
  const [state, setState] = React.useState<ManifestState>({ status: "loading" })

  React.useEffect(() => {
    let cancelled = false
    fetch("/firmware/manifest.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return
        const parsed = firmwareManifestSchema.safeParse(payload)
        setState(
          parsed.success && parsed.data.builds.length > 0
            ? { status: "ready", manifest: parsed.data }
            : { status: "missing" }
        )
      })
      .catch(() => {
        if (!cancelled) setState({ status: "missing" })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function FlashPanel({
  onFlashed,
  onOpenGuide,
}: {
  onFlashed: () => void
  onOpenGuide: () => void
}) {
  const supported = isWebSerialSupported()
  const manifestState = useFirmwareManifest()
  const [source, setSource] = React.useState<"prebuilt" | "own">("prebuilt")
  const [buildId, setBuildId] = React.useState<string>("temperature-kit")
  const [ownFiles, setOwnFiles] = React.useState<OwnFile[]>([])
  const [eraseAll, setEraseAll] = React.useState(false)
  const [progress, setProgress] = React.useState<FlashProgress | null>(null)
  const [log, setLog] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const flashing =
    progress !== null && progress.stage !== "done" && error === null

  const manifest = manifestState.status === "ready" ? manifestState.manifest : null
  const selectedBuild =
    manifest?.builds.find((build) => build.id === buildId) ?? manifest?.builds[0] ?? null

  const ownIssues = ownFiles.map((file) => {
    const offset = parseOffset(file.offsetText)
    return offset === null ? "Enter a flash offset like 0x10000." : validateFlashPart(file.data, offset)
  })
  const overlapIssue = validatePartSet(
    ownFiles.flatMap((file) => {
      const offset = parseOffset(file.offsetText)
      return offset === null ? [] : [{ name: file.name, offset, size: file.data.length }]
    })
  )
  const ownReady =
    ownFiles.length > 0 && ownIssues.every((issue) => issue === null) && !overlapIssue

  async function addFiles(files: FileList | null) {
    if (!files) return
    const added = await Promise.all(
      Array.from(files).map(async (file) => {
        const offset = inferFlashOffset(file.name)
        return {
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          data: new Uint8Array(await file.arrayBuffer()),
          offsetText: offset === null ? "" : formatOffset(offset),
        }
      })
    )
    setOwnFiles((current) => {
      const ids = new Set(current.map((file) => file.id))
      return [...current, ...added.filter((file) => !ids.has(file.id))]
    })
  }

  async function startFlash() {
    setError(null)
    setLog([])
    setProgress({ stage: "connecting", percent: 0, message: "Preparing firmware..." })

    try {
      const parts =
        source === "prebuilt" && selectedBuild
          ? await Promise.all(
              selectedBuild.parts.map(async (part) => {
                const response = await fetch(`/firmware/${part.path}`)
                if (!response.ok) {
                  throw new Error(`Could not download ${part.path}.`)
                }
                return {
                  name: part.path,
                  offset: part.offset,
                  data: new Uint8Array(await response.arrayBuffer()),
                }
              })
            )
          : ownFiles.map((file) => ({
              name: file.name,
              offset: parseOffset(file.offsetText)!,
              data: file.data,
            }))

      await flashParts({
        eraseAll,
        parts,
        onLog: (line) => setLog((current) => [...current, line].slice(-300)),
        onProgress: setProgress,
      })
      onFlashed()
    } catch (flashError) {
      const message =
        flashError instanceof Error ? flashError.message : "Flashing failed."
      setError(
        message.includes("No port selected") || message.includes("NotFoundError")
          ? "No serial port was selected."
          : message
      )
    }
  }

  if (!supported) {
    return (
      <Alert>
        <CpuIcon aria-hidden="true" />
        <AlertTitle>Web Serial is not available</AlertTitle>
        <AlertDescription>
          Flashing from the browser uses Web Serial, which is available in
          Chrome, Edge and Opera on desktop. Firefox and Safari do not support
          it. You can still flash with PlatformIO. See the guide.
          <Button type="button" variant="link" className="h-auto p-0" onClick={onOpenGuide}>
            Open the flashing guide
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        value={[source]}
        onValueChange={(value) => {
          const next = value[0]
          if (next === "prebuilt" || next === "own") setSource(next)
        }}
        variant="outline"
        className="w-full"
      >
        <ToggleGroupItem value="prebuilt" className="flex-1">
          <PackageIcon data-icon="inline-start" />
          Prebuilt Fresco kit
        </ToggleGroupItem>
        <ToggleGroupItem value="own" className="flex-1">
          <FileUpIcon data-icon="inline-start" />
          My own .bin files
        </ToggleGroupItem>
      </ToggleGroup>

      {source === "prebuilt" ? (
        manifestState.status === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading firmware list...
          </div>
        ) : manifest ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="firmware-build">Firmware</FieldLabel>
              <Select
                value={selectedBuild?.id ?? ""}
                onValueChange={(value) => value && setBuildId(value)}
              >
                <SelectTrigger id="firmware-build" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      manifest.builds.find((build) => build.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {manifest.builds.map((build) => (
                      <SelectItem key={build.id} value={build.id}>
                        {build.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {selectedBuild?.description} Version {manifest.version}
                {manifest.commit ? ` (${manifest.commit.slice(0, 7)})` : ""}. Wi-Fi
                and Supabase settings are entered after flashing, so the
                image contains no credentials.
              </FieldDescription>
            </Field>
          </FieldGroup>
        ) : (
          <Alert>
            <PackageIcon aria-hidden="true" />
            <AlertTitle>No prebuilt firmware published yet</AlertTitle>
            <AlertDescription>
              Run the Firmware workflow on GitHub, or build it yourself with
              PlatformIO and use &quot;My own .bin files&quot;.
            </AlertDescription>
          </Alert>
        )
      ) : (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="firmware-files">Firmware files</FieldLabel>
            <Input
              id="firmware-files"
              type="file"
              accept=".bin,application/octet-stream"
              multiple
              onChange={(event) => {
                void addFiles(event.target.files)
                event.target.value = ""
              }}
            />
            <FieldDescription>
              Add one merged image, or bootloader.bin, partitions.bin,
              boot_app0.bin and firmware.bin from{" "}
              <code>.pio/build/&lt;env&gt;/</code>. Offsets are filled in from
              the file names.
            </FieldDescription>
          </Field>
          {ownFiles.map((file, index) => (
            <div key={file.id} className="flex flex-col gap-1 rounded-lg border p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {file.name}
                </span>
                <Badge variant="outline">{(file.data.length / 1024).toFixed(0)} KB</Badge>
                <Input
                  aria-label={`Offset for ${file.name}`}
                  className="h-7 w-24 font-mono text-xs"
                  placeholder="0x10000"
                  value={file.offsetText}
                  onChange={(event) =>
                    setOwnFiles((current) =>
                      current.map((candidate) =>
                        candidate.id === file.id
                          ? { ...candidate, offsetText: event.target.value }
                          : candidate
                      )
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setOwnFiles((current) => current.filter((candidate) => candidate.id !== file.id))
                  }
                >
                  <TrashIcon />
                </Button>
              </div>
              {ownIssues[index] && (
                <p className="text-xs text-destructive">{ownIssues[index]}</p>
              )}
            </div>
          ))}
          {overlapIssue && <p className="text-xs text-destructive">{overlapIssue}</p>}
        </FieldGroup>
      )}

      <Field orientation="horizontal">
        <Switch
          id="erase-flash"
          checked={eraseAll}
          onCheckedChange={setEraseAll}
          disabled={flashing}
        />
        <FieldLabel htmlFor="erase-flash" className="font-normal">
          Erase the whole flash first (also clears saved Wi-Fi settings)
        </FieldLabel>
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={startFlash}
          disabled={
            flashing || (source === "prebuilt" ? !selectedBuild : !ownReady)
          }
        >
          {flashing ? <Spinner data-icon="inline-start" /> : <ZapIcon data-icon="inline-start" />}
          {flashing ? "Flashing..." : "Flash board"}
        </Button>
        <Button type="button" variant="outline" onClick={onOpenGuide}>
          How does this work?
        </Button>
      </div>

      {progress && (
        <div className="flex flex-col gap-2">
          <Progress value={progress.percent} aria-label="Flashing progress" />
          <p className="text-sm text-muted-foreground">{progress.message}</p>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Flashing stopped</AlertTitle>
          <AlertDescription>
            {error} If it can&apos;t connect, hold the board&apos;s BOOT button
            while clicking Flash, and check the USB cable carries data.
          </AlertDescription>
        </Alert>
      )}

      {progress?.stage === "done" && (
        <Alert>
          <ZapIcon aria-hidden="true" />
          <AlertTitle>Flashed</AlertTitle>
          <AlertDescription>
            The board restarted with the new firmware. Next, connect over USB
            to set up Wi-Fi and stream readings.
          </AlertDescription>
        </Alert>
      )}

      {log.length > 0 && (
        <ScrollArea className="h-32 rounded-lg border bg-muted/40">
          <pre className="p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">
            {log.join("\n")}
          </pre>
        </ScrollArea>
      )}
    </div>
  )
}
