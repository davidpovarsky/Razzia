import { z } from "zod"
import { PACKAGE_LIMITS } from "../../core/packages/manifest.ts"
import {
  themeIdSchema,
  themeVersionSchema,
} from "../../core/show-themes/selection.ts"
import { baseInput, digest, locale, opaqueId, revision } from "./schemas.ts"

/** Native archive budget is shared; chunks fit the existing MCP ingress budget. */
export const PACKAGE_TOOL_LIMITS = Object.freeze({
  archiveBytes: PACKAGE_LIMITS.archiveBytes,
  chunkBytes: 24_000,
  base64Characters: 32_000,
  pageItems: 20,
})

const text = (max: number) => z.string().min(1).max(max)
const key = { idempotencyKey: opaqueId }
const selected = { ...baseInput, uploadId: opaqueId }
const versioned = { ...selected, expectedRevision: revision }
const bytes = z.number().int().min(22).max(PACKAGE_TOOL_LIMITS.archiveBytes)
const receivedBytes = z
  .number()
  .int()
  .min(0)
  .max(PACKAGE_TOOL_LIMITS.archiveBytes)
const httpsUrl = z
  .url()
  .regex(/^https:\/\//u)
  .max(2048)
const cursor = text(256)

// Canonical RFC 4648 base64: no whitespace, URL alphabet, or non-zero pad bits.
// Together with the character budget this permits at most 24,000 decoded bytes.
export const packageChunkBase64Schema = z
  .string()
  .min(4)
  .max(PACKAGE_TOOL_LIMITS.base64Characters)
  .regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?$/u,
  )

export const packageInputs = {
  get_authoring_capabilities: z.strictObject(baseInput),
  list_packages: z.strictObject({
    ...baseInput,
    limit: z
      .number()
      .int()
      .min(1)
      .max(PACKAGE_TOOL_LIMITS.pageItems)
      .optional(),
    cursor: cursor.optional(),
  }),
  begin_package_upload: z.strictObject({
    ...baseInput,
    totalBytes: bytes,
    sha256: digest,
    // Display name only: adapters must generate their own storage paths.
    filename: z
      .string()
      .min(8)
      .max(160)
      // oxlint-disable-next-line no-control-regex -- Reject path and control characters.
      .regex(/^[^/\\:\u0000-\u001f\u007f]+\.tadazz$/u),
    ...key,
  }),
  write_package_upload_chunk: z
    .strictObject({
      ...baseInput,
      transferId: opaqueId,
      offset: z
        .number()
        .int()
        .min(0)
        .max(PACKAGE_TOOL_LIMITS.archiveBytes - 1),
      bytesBase64: packageChunkBase64Schema,
      sha256: digest,
      ...key,
    })
    .refine((value) => {
      const getBase64Padding = () => {
        if (value.bytesBase64.endsWith("==")) {
          return 2
        }

        if (value.bytesBase64.endsWith("=")) {
          return 1
        }

        return 0
      }

      const padding = getBase64Padding()

      return (
        value.offset + (value.bytesBase64.length / 4) * 3 - padding <=
        PACKAGE_TOOL_LIMITS.archiveBytes
      )
    }),
  complete_package_upload: z.strictObject({
    ...baseInput,
    transferId: opaqueId,
    ...key,
  }),
  get_package_status: z.strictObject(selected),
  build_package: z.strictObject({ ...versioned, ...key }),
  preview_package: z.strictObject({
    ...versioned,
    gameId: themeIdSchema,
    locale: locale.optional(),
  }),
  delete_package_draft: z.strictObject({ ...versioned, ...key }),
  install_package: z.strictObject({
    ...versioned,
    selectedContentIds: z
      .array(themeIdSchema)
      .min(1)
      .max(PACKAGE_LIMITS.games + PACKAGE_LIMITS.themes)
      .refine((ids) => new Set(ids).size === ids.length),
    ...key,
  }),
  export_package: z.strictObject({ ...versioned, ...key }),
}

export const packageSummarySchema = z.strictObject({
  uploadId: opaqueId,
  packageId: themeIdSchema,
  version: themeVersionSchema.max(32),
  title: text(120),
  phase: z.enum([
    "validated",
    "building",
    "preview-ready",
    "failed",
    "installing",
    "installed",
  ]),
  revision,
  sourceDigest: digest,
  buildDigest: digest.nullable().optional(),
  reviewed: z.boolean(),
})

/** Selected metadata only. Source, manifests and archive bytes are never results. */
export const packageStatusSchema = packageSummarySchema.extend({
  contents: z
    .array(
      z.strictObject({
        id: themeIdSchema,
        kind: z.enum(["declarative-theme", "sandboxed-react-theme", "game"]),
        title: text(120).optional(),
      }),
    )
    .min(1)
    .max(PACKAGE_LIMITS.games + PACKAGE_LIMITS.themes),
  installedGameIds: z.array(text(128)).max(PACKAGE_LIMITS.games).optional(),
})

export const packageDataSchemas = {
  get_authoring_capabilities: z.strictObject({
    installer: z.boolean(),
    runtime: z.boolean(),
    upload: z.boolean(),
    build: z.boolean(),
    preview: z.boolean(),
    install: z.boolean(),
    export: z.boolean(),
    archiveBytes: z
      .number()
      .int()
      .min(22)
      .max(PACKAGE_TOOL_LIMITS.archiveBytes),
    chunkBytes: z.number().int().min(1).max(PACKAGE_TOOL_LIMITS.chunkBytes),
    reasons: z.array(text(240)).max(20),
  }),
  list_packages: z.strictObject({
    items: z.array(packageSummarySchema).max(PACKAGE_TOOL_LIMITS.pageItems),
    nextCursor: cursor.optional(),
  }),
  begin_package_upload: z.strictObject({
    transferId: opaqueId,
    totalBytes: bytes,
    receivedBytes,
    chunkBytes: z.number().int().min(1).max(PACKAGE_TOOL_LIMITS.chunkBytes),
    expiresAt: z.iso.datetime(),
    uploadUrl: httpsUrl.optional(),
    uploadExpiresAt: z.iso.datetime().optional(),
  }),
  write_package_upload_chunk: z.strictObject({
    transferId: opaqueId,
    receivedBytes,
    complete: z.boolean(),
  }),
  complete_package_upload: packageStatusSchema,
  get_package_status: packageStatusSchema,
  build_package: packageStatusSchema,
  preview_package: z.strictObject({
    uploadId: opaqueId,
    revision,
    gameId: themeIdSchema,
    previewUrl: httpsUrl,
    expiresAt: z.iso.datetime().optional(),
    title: text(160).optional(),
    themeId: themeIdSchema.optional(),
  }),
  delete_package_draft: z.strictObject({
    uploadId: opaqueId,
    revision,
    deleted: z.literal(true),
  }),
  install_package: z.strictObject({
    uploadId: opaqueId,
    revision,
    installedGameIds: z.array(text(128)).max(PACKAGE_LIMITS.games),
    studioUrl: httpsUrl.optional(),
  }),
  export_package: z.strictObject({
    uploadId: opaqueId,
    revision,
    sha256: digest,
    bytes,
    downloadUrl: httpsUrl.optional(),
    expiresAt: z.iso.datetime().optional(),
  }),
}

export type PackageToolName = keyof typeof packageInputs

export type PackageToolInput<N extends PackageToolName = PackageToolName> =
  z.infer<(typeof packageInputs)[N]>

export type PackageToolData<N extends PackageToolName = PackageToolName> =
  z.infer<(typeof packageDataSchemas)[N]>

export type PackageStatus = z.infer<typeof packageStatusSchema>

export const packageToolNames = Object.freeze(
  Object.keys(packageInputs) as PackageToolName[],
)

const packageNames: ReadonlySet<string> = new Set(packageToolNames)

export function isPackageTool(name: string): name is PackageToolName {
  return packageNames.has(name)
}

export const packageScopes: Readonly<
  Record<PackageToolName, readonly string[]>
> = {
  get_authoring_capabilities: ["tadazz.catalog.read"],
  list_packages: ["tadazz.drafts.read"],
  begin_package_upload: ["tadazz.drafts.write"],
  write_package_upload_chunk: ["tadazz.drafts.write"],
  complete_package_upload: ["tadazz.drafts.write"],
  get_package_status: ["tadazz.drafts.read"],
  build_package: ["tadazz.drafts.read", "tadazz.drafts.write"],
  preview_package: ["tadazz.drafts.read"],
  delete_package_draft: ["tadazz.drafts.read", "tadazz.drafts.write"],
  install_package: ["tadazz.drafts.read", "tadazz.library.write"],
  export_package: ["tadazz.drafts.read", "tadazz.exports.read"],
}

export const packageMutations: readonly PackageToolName[] = [
  "begin_package_upload",
  "write_package_upload_chunk",
  "complete_package_upload",
  "build_package",
  "delete_package_draft",
  "install_package",
  "export_package",
]

export const packageDescriptions: Readonly<Record<PackageToolName, string>> = {
  get_authoring_capabilities:
    "Read the enabled native package authoring features, upload limits and unavailability reasons for this account. Discovery alone does not enable an installer, build worker or sandbox runtime.",
  list_packages:
    "List this account's private package uploads as bounded metadata. Pass the returned cursor unchanged for the next page; a changed catalog may require restarting the list.",
  begin_package_upload:
    "Begin a private .tadazz package upload with its exact file length and SHA-256. If an uploadUrl is returned, upload those exact binary bytes there before complete_package_upload. Otherwise use bounded chunks. This stages bytes only and does not build, install or save a game.",
  write_package_upload_chunk:
    "Write one canonical base64 chunk of at most 24000 decoded bytes at the acknowledged offset, with that chunk's SHA-256. Reuse the same idempotencyKey for an exact retry. Ownership, upload expiry, total length and byte digest are checked by the native adapter.",
  complete_package_upload:
    "Finish your staged upload after exact total-length and SHA-256 verification and native package validation. Returns the uploadId and revision for build/preview. This does not install the theme or save a library game.",
  get_package_status:
    "Read your package's current revision, native build phase, review state and bounded content identities. No source, full manifest, account data or archive bytes are returned.",
  build_package:
    "Request the native isolated package build at an exact revision. Poll get_package_status for completion. Source is never executed in the MCP server; unavailable build infrastructure remains an explicit error.",
  preview_package:
    "Open a first-party isolated demo for one game in your built package at the exact revision. Preview creates no live room, real votes or saved account game. Inspect this before requesting installation.",
  delete_package_draft:
    "Delete only your uninstalled private package draft at its exact revision. Installed packages and in-progress builds/installations cannot be removed through this tool.",
  install_package:
    "Install selected contents of your validated, built package into your private account at the exact revision. An explicit request with library-write scope saves the custom theme and selected games directly; no separate reviewer or save approval page is required. Reuse the same idempotencyKey for retries.",
  export_package:
    "Export your exact package revision after native ownership and asset export-rights checks. A first-party download URL is returned when delivery is available. Export does not grant install approval or save a game.",
}
