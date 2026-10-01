"use client"

import { UsbIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// The one "Connect Hardware" button used in the header and the simulated-data
// strip, so both open the same dialog and look the same.
export function ConnectHardwareButton({
  className,
  iconOnly = false,
  onClick,
  size = "default",
}: {
  className?: string
  iconOnly?: boolean
  onClick: () => void
  size?: "default" | "sm"
}) {
  if (iconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size={size === "sm" ? "icon-sm" : "icon"}
              aria-label="Connect Hardware"
              className={className}
              onClick={onClick}
            />
          }
        >
          <UsbIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Connect Hardware</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      onClick={onClick}
    >
      <UsbIcon data-icon="inline-start" aria-hidden="true" />
      Connect Hardware
    </Button>
  )
}
