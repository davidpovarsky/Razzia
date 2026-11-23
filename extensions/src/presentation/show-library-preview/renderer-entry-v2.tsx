import { restoreNativeCspConfiguration } from "./renderer-csp-admission"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { builtDefinitions } from "virtual:tadazz-native-v2-definitions"
import {
  nativePreviewRendererInputV2Schema,
  type NativePreviewCandidateMountV2,
  type NativePreviewRendererInputV2,
} from "../../core/show-library/native-preview-renderer-v2-schema"
import { resolveBundledPreviewThemeV2 } from "./native-theme-admission-v2"
import { NativePreviewStage } from "./NativePreviewStage"
import { NativeRazziaPreviewV2 } from "./NativeRazziaPreviewV2"
import { ShowThemeScope } from "../show-themes/context"
import type { TadazzStageHandle } from "../tadazz-show/TadazzStage"

restoreNativeCspConfiguration()
const identities = new WeakMap<object, number>()
let nextIdentity = 0

/** Separate V2 ABI. It cannot register a pin, load a module or admit a V1 input. */
export const mountCompositionPreviewCandidateV2: NativePreviewCandidateMountV2 =
  (element, onUnavailable) => {
    if (!(element.getRootNode() instanceof ShadowRoot)) {
      throw new Error("show-preview:isolated-root-required")
    }

    const root = createRoot(element)
    let disposed = false
    let fitRevision = 0
    let current: NativePreviewRendererInputV2 | null = null
    let theme: ReturnType<typeof resolveBundledPreviewThemeV2> | null = null
    let handleId: number | null = null
    const lifecycle: Array<{
      event: "mounted" | "disposed"
      handleId: number
    }> = []
    const observe = (value: TadazzStageHandle | HTMLDivElement | null) => {
      const next =
        value === null ? null : (identities.get(value) ?? (nextIdentity += 1))

      if (value !== null) {
        identities.set(value, next!)
      }

      if (handleId === next) {
        return
      }

      if (handleId !== null) {
        lifecycle.push({ event: "disposed", handleId })
      }

      handleId = next

      if (next !== null) {
        lifecycle.push({ event: "mounted", handleId: next })
      }

      if (lifecycle.length > 64) {
        lifecycle.splice(0, lifecycle.length - 64)
      }
    }
    const render = () => {
      if (disposed || !current || !theme) {
        return
      }

      const input = current
      const key = `${input.frame.role}:${input.frame.revision}:${input.frame.epoch}:${input.themeBinding.theme.id}:${input.themeBinding.compositionDocumentSha256}`
      // This is the imperative host boundary. Commit the admitted snapshot before
      // returning so a deferred React task cannot leave a previous card visible.
      flushSync(() =>
        root.render(
          theme!.definition.rendererId === "tadazz-classic-stage" ? (
            <NativePreviewStage
              key={key}
              frame={input.frame}
              locale={input.locale}
              reducedMotion={input.reducedMotion}
              fitRevision={fitRevision}
              onUnavailable={onUnavailable}
              onStageHandle={observe}
              resolvedTheme={theme!}
            />
          ) : (
            <ShowThemeScope key={key} theme={theme!}>
              <NativeRazziaPreviewV2
                input={input}
                theme={theme!}
                rootRef={observe}
              />
            </ShowThemeScope>
          ),
        ),
      )
    }
    const resize = new ResizeObserver(() => {
      fitRevision += 1

      render()
    })
    resize.observe(element)

    return {
      update(input) {
        if (disposed) {
          throw new Error("show-preview:disposed")
        }

        const parsed = nativePreviewRendererInputV2Schema.parse(input)
        const resolved = resolveBundledPreviewThemeV2(
          parsed.themeBinding,
          builtDefinitions,
        )

        // Classic's native choreography has not yet adopted these optional CSS
        // presets. Never accept settings that this concrete adapter would ignore.
        if (
          resolved.definition.rendererId === "tadazz-classic-stage" &&
          (Object.values(parsed.themeBinding.settings.stageAnimations).some(
            (slot) => slot.preset !== "none",
          ) ||
            parsed.themeBinding.settings.questionDecoration.enabled)
        ) {
          throw new Error("show-preview:classic-visual-settings-unavailable")
        }

        current = parsed
        theme = resolved
        render()
      },
      dispose() {
        if (disposed) {
          return
        }

        disposed = true
        resize.disconnect()
        root.unmount()
        current = null
        theme = null
      },
      diagnostics() {
        return {
          disposed,
          handleId,
          lifecycle: lifecycle.map((entry) => ({ ...entry })),
        }
      },
    }
  }
