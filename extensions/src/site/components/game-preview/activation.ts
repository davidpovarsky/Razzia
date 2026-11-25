export interface PressInput {
  pointerId: number
  pointerType: string
  x: number
  y: number
  button: number
  primary: boolean
  nestedAction: boolean
}

/** Gesture timer only; never a playback/animation clock. */
export function createPreviewActivation(
  activate: () => void,
  schedule: (callback: () => void, ms: number) => () => void = (
    callback,
    ms,
  ) => {
    const timer = setTimeout(callback, ms)

    return () => clearTimeout(timer)
  },
) {
  let pending: PressInput | null = null
  let cancelTimer: (() => void) | null = null
  let suppressClick = false
  let activated = false
  let disposed = false
  const cancel = () => {
    cancelTimer?.()
    cancelTimer = null
    pending = null
  }

  return {
    down(input: PressInput) {
      cancel()
      // A new real pointer gesture cannot be the old hold's synthetic click.
      suppressClick = false
      activated = false

      if (
        disposed ||
        !input.primary ||
        input.button !== 0 ||
        !["mouse", "touch", "pen"].includes(input.pointerType) ||
        input.nestedAction
      ) {
        return
      }

      pending = input
      cancelTimer = schedule(() => {
        if (!pending || disposed) {
          return
        }

        activated = true
        suppressClick = true
        cancel()
        activate()
      }, 450)
    },
    move(pointerId: number, x: number, y: number) {
      if (
        pending?.pointerId === pointerId &&
        Math.hypot(x - pending.x, y - pending.y) > 10
      ) {
        cancel()
      }
    },
    up(pointerId: number) {
      if (pending?.pointerId === pointerId) {
        cancel()
      }
      // A recognized hold remains open after release.
    },
    cancel,
    consumeClick() {
      const consume = suppressClick
      suppressClick = false

      return consume
    },
    interceptContextMenu: () => activated,
    dispose() {
      disposed = true
      suppressClick = false
      cancel()
    },
  }
}
