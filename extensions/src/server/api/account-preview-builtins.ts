import type { TadaShowV1 } from "../../core/show-authoring-schema"
import {
  readReviewedPreviewReferences,
  type PreviewAssetBinding,
} from "../../core/show-library/reviewed-preview-assets"
import type { SemanticAssetResolver } from "../../mcp-app/contracts/semantic-edit"

export type AccountPreviewBuiltinAuthority = Pick<
  SemanticAssetResolver,
  "resolveStoredUrl" | "resolveAsset"
>

let installed: Readonly<AccountPreviewBuiltinAuthority> | undefined = undefined

/** Trusted bootstrap only, before native routes start. No production reset. */
export function installAccountPreviewBuiltinAssets(
  authority: AccountPreviewBuiltinAuthority,
): void {
  if (
    installed ||
    typeof authority.resolveStoredUrl !== "function" ||
    typeof authority.resolveAsset !== "function"
  ) {
    throw new Error("Account preview built-in authority installation rejected")
  }

  installed = Object.freeze({
    resolveStoredUrl: authority.resolveStoredUrl.bind(authority),
    resolveAsset: authority.resolveAsset.bind(authority),
  })
}

/** Called only after the existing account-owned source read; never fetches URLs. */
export function readAccountPreviewBuiltinAssets(
  show: TadaShowV1,
  authority: AccountPreviewBuiltinAuthority | undefined = installed,
): readonly PreviewAssetBinding[] {
  return readReviewedPreviewReferences(show).map((reference) => {
    const context = Object.freeze({
      theme: reference.theme,
      purpose: reference.purpose,
      operation: "preview" as const,
    })
    const admitted = authority?.resolveStoredUrl(reference.url, context)

    if (
      !admitted ||
      admitted.publicUrl !== reference.url ||
      admitted.ref.assetId !== reference.assetId ||
      admitted.ref.sha256 !== reference.sha256 ||
      admitted.ref.theme.id !== reference.theme.id ||
      admitted.ref.theme.version !== reference.theme.version
    ) {
      throw new Error("Account preview public asset unavailable")
    }

    const roundtrip = authority?.resolveAsset(admitted.ref, context)

    if (
      !roundtrip ||
      roundtrip.publicUrl !== reference.url ||
      roundtrip.ref.assetId !== reference.assetId ||
      roundtrip.ref.sha256 !== reference.sha256 ||
      roundtrip.ref.theme.id !== reference.theme.id ||
      roundtrip.ref.theme.version !== reference.theme.version
    ) {
      throw new Error("Account preview public asset changed")
    }

    return Object.freeze({
      url: reference.url,
      sha256: reference.sha256,
      bytes: reference.bytes,
    })
  })
}
