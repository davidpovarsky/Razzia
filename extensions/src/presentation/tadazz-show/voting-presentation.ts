/** A finished timed vote is still a clock, never an unlimited-vote badge. */
export function votingPresentation(
  seconds: number | null,
): "countdown" | "voting-open" {
  return seconds !== null && Number.isFinite(seconds) && seconds > 0
    ? "countdown"
    : "voting-open"
}
