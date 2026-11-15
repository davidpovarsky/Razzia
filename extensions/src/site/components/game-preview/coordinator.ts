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

    try {
      const released = previous.close()
      drained = Promise.all([drained, released]).then(() => undefined)
    } catch {
      failed = true
    }

    // A failed disposal cannot silently admit the next stage.
    void drained.catch(() => {
      failed = true
    })
  }

  return {
    claim(close: () => void | Promise<void>) {
      revoke()
      generation += 1
      const id = generation
      const abort = new AbortController()
      current = { id, abort, close }
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
