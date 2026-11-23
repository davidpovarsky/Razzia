import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps"
import Button from "../../../../packages/web/src/components/Button"
import Input from "../../../../packages/web/src/components/Input"
import { draftTitle, withDraftTitle } from "./draft-fields.ts"
import { I18nextProvider, useTranslation } from "react-i18next"
import {
  nativePreviewRendererInputV2Schema,
  type NativePreviewRendererInputV2,
} from "../../core/show-library/native-preview-renderer-v2-schema"
import { CandidateStage } from "./stage.tsx"
import { createWidgetI18n, hostLocale, locales, type Locale } from "./i18n.ts"
import type { WidgetController } from "./controller.ts"

export interface PrivateFixtureQuery {
  locale: Locale
  theme: "tadazz-classic" | "razzia-original"
  question: "0" | "1"
  phase: "question" | "answerCards" | "results"
  paused: "true"
}

// Development-only injected, read-only producer port. Never inferred from query
// strings, tool text, arbitrary URLs or the presence of a V1 ready result.
export interface PrivateFixturePort {
  load(query: PrivateFixtureQuery, signal: AbortSignal): Promise<unknown>
}

export interface WidgetProps {
  controller: WidgetController
  context?: McpUiHostContext
  privateFixture?: PrivateFixturePort
  expand?: () => Promise<unknown>
  nativeSurface?: ReactNode
  requestPreview?: () => Promise<unknown>
  toolsAvailable?: boolean
}

export function Widget(props: WidgetProps) {
  const instance = useRef(createWidgetI18n())
  useEffect(() => {
    void instance.current.changeLanguage(hostLocale(props.context?.locale))
  }, [props.context?.locale])

  return (
    <I18nextProvider i18n={instance.current}>
      <WidgetContent {...props} />
    </I18nextProvider>
  )
}

function WidgetContent({
  controller,
  context,
  privateFixture,
  expand,
  nativeSurface,
  requestPreview,
  toolsAvailable = true,
}: WidgetProps) {
  const { t, i18n } = useTranslation("widget")
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot)
  const { draft } = state
  const [query, setQuery] = useState<PrivateFixtureQuery>({
    locale: "en",
    theme: "tadazz-classic",
    question: "0",
    phase: "answerCards",
    paused: "true",
  })
  const [input, setInput] = useState<NativePreviewRendererInputV2 | null>(null)
  const [fixtureState, setFixtureState] = useState<
    "loading" | "ready" | "error"
  >("loading")
  const [replay, setReplay] = useState(0)
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [text, setText] = useState("")
  const [dirty, setDirty] = useState(false)
  const [editRevision, setEditRevision] = useState<number | null>(null)
  const editDraft = useRef<string | null>(null)
  const editVersion = useRef(0)
  const previewVersion = useRef(0)
  const [previewPending, setPreviewPending] = useState(false)
  const previewReset =
    state.status === "loading" ||
    state.status === "cancelled" ||
    state.status === "closed"
  const previewKey = `${state.selectedDraftId ?? ""}:${draft?.revision ?? ""}:${hostLocale(context?.locale)}`
  useEffect(() => {
    previewVersion.current += 1
    setPreviewPending(false)
  }, [previewKey, previewReset])
  useEffect(() => {
    const id = state.selectedDraftId

    if (id !== editDraft.current) {
      editVersion.current += 1
      editDraft.current = id
      setText("")
      setDirty(false)
      setEditRevision(null)
    } else if (draft && !dirty) {
      setText(draft.authoredShowJson)
      setEditRevision(draft.revision)
    }
  }, [state.selectedDraftId, draft, dirty])
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(motion.matches)
    motion.addEventListener("change", update)

    return () => motion.removeEventListener("change", update)
  }, [])
  useEffect(() => {
    if (!privateFixture) {
      return
    }

    const abort = new AbortController()
    let disposed = false
    setInput(null)
    setFixtureState("loading")
    setVotes({})
    const timeout = setTimeout(() => {
      abort.abort()

      if (!disposed) {
        setFixtureState("error")
      }
    }, 10_000)
    void privateFixture
      .load({ ...query, locale: hostLocale(i18n.language) }, abort.signal)
      .then((raw) => {
        if (disposed || abort.signal.aborted) {
          return
        }

        const parsed = nativePreviewRendererInputV2Schema.parse(raw)

        if (
          parsed.locale !== hostLocale(i18n.language) ||
          parsed.themeBinding.theme.id !== query.theme ||
          parsed.frame.phase !== query.phase
        ) {
          throw new Error("widget:fixture-association")
        }

        setInput({ ...parsed, reducedMotion: reduced })
        setFixtureState("ready")
      })
      .catch(() => {
        if (!disposed) {
          setFixtureState("error")
        }
      })
      .finally(() => clearTimeout(timeout))

    return () => {
      disposed = true
      abort.abort()
      clearTimeout(timeout)
    }
  }, [privateFixture, query, i18n.language, reduced, replay])
  const closed = state.status === "closed"
  const showFixture = Boolean(privateFixture) && !closed
  let status: string | null = state.status

  if (closed) {
    status = "closed"
  } else if (showFixture) {
    status = fixtureState === "ready" ? null : fixtureState
  } else if (state.status === "ready" && !state.preview) {
    status = null
  }

  const count = Object.values(votes).reduce((sum, value) => sum + value, 0)

  return (
    <main
      className="widget-shell font-display"
      data-theme={context?.theme ?? "light"}
      lang={hostLocale(i18n.language)}
      dir={i18n.dir()}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <label className="flex items-center gap-2 text-sm">
          {t("language")}
          <select
            className="border-accent bg-background rounded-lg border-2 p-2"
            value={hostLocale(i18n.language)}
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
          >
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {new Intl.DisplayNames([locale], { type: "language" }).of(
                  locale,
                )}
              </option>
            ))}
          </select>
        </label>
      </header>
      <p className="font-semibold" data-testid="demo-label">
        {t("demo")}
      </p>
      {showFixture && (
        <p className="text-sm" data-testid="fixture-label">
          {t("fixture")}
        </p>
      )}
      <div role="status" aria-live="polite" data-testid="widget-status">
        {status
          ? t(status === "error" && showFixture ? "unavailable" : status)
          : null}
        {draft && !showFixture && (
          <span> · {t("revision", { revision: draft.revision })}</span>
        )}
      </div>
      {nativeSurface && (
        <div hidden={state.status !== "candidate"}>{nativeSurface}</div>
      )}
      {!privateFixture && draft && requestPreview && (
        <Button
          size="sm"
          disabled={
            !toolsAvailable ||
            state.status === "loading" ||
            dirty ||
            previewPending
          }
          onClick={() => {
            previewVersion.current += 1
            const version = previewVersion.current
            setPreviewPending(true)
            void requestPreview().finally(() => {
              if (previewVersion.current === version) {
                setPreviewPending(false)
              }
            })
          }}
        >
          {t("title")}
        </Button>
      )}
      {showFixture && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm">
              {t("theme")}{" "}
              <select
                className="border-accent bg-background rounded-lg border-2 p-2"
                value={query.theme}
                onChange={(event) =>
                  setQuery({
                    ...query,
                    theme: event.target.value as PrivateFixtureQuery["theme"],
                  })
                }
              >
                <option value="tadazz-classic">Classic</option>
                <option value="razzia-original">Razzia</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reduced}
                onChange={(event) => setReduced(event.target.checked)}
              />
              {t("reduce")}
            </label>
          </div>
          {input && fixtureState === "ready" && (
            <CandidateStage
              key={`${replay}:${query.theme}`}
              input={input}
              onUnavailable={() => {
                setInput(null)
                setFixtureState("error")
              }}
            />
          )}
          <nav aria-label={t("title")} className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={query.question === "0"}
              onClick={() => setQuery({ ...query, question: "0" })}
            >
              {t("previous")}
            </Button>
            <Button
              size="sm"
              disabled={query.question === "1"}
              onClick={() => setQuery({ ...query, question: "1" })}
            >
              {t("next")}
            </Button>
            {(["question", "answerCards", "results"] as const).map((phase) => (
              <Button
                size="sm"
                key={phase}
                aria-pressed={phase === query.phase}
                onClick={() => setQuery({ ...query, phase })}
              >
                {t(phase === "answerCards" ? "answers" : phase)}
              </Button>
            ))}
            <Button
              size="sm"
              onClick={() => {
                setQuery({ ...query, phase: "question" })
                setReplay((value) => value + 1)
              }}
            >
              {t("replay")}
            </Button>
          </nav>
          {input && (
            <fieldset className="border-accent rounded-xl border-2 p-3">
              <legend>
                {t("simulated")} · {count}
              </legend>
              <div className="flex flex-wrap gap-2">
                {input.frame.choices.map((answer) => (
                  <Button
                    size="sm"
                    key={answer.id}
                    onClick={() =>
                      setVotes((value) => ({
                        ...value,
                        [answer.id]: Math.min(99, (value[answer.id] ?? 0) + 1),
                      }))
                    }
                  >
                    {answer.label} · {votes[answer.id] ?? 0}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}
          <p className="text-sm">{t("sound")}</p>
        </>
      )}
      {!privateFixture && !closed && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={
                !toolsAvailable ||
                !state.selectedDraftId ||
                state.status === "loading"
              }
              onClick={() => void controller.refresh()}
            >
              {t("refresh")}
            </Button>
            {state.status === "loading" && (
              <Button size="sm" onClick={() => controller.cancel()}>
                {t("cancel")}
              </Button>
            )}
          </div>
          {draft && (
            <section className="space-y-2">
              <label htmlFor="draft-json" className="block font-semibold">
                {t("edit")}
              </label>
              <Input
                id="draft-json"
                className="border-accent bg-background w-full rounded-lg border-2 p-2"
                value={draftTitle(text) ?? ""}
                maxLength={160}
                disabled={draftTitle(text) === null}
                onChange={(event) => {
                  const next = withDraftTitle(text, event.target.value)

                  if (next === null) {
                    return
                  }

                  editVersion.current += 1
                  setText(next)

                  if (!dirty) {
                    setEditRevision(draft.revision)
                  }

                  setDirty(true)
                }}
              />
              {dirty && <p>{t("dirty")}</p>}
              {dirty && editRevision !== draft.revision && (
                <p role="alert">{t("conflict")}</p>
              )}
              {dirty && (
                <Button
                  size="sm"
                  onClick={() => {
                    editVersion.current += 1
                    setText(draft.authoredShowJson)
                    setEditRevision(draft.revision)
                    setDirty(false)
                  }}
                >
                  {t("reset")}
                </Button>
              )}
              <Button
                size="sm"
                disabled={
                  !dirty ||
                  !toolsAvailable ||
                  !draftTitle(text)?.trim() ||
                  new TextEncoder().encode(text).byteLength > 32768 ||
                  editRevision !== draft.revision ||
                  state.status === "loading" ||
                  state.status === "conflict" ||
                  state.status === "cancelled" ||
                  state.status === "error"
                }
                onClick={() => {
                  if (editRevision === null) {
                    return
                  }

                  const submittedDraftId = draft.draftId
                  const submittedRevision = editRevision
                  const submittedText = text
                  editVersion.current += 1
                  const submittedVersion = editVersion.current
                  void controller
                    .update(submittedText, submittedRevision)
                    .then(() => {
                      const current = controller.snapshot()
                      const acknowledged = current.draft

                      // The ACK belongs to this submission, not a later local
                      // edit. Preserve that edit and its original CAS base.
                      if (
                        editVersion.current === submittedVersion &&
                        current.status === "acknowledged" &&
                        current.selectedDraftId === submittedDraftId &&
                        acknowledged?.draftId === submittedDraftId &&
                        acknowledged.revision === submittedRevision + 1 &&
                        acknowledged.authoredShowJson === submittedText
                      ) {
                        setDirty(false)
                      }
                    })
                }}
              >
                {t("apply")}
              </Button>
              {state.undoAvailable && (
                <Button
                  size="sm"
                  disabled={dirty || state.status === "loading"}
                  onClick={() => void controller.undo()}
                >
                  {t("undo")}
                </Button>
              )}
            </section>
          )}
          <p className="text-sm">{t("noSave")}</p>
        </>
      )}
      {context?.availableDisplayModes?.includes("fullscreen") &&
        expand &&
        !closed && (
          <Button
            size="sm"
            onClick={() => void expand().catch(() => controller.unavailable())}
          >
            {t("expand")}
          </Button>
        )}
    </main>
  )
}
