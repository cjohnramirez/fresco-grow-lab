"use client"

import * as React from "react"
import { InfoIcon, SparklesIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ConnectHardwareButton } from "@/features/hardware/connect-hardware-button"
import { cn } from "@/lib/utils"

const EXPLANATION =
  "Readings are generated live from a model of a Cagayan de Oro grow bag and rain gauge. Have an ESP32? Flash it from this page and stream your own sensors."

const DISMISS_KEY = "fresco-simulated-notice-dismissed"
const listeners = new Set<() => void>()
let dismissedThisSession = false

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function readDismissed() {
  if (dismissedThisSession) return true
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

function dismissNotice() {
  dismissedThisSession = true
  try {
    window.localStorage.setItem(DISMISS_KEY, "1")
  } catch {
    // Blocked storage: stays dismissed until reload.
  }
  for (const listener of listeners) listener()
}

// Wide headers: a compact pill whose tooltip explains the simulation.
export function SimulatedDataChip({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="secondary"
            tabIndex={0}
            className={cn("h-7 cursor-help gap-1.5 px-2.5", className)}
          />
        }
      >
        <SparklesIcon aria-hidden="true" />
        Simulated data
        <InfoIcon aria-hidden="true" className="opacity-60" />
        <span className="sr-only">. {EXPLANATION}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{EXPLANATION}</TooltipContent>
    </Tooltip>
  )
}

// Narrow screens: one slim, dismissible line under the header that reuses
// the Connect Hardware button.
export function SimulatedDataStrip({
  className,
  onConnectHardware,
}: {
  className?: string
  onConnectHardware: () => void
}) {
  const dismissed = React.useSyncExternalStore(
    subscribe,
    readDismissed,
    // Server render: hidden, so the strip never flashes for returning visitors.
    () => true
  )

  if (dismissed) {
    return null
  }

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 border-t bg-muted/40 px-3 py-1.5 text-sm sm:px-4",
        className
      )}
    >
      <SparklesIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-medium">Simulated data</span>
        <span className="sr-only">. {EXPLANATION}</span>
      </p>
      <ConnectHardwareButton size="sm" onClick={onConnectHardware} />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Dismiss simulated data notice"
        onClick={dismissNotice}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  )
}
