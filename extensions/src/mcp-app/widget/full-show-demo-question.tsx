import NativeButton from "../../../../packages/web/src/components/Button"
import { useCallback, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { FullShowFrameV3 } from "../contracts/full-show-frame.ts"
import type { FullShowPlaybackSnapshot } from "../client/full-show-playback.ts"
import { hashJson } from "../contracts/canonical.ts"
import type { ResolvedShowTheme } from "../../core/show-themes/resolve.ts"
import type { TadazzStageHandle } from "../../presentation/tadazz-show/TadazzStage.tsx"
import { NativePreviewStage } from "../../presentation/show-library-preview/NativePreviewStage.tsx"
import { NativeRazziaPreviewV2 } from "../../presentation/show-library-preview/NativeRazziaPreviewV2.tsx"
import { NativeStageViewportV3 } from "./native-stage-viewport.tsx"

export interface FullShowDemoLabels {
  choose: string
  selected: (answerNumber: number) => string
  reveal: string
  correct: string
  incorrect: string
  survey: string
}

// Only the local selected index is retained. The parent keys this component by
// draft/revision/question/explicit replay; votes and correctness remain host data.
export function FullShowDemoQuestionV3({
  input,
  theme,
  playback,
  onUnavailable,
  controlsTarget,
  onReveal,
  labels,
}: {
  input: FullShowFrameV3
  theme: ResolvedShowTheme
  playback: FullShowPlaybackSnapshot
  onUnavailable: () => void
  controlsTarget?: HTMLDivElement | null
  onReveal?: () => void
  labels?: FullShowDemoLabels
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const stage = useRef<TadazzStageHandle | null>(null)
  const attachStage = useCallback((handle: TadazzStageHandle | null) => {
    stage.current = handle
  }, [])
  const { content } = input

  if (content.kind !== "question") {
    throw new Error("full-show:question-required")
  }

  const { frame } = content
  const canChoose = Boolean(
    controlsTarget &&
    onReveal &&
    labels &&
    (frame.phase === "answerCards" || frame.phase === "voting"),
  )
  const count = frame.choices.length
  const choose = useCallback(
    (index: number) => {
      if (
        !canChoose ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= count
      ) {
        return
      }

      setSelectedIndex(index)
      stage.current?.setSelectedOptions([index])
    },
    [canChoose, count],
  )
  const nativeFrame = {
    ...frame,
    epoch: playback.clock.epoch,
    clock: {
      elapsedMs: playback.clock.elapsedMs,
      deadlineMs: playback.clock.deadlineMs,
      paused: playback.clock.paused,
    },
  }
  // Phase clocks reset at question/answers/results boundaries. The parent owns
  // question/revision/explicit-replay identity, so keep the native stage mounted.
  const selected = selectedIndex === null ? null : frame.choices[selectedIndex]
  const result = selected
    ? frame.results?.find((value) => value.answerId === selected.id)
    : undefined
  let resultLabel: string | null = null
  let resultKind: "survey" | "correct" | "incorrect" = "survey"

  if (labels && selected && frame.phase === "results") {
    resultLabel = labels.survey

    if (result?.correct === true) {
      resultLabel = labels.correct
      resultKind = "correct"
    } else if (result?.correct === false) {
      resultLabel = labels.incorrect
      resultKind = "incorrect"
    }
  }

  return (
    <>
      {theme.definition.rendererId === "tadazz-classic-stage" ? (
        <NativePreviewStage
          frame={nativeFrame}
          locale={input.inventory.context.locale}
          reducedMotion={input.inventory.context.reducedMotion}
          fitRevision={0}
          resolvedTheme={theme}
          presentation={input.presentation}
          continuousPlayback
          onUnavailable={onUnavailable}
          onStageHandle={attachStage}
          onDemoSelect={canChoose ? choose : undefined}
        />
      ) : (
        <NativeStageViewportV3 enabled onUnavailable={onUnavailable}>
          <NativeRazziaPreviewV2
            theme={theme}
            presentation={input.presentation}
            continuousPlayback
            selectedAnswer={selectedIndex}
            onSelectAnswer={canChoose ? choose : undefined}
            input={{
              inputVersion: 2,
              frame: nativeFrame,
              locale: input.inventory.context.locale,
              reducedMotion: input.inventory.context.reducedMotion,
              themeBinding: {
                format: "tadazz-native-preview-theme",
                schemaVersion: 2,
                portVersion: 3,
                identityRuleVersion: 2,
                questionId: frame.question.id,
                role: frame.role,
                draftRevision: frame.revision,
                theme: { id: input.theme.id, version: input.theme.version },
                rendererId: input.theme.rendererId,
                definitionSha256: input.theme.definitionSha256,
                compositionDocumentSha256: hashJson(input.theme),
                slots: input.theme.slots,
                settings: content.visualSettings,
              },
            }}
          />
        </NativeStageViewportV3>
      )}
      {controlsTarget &&
        labels &&
        onReveal &&
        createPortal(
          <div
            className="widget-toolbar"
            data-testid="full-show-demo-controls"
            data-demo-selected-index={selectedIndex ?? ""}
            data-demo-question={frame.question.id}
          >
            <span data-testid="full-show-demo-selection" aria-live="polite">
              {selectedIndex === null
                ? labels.choose
                : labels.selected(selectedIndex + 1)}
            </span>
            {resultLabel && (
              <span
                data-testid="full-show-demo-result"
                data-demo-result={resultKind}
                aria-live="polite"
              >
                {resultLabel}
              </span>
            )}
            {frame.phase !== "results" && (
              <NativeButton
                classNameContent="contents"
                data-control-source="razzia"
                type="button"
                data-testid="full-show-demo-reveal"
                disabled={!canChoose || (count > 0 && selectedIndex === null)}
                onClick={onReveal}
              >
                {labels.reveal}
              </NativeButton>
            )}
          </div>,
          controlsTarget,
        )}
    </>
  )
}
