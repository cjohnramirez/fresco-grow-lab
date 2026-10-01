"use client"

import { EllipsisVerticalIcon, RefreshCwIcon, UsbIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CloudBadge } from "@/features/dashboard/shell/cloud-badge"
import {
  ExportMenu,
  ExportMenuItems,
  useTemperatureExports,
} from "@/features/dashboard/shell/export-menu"
import type { useFrescoDashboard } from "@/features/dashboard/hooks/use-fresco-dashboard"
import { ConnectHardwareButton } from "@/features/hardware/connect-hardware-button"
import { RainGaugeStatusBadge } from "@/features/rain-gauge/components/rain-gauge-status-badge"
import type { RainGaugeDashboardState } from "@/features/rain-gauge/hooks/use-rain-gauge-dashboard"
import { RAIN_SOURCES, TEMPERATURE_SOURCES } from "@/features/telemetry/data-source"
import { DataSourceSelect } from "@/features/telemetry/data-source-select"
import {
  SimulatedDataChip,
  SimulatedDataStrip,
} from "@/features/telemetry/simulated-data-notice"

type Temperature = ReturnType<typeof useFrescoDashboard>

// Header layout follows the header's own width (container queries), so it
// adapts whether the sidebar is expanded, collapsed or a mobile sheet:
//   < @xl  (phones)   title, data source, and a "more" menu for actions
//   @xl    icon-only actions with tooltips
//   @4xl   + simulated-data chip and status badge (narrower: a slim strip
//          under the header row instead)
//   @5xl   + action labels
export function DashboardHeader({
  activeDashboard,
  onConnectHardware,
  rain,
  surface,
  temperature,
  title,
  shortTitle,
}: {
  activeDashboard: "temperature" | "rain-gauge"
  onConnectHardware: () => void
  rain: RainGaugeDashboardState
  surface: "dashboard" | "docs"
  temperature: Temperature
  title: string
  shortTitle: string
}) {
  const onDashboard = surface === "dashboard"
  const isTemperature = activeDashboard === "temperature"
  const simulated = isTemperature
    ? temperature.dataSource === "simulated"
    : rain.dataSource === "simulated"

  return (
    <header className="@container/header border-b">
      <div className="flex min-h-14 items-center gap-2 px-3 py-2 sm:px-4">
        <SidebarTrigger />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
          <span className="@2xl/header:hidden">{shortTitle}</span>
          <span className="hidden @2xl/header:inline">{title}</span>
        </h1>

        {onDashboard && (
          <div className="flex shrink-0 items-center gap-2">
            {simulated ? (
              <SimulatedDataChip className="hidden @4xl/header:inline-flex" />
            ) : isTemperature ? (
              <span className="hidden @4xl/header:inline-flex">
                <CloudBadge dataSource={temperature.dataSource} state={temperature.cloudState} />
              </span>
            ) : null}
            {!isTemperature && (
              <span className="hidden @4xl/header:inline-flex">
                <RainGaugeStatusBadge state={rain.connectionState} />
              </span>
            )}

            {isTemperature ? (
              <DataSourceSelect
                options={TEMPERATURE_SOURCES}
                value={temperature.dataSource}
                onValueChange={temperature.setDataSource}
              />
            ) : (
              <DataSourceSelect
                options={RAIN_SOURCES}
                value={rain.dataSource}
                onValueChange={rain.setDataSource}
              />
            )}

            <div className="hidden items-center gap-2 @xl/header:flex">
              {isTemperature && (
                <>
                  <ExportActions temperature={temperature} />
                  <RefreshButton temperature={temperature} />
                </>
              )}
              <ConnectHardwareButton
                className="@5xl/header:hidden"
                iconOnly
                onClick={onConnectHardware}
              />
              <ConnectHardwareButton
                className="hidden @5xl/header:inline-flex"
                onClick={onConnectHardware}
              />
            </div>

            <div className="@xl/header:hidden">
              <OverflowMenu
                isTemperature={isTemperature}
                onConnectHardware={onConnectHardware}
                temperature={temperature}
              />
            </div>
          </div>
        )}
      </div>
      {onDashboard && simulated && (
        <SimulatedDataStrip
          className="@4xl/header:hidden"
          onConnectHardware={onConnectHardware}
        />
      )}
    </header>
  )
}

function exportProps(temperature: Temperature) {
  return {
    cloudState: temperature.cloudState,
    eventsError: temperature.eventsError,
    irrigationEvents: temperature.irrigationEvents,
    loadingState: temperature.loadingState,
    readings: temperature.readings,
    sessionId: temperature.sessionId,
    weekAnalysis: temperature.weekAnalysis,
  }
}

function ExportActions({ temperature }: { temperature: Temperature }) {
  return (
    <>
      <span className="@5xl/header:hidden">
        <ExportMenu compact {...exportProps(temperature)} />
      </span>
      <span className="hidden @5xl/header:inline-flex">
        <ExportMenu {...exportProps(temperature)} />
      </span>
    </>
  )
}

function RefreshButton({ temperature }: { temperature: Temperature }) {
  const refreshing = temperature.loadingState.cloudRefreshing
  const icon = refreshing ? (
    <Spinner aria-hidden="true" />
  ) : (
    <RefreshCwIcon aria-hidden="true" />
  )

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon"
              className="@5xl/header:hidden"
              aria-label={refreshing ? "Refreshing" : "Refresh"}
              onClick={temperature.refreshFromSupabase}
              disabled={refreshing}
            />
          }
        >
          {icon}
        </TooltipTrigger>
        <TooltipContent>Refresh</TooltipContent>
      </Tooltip>
      <Button
        type="button"
        className="hidden @5xl/header:inline-flex"
        onClick={temperature.refreshFromSupabase}
        disabled={refreshing}
      >
        {refreshing ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
        )}
        {refreshing ? "Refreshing..." : "Refresh"}
      </Button>
    </>
  )
}

function OverflowMenu({
  isTemperature,
  onConnectHardware,
  temperature,
}: {
  isTemperature: boolean
  onConnectHardware: () => void
  temperature: Temperature
}) {
  const exports = useTemperatureExports(exportProps(temperature))
  const exportsReady = !exports.isPreparing && !exports.errorMessage

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" size="icon" aria-label="More actions" />}
      >
        <EllipsisVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {isTemperature && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Export CSV</DropdownMenuLabel>
              {exportsReady ? (
                <ExportMenuItems items={exports.items} />
              ) : (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {exports.errorMessage ?? "Preparing exports..."}
                </p>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={temperature.loadingState.cloudRefreshing}
              onClick={temperature.refreshFromSupabase}
            >
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={onConnectHardware}>
          <UsbIcon aria-hidden="true" />
          Connect Hardware
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
