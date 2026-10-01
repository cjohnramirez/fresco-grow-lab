"use client"

import {
  DatabaseIcon,
  DownloadIcon,
  PlugIcon,
  PowerIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableRowsSkeleton } from "@/features/dashboard/components/loading-states"
import { RainGaugeStatusBadge } from "@/features/rain-gauge/components/rain-gauge-status-badge"
import { formatDateTime, formatNumber } from "@/features/rain-gauge/lib/format"
import type { RainGaugeDashboardState } from "@/features/rain-gauge/hooks/use-rain-gauge-dashboard"

const SOURCE_COPY = {
  simulated: {
    title: "Simulated Gauge",
    description:
      "A modelled tipping-bucket gauge publishes a packet every 3 seconds. Disconnect pauses it; Reset Session zeroes the counters.",
  },
  ap: {
    title: "Access Point",
    description: "Connect to the ESP32 rain gauge through the local Next.js proxy.",
  },
  device: {
    title: "USB Device",
    description:
      "Streams rain packets from kit firmware over Web Serial. Open Connect Hardware to pick the port first.",
  },
} as const

export function RainMonitorView({
  rain,
}: {
  rain: RainGaugeDashboardState
}) {
  const copy = SOURCE_COPY[rain.dataSource]

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle>{copy.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{copy.description}</p>
            </div>
            <RainGaugeStatusBadge state={rain.connectionState} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {rain.dataSource === "ap" && (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="rain-ap-url">AP URL</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="rain-ap-url"
                    name="rain-ap-url"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    value={rain.apBaseUrl}
                    onChange={(event) => rain.setApBaseUrl(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      aria-label="Refresh rain gauge status"
                      disabled={rain.loading.status}
                      onClick={() => rain.refreshStatus()}
                      size="icon-xs"
                    >
                      {rain.loading.status ? <Spinner /> : <RefreshCwIcon />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>
                  Default firmware AP address is http://192.168.4.1. This only
                  works when the dashboard runs on your own computer.
                </FieldDescription>
              </Field>
            </FieldGroup>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={rain.connect}
              disabled={
                rain.connectionState === "connecting" ||
                rain.connectionState === "connected"
              }
            >
              {rain.connectionState === "connecting" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlugIcon data-icon="inline-start" />
              )}
              Connect
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={rain.disconnect}
              disabled={rain.connectionState === "idle"}
            >
              <PowerIcon data-icon="inline-start" />
              Disconnect
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={rain.resetGauge}
              disabled={rain.loading.reset}
            >
              {rain.loading.reset ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RotateCcwIcon data-icon="inline-start" />
              )}
              Reset Session
            </Button>
          </div>

          {rain.error && (
            <Alert variant="destructive">
              <AlertTitle>Connection Issue</AlertTitle>
              <AlertDescription>{rain.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <CardTitle>Local Readings</CardTitle>
              <p className="text-sm text-muted-foreground">
                Page {rain.page} of {rain.totalPages}, {rain.readings.length} locally stored rows.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={rain.exportCurrentReadings}
                disabled={rain.pagedReadings.length === 0}
              >
                <DownloadIcon data-icon="inline-start" />
                Current Page CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={rain.exportAllReadings}
                disabled={rain.readings.length === 0}
              >
                <DatabaseIcon data-icon="inline-start" />
                Full Session CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Seq</TableHead>
                  <TableHead>Edges</TableHead>
                  <TableHead>Tips</TableHead>
                  <TableHead>Rainfall</TableHead>
                  <TableHead>Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rain.loading.initial ? (
                  <TableRowsSkeleton columns={6} />
                ) : rain.pagedReadings.length > 0 ? (
                  rain.pagedReadings.map((reading) => (
                    <TableRow key={reading.id}>
                      <TableCell>{formatDateTime(reading.receivedAt)}</TableCell>
                      <TableCell>{reading.seq}</TableCell>
                      <TableCell>{reading.edges}</TableCell>
                      <TableCell>{reading.tips}</TableCell>
                      <TableCell>{formatNumber(reading.rainfallMl)} ml</TableCell>
                      <TableCell>{formatNumber(reading.rateMlPerMin)} ml/min</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Connect to the AP to start storing rain readings.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rain.setPage(Math.max(1, rain.page - 1))}
              disabled={rain.page <= 1}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rain.setPage(Math.min(rain.totalPages, rain.page + 1))}
              disabled={rain.page >= rain.totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw Stream</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-52 rounded-lg border bg-muted/30 p-3">
            {rain.rawPackets.length > 0 ? (
              <div className="flex flex-col gap-2 text-sm wrap-break-word">
                {rain.rawPackets.map((packet, index) => (
                  <p key={`${packet}-${index}`}>{packet}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No realtime packets received yet.
              </p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
