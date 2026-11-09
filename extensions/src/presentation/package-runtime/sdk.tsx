/* oxlint-disable typescript/no-non-null-assertion -- The trusted immutable document always creates the root before the SDK loads. */
import { useEffect, useState, type ComponentType } from "react"
import { createRoot } from "react-dom/client"
import {
  parentMessageSchema,
  type RuntimeSnapshot,
} from "../../core/packages/protocol"

export interface ThemeSDK {
  snapshot: RuntimeSnapshot
  asset: (id: string) => string
  submitAnswer: (optionIds: string[]) => void
  requestAudioCue: (cueId: string) => void
}

/** Only this tiny versioned browser API is available to uploaded TSX. */
export function mount(
  Theme: ComponentType<ThemeSDK>,
  embeddedAssets: Record<string, string> = {},
) {
  let channel = "",
    sequence = 0,
    parentSequence = 0,
    epoch = 0
  let update: ((s: RuntimeSnapshot) => void) | null = null
  let latest: RuntimeSnapshot | null = null
  let assets: Record<string, string> = embeddedAssets
  const send = (value: Record<string, unknown>) => {
    sequence += 1
    window.parent.postMessage(
      {
        v: 1,
        channel,
        roomId: latest?.roomId ?? "",
        questionId: latest?.questionId ?? "",
        role: latest?.role ?? "spectator",
        sequence,
        epoch,
        ...value,
      },
      "*",
    )
  }
  function Root() {
    const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(latest)
    useEffect(() => {
      update = setSnapshot

      if (latest) {
        setSnapshot(latest)
      }

      return () => {
        update = null
      }
    }, [])

    if (!snapshot) {
      return null
    }

    return (
      <Theme
        snapshot={snapshot}
        asset={(id) => {
          if (!Object.hasOwn(assets, id)) {
            throw new Error("Unknown package asset")
          }

          return assets[id]
        }}
        submitAnswer={(optionIds) =>
          send({
            type: "ANSWER_INTENT",
            questionId: snapshot.questionId,
            optionIds,
          })
        }
        requestAudioCue={(cueId) => send({ type: "AUDIO_CUE_REQUEST", cueId })}
      />
    )
  }
  const root = createRoot(document.getElementById("root")!, {
    onUncaughtError: () =>
      send({ type: "RUNTIME_ERROR", code: "RENDER_FAILED" }),
  })
  root.render(<Root />)
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) {
      return
    }

    const parsed = parentMessageSchema.safeParse(event.data)

    if (!parsed.success) {
      return
    }

    const { data: value } = parsed

    if (value.type === "BOOTSTRAP" && !channel) {
      const { channel: receivedChannel } = value
      channel = receivedChannel
    }

    if (
      value.channel !== channel ||
      value.sequence <= parentSequence ||
      value.epoch < epoch
    ) {
      return
    }

    ;({ sequence: parentSequence, epoch } = value)

    if (value.type === "DISPOSE") {
      root.unmount()
      window.removeEventListener("message", onMessage)

      return
    }

    if (value.type === "BOOTSTRAP") {
      assets = { ...embeddedAssets, ...value.assetMap }
      latest = value.snapshot
      send({ type: "READY", runtimeApi: 1 })
    }

    latest = value.snapshot
    update?.(value.snapshot)
  }
  window.addEventListener("message", onMessage)
  window.addEventListener("error", () => {
    if (channel) {
      send({ type: "RUNTIME_ERROR", code: "RENDER_FAILED" })
    }
  })
  window.addEventListener("unhandledrejection", () => {
    if (channel) {
      send({ type: "RUNTIME_ERROR", code: "RENDER_FAILED" })
    }
  })
  const health = setInterval(() => {
    if (channel) {
      send({ type: "RENDER_HEALTH" })
    }
  }, 1000)
  window.addEventListener("pagehide", () => clearInterval(health), {
    once: true,
  })
}
