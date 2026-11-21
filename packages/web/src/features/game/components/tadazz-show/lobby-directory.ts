export interface PublicLobbyDirectory {
  dialNumber?: string
  representatives?: Array<{ table: number; name: string }>
  connectedTables?: number[]
  roster?: Array<{ id: string; label: string; connected: boolean }>
  joinMode?: "standard" | "phone-only"
  instructions?: string[]
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
    ...(source.joinMode === "standard" || source.joinMode === "phone-only"
      ? { joinMode: source.joinMode }
      : {}),
    ...(Array.isArray(source.instructions)
      ? {
          instructions: source.instructions
            .filter(
              (line): line is string =>
                typeof line === "string" &&
                line.length > 0 &&
                line.length <= 500,
            )
            .slice(0, 8),
        }
      : {}),
    ...(Array.isArray(source.roster)
      ? {
          roster: source.roster.slice(0, 2000).flatMap((entry: unknown) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
              return []
            }

            const person = entry as Record<string, unknown>

            return typeof person.id === "string" &&
              person.id.length > 0 &&
              person.id.length <= 100 &&
              typeof person.label === "string" &&
              person.label.length > 0 &&
              person.label.length <= 160 &&
              typeof person.connected === "boolean"
              ? [
                  {
                    id: person.id,
                    label: person.label,
                    connected: person.connected,
                  },
                ]
              : []
          }),
        }
      : {}),
    ...(typeof source.dialNumber === "string" && source.dialNumber.length <= 100
      ? { dialNumber: source.dialNumber }
      : {}),
    ...(representatives ? { representatives } : {}),
    ...(Array.isArray(source.connectedTables)
      ? { connectedTables: source.connectedTables.filter(tableNumber) }
      : {}),
  }
}
