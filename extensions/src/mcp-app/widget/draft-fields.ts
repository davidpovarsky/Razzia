function document(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)

    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).title === "string"
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function draftTitle(value: string): string | null {
  return (document(value)?.title as string | undefined) ?? null
}

// Preserve the complete canonical document. Only this explicit user field changes;
// the server remains authoritative for authoring validation, scope and revision.
export function withDraftTitle(value: string, title: string): string | null {
  const parsed = document(value)

  return parsed ? JSON.stringify({ ...parsed, title }) : null
}
