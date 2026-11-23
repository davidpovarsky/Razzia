/** Native Promise executor initialization is synchronous on every supported target. */
export function createDeferred<T>() {
  let settle: (value: T | PromiseLike<T>) => void = () => {
    throw new Error(
      "Promise resolver settle was used before executor initialization",
    )
  }

  let fail: (reason?: unknown) => void = () => {
    throw new Error(
      "Promise resolver fail was used before executor initialization",
    )
  }

  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve
    fail = reject
  })

  return {
    promise,
    resolve(value: T | PromiseLike<T>) {
      settle(value)
    },
    reject(reason?: unknown) {
      fail(reason)
    },
  }
}
