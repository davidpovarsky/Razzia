/** Execute immediately, while preserving Promise rejection and value adoption. */
export function promiseFrom<T>(
  operation: () => T | PromiseLike<T>,
): Promise<T> {
  return new Promise<T>((resolve) => {
    resolve(operation())
  })
}
