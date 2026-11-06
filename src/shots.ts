// A call's screenshots (webview/capture.ts takes them, the engine keeps them in
// the recording's folder, transcript.json lists them): whether a frame changed
// enough to keep, and which ones the transcript shows. Pure, shared by the pages.

/** One screenshot as transcript.json lists it: seconds from the start, its file, taken by the person, or marked key by the summary's pass. */
export type Shot = { at: number; file: string; manual?: boolean; key?: boolean }

/** A frame's fingerprint: SHOT_SIDE × SHOT_SIDE grayscale, a bit each, set where brighter than the mean (average hash). */
export const SHOT_SIDE = 16
/** Bits of 256 that must differ for a frame to count as new. */
// ponytail: a fixed threshold read off no measurement; tune it once real calls show too many or too few shots
export const SHOT_CHANGE = 12

/** The fingerprint of a small RGBA picture (canvas ImageData's data, SHOT_SIDE² pixels). */
export function frameHash(rgba: ArrayLike<number>): Uint8Array {
  const n = SHOT_SIDE * SHOT_SIDE
  const gray = new Float64Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    gray[i] = 0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0)
    sum += gray[i]!
  }
  const mean = sum / n
  return Uint8Array.from(gray, g => (g > mean ? 1 : 0))
}

export function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

/** Keep this frame? The first always; then only one far enough from the last kept. */
export const changed = (last: Uint8Array | undefined, next: Uint8Array): boolean => !last || hamming(last, next) >= SHOT_CHANGE

/** The shots the transcript shows: those the person took and those the summary's pass marked key, by time. */
export const shownShots = (shots: readonly Shot[] = []): Shot[] => shots.filter(s => s.manual || s.key).sort((a, b) => a.at - b.at)
