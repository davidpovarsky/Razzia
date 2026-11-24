import "./browser-i18n"
import { createRoot } from "react-dom/client"
import { useEffect, useState } from "react"
import { Toaster } from "react-hot-toast"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  useParams,
} from "@tanstack/react-router"
import { Controller, useFormContext } from "react-hook-form"
import {
  QuizzEditorProvider,
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import {
  StudioEditorProvider,
  useStudioEditor,
} from "@razzia/web/features/quizz/components/studio/studio-editor-context"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import { EditorEditingModeProvider } from "@razzia/web/features/quizz/components/studio/editor-editing-mode"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import type { QuizzWithId } from "@razzia/common/types/game"

function Controls() {
  const studio = useStudioEditor()
  const editor = useQuizzEditor()
  const { control, setValue, formState } = useFormContext<QuizzFormValues>()
  useEffect(() => {
    Object.assign(window, {
      fixtureLateEdit: () =>
        setValue("subject", "Newer edit during create", { shouldDirty: true }),
    })
  }, [setValue])
  const scene =
    studio.selectedTimelineItem?.kind !== "question" &&
    studio.selectedTimelineItem
      ? studio.scenes[studio.selectedTimelineItem.sceneId]
      : null
  return (
    <>
      <QuizzEditorHeader />
      <fieldset
        disabled={editor.extrasStatus !== "ready" || formState.isSubmitting}
        inert={formState.isSubmitting}
      >
        <div className="actions">
          <Button
            data-testid="add-question"
            onClick={() => studio.addTimelineCard("quiz")}
          >
            Add question
          </Button>
          <Button
            data-testid="add-scene"
            onClick={() => studio.addTimelineCard("transition")}
          >
            Add scene
          </Button>
          <Button
            data-testid="duplicate"
            onClick={() =>
              studio.duplicateTimelineCard(studio.selectedTimelineIndex)
            }
          >
            Duplicate
          </Button>
          <Button
            data-testid="remove"
            onClick={() =>
              studio.removeTimelineCard(studio.selectedTimelineIndex)
            }
          >
            Remove
          </Button>
          <Button
            data-testid="move-first"
            onClick={() =>
              studio.reorderTimelineCards(studio.selectedTimelineIndex, 0)
            }
          >
            Move first
          </Button>
          <Button
            data-testid="convert-scene"
            onClick={() => studio.changeSelectedCardKind("transition")}
          >
            Convert to scene
          </Button>
          <Button
            data-testid="convert-survey"
            onClick={() => studio.changeSelectedCardKind("survey")}
          >
            Convert to survey
          </Button>
          <Button
            data-testid="convert-quiz"
            onClick={() => studio.changeSelectedCardKind("quiz")}
          >
            Convert to quiz
          </Button>
          <Button
            data-testid="edit-audio"
            onClick={() =>
              editor.setExtras((value) =>
                value
                  ? {
                      ...value,
                      audio: {
                        ...value.audio,
                        cues: {
                          ...value.audio.cues,
                          start: { ...value.audio.cues.start!, volume: 0.17 },
                        },
                      },
                    }
                  : value,
              )
            }
          >
            Audio edit
          </Button>
        </div>
        <div className="actions">
          {studio.timeline.map((item) => (
            <Button
              key={item.id}
              data-testid={`select-${item.id}`}
              onClick={() => studio.selectTimelineItem(item.id)}
            >
              {item.kind}
            </Button>
          ))}
        </div>
        {scene ? (
          <label>
            Scene title
            <Input
              data-testid="scene-title"
              value={scene.title ?? ""}
              onChange={(event) =>
                studio.updateSceneConfig(scene.id, {
                  title: event.target.value,
                })
              }
            />
          </label>
        ) : (
          <>
            <Controller
              control={control}
              name={`questions.${editor.currentIndex}.question`}
              render={({ field }) => (
                <label>
                  Question
                  <Input {...field} data-testid="question-text" />
                </label>
              )}
            />
            <Controller
              control={control}
              name={`questions.${editor.currentIndex}.answers.0`}
              render={({ field }) => (
                <label>
                  Answer A<Input {...field} data-testid="answer-a" />
                </label>
              )}
            />
            <Controller
              control={control}
              name={`questions.${editor.currentIndex}.answers.1`}
              render={({ field }) => (
                <label>
                  Answer B<Input {...field} data-testid="answer-b" />
                </label>
              )}
            />
          </>
        )}
      </fieldset>
      <output data-testid="inspector">
        {JSON.stringify({
          snapshot: studio.captureStudioSnapshot(),
          dirty: formState.isDirty || editor.isExtrasDirty,
          canUndo: studio.canUndo,
          canRedo: studio.canRedo,
          ready: editor.extrasStatus,
          draftConflict: studio.draftConflict,
          pending: Boolean(studio.pendingDraft),
        })}
      </output>
    </>
  )
}

function EditorFixture() {
  const { quizzId } = useParams({ strict: false }) as { quizzId: string }
  const [base, setBase] = useState<QuizzWithId | null>(null)
  useEffect(() => {
    let active = true
    setBase(null)
    if (quizzId !== "new")
      fetch(`/fixture/${quizzId}`)
        .then((response) => response.json())
        .then((data) => {
          if (active) setBase(data)
        })
    return () => {
      active = false
    }
  }, [quizzId])
  if (quizzId !== "new" && !base) return <p>Loading fixture</p>
  return (
    <QuizzEditorProvider initialData={base ?? undefined}>
      <StudioEditorProvider>
        <EditorEditingModeProvider>
          <Controls />
        </EditorEditingModeProvider>
      </StudioEditorProvider>
    </QuizzEditorProvider>
  )
}

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
})
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/manager/quizz/$quizzId",
  component: EditorFixture,
})
const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/manager/config",
  component: () => (
    <h1 data-testid="manager-config">Saved and returned to manager</h1>
  ),
})
const router = createRouter({
  routeTree: rootRoute.addChildren([editorRoute, configRoute]),
})
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
