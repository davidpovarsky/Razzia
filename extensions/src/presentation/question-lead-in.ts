import { QUESTION_LEAD_IN_MS } from "@razzia/common/constants"

/** A cancellable reading interval for local play. Voting uses its returned deadline. */
export function createQuestionLeadIn(now: () => number = Date.now) {
  let pending: {
    timer: ReturnType<typeof setTimeout>
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
    wait(): Promise<number | null> {
      cancel()
      const opensAt = now() + QUESTION_LEAD_IN_MS

      return new Promise((settle) => {
        pending = {
          settle,
          timer: setTimeout(
            () => {
              pending = null
              settle(opensAt)
            },
            Math.max(0, opensAt - now()),
          ),
        }
      })
    },
  }
}
