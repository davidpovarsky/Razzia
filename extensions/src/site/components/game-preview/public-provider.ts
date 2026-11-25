import { normalizeApplicationPreviewDraft } from "../../../core/show-library/application-preview-input"
import { resolveApplicationPreviewPlan } from "../../../core/show-library/application-preview-resolve"
import type { GamePreviewProvider } from "./contracts"
import { createApplicationPreviewSession } from "./application-session"
import { loadApplicationPreviewRuntime } from "./application-runtime"

/** Fixed public projection only. Never falls back to an account or accepts a tenant ID. */
export function createPublicPreviewProvider(): GamePreviewProvider {
  return {
    async open(
      selection,
      signal,
      preferences = { locale: "en", reducedMotion: false },
    ) {
      if (selection.kind !== "published-demo") {
        return { status: "unavailable", reason: "source-unavailable" }
      }

      const read = async (nextSignal: AbortSignal) => {
        const response = await fetch(
          `/api/extensions/preview/public/${encodeURIComponent(selection.catalogueId)}`,
          {
            signal: nextSignal,
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
          },
        )

        if (
          !response.ok ||
          Number(response.headers.get("Content-Length")) > 262144
        ) {
          throw new Error("Public example unavailable")
        }

        const value: unknown = await response.json()
        const draft = normalizeApplicationPreviewDraft(value, {
          ...preferences,
          role: "spectator",
        })

        if (
          draft.source.kind !== "published-demo" ||
          draft.source.catalogueId !== selection.catalogueId
        ) {
          throw new Error("Public example changed")
        }

        return draft
      }

      try {
        const draft = await read(signal)
        const plan = resolveApplicationPreviewPlan(draft)

        if (plan.resolution.kind !== "exact") {
          return { status: "unavailable", reason: "renderer-unavailable" }
        }

        const runtime = await loadApplicationPreviewRuntime(signal, true)
        signal.throwIfAborted()

        return {
          status: "ready",
          session: createApplicationPreviewSession({
            source: draft.source,
            show: draft.show,
            plan,
            preferences,
            runtime,
            authorizeMedia: (urls, nextSignal) => {
              nextSignal.throwIfAborted()

              if (urls.length) {
                return Promise.reject(new Error("Public account media denied"))
              }

              return Promise.resolve([])
            },
            revalidate: async (nextSignal) => {
              const latest = await read(nextSignal)

              if (
                latest.source.immutableRevision !==
                draft.source.immutableRevision
              ) {
                throw new Error("Public example changed")
              }
            },
          }),
        }
      } catch (error) {
        if (signal.aborted) {
          throw error
        }

        return { status: "unavailable", reason: "source-unavailable" }
      }
    },
  }
}
