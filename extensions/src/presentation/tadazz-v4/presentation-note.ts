/** Import provenance is retained in quiz data, but is not audience-facing copy. */
export function presentationNote(note?: string): string | undefined {
  if (!note) {
    return undefined
  }

  if (
    /Source:\s*Category\s+\d+\s*-/.test(note) &&
    note.includes("No correct answer and no scoring.")
  ) {
    return undefined
  }

  return note
}
