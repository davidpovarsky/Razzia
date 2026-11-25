/** Pure startup metadata contract; importing it grants no runtime authority. */
export interface StartupOwnerSnapshot {
  readonly configuredRoot: string
  readonly ownerIds: readonly string[]
  readonly mode: "legacy-global-only" | "accounts"
  readonly assertUnchanged: () => void
}
