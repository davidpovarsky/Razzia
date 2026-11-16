/** Required value from a validated graph or an admitted adapter. */
export function requireLibraryValue<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) {
    throw new Error("show-library:required-value")
  }

  return value
}
