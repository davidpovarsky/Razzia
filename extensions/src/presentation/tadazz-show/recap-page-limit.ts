export const CLASSIC_RECAP_MAX_ITEMS = 6

export function recapPageLimit(rendererId: string): number {
  return rendererId === "tadazz-classic-stage" ? CLASSIC_RECAP_MAX_ITEMS : 8
}

export function recapPageSize(
  value: number | undefined,
  rendererId: string,
): number {
  const integer =
    value === undefined || !Number.isFinite(value) ? 4 : Math.trunc(value)

  return Math.max(1, Math.min(recapPageLimit(rendererId), integer))
}
