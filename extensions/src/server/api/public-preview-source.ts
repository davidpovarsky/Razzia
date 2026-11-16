import { createHash } from "node:crypto"
import example from "../../core/show-library/approved-public-example.json" with { type: "json" }
import { normalizeApplicationPreviewDraft } from "../../core/show-library/application-preview-input"
import { canonicalJson } from "../../core/show-library/digest"

/** One explicitly owner-approved text-only derivative; no tenant lookup or public write API. */
export function readPublicPreviewSource(catalogueId: string) {
  if (
    process.env.TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED !== "true" ||
    catalogueId !== example.catalogueId
  ) {
    return null
  }

  const source = {
    kind: "published-demo" as const,
    catalogueId: example.catalogueId,
    immutableRevision: createHash("sha256")
      .update(canonicalJson(example.show))
      .digest("hex"),
  }
  const draft = normalizeApplicationPreviewDraft(
    { source, show: example.show, assets: [] },
    { role: "spectator", locale: "en", reducedMotion: false },
  )

  return { source: draft.source, show: draft.show, assets: draft.assets }
}
