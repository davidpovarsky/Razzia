import { requireLibraryValue } from "../../../core/show-library/required"
// oxlint-disable typescript/no-unnecessary-condition -- Persisted optional theme fields are checked at the runtime account boundary.
import { z } from "zod"
import { getClientId } from "@razzia/web/lib/session"
import {
  siteRequest,
  SiteApiError,
  currentAccount,
} from "../../adapters/client"
import { tadaShowV1Schema } from "../../../core/show-authoring-schema"
import { normalizeApplicationPreviewDraft } from "../../../core/show-library/application-preview-input"
import { resolveApplicationPreviewPlan } from "../../../core/show-library/application-preview-resolve"
import {
  previewSourceSchema,
  type GamePreviewProvider,
  type PreviewPreferences,
} from "./contracts"
import { loadApplicationPreviewRuntime } from "./application-runtime"
import { createApplicationPreviewSession } from "./application-session"
import {
  applicationCompositionPinSchema,
  type ApplicationCompositionPin,
} from "../../../core/show-library/application-composition-pin"
import {
  builderDigest,
  parseBuilderDocument,
} from "../../../components/theme-builder/document"

const sourceSchema = z.strictObject({
  source: previewSourceSchema,
  show: tadaShowV1Schema,
  assets: z
    .array(
      z.strictObject({
        url: z.string().max(2048),
        bytes: z.number().int().positive().max(100_000_000),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      }),
    )
    .max(256),
  chapters: z.array(z.unknown()).max(1024),
  sampleData: z.literal(true),
  scopeIds: z.record(z.string().max(160), z.uuid()),
})
const mediaBindingsSchema = sourceSchema.shape.assets

/** No private cache. Every open and chapter change rechecks the current account. */
export function createAccountPreviewAccess(accountId: string) {
  const read = async (quizId: string, signal: AbortSignal) => {
    if (getClientId() !== accountId) {
      throw new SiteApiError(403, "preview-account-changed")
    }

    const source = sourceSchema.parse(
      await siteRequest(
        `/api/extensions/preview/quizzes/${encodeURIComponent(quizId)}`,
        { signal },
      ),
    )

    if (
      getClientId() !== accountId ||
      source.source.kind !== "account-owned" ||
      source.source.quizId !== quizId
    ) {
      throw new SiteApiError(403, "preview-account-changed")
    }

    return source
  }
  const readComposition = async (
    pin: ApplicationCompositionPin,
    signal: AbortSignal,
  ) => {
    if (getClientId() !== accountId) {
      throw new SiteApiError(403, "preview-account-changed")
    }

    const result = await siteRequest<{
      document: unknown
      digest: string
      version: string
      admission: { rendererBuildSha256: string }
    }>(
      `/api/themes/builder/${encodeURIComponent(pin.workspaceId)}/documents/${encodeURIComponent(pin.documentId)}/published/${encodeURIComponent(pin.version)}`,
      { signal },
    )
    const document = parseBuilderDocument(result.document)

    if (
      getClientId() !== accountId ||
      document.id !== pin.documentId ||
      result.version !== pin.version ||
      result.digest !== pin.digest ||
      builderDigest(document) !== pin.digest ||
      result.admission.rendererBuildSha256 !== pin.rendererBuildSha256
    ) {
      throw new SiteApiError(409, "preview-composition-changed")
    }

    return { registry: document.registry, document: document.content }
  }

  return {
    readSource: read,
    readComposition,
    async authorizeMedia(urls: string[], signal: AbortSignal) {
      if (getClientId() !== accountId) {
        throw new SiteApiError(403, "preview-account-changed")
      }

      const result = await siteRequest<{ assets: unknown }>(
        "/api/extensions/preview/assets",
        { method: "POST", body: JSON.stringify({ urls }), signal },
      )
      const assets = mediaBindingsSchema.parse(result.assets)

      if (
        getClientId() !== accountId ||
        JSON.stringify(assets.map((asset) => asset.url)) !==
          JSON.stringify(urls)
      ) {
        throw new SiteApiError(403, "preview-assets-changed")
      }

      return assets
    },
    async assertSession(signal: AbortSignal) {
      if (getClientId() !== accountId) {
        throw new SiteApiError(403, "preview-account-changed")
      }

      const account = await currentAccount(signal)

      if (
        account.id !== accountId ||
        !account.verified ||
        getClientId() !== accountId
      ) {
        throw new SiteApiError(403, "preview-account-changed")
      }
    },
  }
}

export function createAccountPreviewProvider(
  accountId: string,
): GamePreviewProvider {
  const access = createAccountPreviewAccess(accountId)
  const { readSource: read, readComposition } = access

  return {
    async open(
      selection,
      signal,
      preferences: Readonly<PreviewPreferences> = {
        locale: "en",
        reducedMotion: false,
      },
    ) {
      if (selection.kind !== "account-owned") {
        return { status: "unavailable", reason: "source-unavailable" }
      }

      try {
        const source = await read(selection.quizId, signal)
        const draft = normalizeApplicationPreviewDraft(
          { source: source.source, show: source.show, assets: source.assets },
          { role: "spectator", ...preferences },
        )
        const plan = resolveApplicationPreviewPlan(draft)

        if (plan.resolution.kind === "unavailable") {
          return { status: "unavailable", reason: "renderer-unavailable" }
        }

        const pin = source.show.defaults?.showComposition
          ? applicationCompositionPinSchema.parse(
              source.show.defaults.showComposition,
            )
          : undefined

        if (
          pin &&
          plan.resolution.pin?.rendererBuildSha256 !== pin.rendererBuildSha256
        ) {
          return { status: "unavailable", reason: "renderer-unavailable" }
        }

        const published = pin ? await readComposition(pin, signal) : undefined

        if (
          published &&
          (published.document.selection.id !==
            source.show.defaults?.showTheme?.id ||
            published.document.selection.version !==
              source.show.defaults?.showTheme?.version)
        ) {
          throw new SiteApiError(409, "preview-theme-changed")
        }

        const appearance = published
          ? {
              ...published,
              document: {
                ...published.document,
                selection: requireLibraryValue(
                  requireLibraryValue(source.show.defaults).showTheme,
                ),
              },
            }
          : undefined
        const runtime = await loadApplicationPreviewRuntime(signal)
        signal.throwIfAborted()
        const session = createApplicationPreviewSession({
          source: source.source,
          show: draft.show,
          scopeIds: source.scopeIds,
          plan,
          preferences,
          runtime,
          authorizeMedia: (urls, nextSignal) =>
            access.authorizeMedia(urls, nextSignal),
          revalidate: async (nextSignal) => {
            const latest = await read(selection.quizId, nextSignal)

            if (
              latest.source.immutableRevision !==
                source.source.immutableRevision ||
              JSON.stringify(latest.assets) !== JSON.stringify(source.assets)
            ) {
              throw new SiteApiError(409, "preview-source-changed")
            }

            if (pin) {
              await readComposition(pin, nextSignal)
            }
          },
        })

        if (appearance) {
          try {
            await requireLibraryValue(session.setAppearance?.bind(session))(
              appearance,
              signal,
            )
          } catch (error) {
            await session.dispose()
            throw error
          }
        }

        return { status: "ready", session }
      } catch (error) {
        if (signal.aborted) {
          throw error
        }

        return {
          status: "unavailable",
          reason:
            error instanceof SiteApiError
              ? ((
                  {
                    401: "access-denied",
                    403: "access-denied",
                    409: "stale-revision",
                  } as const
                )[error.status as 401 | 403 | 409] ?? "source-unavailable")
              : "source-unavailable",
        }
      }
    },
  }
}
