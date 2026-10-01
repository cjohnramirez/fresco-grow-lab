import {
  createIrrigationEventSchema,
  cutoffAtForWatering,
  isBeforeWateringCutoff,
  mergeWeightLog,
  updateIrrigationEventSchema,
} from "@/lib/experiment/irrigation"
import type { IrrigationEvent } from "@/lib/experiment/types"

// In-browser versions of the irrigation API routes, used when the dashboard is
// on simulated or USB-device data. They apply the same schemas and rules as
// app/api/irrigation-events so visitors can try the full watering workflow
// without a database.

export class LocalIrrigationError extends Error {}

function firstIssue(issues: Array<{ message: string }>, fallback: string) {
  return issues[0]?.message ?? fallback
}

export function createLocalIrrigationEvent(
  events: IrrigationEvent[],
  input: Record<string, unknown>,
  now = new Date()
): IrrigationEvent {
  const parsed = createIrrigationEventSchema.safeParse(input)
  if (!parsed.success) {
    throw new LocalIrrigationError(firstIssue(parsed.error.issues, "Invalid event."))
  }
  if (!isBeforeWateringCutoff(parsed.data.wateredAt)) {
    throw new LocalIrrigationError("Watering must be logged before 6 PM Manila time.")
  }

  const hasOpenEvent = events.some(
    (event) =>
      event.bagId === parsed.data.bagId &&
      event.archivedAt === null &&
      Date.parse(event.cutoffAt) > now.getTime()
  )
  if (hasOpenEvent) {
    throw new LocalIrrigationError(
      "Finish the current 10-minute weigh schedule before starting another watering."
    )
  }

  const createdAt = now.toISOString()
  return {
    id: `local-${now.getTime().toString(36)}`,
    bagId: parsed.data.bagId,
    wateredAt: parsed.data.wateredAt,
    cutoffAt: cutoffAtForWatering(parsed.data.wateredAt),
    waterL: parsed.data.waterL,
    waterTempC: parsed.data.waterTempC,
    weightLogs: parsed.data.weightLogs,
    note: parsed.data.note,
    createdAt,
    archivedAt: null,
  }
}

export function updateLocalIrrigationEvent(
  event: IrrigationEvent,
  input: Record<string, unknown>
): IrrigationEvent {
  const parsed = updateIrrigationEventSchema.safeParse(input)
  if (!parsed.success) {
    throw new LocalIrrigationError(
      firstIssue(parsed.error.issues, "Invalid event update.")
    )
  }

  const next = { ...parsed.data }
  if (next.wateredAt !== undefined) {
    if (!isBeforeWateringCutoff(next.wateredAt)) {
      throw new LocalIrrigationError("Watering must be logged before 6 PM Manila time.")
    }
    next.cutoffAt = cutoffAtForWatering(next.wateredAt)
  }

  const scheduled = {
    ...event,
    wateredAt: next.wateredAt ?? event.wateredAt,
    cutoffAt: next.cutoffAt ?? event.cutoffAt,
    weightLogs: next.weightLogs ?? event.weightLogs,
  }
  const weightLogs = next.weightLog
    ? mergeWeightLog(scheduled, next.weightLog)
    : scheduled.weightLogs

  return {
    ...scheduled,
    bagId: next.bagId ?? event.bagId,
    waterL: next.waterL ?? event.waterL,
    waterTempC: next.waterTempC === undefined ? event.waterTempC : next.waterTempC,
    note: next.note ?? event.note,
    archivedAt: next.archivedAt === undefined ? event.archivedAt : next.archivedAt,
    weightLogs,
  }
}

export function archiveLocalIrrigationEvent(event: IrrigationEvent, now = new Date()) {
  return { ...event, archivedAt: now.toISOString() }
}
