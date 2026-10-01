"use client"

import * as React from "react"
import {
  CloudRainIcon,
  PlugIcon,
  PowerIcon,
  RefreshCwIcon,
  SaveIcon,
  ThermometerIcon,
  UsbIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { kitConfigSchema, type KitConfig } from "@/lib/hardware/serial-protocol"

import {
  clearSerialConsole,
  connectSerial,
  disconnectSerial,
  isWebSerialSupported,
  requestKitInfo,
  sendKitConfig,
  useSerialState,
} from "./serial-connection"

const EMPTY_CONFIG: KitConfig = {
  deviceId: "",
  wifiSsid: "",
  wifiPassword: "",
  supabaseUrl: "",
  supabaseKey: "",
}

export function UsbPanel({
  onUseStream,
}: {
  onUseStream: (dashboard: "temperature" | "rain-gauge") => void
}) {
  const serial = useSerialState()
  const [config, setConfig] = React.useState<KitConfig>(EMPTY_CONFIG)
  const [configError, setConfigError] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)
  const consoleEndRef = React.useRef<HTMLDivElement | null>(null)
  const connected = serial.status === "connected"
  const isRainKit = serial.info?.firmware.includes("rain") ?? false
  const isKit = serial.info !== null

  React.useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ block: "end" })
  }, [serial.consoleLines.length])

  function update<K extends keyof KitConfig>(key: K, value: KitConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  async function saveConfig(event: React.FormEvent) {
    event.preventDefault()
    const parsed = kitConfigSchema.safeParse(config)
    if (!parsed.success) {
      setConfigError(parsed.error.issues[0]?.message ?? "Check the settings.")
      return
    }
    setConfigError(null)
    setSending(true)
    try {
      await sendKitConfig(parsed.data)
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "Could not send settings.")
    } finally {
      setSending(false)
    }
  }

  if (!isWebSerialSupported()) {
    return (
      <Alert>
        <UsbIcon aria-hidden="true" />
        <AlertTitle>Web Serial is not available</AlertTitle>
        <AlertDescription>
          Live USB streaming needs Chrome, Edge or Opera on desktop.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <Button type="button" variant="outline" onClick={() => void disconnectSerial()}>
            <PowerIcon data-icon="inline-start" />
            Disconnect
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void connectSerial()}
            disabled={serial.status === "connecting"}
          >
            {serial.status === "connecting" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlugIcon data-icon="inline-start" />
            )}
            Connect over USB
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => void requestKitInfo().catch(() => {})}
          disabled={!connected}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Identify board
        </Button>
        <Badge variant={connected ? "default" : "outline"}>
          {connected ? `${serial.packetCount} packets` : serial.status}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{serial.message}</p>

      {serial.info && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Firmware</div>
            <div className="truncate">{serial.info.firmware}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Device ID</div>
            <div className="truncate">{serial.info.deviceId || "--"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Wi-Fi</div>
            <div className="truncate">
              {serial.info.wifiConnected ? serial.info.ip : serial.info.wifiSsid ? "Not connected" : "Not set"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Supabase</div>
            <div>{serial.info.supabaseConfigured ? "Uploading" : "USB only"}</div>
          </div>
        </div>
      )}

      {connected && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={isKit && !isRainKit ? "default" : "outline"}
            onClick={() => onUseStream("temperature")}
          >
            <ThermometerIcon data-icon="inline-start" />
            Show on Temperature dashboard
          </Button>
          <Button
            type="button"
            variant={isRainKit ? "default" : "outline"}
            onClick={() => onUseStream("rain-gauge")}
          >
            <CloudRainIcon data-icon="inline-start" />
            Show on Rain Gauge dashboard
          </Button>
        </div>
      )}

      <form onSubmit={saveConfig}>
        <FieldSet disabled={!connected || sending}>
          <FieldLegend variant="label">Board settings (kit firmware)</FieldLegend>
          <FieldDescription>
            Sent over USB and saved in the board&apos;s flash (NVS). Nothing is
            stored on this website. Leave Supabase empty to stream over USB
            only.
          </FieldDescription>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="kit-device-id">Device ID</FieldLabel>
              <Input
                id="kit-device-id"
                placeholder="my-grow-bag"
                value={config.deviceId}
                onChange={(event) => update("deviceId", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="kit-ssid">Wi-Fi name</FieldLabel>
              <Input
                id="kit-ssid"
                autoComplete="off"
                value={config.wifiSsid}
                onChange={(event) => update("wifiSsid", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="kit-password">Wi-Fi password</FieldLabel>
              <Input
                id="kit-password"
                type="password"
                autoComplete="new-password"
                value={config.wifiPassword}
                onChange={(event) => update("wifiPassword", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="kit-supabase-url">Supabase URL</FieldLabel>
              <Input
                id="kit-supabase-url"
                placeholder="https://abcd1234.supabase.co"
                value={config.supabaseUrl}
                onChange={(event) => update("supabaseUrl", event.target.value)}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="kit-supabase-key">Supabase publishable key</FieldLabel>
              <Input
                id="kit-supabase-key"
                type="password"
                autoComplete="off"
                placeholder="sb_publishable_..."
                value={config.supabaseKey}
                onChange={(event) => update("supabaseKey", event.target.value)}
              />
              <FieldDescription>
                Use the publishable (anon) key, never the secret key: it lives
                on the device.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {configError && <FieldError>{configError}</FieldError>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!connected || sending}>
              {sending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              Save to board
            </Button>
            {serial.lastAck && (
              <Badge variant={serial.lastAck.ok ? "default" : "destructive"}>
                {serial.lastAck.ok ? "Saved on board" : "Board rejected settings"}
                {serial.lastAck.message ? `: ${serial.lastAck.message}` : ""}
              </Badge>
            )}
          </div>
        </FieldSet>
      </form>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Serial console</span>
          <Button type="button" variant="ghost" size="sm" onClick={clearSerialConsole}>
            Clear
          </Button>
        </div>
        <ScrollArea className="h-36 rounded-lg border bg-muted/40">
          <pre className="p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">
            {serial.consoleLines.length > 0
              ? serial.consoleLines.join("\n")
              : "Log lines from the board appear here. Telemetry packets go straight to the dashboard."}
          </pre>
          <div ref={consoleEndRef} />
        </ScrollArea>
      </div>
    </div>
  )
}
