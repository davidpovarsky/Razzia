/**
 * Read one chunk at a time and retain the pending read through interruption.
 * The caller owns reader cancellation and release, including incomplete reads.
 */
export function interruptibleChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  interrupted: Promise<never>,
) {
  let pendingRead: ReturnType<typeof reader.read> | undefined = undefined
  let complete = false

  return {
    get pendingRead() {
      return pendingRead
    },
    get complete() {
      return complete
    },
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      return {
        next() {
          pendingRead = reader.read()

          return Promise.race([pendingRead, interrupted]).then((part) => {
            pendingRead = undefined

            if (part.done) {
              complete = true

              return { done: true, value: undefined }
            }

            return { done: false, value: part.value }
          })
        },
      }
    },
  }
}
