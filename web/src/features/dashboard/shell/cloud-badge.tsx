import { Badge } from "@/components/ui/badge"
import type { CloudState } from "@/features/dashboard/lib/dashboard-types"
import type { TemperatureDataSource } from "@/features/telemetry/data-source"

export function CloudBadge({
  dataSource = "cloud",
  state,
}: {
  dataSource?: TemperatureDataSource
  state: CloudState
}) {
  if (dataSource === "simulated") {
    return <Badge variant="secondary">Simulated data</Badge>
  }

  if (dataSource === "device") {
    return state.rowCount > 0 ? (
      <Badge>USB live</Badge>
    ) : (
      <Badge variant="outline">USB waiting</Badge>
    )
  }

  if (state.status === "error") {
    return <Badge variant="destructive">Supabase error</Badge>
  }

  if (state.status === "ready") {
    return <Badge>Supabase ready</Badge>
  }

  return <Badge variant="outline">{state.status}</Badge>
}
