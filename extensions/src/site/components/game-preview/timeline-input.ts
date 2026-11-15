import type { PreviewSnapshot } from "./contracts"

/** Chapter keyboard input, never an authored timeline compiler or playback clock. */
export function chapterKeyTarget(
  key: string,
  current: number,
  count: number,
): number | null {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(current)) {
    return null
  }

  const offset: Record<string, number> = {
    ArrowLeft: -1,
    ArrowDown: -1,
    ArrowRight: 1,
    ArrowUp: 1,
    PageDown: -5,
    PageUp: 5,
  }
  let requested: number | null = null

  if (key === "Home") {
    requested = 0
  } else if (key === "End") {
    requested = count - 1
  } else if (Object.hasOwn(offset, key)) {
    requested = current + offset[key]
  }

  return requested === null ? null : Math.min(count - 1, Math.max(0, requested))
}

/** Validate measured original-media metadata. Does not grant a seek capability. */
export function isSeekableMediaTime(
  media: PreviewSnapshot["media"],
  seconds: number,
): boolean {
  return Boolean(
    media &&
    Number.isFinite(seconds) &&
    seconds >= 0 &&
    Number.isFinite(media.durationSeconds) &&
    media.durationSeconds > 0 &&
    seconds <= media.durationSeconds &&
    media.seekable.some(
      ([start, end]) =>
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end <= media.durationSeconds &&
        start <= end &&
        seconds >= start &&
        seconds <= end,
    ),
  )
}
