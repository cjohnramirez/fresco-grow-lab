import type {
  CalibrationTrial,
  RainGaugeReading,
  RainGaugeSession,
} from "./types"

const DB_NAME = "fresco-rain-gauge"
const DB_VERSION = 1

type StoreName = "sessions" | "readings" | "calibrationTrials" | "settings" | "syncQueue"

function ensureIndexedDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this browser.")
  }
}

function openDatabase() {
  ensureIndexedDb()

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id" })
      }

      if (!db.objectStoreNames.contains("readings")) {
        const store = db.createObjectStore("readings", { keyPath: "id" })
        store.createIndex("sessionId", "sessionId")
        store.createIndex("receivedAt", "receivedAt")
      }

      if (!db.objectStoreNames.contains("calibrationTrials")) {
        db.createObjectStore("calibrationTrials", { keyPath: "id" })
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" })
      }

      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id" })
      }
    }

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transaction<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void
) {
  return openDatabase().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const request = run(store)

        tx.oncomplete = () => {
          db.close()
          resolve(request ? request.result : undefined)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      })
  )
}

function readAll<T>(storeName: StoreName) {
  return transaction<T[]>(storeName, "readonly", (store) => store.getAll()).then(
    (value) => value ?? []
  )
}

function putMany<T extends { id: string }>(storeName: StoreName, values: T[]) {
  return transaction(storeName, "readwrite", (store) => {
    for (const value of values) {
      store.put(value)
    }
  })
}

function clearStore(storeName: StoreName) {
  return transaction(storeName, "readwrite", (store) => store.clear())
}

export async function saveRainGaugeSession(session: RainGaugeSession) {
  await putMany("sessions", [session])
}

export async function getRainGaugeSessions() {
  return readAll<RainGaugeSession>("sessions")
}

export async function saveRainGaugeReadings(readings: RainGaugeReading[]) {
  await putMany("readings", readings)
}

export async function getRainGaugeReadings(sessionId?: string) {
  const readings = await readAll<RainGaugeReading>("readings")
  return readings
    .filter((reading) => !sessionId || reading.sessionId === sessionId)
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
}

export async function saveCalibrationTrials(trials: CalibrationTrial[]) {
  await putMany("calibrationTrials", trials)
}

export async function getCalibrationTrials() {
  return readAll<CalibrationTrial>("calibrationTrials")
}

export async function deleteCalibrationTrial(id: string) {
  await transaction("calibrationTrials", "readwrite", (store) => store.delete(id))
}

export async function clearCalibrationTrials() {
  await clearStore("calibrationTrials")
}

export async function clearRainGaugeData() {
  await Promise.all([
    clearStore("sessions"),
    clearStore("readings"),
    clearStore("calibrationTrials"),
    clearStore("syncQueue"),
  ])
}

// A session whose Supabase sync failed. Upserts are idempotent (reading ids are
// primary keys), so a retry simply re-sends the whole session in chunks.
export type RainGaugeSyncQueueEntry = {
  id: string
  session: RainGaugeSession
  attempts: number
  lastError: string
  queuedAt: string
}

export async function queueRainGaugeSync(entry: RainGaugeSyncQueueEntry) {
  await putMany("syncQueue", [entry])
}

export async function getRainGaugeSyncQueue() {
  return readAll<RainGaugeSyncQueueEntry>("syncQueue")
}

export async function removeRainGaugeSyncQueueEntry(id: string) {
  await transaction("syncQueue", "readwrite", (store) => store.delete(id))
}

export function createRainGaugeSessionId() {
  return `rain-${new Date().toISOString().replace(/[:.]/g, "-")}`
}
