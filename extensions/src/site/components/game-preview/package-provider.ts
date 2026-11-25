import { getClientId } from "@razzia/web/lib/session"
import { SiteApiError } from "../../adapters/client"
import { applicationPackagePreviewSchema } from "../../../core/show-library/application-package-preview"
import { normalizeApplicationPreviewDraft } from "../../../core/show-library/application-preview-input"
import { resolveApplicationPreviewPlan } from "../../../core/show-library/application-preview-resolve"
import { sanitizeAuthoredShowForPreview } from "../../../core/show-library/sanitized-authored-preview"
import { canonicalJson, sha256 } from "../../../core/show-library/digest"
import {
  assertBoundedJson,
  freeze,
} from "../../../core/show-library/primitives"
import { loadApplicationPreviewRuntime } from "./application-runtime"
import { createApplicationPreviewSession } from "./application-session"
import type { GamePreviewProvider, PreviewPreferences } from "./contracts"

/** A private unsaved package uses the native preview clock and isolated renderer. */
export function createPackagePreviewProvider(options: {
  accountId: string
  selectionId: string
  uploadId: string
  revision: number
  sourceDigest: string
  buildDigest: string | null
  packageId: string
  packageVersion: string
  read: (signal: AbortSignal) => Promise<unknown>
}): GamePreviewProvider {
  const read = async (signal: AbortSignal) => {
    if (getClientId() !== options.accountId) {
      throw new SiteApiError(403, "preview-account-changed")
    }

    const value = await options.read(signal)
    assertBoundedJson(value)

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new SiteApiError(409, "preview-package-invalid")
    }

    const { show: authored, ...receipt } = value as Record<string, unknown>
    const context = applicationPackagePreviewSchema.parse(receipt)

    if (getClientId() !== options.accountId) {
      throw new SiteApiError(403, "preview-account-changed")
    }

    if (
      context.uploadId !== options.uploadId ||
      context.revision !== options.revision ||
      context.sourceDigest !== options.sourceDigest ||
      context.buildDigest !== options.buildDigest ||
      context.definitions.some(
        (definition) =>
          definition.runtime &&
          (definition.runtime.packageId !== options.packageId ||
            definition.runtime.version !== options.packageVersion),
      )
    ) {
      throw new SiteApiError(409, "preview-package-changed")
    }

    const show = sanitizeAuthoredShowForPreview(authored)
    const { runtimeUrls: _ephemeral, ...immutableContext } = context

    return {
      show,
      context: freeze(context),
      fingerprint: sha256(canonicalJson({ show, ...immutableContext })),
    }
  }

  return {
    async open(
      selection,
      signal,
      preferences: Readonly<PreviewPreferences> = {
        locale: "en",
        reducedMotion: false,
      },
    ) {
      if (
        selection.kind !== "account-owned" ||
        selection.quizId !== options.selectionId
      ) {
        return { status: "unavailable", reason: "source-unavailable" }
      }

      try {
        const initial = await read(signal)
        let currentContext = initial.context
        let runtimeReceiptAt = Date.now()
        const revalidate = async (nextSignal: AbortSignal) => {
          const current = await read(nextSignal)

          if (current.fingerprint !== initial.fingerprint) {
            throw new SiteApiError(409, "preview-package-changed")
          }

          // Do not remount the frame on every question phase. Renew an expiring
          // runtime ticket only; its immutable source/build/media binding stays exact.
          if (Date.now() - runtimeReceiptAt > 240_000) {
            currentContext = current.context
            runtimeReceiptAt = Date.now()
          }
        }
        const source = {
          kind: "account-owned" as const,
          quizId: options.selectionId,
          immutableRevision: initial.fingerprint,
        }
        const draft = normalizeApplicationPreviewDraft(
          {
            source,
            show: initial.show,
            assets: initial.context.assets,
            packageContext: initial.context,
          },
          { role: "spectator", ...preferences },
        )
        const plan = resolveApplicationPreviewPlan(draft)

        if (plan.resolution.kind === "unavailable") {
          return { status: "unavailable", reason: "renderer-unavailable" }
        }

        const runtime = await loadApplicationPreviewRuntime(signal)
        signal.throwIfAborted()

        return {
          status: "ready",
          session: createApplicationPreviewSession({
            source,
            show: draft.show,
            plan,
            preferences,
            runtime,
            revalidate,
            getPackageContext: () => {
              if (getClientId() !== options.accountId) {
                throw new SiteApiError(403, "preview-account-changed")
              }

              return currentContext
            },
            authorizeMedia: async (urls, nextSignal) => {
              await revalidate(nextSignal)

              return urls.map((url) => {
                const asset = initial.context.assets.find(
                  (entry) => entry.url === url,
                )

                if (!asset) {
                  throw new SiteApiError(403, "preview-package-media-denied")
                }

                return asset
              })
            },
          }),
        }
      } catch (error) {
        if (signal.aborted) {
          throw error
        }

        const status =
          error && typeof error === "object" && "status" in error
            ? error.status
            : undefined

        const getUnavailableReason = ():
          "access-denied" | "stale-revision" | "source-unavailable" => {
          if (status === 401 || status === 403) {
            return "access-denied"
          }

          if (status === 409) {
            return "stale-revision"
          }

          return "source-unavailable"
        }

        return {
          status: "unavailable",
          reason: getUnavailableReason(),
        }
      }
    },
  }
}
