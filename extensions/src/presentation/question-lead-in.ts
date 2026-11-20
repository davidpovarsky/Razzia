import { QUESTION_LEAD_IN_MS } from "@razzia/common/constants"

/** A cancellable reading interval anchored to the presented question, not its render request. */
export function createQuestionLeadIn(now: () => number = Date.now) {
  let pending: {
    questionKey: string
    timer?: ReturnType<typeof setTimeout>
    settle: (at: number | null) => void
  } | null = null

  const cancel = () => {
    if (pending) {
      clearTimeout(pending.timer)
      pending.settle(null)
      pending = null
    }
  }

  return {
    cancel,
    wait(questionKey: string): Promise<number | null> {
      cancel()

      return new Promise((settle) => {
        pending = { questionKey, settle }
      })
    },
    present(questionKey: string, onPresented?: () => void): boolean {
      const request = pending

      if (
        !request ||
        request.questionKey !== questionKey ||
        request.timer !== undefined
      ) {
        return false
      }

      onPresented?.()

      if (pending !== request) {
        return false
      }

      const opensAt = now() + QUESTION_LEAD_IN_MS
      request.timer = setTimeout(
        () => {
          if (pending !== request) {
            return
          }

          pending = null
          request.settle(opensAt)
        },
        Math.max(0, opensAt - now()),
      )

      return true
    },
  }
}

/** Wait for a committed presentation in a rendering frame; cancellation also covers pre-paint work. */
export function observePresentedFrame(
  isPresented: () => boolean,
  onPresented: () => void,
): () => void {
  let stopped = false
  let frame: number
  const tick = () => {
    if (stopped) {
      return
    }

    if (isPresented()) {
      stopped = true
      onPresented()

      return
    }

    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  return () => {
    stopped = true

    cancelAnimationFrame(frame)
  }
}

function elementIsPresented(element: Element): boolean {
  if (!element.isConnected) {
    return false
  }

  const bounds = element.getBoundingClientRect()

  if (bounds.width <= 0 || bounds.height <= 0) {
    return false
  }

  let current: Element | null = element

  while (current) {
    const style = getComputedStyle(current)

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) <= 0.01
    ) {
      return false
    }

    const root = current.getRootNode()
    current =
      current.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
  }

  return true
}

/** The caller must bind this observer to its committed question/replay identity. */
export function observeQuestionPresentation(
  root: Element,
  onPresented: () => void,
  { packageReady = false }: { packageReady?: boolean } = {},
): () => void {
  return observePresentedFrame(() => {
    const headings = Array.from(
      root.querySelectorAll(
        '[data-native-question-heading], [data-testid="native-razzia-question"], .q-text, .photo-question-head',
      ),
    ).filter((heading) => Boolean(heading.textContent?.trim()))

    // A visible panel must never bypass a nonempty title's opacity-zero entrance.
    if (headings.length > 0) {
      return headings.some(elementIsPresented)
    }

    // Empty drafts and media-only cards can present a question panel without
    // text. The SDK frame is eligible only after its renderer acknowledged ready.
    const selector = [
      '[data-testid="tadazz-question-panel"]',
      "[data-editor-preview-fallback]",
      ...(packageReady ? ['[data-testid="package-runtime-frame"]'] : []),
    ].join(", ")

    return Array.from(root.querySelectorAll(selector)).some(elementIsPresented)
  }, onPresented)
}
