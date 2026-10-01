"use client"

import { ExternalLinkIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export const FRESCO_SITE_URL = "https://fresco.ph/"

// Small external-link button placed beside every mention of Fresco
// Greenovations Inc. in the app.
export function FrescoSiteLink({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            nativeButton={false}
            className={cn("shrink-0 text-muted-foreground hover:text-foreground", className)}
            render={
              <a
                href={FRESCO_SITE_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Fresco Greenovations website, fresco.ph (opens in a new tab)"
              />
            }
          />
        }
      >
        <ExternalLinkIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>Visit fresco.ph</TooltipContent>
    </Tooltip>
  )
}
