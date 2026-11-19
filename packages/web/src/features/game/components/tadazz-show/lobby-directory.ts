export interface PublicLobbyDirectory {
  dialNumber?: string
  representatives?: Array<{ table: number; name: string }>
  connectedTables?: number[]
}

/** Read only the server's public presentation fields, never a private roster. */
export function readPublicLobbyDirectory(
  value: unknown,
): PublicLobbyDirectory | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const source = value as Record<string, unknown>
  const tableNumber = (entry: unknown): entry is number =>
    typeof entry === "number" &&
    Number.isSafeInteger(entry) &&
    entry >= 1 &&
    entry <= 2000
  const representatives = Array.isArray(source.representatives)
    ? source.representatives.flatMap((entry: unknown) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return []
        }

        const person = entry as Record<string, unknown>

        return tableNumber(person.table) &&
          typeof person.name === "string" &&
          person.name.trim()
          ? [{ table: person.table, name: person.name }]
          : []
      })
    : undefined

  return {
    ...(typeof source.dialNumber === "string" && source.dialNumber.length <= 100
      ? { dialNumber: source.dialNumber }
      : {}),
    ...(representatives ? { representatives } : {}),
    ...(Array.isArray(source.connectedTables)
      ? { connectedTables: source.connectedTables.filter(tableNumber) }
      : {}),
  }
}
