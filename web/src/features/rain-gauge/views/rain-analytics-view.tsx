"use client"

import {
  BarChart3Icon,
  DownloadIcon,
  GaugeIcon,
  LineChartIcon,
  UploadCloudIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ChartCardHeader } from "@/features/dashboard/components/chart-card-header"
import { ChartSkeleton } from "@/features/dashboard/components/loading-states"
import { MetricCard } from "@/features/dashboard/components/metric-card"
import { CalibrationManualEntry } from "@/features/rain-gauge/components/calibration-manual-entry"
import {
  CalibrationVolumeChart,
  RainRateChart,
  RainTotalsChart,
} from "@/features/rain-gauge/components/rain-gauge-charts"
import {
  DailyTotalsCard,
  IntensityCard,
  RainEventsCard,
  TipIntervalCard,
} from "@/features/rain-gauge/components/rain-insights"
import { formatNumber } from "@/features/rain-gauge/lib/format"
import type { RainGaugeDashboardState } from "@/features/rain-gauge/hooks/use-rain-gauge-dashboard"

export function RainAnalyticsView({
  rain,
}: {
  rain: RainGaugeDashboardState
}) {
  const calibration = rain.calibration

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={GaugeIcon}
          label="Calibration Mean"
          loading={rain.loading.calibration}
          value={`${formatNumber(calibration?.summary.meanPairAverageMl)} ml`}
          detail={calibration?.confidence.label ?? "Import a calibration CSV"}
        />
        <MetricCard
          icon={BarChart3Icon}
          label="Uniformity"
          loading={rain.loading.calibration}
          value={`${formatNumber(calibration?.summary.withinRangePct)}%`}
          detail={`${calibration?.summary.withinRangeCount ?? 0} of ${
            calibration?.summary.trialCount ?? 0
          } trials within range`}
        />
        <MetricCard
          icon={LineChartIcon}
          label="Variation"
          loading={rain.loading.calibration}
          value={`${formatNumber(
            calibration?.summary.coefficientOfVariationPct
          )}%`}
          detail="Pair average coefficient of variation"
        />
        <MetricCard
          icon={UploadCloudIcon}
          label="Sync"
          loading={rain.loading.sync}
          value={rain.syncState.status === "synced" ? "Synced" : "Manual"}
          detail={rain.syncState.message}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle>Calibration Import</CardTitle>
              <CardDescription>
                Import the loose rain gauge CSV to recompute calibration metrics.
              </CardDescription>
            </div>
            {calibration && <Badge variant="secondary">{calibration.confidence.label}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="calibration-csv">Calibration CSV</FieldLabel>
              <Input
                id="calibration-csv"
                name="calibration-csv"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) {
                    return
                  }
                  file.text().then(rain.importCalibrationCsv)
                  event.target.value = ""
                }}
              />
              <FieldDescription>
                The parser accepts wide spreadsheet exports with paired bucket
                volume columns and footer notes.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={rain.exportCalibration}
              disabled={rain.calibrationTrials.length === 0}
            >
              <DownloadIcon data-icon="inline-start" />
              Calibration CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={rain.exportAnalytics}
              disabled={rain.readings.length === 0 && rain.calibrationTrials.length === 0}
            >
              <DownloadIcon data-icon="inline-start" />
              Analytics CSV
            </Button>
            <Button
              type="button"
              onClick={rain.syncToSupabase}
              disabled={
                rain.readings.length === 0 ||
                rain.loading.sync ||
                rain.dataSource === "simulated" ||
                rain.syncState.status === "not_configured"
              }
            >
              {rain.loading.sync ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <UploadCloudIcon data-icon="inline-start" />
              )}
              Sync To Supabase
            </Button>
            {rain.queuedSessions > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void rain.retryQueuedSync()}
                disabled={rain.loading.sync}
              >
                Retry Queued ({rain.queuedSessions})
              </Button>
            )}
          </div>

          {rain.syncState.status === "not_configured" && (
            <Alert>
              <AlertTitle>Supabase Sync Disabled</AlertTitle>
              <AlertDescription>{rain.syncState.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <CalibrationManualEntry rain={rain} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <ChartCardHeader
            chartRange={rain.chartRange}
            description="Sliding-window rain rate from the ESP32 AP packets."
            onChartRangeChange={rain.setChartRange}
            title="Rain Rate"
          />
          <CardContent>
            {rain.loading.initial ? (
              <ChartSkeleton />
            ) : (
              <RainRateChart data={rain.summary.series} />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <ChartCardHeader
            chartRange={rain.chartRange}
            description="Hourly local totals from cumulative rainfall deltas."
            onChartRangeChange={rain.setChartRange}
            title="Hourly Totals"
          />
          <CardContent>
            {rain.loading.initial ? (
              <ChartSkeleton />
            ) : (
              <RainTotalsChart data={rain.summary.hourlyTotals} mode="hourly" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-1 pt-2">
        <h2 className="text-base font-semibold">Rain Patterns</h2>
        <p className="text-sm text-muted-foreground">
          Computed from every reading in the current session.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <RainEventsCard readings={rain.readings} />
        <IntensityCard readings={rain.readings} />
        <DailyTotalsCard summary={rain.summary} />
        <TipIntervalCard summary={rain.summary} />
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Calibration Volumes</CardTitle>
          <CardDescription>
            Bucket 1, bucket 2, and paired average from imported trials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rain.loading.calibration ? (
            <ChartSkeleton />
          ) : rain.calibrationTrials.length > 0 ? (
            <CalibrationVolumeChart data={rain.calibrationTrials} />
          ) : (
            <div className="rounded-lg border p-6 text-sm text-muted-foreground">
              Import the rain gauge calibration CSV to show calibration charts.
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
