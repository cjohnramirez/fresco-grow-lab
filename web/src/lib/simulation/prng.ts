// Deterministic noise helpers for the simulator. Everything is a pure function
// of (seed, key) so simulated history is identical across reloads and every
// visitor sees the same "farm", while live ticks keep extending it.

export const SIMULATION_SEED = 20_260_701

// 32-bit integer hash (a variant of the lowbias32 finalizer).
export function hash32(value: number) {
  let x = value | 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}

export function hashString(value: string) {
  let h = 2166136261
  for (let index = 0; index < value.length; index++) {
    h ^= value.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Uniform [0, 1) for a (seed, ...keys) tuple.
export function unit(seed: number, ...keys: number[]) {
  let h = hash32(seed)
  for (const key of keys) {
    h = hash32(h ^ hash32(Math.floor(key)))
  }
  return h / 4294967296
}

// Uniform [-1, 1).
export function signedUnit(seed: number, ...keys: number[]) {
  return unit(seed, ...keys) * 2 - 1
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

// 1-D value noise: random knots every `periodMs`, smoothly interpolated. Used
// for slow weather drift (clouds, breeze) so curves wander without jitter.
export function valueNoise(seed: number, timeMs: number, periodMs: number) {
  const position = timeMs / periodMs
  const index = Math.floor(position)
  const fraction = smoothstep(position - index)
  const a = signedUnit(seed, index)
  const b = signedUnit(seed, index + 1)
  return a + (b - a) * fraction
}

// Box-Muller normal sample from two deterministic uniforms.
export function gaussian(seed: number, ...keys: number[]) {
  const u1 = Math.max(unit(seed, ...keys, 1), 1e-9)
  const u2 = unit(seed, ...keys, 2)
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
