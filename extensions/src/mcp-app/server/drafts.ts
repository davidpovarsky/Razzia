import { canonicalJson } from "../contracts/canonical.ts"
import { authoredJson, draftData, locale } from "../contracts/schemas.ts"
import { normalizeStoredDraft } from "./authoring.ts"
import type { Dependencies, VerifiedPrincipal } from "./dependencies.ts"
import { ToolError, unavailable } from "./errors.ts"

const storedDraft = draftData
  .extend({
    authoredShowJson: authoredJson,
    locale: locale.optional(),
  })
  .strict()

export function checkedDraft(raw: unknown, deps: Dependencies) {
  if (!deps.authoring) throw unavailable()
  try {
    const record = storedDraft.parse(raw)
    const checked = normalizeStoredDraft(
      record.authoredShowJson,
      deps.authoring,
    )
    if (
      checked.authoredShowJson !== record.authoredShowJson ||
      canonicalJson(checked.summary) !== canonicalJson(record.summary)
    )
      throw new Error("Inconsistent stored draft")
    return record
  } catch {
    throw new ToolError("INTERNAL")
  }
}

export async function readDraft(
  deps: Dependencies,
  p: VerifiedPrincipal,
  id: string,
  expected?: number,
) {
  if (!deps.drafts) throw unavailable()
  const raw = await deps.drafts.get(p, id)
  if (!raw) throw new ToolError("NOT_FOUND")
  const record = checkedDraft(raw, deps)
  if (record.draftId !== id) throw new ToolError("INTERNAL")
  if (expected !== undefined && record.revision !== expected)
    throw new ToolError("REVISION_CONFLICT", {
      currentRevision: record.revision,
    })
  return record
}
