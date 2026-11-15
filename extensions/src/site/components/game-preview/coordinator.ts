/** One active inline owner per page. Teardown completes before another stage mounts. */
export function createPreviewCoordinator() {
  let generation = 0
  let current:
    | {
        id: number
        abort: AbortController
        close: () => void | Promise<void>
      }
    | undefined = undefined
  let drained: Promise<void> = Promise.resolve()
  let failed = false

  function revoke() {
    const previous = current
    current = undefined

    if (!previous) {
      return
    }

    previous.abort.abort()
    const barrier = Promise.withResolvers<undefined>()
    drained = Promise.all([drained, barrier.promise]).then(() => undefined)
    // Publish the barrier before callbacks: a reentrant claim must also wait.
    void drained.catch(() => {
      failed = true
    })

    try {
      void Promise.resolve(previous.close()).then(
        () => barrier.resolve(undefined),
        barrier.reject,
      )
    } catch (error) {
      barrier.reject(error)
    }
  }

  return {
    claim(close: () => void | Promise<void>) {
      generation += 1
      const id = generation
      const abort = new AbortController()
      revoke()

      if (id === generation) {
        current = { id, abort, close }
      } else {
        // A newer claim made by a close callback wins over the outer request.
        abort.abort()
      }

      const isCurrent = () => current?.id === id && !abort.signal.aborted

      return {
        signal: abort.signal,
        isCurrent,
        async ready() {
          try {
            await drained

            return !failed && isCurrent()
          } catch {
            return false
          }
        },
        release() {
          if (isCurrent()) {
            revoke()
          }
        },
      }
    },
    dispose: revoke,
  }
}
