"use client"

import * as React from "react"
import {
  ClockIcon,
  DatabaseIcon,
  DropletsIcon,
  ScaleIcon,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { ChartCardHeader } from "@/features/dashboard/components/chart-card-header"
import { ChartSkeleton } from "@/features/dashboard/components/loading-states"
import { chartConfig } from "@/features/dashboard/lib/dashboard-config"
import { MetricCard } from "@/features/dashboard/components/metric-card"
import { TemperatureChart } from "@/features/dashboard/components/temperature-chart"
import {
  SensorHealthCard,
  ThermalPatternsSection,
} from "@/features/dashboard/components/thermal-patterns"
import type { SeriesRow } from "@/lib/experiment/patterns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
} from "@/components/ui/chart"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  baselineVerdictLabel,
  formatManilaDateTime,
} from "@/lib/experiment/irrigation"
import type {
  ChartRange,
  ExperimentSummary,
  IrrigationEvent,
  NormalizedReading,
  WeekAnalysisResult,
} from "@/lib/experiment/types"
import type {
  CloudState,
  DashboardLoadingState,
} from "@/features/dashboard/lib/dashboard-types"

function average(values: number[]) {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function kg(value: number | null) {
  return value === null ? "--" : `${value.toFixed(2)} kg`
}

function slope(value: number | null) {
  return value === null ? "--" : `${value.toFixed(3)} kg/day`
}

export function AnalyticsView({
  chartRange,
  irrigationEvents,
  loadingState,
  onChartRangeChange,
  runWeekAnalysis,
  setWeekRange,
  summary,
  weekAnalysis,
  weekAnalysisState,
  weekLoading,
  weekRange,
  weekSeries,
  readings,
}: {
  chartRange: ChartRange
  irrigationEvents: IrrigationEvent[]
  loadingState: DashboardLoadingState
  onChartRangeChange: (value: ChartRange) => void
  runWeekAnalysis: () => void
  setWeekRange: React.Dispatch<
    React.SetStateAction<{ from: string; to: string }>
  >
  summary: ExperimentSummary | null
  weekAnalysis: WeekAnalysisResult | null
  weekAnalysisState: CloudState
  weekLoading: boolean
  weekRange: { from: string; to: string }
  weekSeries: SeriesRow[]
  readings: NormalizedReading[]
}) {
  const averageDailyUse = average(
    summary?.dailyWaterUse.map((row) => row.waterUseKg) ?? []
  )
  const baseline = summary?.baseline
  const parsedAt = weekAnalysis?.generatedAt
    ? formatManilaDateTime(weekAnalysis.generatedAt)
    : null
  const chartsLoading = loadingState.summaryLoading

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard
          label="Baseline Drift"
          value={slope(baseline?.slopeKgPerDay ?? null)}
          detail={baseline ? baselineVerdictLabel(baseline.verdict) : "Need checkpoint weights"}
          icon={ScaleIcon}
          loading={loadingState.summaryLoading}
        />
        <MetricCard
          label="Average Checkpoint Loss"
          value={kg(averageDailyUse)}
          detail={`${summary?.dailyWaterUse.length ?? 0} usable watering windows`}
          icon={DropletsIcon}
          loading={loadingState.summaryLoading}
        />
        <MetricCard
          label="Watering Recovery Windows"
          value={String(summary?.wateringRecovery.length ?? 0)}
          detail="Root-zone samples within 2 h after watering"
          icon={ClockIcon}
          loading={loadingState.summaryLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Full Week Parse</CardTitle>
          <CardDescription>
            Chart tabs stay bucketed for speed; full-week parsing is explicit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <FieldGroup className="flex flex-col gap-2 lg:flex-row lg:gap-4">
              <Field>
                <FieldLabel htmlFor="week-from">From</FieldLabel>
                <Input
                  id="week-from"
                  type="datetime-local"
                  value={weekRange.from}
                  disabled={weekAnalysisState.status === "loading"}
                  onChange={(event) =>
                    setWeekRange((current) => ({
                      ...current,
                      from: event.target.value,
                    }))
                  }
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="week-to">To</FieldLabel>
                <Input
                  id="week-to"
                  type="datetime-local"
                  value={weekRange.to}
                  disabled={weekAnalysisState.status === "loading"}
                  onChange={(event) =>
                    setWeekRange((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                  autoComplete="off"
                />
              </Field>
            </FieldGroup>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <Button
                type="button"
                onClick={runWeekAnalysis}
                disabled={weekAnalysisState.status === "loading"}
              >
                {weekAnalysisState.status === "loading" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <DatabaseIcon data-icon="inline-start" />
                )}
                {weekAnalysisState.status === "loading"
                  ? "Parsing Full Week..."
                  : "Parse Full Week"}
              </Button>
              {weekAnalysis && (
                <Badge variant="secondary">Full-Resolution Metrics</Badge>
              )}
            </div>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            {weekAnalysisState.message}
            {parsedAt ? ` at ${parsedAt}` : ""}
            {weekAnalysis ? `; ${weekAnalysis.rowCount} rows parsed.` : ""}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <ChartCardHeader
            title="Temperature + Irrigation"
            description="Bucketed probe temperatures with watering markers."
            chartRange={chartRange}
            loading={loadingState.summaryRefreshing}
            onChartRangeChange={onChartRangeChange}
          />
          <CardContent>
            {chartsLoading ? (
              <ChartSkeleton />
            ) : (
              <TemperatureChart
                data={summary?.temperatureSeries ?? []}
                markers={summary?.irrigationMarkers ?? []}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <ChartCardHeader
            title="Baseline Drift"
            description="Initial and final checkpoint mass per watering day."
            chartRange={chartRange}
            loading={loadingState.summaryRefreshing}
            onChartRangeChange={onChartRangeChange}
          />
          <CardContent>
            {chartsLoading ? (
              <ChartSkeleton className="h-70" />
            ) : (
              <ChartContainer config={chartConfig} className="h-70 w-full aspect-auto">
                <LineChart data={summary?.baseline.points ?? []} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    dataKey="finalMassKg"
                    type="monotone"
                    stroke="var(--color-finalMassKg)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="initialMassKg"
                    type="monotone"
                    stroke="var(--color-initialMassKg)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <ChartCardHeader
            title="Checkpoint Weight Loss"
            description="First logged weight minus latest logged weight."
            chartRange={chartRange}
            loading={loadingState.summaryRefreshing}
            onChartRangeChange={onChartRangeChange}
          />
          <CardContent>
            {chartsLoading ? (
              <ChartSkeleton className="h-65" />
            ) : (
              <ChartContainer config={chartConfig} className="h-65 w-full aspect-auto">
                <BarChart data={summary?.dailyWaterUse ?? []} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="waterUseKg" fill="var(--color-waterUseKg)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <ChartCardHeader
            title="Watering Window Change"
            description="Mass change across logged 10-minute checkpoints."
            chartRange={chartRange}
            loading={loadingState.summaryRefreshing}
            onChartRangeChange={onChartRangeChange}
          />
          <CardContent>
            {chartsLoading ? (
              <ChartSkeleton className="h-65" />
            ) : (
              <ChartContainer config={chartConfig} className="h-65 w-full aspect-auto">
                <BarChart data={summary?.checkpointDrainage ?? []} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Bar dataKey="drainageKg" fill="var(--color-drainageKg)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <ChartCardHeader
            title="Root Temperature Swing"
            description="Daily max minus min for the root-zone probe."
            chartRange={chartRange}
            loading={loadingState.summaryRefreshing}
            onChartRangeChange={onChartRangeChange}
          />
          <CardContent>
            {chartsLoading ? (
              <ChartSkeleton className="h-65" />
            ) : (
              <ChartContainer config={chartConfig} className="h-65 w-full aspect-auto">
                <BarChart data={summary?.swingData ?? []} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="swing" fill="var(--color-swing)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <ChartCardHeader
            title="Watering Recovery Windows"
            description="Root-zone temperature change within 2 h after watering."
            chartRange={chartRange}
            loading={loadingState.summaryRefreshing}
            onChartRangeChange={onChartRangeChange}
          />
          <CardContent>
            {chartsLoading ? (
              <ChartSkeleton className="h-65" />
            ) : (
              <ChartContainer config={chartConfig} className="h-65 w-full aspect-auto">
                <BarChart data={summary?.wateringRecovery ?? []} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="event" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Bar dataKey="delta" fill="var(--chart-4)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-1 pt-2">
        <h2 className="text-base font-semibold">Thermal Patterns</h2>
        <p className="text-sm text-muted-foreground">
          Always the last 7 days, independent of the range tabs above.
        </p>
      </div>
      <ThermalPatternsSection
        events={irrigationEvents}
        loading={weekLoading}
        rows={weekSeries}
      />
      <SensorHealthCard readings={readings} />
    </div>
  )
}
