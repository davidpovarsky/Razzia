/** Keep synchronous work and cleanup inside the Promise rejection boundary. */
export function synchronousPromise<T>(operation: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    resolve(operation())
  })
}
