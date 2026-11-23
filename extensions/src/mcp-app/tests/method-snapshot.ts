/** Snapshot an original method for a test hook that restores its exact identity. */
export function captureMethod<T extends object, K extends keyof T>(
  target: T,
  key: K,
): T[K] {
  const method: unknown = Reflect.get(target, key)

  if (typeof method !== "function") {
    throw new Error("Expected a callable method to snapshot")
  }

  return method as T[K]
}
