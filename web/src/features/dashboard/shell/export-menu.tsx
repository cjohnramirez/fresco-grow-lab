"use client"

import * as React from "react"
import {
  DownloadIcon,
  DropletsIcon,
  FileDownIcon,
  ScaleIcon,
  TableIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
  CloudState,
  DashboardLoadingState,
} from "@/features/dashboard/lib/dashboard-types"
import {
  downloadCsv,
  irrigationEventsToCsv,
  irrigationWeightLogsToCsv,
  readingsToCsv,
  weekAnalysisToCsv,
} from "@/lib/experiment/csv"
import type {
  IrrigationEvent,
  NormalizedReading,
  WeekAnalysisResult,
} from "@/lib/experiment/types"

export type ExportMenuProps = {
  cloudState: CloudState
  eventsError: unknown
  irrigationEvents: IrrigationEvent[]
  loadingState: DashboardLoadingState
  readings: NormalizedReading[]
  sessionId: string
  weekAnalysis: WeekAnalysisResult | null
}

type ExportItem = {
  id: string
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  disabled?: boolean
  run: () => void
}

// Shared by the header Export button and the phone overflow menu.
export function useTemperatureExports({
  cloudState,
  eventsError,
  irrigationEvents,
  loadingState,
  readings,
  sessionId,
  weekAnalysis,
}: ExportMenuProps) {
  const isPreparing =
    cloudState.status === "loading" ||
    loadingState.readingsLoading ||
    loadingState.eventsLoading
  const errorMessage = getExportErrorMessage(cloudState, eventsError)

  const items: ExportItem[] = [
    {
      id: "readings",
      label: "Current Readings Page",
      icon: TableIcon,
      run: () =>
        handleCsvExport({
          filename: `${sessionId}-current-temperature-page.csv`,
          content: readingsToCsv(readings),
          label: "Current readings page",
        }),
    },
    {
      id: "events",
      label: "Active Irrigation Events",
      icon: DropletsIcon,
      run: () =>
        handleCsvExport({
          filename: `${sessionId}-irrigation-events.csv`,
          content: irrigationEventsToCsv(irrigationEvents),
          label: "Active irrigation events",
        }),
    },
    {
      id: "weights",
      label: "Irrigation Weight Logs",
      icon: ScaleIcon,
      run: () =>
        handleCsvExport({
          filename: `${sessionId}-irrigation-weight-logs.csv`,
          content: irrigationWeightLogsToCsv(irrigationEvents),
          label: "Irrigation weight logs",
        }),
    },
    {
      id: "week",
      label: "Full-Week Analysis",
      icon: FileDownIcon,
      disabled: !weekAnalysis,
      run: () => {
        if (!weekAnalysis) {
          toast.message("Parse the full week before exporting analysis.")
          return
        }
        handleCsvExport({
          filename: `${sessionId}-full-week-analysis.csv`,
          content: weekAnalysisToCsv(weekAnalysis),
          label: "Full-week analysis",
        })
      },
    },
  ]

  return { errorMessage, isPreparing, items }
}

export function ExportMenuItems({ items }: { items: ExportItem[] }) {
  return items.map((item) => (
    <DropdownMenuItem key={item.id} disabled={item.disabled} onClick={item.run}>
      <item.icon aria-hidden="true" />
      {item.label}
      <DropdownMenuShortcut>.csv</DropdownMenuShortcut>
    </DropdownMenuItem>
  ))
}

export function ExportMenu({
  compact = false,
  ...props
}: ExportMenuProps & {
  // Icon-only trigger for narrower headers.
  compact?: boolean
}) {
  const { errorMessage, isPreparing, items } = useTemperatureExports(props)

  if (isPreparing || errorMessage) {
    const message = errorMessage ?? "Preparing CSV exports"
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex" tabIndex={0} aria-label={message} />}
        >
          <Button
            type="button"
            variant="outline"
            size={compact ? "icon" : "default"}
            disabled
            aria-label={message}
          >
            {isPreparing ? (
              <Spinner data-icon={compact ? undefined : "inline-start"} />
            ) : (
              <DownloadIcon data-icon={compact ? undefined : "inline-start"} />
            )}
            {!compact && (isPreparing ? "Preparing..." : "Export Unavailable")}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-pretty">
          {errorMessage ??
            "Exports are available after Supabase readings and events finish loading."}
        </TooltipContent>
      </Tooltip>
    )
  }

  const trigger = (
    <DropdownMenuTrigger
      render={
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : "default"}
          aria-label={compact ? "Export CSV" : undefined}
        />
      }
    >
      <DownloadIcon data-icon={compact ? undefined : "inline-start"} aria-hidden="true" />
      {!compact && "Export"}
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {compact ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent>Export CSV</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent className="w-64" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>CSV Exports</DropdownMenuLabel>
          <ExportMenuItems items={items} />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Readings export the current table page. Use Parse Full Week for
          complete metrics.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getExportErrorMessage(cloudState: CloudState, eventsError: unknown) {
  if (cloudState.status === "error") {
    return cloudState.message
  }

  if (eventsError) {
    return eventsError instanceof Error
      ? eventsError.message
      : "Supabase events could not be loaded."
  }

  return null
}

function handleCsvExport({
  content,
  filename,
  label,
}: {
  content: string
  filename: string
  label: string
}) {
  try {
    downloadCsv(filename, content)
    toast.success(`${label} exported`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "CSV export failed.")
  }
}
