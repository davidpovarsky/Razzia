import type Game from "@razzia/socket/services/game"
import { serviceDenied } from "./auth/credential-codec"

interface Fence {
  readonly owner: NativePhoneAdoption
  closed: boolean
  turn?: () => void
}
const fences = new WeakMap<object, Fence>()

export function isPhoneLifecycleV2Adopted(game: object): boolean {
  return fences.has(game)
}

// Called at the actual native mutation boundary. A legacy Game has no fence.
// A v2 Game requires the exact synchronous factory turn and fresh live proof.
export function allowsNativePhoneMutation(game: object): boolean {
  const fence = fences.get(game)
  if (!fence) return true
  if (fence.closed || !fence.turn) return false
  try { return fence.turn() === undefined } catch { return false }
}

// Internal server composition only; intentionally absent from the public barrel.
// No route, settings field, constructor default or automatic migration adopts.
export class NativePhoneAdoption {
  private readonly games = new Set<Game>()
  private closed = false

  adopt(game: Game): void {
    if (this.closed) serviceDenied()
    const prior = fences.get(game)
    if (prior) {
      if (prior.owner !== this || prior.closed) serviceDenied()
      return
    }
    if (!game.canAdoptPhoneLifecycleV2()) serviceDenied()
    fences.set(game, { owner: this, closed: false })
    this.games.add(game)
  }

  run<T>(game: Game, check: () => void, work: () => T): T {
    const fence = fences.get(game)
    if (this.closed || !fence || fence.owner !== this || fence.closed || fence.turn) serviceDenied()
    const live = () => {
      if (this.closed || fence.closed || fences.get(game) !== fence) serviceDenied()
      const result: unknown = check()
      if (result !== undefined) serviceDenied()
    }
    live()
    fence.turn = live
    try {
      const result = work()
      if (result && (typeof result === "object" || typeof result === "function") && "then" in result) serviceDenied()
      live()
      return result
    } finally { fence.turn = undefined }
  }

  close(): void {
    this.closed = true
    for (const game of this.games) {
      const fence = fences.get(game)
      if (fence?.owner === this) { fence.closed = true; fence.turn = undefined }
    }
    this.games.clear() // WeakMap retains the fence; never downgrade a live Game.
  }
}
