import { requireLibraryValue } from "../../../core/show-library/required"
// oxlint-disable typescript/no-unnecessary-condition -- Optional draft fields are checked before admitting a runtime appearance.
import type { GamePreviewProvider, PreviewPreferences } from "./contracts"
import { SiteApiError } from "../../adapters/client"
import { createAccountPreviewAccess } from "./account-provider"
import { sanitizeAuthoredShowForPreview } from "../../../core/show-library/sanitized-authored-preview"
import { canonicalJson, sha256 } from "../../../core/show-library/digest"
import { normalizeApplicationPreviewDraft } from "../../../core/show-library/application-preview-input"
import { resolveApplicationPreviewPlan } from "../../../core/show-library/application-preview-resolve"
import { loadApplicationPreviewRuntime } from "./application-runtime"
import { createApplicationPreviewSession } from "./application-session"
import { nativePreviewScopeIds } from "../../../core/show-library/native-preview-scopes"
import type { TimelineItem } from "../../../core/studio-timeline-schema"

// Local unsaved authoring data, authenticated account media and the same native owner.
// This adapter has no save/import/room/score operation and exports no private source.
export function createAuthoredPreviewProvider(
  accountId: string,
  id: string,
  getSource: () => {
    version: object
    show: () => unknown
    timeline?: readonly TimelineItem[]
  },
): GamePreviewProvider {
  const access = createAccountPreviewAccess(accountId)

  return {
    async open(
      selection,
      signal,
      preferences: Readonly<PreviewPreferences> = {
        locale: "en",
        reducedMotion: false,
      },
    ) {
      if (selection.kind !== "account-owned" || selection.quizId !== id) {
        return { status: "unavailable", reason: "source-unavailable" }
      }

      try {
        await access.assertSession(signal)
        const snapshot = getSource(),
          show = sanitizeAuthoredShowForPreview(snapshot.show())
        const urls = new Set<string>()
        const visit = (value: unknown) => {
          if (typeof value === "string" && value.startsWith("/media/")) {
            urls.add(value)
          }

          if (Array.isArray(value)) {
            value.forEach(visit)
          } else if (value && typeof value === "object") {
            Object.values(value).forEach(visit)
          }
        }
        visit(show)
        const assets = urls.size
          ? await access.authorizeMedia([...urls].sort(), signal)
          : []
        const source = {
          kind: "account-owned" as const,
          quizId: id,
          immutableRevision: sha256(canonicalJson(show)),
        }
        const draft = normalizeApplicationPreviewDraft(
          { source, show, assets },
          { role: "spectator", ...preferences },
        )
        const plan = resolveApplicationPreviewPlan(draft)

        if (plan.resolution.kind === "unavailable") {
          return { status: "unavailable", reason: "renderer-unavailable" }
        }

        const pin = show.defaults?.showComposition

        if (
          pin &&
          plan.resolution.pin?.rendererBuildSha256 !== pin.rendererBuildSha256
        ) {
          return { status: "unavailable", reason: "renderer-unavailable" }
        }

        const appearance = pin
          ? await access.readComposition(pin, signal)
          : undefined
        const runtime = await loadApplicationPreviewRuntime(signal)
        const session = createApplicationPreviewSession({
          source,
          show: draft.show,
          scopeIds: snapshot.timeline
            ? nativePreviewScopeIds(show, snapshot.timeline)
            : undefined,
          plan,
          preferences,
          runtime,
          authorizeMedia: (requestedUrls, nextSignal) =>
            access.authorizeMedia(requestedUrls, nextSignal),
          revalidate: async (nextSignal) => {
            await access.assertSession(nextSignal)

            if (getSource().version !== snapshot.version) {
              throw new SiteApiError(409, "preview-draft-changed")
            }

            if (
              assets.length &&
              JSON.stringify(
                await access.authorizeMedia(
                  assets.map((asset) => asset.url),
                  nextSignal,
                ),
              ) !== JSON.stringify(assets)
            ) {
              throw new SiteApiError(409, "preview-assets-changed")
            }

            if (pin) {
              await access.readComposition(pin, nextSignal)
            }
          },
        })

        try {
          if (getSource().version !== snapshot.version) {
            throw new SiteApiError(409, "preview-draft-changed")
          }

          if (appearance) {
            if (
              appearance.document.selection.id !==
                show.defaults?.showTheme?.id ||
              appearance.document.selection.version !==
                show.defaults?.showTheme?.version
            ) {
              throw new SiteApiError(409, "preview-theme-changed")
            }

            await requireLibraryValue(session.setAppearance?.bind(session))(
              {
                ...appearance,
                document: {
                  ...appearance.document,
                  selection: show.defaults.showTheme,
                },
              },
              signal,
            )
          }
        } catch (error) {
          await session.dispose()
          throw error
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
