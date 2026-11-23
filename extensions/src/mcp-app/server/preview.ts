import {
  canonicalJson,
  previewIdentityDigest,
  utf8Bytes,
} from "../contracts/canonical.ts"
import { LIMITS, previewData, previewMetaSchema } from "../contracts/schemas.ts"
import type {
  Dependencies,
  DraftRecord,
  VerifiedPrincipal,
} from "./dependencies.ts"
import { ToolError } from "./errors.ts"

const isV1Identity = (version: unknown): version is 1 => version === 1

/**
 * MCP boundary only. The accepted injected SB port owns plan/identity/pin
 * validation and the actual renderer. No phase/clock/role engine lives here.
 */

export async function renderPreview(
  ...[deps, principal, record, locale]: [
    deps: Dependencies,
    principal: VerifiedPrincipal,
    record: DraftRecord,
    locale?: string,
  ]
) {
  if (!deps.preview) {
    throw new ToolError("PREVIEW_UNAVAILABLE")
  }

  const result = await deps.preview.render(
    principal,
    record,
    locale ?? record.locale,
  )
  const view = previewData.parse(result.data)
  const widget = previewMetaSchema.parse(result.meta)
  deps.preview.assertAcceptedIdentity(result.identity)

  if (
    view.rendererStatus === "unavailable" ||
    !view.sbRegistryVersion ||
    view.sbRegistryVersion !== deps.preview.registryVersion ||
    result.identity.compiledPin === null ||
    result.identity.identityMap === null ||
    !isV1Identity(result.identity.version) ||
    result.identity.draftId !== record.draftId ||
    result.identity.revision !== record.revision ||
    canonicalJson(result.identity.normalizedAuthoredContent) !==
      canonicalJson(JSON.parse(record.authoredShowJson)) ||
    view.draftId !== record.draftId ||
    view.revision !== record.revision ||
    widget.draftId !== record.draftId ||
    widget.revision !== record.revision ||
    widget.sbRegistryVersion !== view.sbRegistryVersion ||
    widget.authoredShowJson !== record.authoredShowJson ||
    previewIdentityDigest(result.identity) !== view.projectionDigest ||
    view.projectionDigest !== widget.projectionDigest ||
    view.summary.title !== record.summary.title ||
    view.summary.cardCount !== record.summary.cardCount ||
    view.summary.questionCount !== record.summary.questionCount ||
    view.summary.themeId !== record.summary.themeId ||
    view.summary.themeVersion !== record.summary.themeVersion
  ) {
    throw new ToolError("PREVIEW_UNAVAILABLE")
  }

  const assetPairs = widget.assetManifest
    .map(({ assetId, sha256 }) => ({ assetId, sha256 }))
    .sort((a, b) => {
      if (a.assetId < b.assetId) {
        return -1
      }

      if (a.assetId > b.assetId) {
        return 1
      }

      return 0
    })
  const digestPairs = [...result.identity.assetDigests].sort((a, b) => {
    if (a.assetId < b.assetId) {
      return -1
    }

    if (a.assetId > b.assetId) {
      return 1
    }

    return 0
  })

  if (
    canonicalJson(assetPairs) !== canonicalJson(digestPairs) ||
    widget.assetManifest.some(
      (asset) => !deps.authoring?.allowedPublicAssetUrls.has(asset.url),
    ) ||
    (view.rendererStatus === "unsupportedTheme" &&
      view.summary.diagnostics.length === 0)
  ) {
    throw new ToolError("PREVIEW_UNAVAILABLE")
  }

  if (utf8Bytes(JSON.stringify(widget)) > LIMITS.preview) {
    throw new ToolError("INTERNAL")
  }

  return { data: view, meta: { "tadazz/preview": widget } }
}
