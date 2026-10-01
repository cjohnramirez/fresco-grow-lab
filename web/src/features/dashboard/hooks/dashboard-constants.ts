import type { CloudState, ReadingQuery } from "@/features/dashboard/lib/dashboard-types"
import type { IrrigationEvent, NormalizedReading } from "@/lib/experiment/types"

export const DEFAULT_READING_QUERY: ReadingQuery = {
  channel: "all",
  page: 1,
  pageSize: 100,
  status: "all",
}

export const INITIAL_SESSION_ID = "session-supabase"

export const INITIAL_WEEK_ANALYSIS_STATE: CloudState = {
  status: "idle",
  message: "Not parsed",
  rowCount: 0,
  latestFetchAt: null,
}

export const EMPTY_READINGS: NormalizedReading[] = []
export const EMPTY_EVENTS: IrrigationEvent[] = []

// Grow bags selectable in the Monitor view. Cloud mode filters Supabase rows by
// bag_id; simulated mode generates a separate watering history per bag.
export const BAG_IDS = ["bag-1", "bag-2", "bag-3"] as const
