import {
  sessionMatchesSelection,
  previewUnavailableReasonSchema,
  previewSelectionSchema,
  previewPreferencesSchema,
  type GamePreviewProvider,
  type GamePreviewSession,
  type PreviewSelection,
  type PreviewSnapshot,
  type PreviewUnavailableReason,
  type PreviewPreferences,
} from "./contracts"
import type { createPreviewCoordinator } from "./coordinator"

export type PreviewConsumerState =
  | { status: "inactive" | "loading" }
  | { status: "unavailable"; reason: PreviewUnavailableReason }
  | { status: "ready"; snapshot: PreviewSnapshot }

type Coordinator = ReturnType<typeof createPreviewCoordinator>
type Lease = ReturnType<Coordinator["claim"]>
interface Activation {
  lease: Lease | null
  session: GamePreviewSession | null
  unsubscribe: (() => void) | null
  mounting: Promise<void> | null
  released: boolean
  mounted: boolean
  drained: Promise<void> | null
}

/** Lazy original-provider lifecycle. No playback clock, stage implementation or data cache. */
export function createPreviewSessionOwner({
  coordinator,
  provider,
  selection,
  preferences,
  onState,
}: {
  coordinator: Coordinator
  provider?: GamePreviewProvider
  selection: PreviewSelection
  preferences?: Readonly<PreviewPreferences>
  onState: (state: PreviewConsumerState) => void
}) {
  let current: Activation | null = null
  let disposed = false
  const parsedSelection = previewSelectionSchema.safeParse(selection)
  const selected = parsedSelection.success
    ? Object.freeze(parsedSelection.data)
    : null
  const parsedPreferences =
    preferences === undefined
      ? undefined
      : previewPreferencesSchema.safeParse(preferences)
  const emit = (state: PreviewConsumerState) => {
    if (!disposed) {
      onState(state)
    }
  }
  const owns = (activation: Activation) =>
    !disposed &&
    current === activation &&
    activation.lease?.isCurrent() === true
  const usable = (activation: Activation) =>
    owns(activation) && !activation.released

  function release(activation: Activation): Promise<void> {
    if (activation.drained) {
      return activation.drained
    }

    activation.released = true
    activation.mounted = false
    const { unsubscribe, session } = activation
    activation.unsubscribe = null
    activation.session = null
    const settled = Promise.withResolvers<undefined>()
    activation.drained = settled.promise
    const cleanup = async () => {
      // Revoke original transitions/audio now, before waiting for an async mount.
      let failed = false

      try {
        unsubscribe?.()
      } catch {
        failed = true
      }

      try {
        await session?.dispose()
      } catch {
        failed = true
      }

      await activation.mounting?.catch(() => undefined)

      if (failed) {
        throw new Error("inline-preview:cleanup-unavailable")
      }
    }
    void cleanup().then(() => settled.resolve(undefined), settled.reject)

    return activation.drained
  }

  async function fail(activation: Activation) {
    await release(activation).catch(() => undefined)

    if (owns(activation)) {
      emit({ status: "unavailable", reason: "playback-unavailable" })
    }
  }

  return {
    async open(element: HTMLElement) {
      if (disposed) {
        return
      }

      const activation: Activation = {
        lease: null,
        session: null,
        unsubscribe: null,
        mounting: null,
        released: false,
        mounted: false,
        drained: null,
      }
      activation.lease = coordinator.claim(() => {
        if (current === activation) {
          current = null
          emit({ status: "inactive" })
        }

        return release(activation)
      })

      if (!activation.lease.isCurrent()) {
        return
      }

      current = activation
      emit({ status: "loading" })

      if (!(await activation.lease.ready())) {
        if (owns(activation)) {
          emit({ status: "unavailable", reason: "playback-unavailable" })
        }

        return
      }

      if (!provider || !selected || parsedPreferences?.success === false) {
        emit({ status: "unavailable", reason: "source-unavailable" })

        return
      }

      try {
        const result = parsedPreferences?.success
          ? await provider.open(
              selected,
              activation.lease.signal,
              Object.freeze(parsedPreferences.data),
            )
          : await provider.open(selected, activation.lease.signal)

        if (!usable(activation)) {
          // Open is projection-only. A late result never gets a stage mount.
          if (result.status === "ready") {
            await result.session.dispose()
          }

          return
        }

        if (result.status === "unavailable") {
          const reason = previewUnavailableReasonSchema.safeParse(result.reason)
          emit({
            status: "unavailable",
            reason: reason.success ? reason.data : "source-unavailable",
          })

          return
        }

        activation.session = result.session

        if (!sessionMatchesSelection(result.session, selected)) {
          await release(activation)

          if (owns(activation)) {
            emit({ status: "unavailable", reason: "renderer-unavailable" })
          }

          return
        }

        const { session } = result
        activation.mounting = Promise.resolve().then(async () => {
          if (usable(activation)) {
            await session.mount(element, { muted: true })
          }
        })
        await activation.mounting

        if (!usable(activation)) {
          return
        }

        activation.mounted = true
        const publish = () => {
          if (!usable(activation)) {
            return
          }

          try {
            emit({ status: "ready", snapshot: session.snapshot() })
          } catch {
            void fail(activation)
          }
        }
        const unsubscribe = session.subscribe(publish)

        if (!usable(activation)) {
          unsubscribe()
        } else {
          activation.unsubscribe = unsubscribe
        }

        publish()
      } catch {
        // Do not forward provider errors, tokens, private titles or paths to DOM.
        await fail(activation)
      }
    },
    session() {
      return current?.mounted && owns(current) && !current.released
        ? current.session
        : null
    },
    close() {
      current?.lease?.release()
    },
    fail() {
      if (current && owns(current)) {
        return fail(current)
      }

      return Promise.resolve()
    },
    dispose() {
      disposed = true
      current?.lease?.release()
    },
  }
}
