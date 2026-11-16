import { useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { getClientId } from "@razzia/web/lib/session"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useStudioEditor } from "@razzia/web/features/quizz/components/studio/studio-editor-context"
import {
  nativeBundleToAuthoredShow,
  isQuizExtrasV2,
  quizExtrasV2Schema,
} from "../../core"
import { InlineGamePreviewBoundary } from "../../site/components/game-preview/boundary"
import { GamePreviewSurface } from "../../site/components/game-preview/game-preview-surface"
import { createAuthoredPreviewProvider } from "../../site/components/game-preview/authored-provider"
import { builderText } from "./strings"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"

/** Current editor data and existing converter; no draft save or temporary game. */
export function EditorReadonlyPreview({
  subject,
  readQuizz,
}: {
  subject: string
  readQuizz: () => QuizzFormValues
}) {
  const { i18n } = useTranslation(),
    [language] = i18n.language.split("-")
  const text = builderText(
    (["en", "fr", "de", "es", "it", "ja", "tr", "vi"].includes(language)
      ? language
      : "en") as PreviewLocale,
  )
  const { quizzId, questions, questionIds, extras } = useQuizzEditor()
  const {
    timeline,
    scenes,
    defaults,
    selectedTimelineIndex,
    selectedTimelineItem,
  } = useStudioEditor()
  const version = useMemo(
    () => ({}),
    [subject, questions, questionIds, extras, timeline, scenes, defaults],
  )
  const latest = useRef({ version, timeline, show: (): unknown => null })
  latest.current = {
    version,
    timeline,
    show: () => {
      if (!extras || !isQuizExtrasV2(extras)) {
        throw new Error("Authoring draft not ready")
      }

      const current = quizExtrasV2Schema.parse({
        ...extras,
        timeline,
        scenes,
        defaults,
        questionIds,
      })

      return nativeBundleToAuthoredShow(
        { quizz: readQuizz(), extras: current },
        { includePrivateRoster: false },
      )
    },
  }
  const accountId = getClientId(),
    id = `draft-${quizzId ?? "unsaved"}`
  const provider = useMemo(
    () =>
      accountId
        ? createAuthoredPreviewProvider(accountId, id, () => latest.current)
        : undefined,
    [accountId, id],
  )
  const preceding = timeline.slice(0, selectedTimelineIndex + 1)
  const question = selectedTimelineItem?.kind === "question"
  const ordinal = preceding.filter(
    (item) => (item.kind === "question") === question,
  ).length
  const selectedPrefix = question
    ? "Q"
    : `${selectedTimelineItem?.kind.toUpperCase()}_`
  const selectedKey = selectedTimelineItem
    ? `${selectedPrefix}${String(ordinal).padStart(2, "0")}`
    : undefined

  if (!provider) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {text("unavailable")}
      </p>
    )
  }

  return (
    <InlineGamePreviewBoundary enabled provider={provider} routeKey={version}>
      <div data-testid="editor-native-preview" className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">{text("draftPreview")}</p>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg">
          <GamePreviewSurface
            selection={{ kind: "account-owned", quizId: id }}
            label={text("nativePreview")}
            previewRole="manager"
            initialAuthoredKey={selectedKey}
            dismissOnOutside={false}
          >
            <div className="flex aspect-video w-full items-center justify-center">
              {text("nativePreview")}
            </div>
          </GamePreviewSurface>
        </div>
      </div>
    </InlineGamePreviewBoundary>
  )
}
