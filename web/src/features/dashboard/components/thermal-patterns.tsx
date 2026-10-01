"use client"

import * as React from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChartSkeleton } from "@/features/dashboard/components/loading-states"
import { chartConfig } from "@/features/dashboard/lib/dashboard-config"
import {
  bagControlDelta,
  channelHealth,
  probeDistributions,
  thermalHeatmap,
  verticalProfile,
  waterTempVsLoss,
  type SeriesRow,
} from "@/lib/experiment/patterns"
import {
  CHANNELS,
  type IrrigationEvent,
  type NormalizedReading,
} from "@/lib/experiment/types"

function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`
}

function shortDay(day: string) {
  const date = new Date(`${day}T00:00:00+08:00`)
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(date)
}

// Hour x day grid for one probe. Sequential single-hue scale (light = cool,
// dark = hot) mixed from the heat hue into the card surface so it reads in
// both themes.
export function ThermalHeatmapCard({ loading, rows }: { loading: boolean; rows: SeriesRow[] }) {
  const [channelId, setChannelId] = React.useState<string>("surface")
  const [active, setActive] = React.useState<{ day: string; hour: number; value: number | null } | null>(null)
  const heatmap = React.useMemo(() => thermalHeatmap(rows, channelId), [channelId, rows])
  const span = heatmap.min !== null && heatmap.max !== null ? heatmap.max - heatmap.min : 0
  const channelLabel = CHANNELS.find((channel) => channel.id === channelId)?.label ?? channelId
  const extremes = React.useMemo(() => {
    const valued = heatmap.cells.filter((cell) => cell.value !== null)
    const hottest = valued.reduce<(typeof valued)[number] | null>(
      (best, cell) => (!best || cell.value! > best.value! ? cell : best),
      null
    )
    const coolest = valued.reduce<(typeof valued)[number] | null>(
      (best, cell) => (!best || cell.value! < best.value! ? cell : best),
      null
    )
    return { coolest, hottest }
  }, [heatmap.cells])
  // Screen readers get the takeaway instead of 168 unlabeled cells.
  const heatmapSummary =
    extremes.hottest && extremes.coolest
      ? `${channelLabel} temperature heatmap, ${heatmap.days.length} days by 24 hours. Hottest ${extremes.hottest.value!.toFixed(1)} C on ${shortDay(extremes.hottest.day)} at ${formatHour(extremes.hottest.hour)}; coolest ${extremes.coolest.value!.toFixed(1)} C on ${shortDay(extremes.coolest.day)} at ${formatHour(extremes.coolest.hour)}.`
      : `${channelLabel} temperature heatmap`

  const fill = (value: number | null) => {
    if (value === null || heatmap.min === null) return "var(--muted)"
    const ratio = span > 0 ? (value - heatmap.min) / span : 0.5
    return `color-mix(in oklch, var(--chart-2) ${Math.round(12 + ratio * 88)}%, var(--card))`
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>Thermal Heatmap</CardTitle>
            <CardDescription>
              Hourly mean temperature by day over the last 7 days (Manila time).
            </CardDescription>
          </div>
          <Select value={channelId} onValueChange={(value) => value && setChannelId(value)}>
            <SelectTrigger aria-label="Probe" className="w-full sm:w-36">
              <SelectValue>
                {(value: string) => CHANNELS.find((channel) => channel.id === value)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CHANNELS.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading ? (
          <ChartSkeleton className="h-56" />
        ) : heatmap.days.length === 0 ? (
          <EmptyChart>No readings for this probe in the last 7 days.</EmptyChart>
        ) : (
          <>
            <div
              className="grid gap-0.5 text-[10px] text-muted-foreground"
              style={{ gridTemplateColumns: "auto repeat(24, minmax(0, 1fr))" }}
              onMouseLeave={() => setActive(null)}
              role="img"
              aria-label={heatmapSummary}
            >
              <div />
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="text-center">
                  {hour % 6 === 0 ? String(hour).padStart(2, "0") : ""}
                </div>
              ))}
              {heatmap.days.map((day) => (
                <React.Fragment key={day}>
                  <div className="pr-1.5 text-right whitespace-nowrap">{shortDay(day)}</div>
                  {heatmap.cells
                    .filter((cell) => cell.day === day)
                    .map((cell) => (
                      <div
                        key={cell.hour}
                        title={`${shortDay(day)} ${formatHour(cell.hour)}: ${
                          cell.value === null ? "no data" : `${cell.value.toFixed(1)} C`
                        }`}
                        className="h-3 rounded-[3px] ring-foreground/60 hover:ring-1 sm:h-5"
                        style={{ background: fill(cell.value) }}
                        onMouseEnter={() => setActive(cell)}
                        onClick={() => setActive(cell)}
                      />
                    ))}
                </React.Fragment>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {active
                  ? `${shortDay(active.day)}, ${formatHour(active.hour)}: ${
                      active.value === null ? "no data" : `${active.value.toFixed(1)} C`
                    }`
                  : "Hover or tap a cell for its value"}
              </span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">{heatmap.min?.toFixed(1)} C</span>
                <div
                  className="h-2 w-24 rounded-full"
                  style={{
                    background:
                      "linear-gradient(to right, color-mix(in oklch, var(--chart-2) 12%, var(--card)), var(--chart-2))",
                  }}
                />
                <span className="tabular-nums">{heatmap.max?.toFixed(1)} C</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const profileConfig = {
  coolest: { label: "Coolest hour", color: "var(--chart-1)" },
  mean: { label: "Daily mean", color: "var(--muted-foreground)" },
  hottest: { label: "Hottest hour", color: "var(--chart-2)" },
} satisfies ChartConfig

export function VerticalProfileCard({ loading, rows }: { loading: boolean; rows: SeriesRow[] }) {
  const profile = React.useMemo(() => verticalProfile(rows), [rows])

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Vertical Profile</CardTitle>
        <CardDescription>
          Temperature down the bag at the coolest
          {profile.coolestHour !== null ? ` (${formatHour(profile.coolestHour)})` : ""} and
          hottest
          {profile.hottestHour !== null ? ` (${formatHour(profile.hottestHour)})` : ""} hours.
          Deeper layers swing less.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ChartSkeleton className="h-65" />
        ) : profile.points.length === 0 ? (
          <EmptyChart>Needs ambient and bag probe readings.</EmptyChart>
        ) : (
          <ChartContainer config={profileConfig} className="h-65 w-full aspect-auto">
            <LineChart data={profile.points} layout="vertical" accessibilityLayer margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                domain={["dataMin - 0.5", "dataMax + 0.5"]}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => value.toFixed(0)}
                unit=" C"
              />
              <YAxis
                type="category"
                dataKey="channel"
                tickLine={false}
                axisLine={false}
                width={72}
                padding={{ top: 16, bottom: 16 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {(["coolest", "mean", "hottest"] as const).map((key) => (
                <Line
                  key={key}
                  dataKey={key}
                  type="linear"
                  stroke={`var(--color-${key})`}
                  strokeWidth={2}
                  strokeDasharray={key === "mean" ? "4 4" : undefined}
                  dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

const deltaConfig = {
  surfaceDelta: { label: "Surface - control", color: chartConfig.surface.color },
  rootsDelta: { label: "Root zone - control", color: chartConfig.roots.color },
} satisfies ChartConfig

export function BagControlDeltaCard({ loading, rows }: { loading: boolean; rows: SeriesRow[] }) {
  const data = React.useMemo(() => bagControlDelta(rows), [rows])

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Bag vs Ambient</CardTitle>
        <CardDescription>
          Degrees above (+) or below (-) the control probe over 7 days.
          Negative dips after watering are evaporative cooling.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ChartSkeleton className="h-65" />
        ) : data.length === 0 ? (
          <EmptyChart>Needs the control probe and at least one bag probe.</EmptyChart>
        ) : (
          <ChartContainer config={deltaConfig} className="h-65 w-full aspect-auto">
            <LineChart data={data} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
              <Line dataKey="surfaceDelta" type="monotone" stroke="var(--color-surfaceDelta)" strokeWidth={2} dot={false} />
              <Line dataKey="rootsDelta" type="monotone" stroke="var(--color-rootsDelta)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// Box-style range strips on a shared scale: whiskers span min-max, the bar is
// the interquartile range, the tick is the median.
export function ProbeDistributionCard({ loading, rows }: { loading: boolean; rows: SeriesRow[] }) {
  const distributions = React.useMemo(() => probeDistributions(rows), [rows])
  const low = Math.min(...distributions.map((row) => row.min))
  const high = Math.max(...distributions.map((row) => row.max))
  const position = (value: number) => `${((value - low) / Math.max(high - low, 0.1)) * 100}%`

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Probe Distribution</CardTitle>
        <CardDescription>
          7-day range per probe: whiskers show min and max, the bar the middle
          50%, the tick the median.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ChartSkeleton className="h-48" />
        ) : distributions.length === 0 ? (
          <EmptyChart>No probe readings yet.</EmptyChart>
        ) : (
          <div className="flex flex-col gap-4">
            {distributions.map((row) => {
              const color =
                chartConfig[row.channelId as keyof typeof chartConfig]?.color ?? "var(--chart-1)"
              return (
                <div
                  key={row.channelId}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem]"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    {row.label}
                  </div>
                  <div
                    className="relative h-5"
                    role="img"
                    aria-label={`${row.label}: minimum ${row.min} C, first quartile ${row.q1} C, median ${row.median} C, third quartile ${row.q3} C, maximum ${row.max} C`}
                  >
                    <div
                      className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/60"
                      style={{ left: position(row.min), right: `calc(100% - ${position(row.max)})` }}
                    />
                    <div
                      className="absolute top-1 bottom-1 rounded-[4px] opacity-80"
                      style={{
                        left: position(row.q1),
                        width: `calc(${position(row.q3)} - ${position(row.q1)})`,
                        background: color,
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 rounded-full bg-foreground"
                      style={{ left: position(row.median) }}
                    />
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground tabular-nums sm:col-span-1 sm:text-right">
                    {row.min.toFixed(1)} / <span className="text-foreground">{row.median.toFixed(1)}</span> / {row.max.toFixed(1)} C
                  </div>
                </div>
              )
            })}
            <p className="text-xs text-muted-foreground tabular-nums">
              Shared scale {low.toFixed(1)} to {high.toFixed(1)} C. Values show
              min / median / max.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// The 7-day inputs change about once a minute; memoizing the section keeps the
// 10-second live ticks from re-rendering these charts.
export const ThermalPatternsSection = React.memo(function ThermalPatternsSection({
  events,
  loading,
  rows,
}: {
  events: IrrigationEvent[]
  loading: boolean
  rows: SeriesRow[]
}) {
  return (
    <>
      <ThermalHeatmapCard loading={loading} rows={rows} />
      <div className="grid gap-4 xl:grid-cols-2">
        <VerticalProfileCard loading={loading} rows={rows} />
        <BagControlDeltaCard loading={loading} rows={rows} />
        <ProbeDistributionCard loading={loading} rows={rows} />
        <WaterTempLossCard events={events} />
      </div>
    </>
  )
})

const scatterConfig = {
  lossKg: { label: "Checkpoint loss (kg)", color: "var(--chart-1)" },
} satisfies ChartConfig

export function WaterTempLossCard({ events }: { events: IrrigationEvent[] }) {
  const points = React.useMemo(() => waterTempVsLoss(events), [events])

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Water Temperature vs Weight Loss</CardTitle>
        <CardDescription>
          One dot per watering: irrigation water temperature against the mass
          the bag lost across its checkpoints.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {points.length < 2 ? (
          <EmptyChart>
            Needs at least two waterings with a water temperature and two or
            more checkpoint weights.
          </EmptyChart>
        ) : (
          <ChartContainer config={scatterConfig} className="h-65 w-full aspect-auto">
            <ScatterChart accessibilityLayer margin={{ top: 8, right: 16 }}>
              <CartesianGrid />
              <XAxis
                type="number"
                dataKey="waterTempC"
                name="Water temp"
                unit=" C"
                domain={["dataMin - 0.5", "dataMax + 0.5"]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                padding={{ left: 12, right: 12 }}
                tickFormatter={(value: number) => value.toFixed(1)}
              />
              <YAxis
                type="number"
                dataKey="lossKg"
                name="Loss"
                unit=" kg"
                domain={["dataMin - 0.1", "dataMax + 0.1"]}
                tickLine={false}
                axisLine={false}
                width={64}
                padding={{ top: 8, bottom: 8 }}
                tickFormatter={(value: number) => value.toFixed(2)}
              />
              <ZAxis range={[110, 110]} />
              <ChartTooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.day ?? ""}
                  />
                }
              />
              <Scatter
                data={points}
                fill="var(--color-lossKg)"
                stroke="var(--card)"
                strokeWidth={2}
              />
            </ScatterChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function SensorHealthCard({ readings }: { readings: NormalizedReading[] }) {
  const rows = React.useMemo(() => channelHealth(readings), [readings])

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Sensor Reliability</CardTitle>
        <CardDescription>
          Share of OK, failed and missing reads per probe in the latest{" "}
          {readings.length} readings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyChart>No readings loaded.</EmptyChart>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <div key={row.channelId} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{row.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {row.okPercent}% ok
                    {row.readFailed > 0 ? ` · ${row.readFailed} failed` : ""}
                    {row.missing > 0 ? ` · ${row.missing} missing` : ""}
                  </span>
                </div>
                <div
                  className="flex h-2 gap-0.5 overflow-hidden rounded-full"
                  role="img"
                  aria-label={`${row.label}: ${row.ok} ok, ${row.readFailed} failed, ${row.missing} missing`}
                >
                  <div className="bg-primary" style={{ flexGrow: row.ok }} />
                  {row.readFailed > 0 && <div className="bg-destructive" style={{ flexGrow: row.readFailed }} />}
                  {row.missing > 0 && <div className="bg-muted-foreground/50" style={{ flexGrow: row.missing }} />}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />OK</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />Read failed</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/50" />Missing probe</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
