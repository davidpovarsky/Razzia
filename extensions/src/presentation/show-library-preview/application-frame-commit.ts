/** One completion owner for the native runtime's committed frame updates. */
export function createApplicationFrameCommitOwner() {
  let key: string | null = null
  let presented = false
  let chapter = 0
  let generation = 0
  let disposed = false
  const pending = new Set<() => void>()
  const settleAll = () => {
    for (const settle of pending) {
      settle()
    }
  }

  return {
    request(nextKey: string) {
      if (disposed) {
        throw new Error("Preview disposed")
      }

      generation += 1

      if (key !== nextKey) {
        settleAll()
        key = nextKey
        presented = false
        chapter += 1
      }

      const ownChapter = chapter
      const ownGeneration = generation
      // oxlint-disable-next-line typescript/no-invalid-void-type -- Native withResolvers<void> is a completion Promise; this valid generic call is unsupported by the rule.
      const result = Promise.withResolvers<void>()
      const settle = () => {
        pending.delete(settle)
        result.resolve()
      }
      pending.add(settle)
      const ownsChapter = () => !disposed && chapter === ownChapter

      return {
        promise: result.promise,
        isCurrent: () => ownsChapter() && generation === ownGeneration,
        isPresented: () => ownsChapter() && presented,
        // Only the renderer acknowledgement marks a chapter presented. An old
        // update of this same continuous chapter may acknowledge it while the
        // latest clock/preference update is still being submitted.
        // oxlint-disable-next-line typescript/no-invalid-void-type -- TypeScript this: void declares a receiver-free callback; it is erased and is not a runtime argument.
        acknowledge(this: void) {
          if (ownsChapter()) {
            presented = true
            settleAll()
          } else {
            settle()
          }
        },
        unavailable() {
          if (ownsChapter() && generation === ownGeneration) {
            // Failure settles every update waiting for this chapter, but no
            // delayed acknowledgement may turn that failure into readiness.
            presented = false
            chapter += 1
            settleAll()
          } else {
            settle()
          }
        },
        settle,
      }
    },
    dispose() {
      disposed = true
      settleAll()
    },
  }
}
