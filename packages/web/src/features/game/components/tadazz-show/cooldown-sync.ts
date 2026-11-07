export function resolveMonotonicCooldownDeadline(
  currentDeadline: number | null,
  candidateDeadline: number,
): number {
  if (currentDeadline === null) {
    return candidateDeadline
  }

  // Ordinary server ticks may shorten a local estimate, but delayed or replayed
  // ticks must never make the visible countdown gain time.
  return Math.min(currentDeadline, candidateDeadline)
}
