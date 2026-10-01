"use client"

import * as React from "react"
import { CircleHelpIcon, DatabaseIcon, UsbIcon, ZapIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { FlashGuideDialog } from "./flash-guide-dialog"
import { FlashPanel } from "./flash-panel"
import { SupabasePanel } from "./supabase-panel"
import { UsbPanel } from "./usb-panel"

type HardwareTab = "flash" | "usb" | "supabase"

export function ConnectHardwareDialog({
  onOpenChange,
  onUseCloud,
  onUseStream,
  open,
}: {
  onOpenChange: (open: boolean) => void
  onUseCloud: () => void
  onUseStream: (dashboard: "temperature" | "rain-gauge") => void
  open: boolean
}) {
  const [tab, setTab] = React.useState<HardwareTab>("flash")
  const [guideOpen, setGuideOpen] = React.useState(false)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 pr-8">
              <DialogTitle>Connect Hardware</DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="How to flash and connect a board"
                onClick={() => setGuideOpen(true)}
              >
                <CircleHelpIcon />
              </Button>
            </div>
            <DialogDescription>
              Optional: run the dashboard on your own ESP32 sensors instead of
              simulated data.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as HardwareTab)}
            className="min-w-0"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="flash">
                <ZapIcon aria-hidden="true" />
                Flash
              </TabsTrigger>
              <TabsTrigger value="usb">
                <UsbIcon aria-hidden="true" />
                USB
              </TabsTrigger>
              <TabsTrigger value="supabase">
                <DatabaseIcon aria-hidden="true" />
                My Supabase
              </TabsTrigger>
            </TabsList>
            <TabsContent value="flash" className="pt-3">
              <FlashPanel
                onFlashed={() => setTab("usb")}
                onOpenGuide={() => setGuideOpen(true)}
              />
            </TabsContent>
            <TabsContent value="usb" className="pt-3">
              <UsbPanel
                onUseStream={(dashboard) => {
                  onUseStream(dashboard)
                  onOpenChange(false)
                }}
              />
            </TabsContent>
            <TabsContent value="supabase" className="pt-3">
              <SupabasePanel
                onUseCloud={() => {
                  onUseCloud()
                  onOpenChange(false)
                }}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <FlashGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  )
}
