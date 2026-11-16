/** UI request ownership only. The original provider still owns stage/audio generations. */
export function createPreviewRequestOwner() {
  let generation = 0
  let abort: AbortController | null = null
  let disposed = false

  return {
    async run<T>(
      operation: (signal: AbortSignal) => Promise<T>,
    ): Promise<
      | { status: "completed"; value: T }
      | { status: "failed"; error: unknown }
      | { status: "superseded" }
    > {
      if (disposed) {
        return { status: "superseded" }
      }

      abort?.abort()
      const request = new AbortController()
      abort = request
      generation += 1
      const captured = generation
      const current = () =>
        !disposed && captured === generation && !request.signal.aborted

      try {
        const value = await operation(request.signal)

        return current()
          ? { status: "completed", value }
          : { status: "superseded" }
      } catch (error) {
        return current()
          ? { status: "failed", error }
          : { status: "superseded" }
      }
    },
    dispose() {
      disposed = true
      generation += 1
      abort?.abort()
      abort = null
    },
  }
}
