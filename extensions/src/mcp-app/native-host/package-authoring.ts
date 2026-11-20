import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { PackageError, inspectPackage } from "../../server/packages/index.ts"
import { PACKAGE_LIMITS } from "../../core/packages/manifest.ts"
import {
  packageInstallerEnabled,
  packageRuntimeEnabled,
  packageRuntimeSecret,
  packageStore,
} from "@razzia/socket/services/package-installation"
import { packageTransfers } from "@razzia/socket/services/package-transfers"
import { themeWorkspacePrincipal } from "@razzia/socket/services/theme-installation"
import {
  packageInputs,
  packageStatusSchema,
  packageSummarySchema,
  type PackageStatus,
} from "../contracts/package-authoring.ts"
import { hashJson } from "../contracts/canonical.ts"
import type { PackageAuthoringPort } from "../server/package-authoring.ts"
import { ToolError } from "../server/errors.ts"

type NativeReceipt = ReturnType<ReturnType<typeof packageStore>["details"]>
function status(receipt: NativeReceipt): PackageStatus {
  return packageStatusSchema.parse({
    uploadId: receipt.uploadId,
    packageId: receipt.manifest.id,
    version: receipt.manifest.version,
    title: receipt.manifest.displayName,
    phase: receipt.phase,
    revision: receipt.revision,
    sourceDigest: receipt.sourceDigest,
    buildDigest: receipt.buildDigest,
    reviewed: receipt.reviewed,
    contents: receipt.manifest.contents.map((content) => ({
      id: content.id,
      kind: content.kind,
    })),
    installedGameIds: receipt.installedGames,
  })
}
function sameRevision(receipt: NativeReceipt, expected: number) {
  if (receipt.revision !== expected)
    throw new ToolError("REVISION_CONFLICT", {
      currentRevision: receipt.revision,
    })
}
function runtimeOriginsReady(origin: string) {
  try {
    const runtime = new URL(process.env.TADAZZ_PACKAGE_RUNTIME_ORIGIN ?? "")
    const parent = new URL(process.env.TADAZZ_PACKAGE_PARENT_ORIGIN ?? "")
    return (
      runtime.protocol === "https:" &&
      parent.origin === origin &&
      runtime.origin !== origin &&
      !runtime.username &&
      !runtime.password &&
      runtime.pathname === "/" &&
      !runtime.search &&
      !runtime.hash
    )
  } catch {
    return false
  }
}
function translateError(error: unknown): never {
  if (error instanceof ToolError) throw error
  if (error instanceof PackageError) {
    if (error.code === "PACKAGE_IDEMPOTENCY_CONFLICT")
      throw new ToolError("REQUEST_KEY_REUSED")
    if (error.code === "PACKAGE_OPERATION_UNCERTAIN")
      throw new ToolError("DEPENDENCY_UNAVAILABLE")
    if (error.code === "PACKAGE_RUNTIME_DISABLED")
      throw new ToolError("DEPENDENCY_UNAVAILABLE")
    if (error.status === 404) throw new ToolError("NOT_FOUND")
    if (error.status === 403) throw new ToolError("SCOPE_REQUIRED")
    if (error.status === 413) throw new ToolError("QUOTA_EXCEEDED")
    throw new ToolError("VALIDATION_FAILED")
  }
  throw new ToolError("DEPENDENCY_UNAVAILABLE")
}

/** Platform adapter only. The FirstPartyOAuthGrants wrapper must validate live
 * issued authority before AND after every call. No model-supplied owner/grants. */
export function createNativePackageAuthoring(
  origin: string,
): PackageAuthoringPort {
  if (new URL(origin).origin !== origin || !origin.startsWith("https://"))
    throw new Error("Package origin rejected")
  return Object.freeze<PackageAuthoringPort>({
    async call(principal, name, input) {
      try {
        const installer = packageInstallerEnabled()
        const runtime = packageRuntimeEnabled() && runtimeOriginsReady(origin)
        if (name === "get_authoring_capabilities") {
          return {
            data: {
              installer,
              runtime,
              upload: installer,
              build: installer,
              preview: installer && runtime,
              install: installer,
              export: installer,
              archiveBytes: PACKAGE_LIMITS.archiveBytes,
              chunkBytes: 24_000,
              reasons: [
                ...(!installer ? ["PACKAGE_INSTALLER_DISABLED"] : []),
                ...(installer && !packageRuntimeEnabled()
                  ? ["PACKAGE_RUNTIME_DISABLED"]
                  : []),
                ...(packageRuntimeEnabled() && !runtime
                  ? ["PACKAGE_RUNTIME_ORIGIN_NOT_READY"]
                  : []),
              ],
            },
          }
        }
        if (!installer) throw new ToolError("DEPENDENCY_UNAVAILABLE")
        const native = themeWorkspacePrincipal(
          principal.accountId,
          principal.accountId,
        )
        const store = packageStore()
        const transfers = packageTransfers()
        switch (name) {
          case "list_packages": {
            const a = packageInputs[name].parse(input)
            const entries = store.list(native).map((row) => {
              const {
                contents: _contents,
                installedGameIds: _games,
                ...summary
              } = status(store.details(native, String(row.upload)))
              return packageSummarySchema.parse(summary)
            })
            const snapshot = hashJson(entries)
            const sign = (offset: number) =>
              createHmac("sha256", packageRuntimeSecret())
                .update(
                  `mcp-package-page:${principal.accountId}:${snapshot}:${offset}`,
                )
                .digest("base64url")
            let offset = 0
            if (a.cursor) {
              const match =
                /^pc1\.([1-9][0-9]{0,2})\.([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/u.exec(
                  a.cursor,
                )
              if (!match || match[2] !== snapshot)
                throw new ToolError("VALIDATION_FAILED")
              offset = Number(match[1])
              const actual = Buffer.from(match[3]),
                expected = Buffer.from(sign(offset))
              if (
                offset >= entries.length ||
                actual.length !== expected.length ||
                !timingSafeEqual(actual, expected)
              )
                throw new ToolError("VALIDATION_FAILED")
            }
            const next = Math.min(entries.length, offset + (a.limit ?? 20))
            return {
              data: {
                items: entries.slice(offset, next),
                ...(next < entries.length
                  ? { nextCursor: `pc1.${next}.${snapshot}.${sign(next)}` }
                  : {}),
              },
            }
          }
          case "begin_package_upload": {
            const a = packageInputs[name].parse(input)
            const receipt = transfers.begin(principal.accountId, a)
            return {
              data: {
                ...receipt,
                uploadExpiresAt: new Date(Date.now() + 300_000).toISOString(),
                uploadUrl: `${origin}/api/packages/mcp-transfer/${transfers.issueUploadTicket(principal.accountId, receipt.transferId)}`,
              },
            }
          }
          case "write_package_upload_chunk":
            return {
              data: transfers.chunk(
                principal.accountId,
                packageInputs[name].parse(input),
              ),
            }
          case "complete_package_upload": {
            const a = packageInputs[name].parse(input)
            const result = transfers.operation(
              principal.accountId,
              name,
              a.idempotencyKey,
              hashJson(a),
              () =>
                status(
                  transfers.complete(
                    principal.accountId,
                    a.transferId,
                    (bytes, key) => {
                      if (inspectPackage(bytes).report.code && !runtime)
                        throw new PackageError("PACKAGE_RUNTIME_DISABLED", 409)
                      return store.upload(native, bytes, key)
                    },
                    (id) => store.details(native, id),
                  ),
                ),
            )
            return { data: result }
          }
          case "get_package_status": {
            const a = packageInputs[name].parse(input)
            store.acceptBuild(native, a.uploadId)
            return { data: status(store.details(native, a.uploadId)) }
          }
          case "build_package": {
            const a = packageInputs[name].parse(input)
            return {
              data: transfers.operation(
                principal.accountId,
                name,
                a.idempotencyKey,
                hashJson(a),
                () => {
                  store.requestBuild(native, a.uploadId)
                  return status(store.details(native, a.uploadId))
                },
                () => {
                  const receipt = store.details(native, a.uploadId)
                  sameRevision(receipt, a.expectedRevision)
                  if (receipt.code && !runtime)
                    throw new PackageError("PACKAGE_RUNTIME_DISABLED", 409)
                  if (
                    !["validated", "failed", "building"].includes(receipt.phase)
                  )
                    throw new ToolError("VALIDATION_FAILED")
                },
              ),
            }
          }
          case "preview_package": {
            const a = packageInputs[name].parse(input)
            store.acceptBuild(native, a.uploadId)
            const receipt = store.details(native, a.uploadId)
            sameRevision(receipt, a.expectedRevision)
            if (
              !["preview-ready", "installed"].includes(receipt.phase) ||
              (receipt.code && !runtime)
            )
              throw new ToolError("PREVIEW_UNAVAILABLE")
            const content = receipt.manifest.contents.find(
              (c) => c.kind === "game" && c.id === a.gameId,
            )
            if (!content) throw new ToolError("NOT_FOUND")
            return {
              data: {
                uploadId: a.uploadId,
                revision: receipt.revision,
                gameId: a.gameId,
                title: receipt.manifest.displayName,
                ...(content.themeRef
                  ? { themeId: content.themeRef.split("@")[0] }
                  : {}),
                previewUrl: `${origin}/studio/package-preview/${a.uploadId}/${receipt.revision}/${a.gameId}`,
              },
            }
          }
          case "delete_package_draft": {
            const a = packageInputs[name].parse(input)
            return {
              data: transfers.operation(
                principal.accountId,
                name,
                a.idempotencyKey,
                hashJson(a),
                () => {
                  store.uninstall(native, a.uploadId)
                  return {
                    uploadId: a.uploadId,
                    revision: a.expectedRevision,
                    deleted: true,
                  }
                },
                () => {
                  const receipt = store.details(native, a.uploadId)
                  sameRevision(receipt, a.expectedRevision)
                  if (
                    ["installed", "installing", "building"].includes(
                      receipt.phase,
                    )
                  )
                    throw new ToolError("VALIDATION_FAILED")
                },
              ),
            }
          }
          case "install_package": {
            const a = packageInputs[name].parse(input)
            const receipt = store.details(native, a.uploadId)
            sameRevision(receipt, a.expectedRevision)
            if (
              !["preview-ready", "installed"].includes(receipt.phase) ||
              a.selectedContentIds.some(
                (id) =>
                  !receipt.manifest.contents.some(
                    (content) => content.id === id,
                  ),
              )
            ) {
              throw new ToolError("VALIDATION_FAILED")
            }
            const request = transfers.installIntent(principal.accountId, {
              uploadId: a.uploadId,
              revision: a.expectedRevision,
              sourceDigest: receipt.sourceDigest,
              buildDigest: receipt.buildDigest,
              selectedContentIds: a.selectedContentIds,
              idempotencyKey: a.idempotencyKey,
            })
            const intent = transfers.readInstallIntent(
              principal.accountId,
              request.requestId,
            )
            if (intent.outcome)
              return {
                data: {
                  ...intent.outcome,
                  studioUrl: `${origin}/studio/games`,
                },
              }
            throw new ToolError("CONSENT_REQUIRED", {
              consentRequestId: request.requestId,
              consentUrl: `${origin}/studio/package-save-consent/${request.requestId}`,
            })
          }
          case "export_package": {
            const a = packageInputs[name].parse(input)
            let checked: { receipt: NativeReceipt; bytes: Buffer } | undefined
            return {
              data: transfers.operation(
                principal.accountId,
                name,
                a.idempotencyKey,
                hashJson(a),
                () => {
                  if (!checked) throw new ToolError("DEPENDENCY_UNAVAILABLE")
                  const { receipt, bytes } = checked
                  const token = transfers.issueExportTicket(
                    principal.accountId,
                    {
                      uploadId: a.uploadId,
                      sourceDigest: receipt.sourceDigest,
                      revision: receipt.revision,
                    },
                  )
                  return {
                    uploadId: a.uploadId,
                    revision: receipt.revision,
                    sha256: createHash("sha256").update(bytes).digest("hex"),
                    bytes: bytes.length,
                    downloadUrl: `${origin}/api/packages/mcp-export/${token}`,
                    expiresAt: new Date(Date.now() + 300_000).toISOString(),
                  }
                },
                () => {
                  const receipt = store.details(native, a.uploadId)
                  sameRevision(receipt, a.expectedRevision)
                  checked = { receipt, bytes: store.export(native, a.uploadId) }
                },
              ),
            }
          }
        }
        throw new ToolError("VALIDATION_FAILED")
      } catch (error) {
        return translateError(error)
      }
    },
  })
}
