"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RainTotalsChart } from "@/features/rain-gauge/components/rain-gauge-charts"
import { formatNumber } from "@/features/rain-gauge/lib/format"
import {
  intensityBreakdown,
  segmentRainEvents,
  tipIntervalHistogram,
} from "@/lib/rain-gauge/events"
import type { RainGaugeReading, RainGaugeSummary } from "@/lib/rain-gauge/types"

const eventStartFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
})

function formatEventStart(value: string) {
  return eventStartFormatter.format(new Date(value))
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export function RainEventsCard({ readings }: { readings: RainGaugeReading[] }) {
  const events = React.useMemo(() => segmentRainEvents(readings), [readings])

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Rain Events</CardTitle>
        <CardDescription>
          Showers separated by at least 30 dry minutes, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <Empty>No tips recorded in this session yet.</Empty>
        ) : (
          <ScrollArea className="max-h-72 w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Tips</TableHead>
                  <TableHead className="text-right">Rainfall</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Peak rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap">{formatEventStart(event.start)}</TableCell>
                    <TableCell className="text-right tabular-nums">{event.durationMin} min</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {event.tips}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {event.rainfallMm !== null
                        ? `${formatNumber(event.rainfallMm)} mm`
                        : `${formatNumber(event.rainfallMl)} ml`}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums whitespace-nowrap md:table-cell">
                      {event.peakRateMmPerHr !== null
                        ? `${formatNumber(event.peakRateMmPerHr)} mm/h`
                        : `${formatNumber(event.peakRateMlPerMin)} ml/min`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

// Ordered classes get an ordinal single-hue ramp: lighter = gentler rain.
// Lightest step still clears 2:1 against the card surface.
const INTENSITY_SHADES = [45, 59, 73, 86, 100]

export function IntensityCard({ readings }: { readings: RainGaugeReading[] }) {
  const rows = React.useMemo(() => intensityBreakdown(readings), [readings])
  const maxMinutes = Math.max(1, ...(rows ?? []).map((row) => row.minutes))

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Rain Intensity</CardTitle>
        <CardDescription>
          Rain time per intensity band, measured over 10-minute windows, and
          the rainfall each band delivered.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <Empty>
            Intensity bands need a catchment area so rates can be expressed
            in mm/h. Set RAIN_GAUGE_CATCHMENT_AREA_CM2 in the firmware.
          </Empty>
        ) : rows.every((row) => row.minutes === 0) ? (
          <Empty>No rain yet in this session.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)_6.5rem] items-center gap-3 text-sm"
              >
                <span>{row.label}</span>
                <div className="h-4 rounded-[4px] bg-muted">
                  <div
                    className="h-full rounded-[4px]"
                    style={{
                      width: `${(row.minutes / maxMinutes) * 100}%`,
                      minWidth: row.minutes > 0 ? 4 : 0,
                      background: `color-mix(in oklch, var(--chart-1) ${INTENSITY_SHADES[index]}%, var(--card))`,
                    }}
                  />
                </div>
                <span className="text-right text-xs text-muted-foreground tabular-nums">
                  {row.minutes} min · {formatNumber(row.rainfallMm)} mm
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Light &lt; 2.5, moderate 2.5-7.5, heavy 7.5-15, intense 15-30,
              torrential &gt; 30 mm/h.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const intervalConfig = {
  count: { label: "Intervals", color: "var(--chart-1)" },
} satisfies ChartConfig

export function TipIntervalCard({ summary }: { summary: RainGaugeSummary }) {
  const bins = React.useMemo(
    () => tipIntervalHistogram(summary.tipIntervals),
    [summary.tipIntervals]
  )

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Time Between Tips</CardTitle>
        <CardDescription>
          Short gaps mean heavy rain; long gaps are drizzle or the pause
          between showers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.tipIntervals.length === 0 ? (
          <Empty>Needs at least two tips.</Empty>
        ) : (
          <ChartContainer config={intervalConfig} className="h-65 w-full aspect-auto">
            <BarChart data={bins} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function DailyTotalsCard({ summary }: { summary: RainGaugeSummary }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Daily Totals</CardTitle>
        <CardDescription>Rainfall collected per day in this session (UTC days).</CardDescription>
      </CardHeader>
      <CardContent>
        {summary.dailyTotals.length === 0 ? (
          <Empty>No readings yet.</Empty>
        ) : (
          <RainTotalsChart data={summary.dailyTotals} mode="daily" />
        )}
      </CardContent>
    </Card>
  )
}
