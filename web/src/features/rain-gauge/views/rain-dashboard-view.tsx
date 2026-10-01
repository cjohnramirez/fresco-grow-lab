"use client"

import {
  ActivityIcon,
  DropletsIcon,
  GaugeIcon,
  RadioIcon,
  WavesIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { ChartCardHeader } from "@/features/dashboard/components/chart-card-header"
import { ChartSkeleton } from "@/features/dashboard/components/loading-states"
import { MetricCard } from "@/features/dashboard/components/metric-card"
import { RainfallChart } from "@/features/rain-gauge/components/rain-gauge-charts"
import { RainGaugeStatusBadge } from "@/features/rain-gauge/components/rain-gauge-status-badge"
import { formatDateTime, formatNumber } from "@/features/rain-gauge/lib/format"
import type { RainGaugeDashboardState } from "@/features/rain-gauge/hooks/use-rain-gauge-dashboard"

export function RainDashboardView({
  rain,
}: {
  rain: RainGaugeDashboardState
}) {
  const latest = rain.summary.latest

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {rain.error && (
        <Alert variant="destructive">
          <AlertTitle>Rain Gauge Error</AlertTitle>
          <AlertDescription>{rain.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={DropletsIcon}
          label="Rainfall"
          loading={rain.loading.initial}
          value={`${formatNumber(rain.summary.totalRainfallMl)} ml`}
          detail={
            rain.summary.totalRainfallMm !== null
              ? `${formatNumber(rain.summary.totalRainfallMm)} mm with catchment area`
              : "Millimeter depth needs catchment area"
          }
        />
        <MetricCard
          icon={GaugeIcon}
          label="Physical Tips"
          loading={rain.loading.initial}
          value={formatNumber(latest?.tips, { maximumFractionDigits: 1 })}
          detail={`${formatNumber(latest?.edges, {
            maximumFractionDigits: 0,
          })} counted edges`}
        />
        <MetricCard
          icon={ActivityIcon}
          label="Current Rate"
          loading={rain.loading.initial}
          value={`${formatNumber(latest?.rateMlPerMin)} ml/min`}
          detail={`Peak ${formatNumber(rain.summary.maxRateMlPerMin)} ml/min`}
        />
        <MetricCard
          icon={RadioIcon}
          label={rain.dataSource === "ap" ? "AP Status" : "Source"}
          loading={rain.loading.initial || rain.loading.status}
          value={rain.connectionState === "connected" ? "Live" : "Local"}
          detail={`${rain.status?.clients ?? 0} AP clients, ${
            rain.status?.sseClients ?? 0
          } SSE clients`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <ChartCardHeader
            chartRange={rain.chartRange}
            description="Realtime AP readings stored locally in this browser."
            loading={rain.connectionState === "connecting"}
            onChartRangeChange={rain.setChartRange}
            title="Rainfall Trace"
          />
          <CardContent>
            {rain.loading.initial ? (
              <ChartSkeleton />
            ) : (
              <RainfallChart data={rain.summary.series} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Connection</div>
                <p className="text-sm text-muted-foreground wrap-break-word">
                  {rain.dataSource === "ap"
                    ? rain.apBaseUrl
                    : rain.dataSource === "device"
                      ? "USB serial"
                      : "Simulated gauge"}
                </p>
              </div>
              <RainGaugeStatusBadge state={rain.connectionState} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-muted-foreground">Last Tip</div>
                <div>{formatDateTime(rain.summary.lastTipAt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Debounce</div>
                <div>{rain.status?.debounceMs ?? "--"} ms</div>
              </div>
              <div>
                <div className="text-muted-foreground">ml Per Tip</div>
                <div>{formatNumber(rain.status?.mlPerTip)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Pin</div>
                <div>GPIO {rain.status?.tipPin ?? 34}</div>
              </div>
            </div>
            {rain.summary.pendingHalfTip && (
              <Alert>
                <WavesIcon aria-hidden="true" />
                <AlertTitle>Pending Half Tip</AlertTitle>
                <AlertDescription>
                  The firmware has counted an odd edge. The next edge completes
                  the physical tip.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
