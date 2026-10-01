"use client"

import * as React from "react"
import { toast } from "sonner"

import type { IrrigationEventResponse } from "@/features/dashboard/lib/dashboard-types"
import type { TemperatureDataSource } from "@/features/telemetry/data-source"
import {
  deviceTemperatureStore,
  simulatedTemperatureStore,
  updateLocalEvents,
} from "@/features/telemetry/temperature-stores"
import type { IrrigationEvent } from "@/lib/experiment/types"
import {
  archiveLocalIrrigationEvent,
  createLocalIrrigationEvent,
  updateLocalIrrigationEvent,
} from "@/lib/telemetry/local-irrigation"

import { sendJson } from "./dashboard-api"

function localStoreFor(dataSource: TemperatureDataSource) {
  if (dataSource === "simulated") return simulatedTemperatureStore
  if (dataSource === "device") return deviceTemperatureStore
  return null
}

function replaceLocalEvent(
  dataSource: TemperatureDataSource,
  id: string,
  update: (event: IrrigationEvent) => IrrigationEvent
) {
  const store = localStoreFor(dataSource)!
  const event = store.getSnapshot().events.find((candidate) => candidate.id === id)
  if (!event) {
    throw new Error("Irrigation event not found.")
  }
  const next = update(event)
  updateLocalEvents(store, (events) =>
    events.map((candidate) => (candidate.id === id ? next : candidate))
  )
  return next
}

// Watering writes go to Supabase in cloud mode. Simulated and USB sessions
// keep events in the browser, validated by the same rules as the API routes.
export function useIrrigationActions({
  bagId,
  dataSource,
  mutateCloudData,
}: {
  bagId: string
  dataSource: TemperatureDataSource
  mutateCloudData: () => Promise<void>
}) {
  const createIrrigationEvent = React.useCallback(
    async (input: Record<string, unknown>) => {
      const store = localStoreFor(dataSource)
      if (store) {
        const event = createLocalIrrigationEvent(store.getSnapshot().events, {
          bagId,
          ...input,
        })
        updateLocalEvents(store, (events) => [...events, event])
        toast.success("Watering logged (stored in this browser)")
        return event
      }

      const payload = await sendJson<IrrigationEventResponse>(
        "/api/irrigation-events",
        {
          method: "POST",
          body: JSON.stringify({ bagId, ...input }),
        }
      )
      await mutateCloudData()
      toast.success("Watering logged")
      return payload.event
    },
    [bagId, dataSource, mutateCloudData]
  )

  const updateIrrigationEvent = React.useCallback(
    async (id: string, input: Record<string, unknown>) => {
      if (localStoreFor(dataSource)) {
        const event = replaceLocalEvent(dataSource, id, (current) =>
          updateLocalIrrigationEvent(current, input)
        )
        toast.success("Event updated")
        return event
      }

      const payload = await sendJson<IrrigationEventResponse>(
        `/api/irrigation-events/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        }
      )
      await mutateCloudData()
      toast.success("Event updated")
      return payload.event
    },
    [dataSource, mutateCloudData]
  )

  const archiveIrrigationEvent = React.useCallback(
    async (id: string) => {
      if (localStoreFor(dataSource)) {
        replaceLocalEvent(dataSource, id, (current) =>
          archiveLocalIrrigationEvent(current)
        )
        toast.success("Event archived")
        return
      }

      await sendJson<IrrigationEventResponse>(`/api/irrigation-events/${id}`, {
        method: "DELETE",
      })
      await mutateCloudData()
      toast.success("Event archived")
    },
    [dataSource, mutateCloudData]
  )

  return {
    archiveIrrigationEvent,
    createIrrigationEvent,
    updateIrrigationEvent,
  }
}
