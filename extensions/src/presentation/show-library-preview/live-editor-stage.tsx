import {
  Component,
  lazy,
  Suspense,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useReducedMotion } from "motion/react"
import type { ApplicationPreviewFrame } from "../../core/show-library/application-preview-schema"
import type { TimelineItem } from "../../core/studio-timeline-schema"
import type { ScenePresenterProps } from "../scene-presenter"
import { createEditorPreviewSnapshot } from "./editor-preview-snapshot"
const ApplicationPreviewStage = lazy(async () => ({
  default: (await import("./application-preview-stage"))
    .ApplicationPreviewStage,
}))

interface StageProps {
  source: unknown
  enabled?: boolean
  authoredKey: string
  phase: string
  locale: string
  timeline?: readonly TimelineItem[]
  elapsedMs?: number
  deadlineMs?: number | null
  paused?: boolean
  replay?: number
  mediaRevealed?: boolean
  activeSceneData?: ScenePresenterProps["activeSceneData"]
  children: ReactNode
}

class PreviewFailureBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function ReadyEditorStage({
  frame,
  fallback,
  questionPosition,
  activeSceneData,
}: {
  frame: ApplicationPreviewFrame
  fallback: ReactNode
  questionPosition?: { number: number; total: number }
  activeSceneData?: ScenePresenterProps["activeSceneData"]
}) {
  const [unavailable, setUnavailable] = useState(false)

  if (unavailable) {
    return fallback
  }

  return (
    <Suspense fallback={fallback}>
      <ApplicationPreviewStage
        frame={frame}
        questionPosition={questionPosition}
        activeSceneData={activeSceneData}
        onCommitted={() => undefined}
        onUnavailable={() => setUnavailable(true)}
      />
    </Suspense>
  )
}

// Same in-process stage as the full-show preview, supplied by the open editor.
// Only current editor data enters this component; no room or persistence API.
// Incomplete drafts keep the original native presentational fallback visible.
export function LiveEditorStagePreview({
  source,
  enabled = true,
  authoredKey,
  phase,
  locale,
  timeline,
  elapsedMs = 0,
  deadlineMs = null,
  paused = true,
  replay = 0,
  mediaRevealed = false,
  activeSceneData,
  children,
}: StageProps) {
  const reducedMotion = useReducedMotion()
  const snapshot = useMemo(
    () => createEditorPreviewSnapshot(source, timeline, authoredKey),
    [source, timeline, authoredKey],
  )
  const chapterIndex =
    snapshot?.chapters.findIndex(
      (chapter) =>
        chapter.authoredKey === authoredKey && chapter.phase === phase,
    ) ?? -1
  const [language] = locale.split("-")
  const selectedLocale = (
    ["en", "fr", "de", "es", "it", "ja", "tr", "vi", "he"].includes(language)
      ? language
      : "en"
  ) as ApplicationPreviewFrame["locale"]
  // Source revision is independent of the playback clock.
  const revision = useMemo(
    () => JSON.stringify([snapshot?.show, authoredKey, selectedLocale, replay]),
    [snapshot, authoredKey, selectedLocale, replay],
  )
  const fallback = (
    <div
      data-editor-preview-fallback
      className="relative flex h-full min-h-0 w-full flex-1 flex-col"
    >
      {children}
    </div>
  )

  if (!enabled) {
    return children
  }

  if (
    !snapshot ||
    chapterIndex < 0 ||
    snapshot.show.defaults?.showComposition
  ) {
    return fallback
  }

  const frame: ApplicationPreviewFrame = {
    show: snapshot.show,
    chapterIndex,
    role: "manager",
    locale: selectedLocale,
    reducedMotion: Boolean(reducedMotion),
    soundEnabled: false,
    mediaRevealed,
    appearanceRevision: replay,
    scopeIds: snapshot.scopeIds,
    clock: {
      epoch: replay,
      sequence: 0,
      elapsedMs,
      deadlineMs,
      paused,
    },
  }

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 flex-col"
      data-editor-preview-renderer="application-native"
      lang={selectedLocale}
      dir={selectedLocale === "he" ? "rtl" : "ltr"}
    >
      <PreviewFailureBoundary key={revision} fallback={fallback}>
        <ReadyEditorStage
          frame={frame}
          fallback={fallback}
          questionPosition={snapshot.questionPosition}
          activeSceneData={activeSceneData}
        />
      </PreviewFailureBoundary>
    </div>
  )
}
