export type RainGaugeReadingPacket = {
  type: "rain_gauge"
  seq: number
  ms: number
  edges: number
  tips: number
  lastEdgeMs: number
  rainfallMl: number
  rainfallMm: number | null
  rateMlPerMin: number
  rateMmPerHr: number | null
}

export type RainGaugeStatusPacket = {
  type?: "rain_gauge"
  device: string
  uptimeMs: number
  sessionStartMs: number
  ssid: string
  ip: string
  clients: number
  sseClients: number
  tipPin: number
  debounceMs: number
  countsBothEdges: boolean
  mlPerTip: number
  catchmentAreaCm2: number | null
  mmPerTip: number | null
  edges: number
  tips: number
}

export type RainGaugeReading = RainGaugeReadingPacket & {
  id: string
  sessionId: string
  receivedAt: string
  source: "ap" | "import" | "sample" | "usb"
  raw: string
}

export type RainGaugeSession = {
  id: string
  label: string
  source: "ap" | "sample" | "usb"
  startedAt: string
  apBaseUrl: string
  mlPerTip: number | null
  catchmentAreaCm2: number | null
}

export type RainGaugeConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"

export type RainGaugeChartRange = "1h" | "1d" | "1w"

export type CalibrationTrial = {
  id: string
  sourceRow: number
  bucket1VolumeMl: number
  bucket2VolumeMl: number
  pairAverageMl: number
  method: string
  notes: string
}

export type CalibrationFooterNote = {
  sourceRow: number
  text: string
}

export type CalibrationSummary = {
  rowCount: number
  columnCount: number
  trialCount: number
  missingRows: number
  totalVolumeMl: number
  meanPairAverageMl: number | null
  minPairAverageMl: number | null
  maxPairAverageMl: number | null
  standardDeviationMl: number | null
  coefficientOfVariationPct: number | null
  bucket1MeanMl: number | null
  bucket2MeanMl: number | null
  bucketBiasMl: number | null
  bucket1CvPct: number | null
  bucket2CvPct: number | null
  meanAbsoluteDeltaMl: number | null
  withinRangeCount: number
  withinRangePct: number | null
  footerNotes: CalibrationFooterNote[]
}

export type CalibrationParseResult = {
  trials: CalibrationTrial[]
  summary: CalibrationSummary
}

export type RainGaugeSummary = {
  latest: RainGaugeReading | null
  pendingHalfTip: boolean
  totalReadings: number
  totalRainfallMl: number
  totalRainfallMm: number | null
  maxRateMlPerMin: number | null
  maxRateMmPerHr: number | null
  lastTipAt: string | null
  series: Array<{
    time: string
    rainfallMl: number
    rainfallMm: number | null
    rateMlPerMin: number
    rateMmPerHr: number | null
    tips: number
    edges: number
  }>
  hourlyTotals: Array<{ time: string; rainfallMl: number; rainfallMm: number | null }>
  dailyTotals: Array<{ day: string; rainfallMl: number; rainfallMm: number | null }>
  tipIntervals: Array<{ time: string; intervalSeconds: number }>
}

export type RainGaugeSyncState = {
  status: "idle" | "syncing" | "synced" | "not_configured" | "error"
  queued: number
  synced: number
  failed: number
  message: string
}
