import { createHash } from "node:crypto"
import { getPublicDemo } from "../../core/show-library/public-demo-catalogue"
import { normalizeApplicationPreviewDraft } from "../../core/show-library/application-preview-input"
import { canonicalJson } from "../../core/show-library/digest"

// The enabled gallery ships only reviewed, source-controlled examples. An
// explicit public opt-out still withdraws them without touching account data.
//
export function publicGameCatalogueEnabled() {
  const publicFlag = process.env.TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED

  return (
    publicFlag === "true" ||
    (publicFlag !== "false" &&
      process.env.TADAZZ_INLINE_GAME_PREVIEW_ENABLED === "true")
  )
}

/** Source-controlled public examples only; never resolves a tenant or customer game. */
export function readPublicPreviewSource(catalogueId: string) {
  if (!publicGameCatalogueEnabled()) {
    return null
  }

  const example = getPublicDemo(catalogueId)

  if (!example) {
    return null
  }

  const source = {
    kind: "published-demo" as const,
    catalogueId: example.metadata.id,
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
