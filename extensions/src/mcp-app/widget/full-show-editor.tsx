import { useEffect, useState } from "react"
import type { App } from "@modelcontextprotocol/ext-apps"
import { useTranslation } from "react-i18next"
import type { FullShowFrameV3 } from "../contracts/full-show-frame.ts"
import type {
  SemanticAssetChoice,
  SemanticAssetPurpose,
  SemanticPatch,
} from "../contracts/semantic-edit.ts"
import { dataSchemas, outputs } from "../contracts/tools.ts"
import { fullShowVotingVolume } from "../client/full-show-audio.ts"

interface AssetState {
  key: string
  background: SemanticAssetChoice[]
  audio: SemanticAssetChoice[]
  pictures: SemanticAssetChoice[]
  themes: Array<{ themeId: string; version: string; title: string }>
}
const identity = (frame: FullShowFrameV3) =>
  [
    frame.inventory.draftId,
    frame.inventory.revision,
    frame.inventory.context.locale,
  ].join(":")

/** Bounded fields and issuer-discovered asset refs; authored source never enters this component. */
export function FullShowEditorV3({
  app,
  frame,
  disabled,
  onApply,
}: {
  app: App
  frame: FullShowFrameV3
  disabled: boolean
  onApply: (patch: SemanticPatch) => Promise<void>
}) {
  const { t } = useTranslation("widget")
  const [title, setTitle] = useState(frame.inventory.title)
  const [question, setQuestion] = useState("")
  const [volume, setVolume] = useState(() => fullShowVotingVolume(frame))
  const [choices, setChoices] = useState<AssetState | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [background, setBackground] = useState("")
  const [music, setMusic] = useState("")
  const [selectedTheme, setSelectedTheme] = useState("")
  const [pictures, setPictures] = useState<Record<string, string>>({})
  const key = identity(frame)
  const currentQuestion =
    frame.content.kind === "question" ? frame.content.frame : null
  useEffect(() => {
    setTitle(frame.inventory.title)
    setQuestion(currentQuestion?.question.text ?? "")
    setVolume(fullShowVotingVolume(frame))
    setBackground("")
    setMusic("")
    setSelectedTheme("")
    setPictures({})
    setChoices(null)
    setLoading(false)
    setFailed(false)
  }, [key, currentQuestion?.question.id])
  // In-flight discovery is ignored when the current revision, locale or component changes.
  const [generation] = useState(() => ({ value: 0 }))
  useEffect(() => {
    generation.value += 1

    return () => {
      generation.value += 1
    }
  }, [key, generation])
  async function loadAssets() {
    generation.value += 1
    const request = generation.value
    setLoading(true)
    setFailed(false)

    try {
      const list = async (purpose: SemanticAssetPurpose) => {
        const result = await app.callServerTool(
          {
            name: "list_editing_assets",
            arguments: {
              contractVersion: "0.1.0",
              draftId: frame.inventory.draftId,
              expectedRevision: frame.inventory.revision,
              purpose,
              locale: frame.inventory.context.locale,
            },
          },
          { timeout: 10000 },
        )
        const body = outputs.list_editing_assets.parse(result.structuredContent)

        if (!body.ok || result.isError) {
          throw new Error("assets")
        }

        const data = dataSchemas.list_editing_assets.parse(body.data)

        if (
          data.draftId !== frame.inventory.draftId ||
          data.revision !== frame.inventory.revision ||
          data.purpose !== purpose
        ) {
          throw new Error("assets")
        }

        return data.assets
      }
      const [backgrounds, audio, images, themeResult] = await Promise.all([
        list("background"),
        list("audio"),
        list("answer-image"),
        app.callServerTool(
          {
            name: "list_themes",
            arguments: { contractVersion: "0.1.0", limit: 20 },
          },
          { timeout: 10000 },
        ),
      ])
      const body = outputs.list_themes.parse(themeResult.structuredContent)

      if (!body.ok || themeResult.isError) {
        throw new Error("themes")
      }

      const themes = dataSchemas.list_themes.parse(body.data).items

      if (request === generation.value) {
        setChoices({
          key,
          background: backgrounds,
          audio,
          pictures: images,
          themes,
        })
        const existing: Record<string, string> = {}
        for (const visual of frame.presentation.answerVisuals) {
          const asset = images.find((value) => value.publicUrl === visual.url)

          if (asset) {
            existing[visual.answerId] = asset.ref.assetId
          }
        }
        setPictures(existing)
      }
    } catch {
      if (request === generation.value) {
        setFailed(true)
      }
    } finally {
      if (request === generation.value) {
        setLoading(false)
      }
    }
  }
  const assets = choices?.key === key ? choices : null
  const locked = disabled || loading
  const choose = (values: SemanticAssetChoice[], id: string) =>
    values.find((value) => value.ref.assetId === id)
  const options = (values: SemanticAssetChoice[]) =>
    values.map((value) => (
      <option key={value.ref.assetId} value={value.ref.assetId}>
        {value.label}
      </option>
    ))
  async function applyPictures() {
    if (!assets || !currentQuestion) {
      return
    }

    const selected = currentQuestion.choices.flatMap((answer, index) => {
      const asset = choose(assets.pictures, pictures[answer.id] ?? "")

      return asset
        ? [
            {
              answerNumber: index + 1,
              asset: asset.ref,
              alt: asset.alt || asset.label,
              display: "both" as const,
            },
          ]
        : []
    })

    if (selected.length) {
      await onApply({
        kind: "set-answer-pictures",
        publicQuestionId: currentQuestion.question.id,
        pictures: selected,
      })
    }
  }

  return (
    <section className="widget-editor" aria-label={t("editing")}>
      <div className="widget-control-row">
        <label>
          {t("edit")}
          <input
            data-testid="full-show-title"
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <button
          type="button"
          data-testid="full-show-apply-title"
          disabled={locked || !title.trim() || title === frame.inventory.title}
          onClick={() => void onApply({ kind: "set-title", title })}
        >
          {t("apply")}
        </button>
      </div>
      {currentQuestion && (
        <div className="widget-control-row">
          <label>
            {t("questionText")}
            <textarea
              data-testid="full-show-question-text"
              maxLength={1000}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          <button
            type="button"
            data-testid="full-show-apply-question"
            disabled={
              locked ||
              !question.trim() ||
              question === currentQuestion.question.text
            }
            onClick={() =>
              void onApply({
                kind: "set-question-text",
                publicQuestionId: currentQuestion.question.id,
                text: question,
              })
            }
          >
            {t("apply")}
          </button>
        </div>
      )}
      <details>
        <summary>{t("appearanceAndSound")}</summary>
        <p className="widget-help">{t("approvedAssets")}</p>
        <div className="widget-control-row">
          <label>
            {t("votingVolume")}
            <input
              data-testid="full-show-voting-volume"
              type="number"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              onChange={(event) =>
                setVolume(
                  Math.max(0, Math.min(1, Number(event.target.value) / 100)),
                )
              }
            />
          </label>
          <button
            type="button"
            data-testid="full-show-apply-volume"
            disabled={locked || !Number.isFinite(volume)}
            onClick={() => void onApply({ kind: "set-voting-volume", volume })}
          >
            {t("apply")}
          </button>
        </div>
        <button
          type="button"
          data-testid="full-show-load-assets"
          disabled={locked}
          onClick={() => void loadAssets()}
        >
          {loading ? t("loading") : t("loadAssets")}
        </button>
        {failed && <p role="status">{t("unavailable")}</p>}
        {assets && (
          <>
            <div className="widget-control-row">
              <label>
                {t("background")}
                <select
                  data-testid="full-show-background"
                  value={background}
                  onChange={(event) => setBackground(event.target.value)}
                >
                  <option value="">{t("choose")}</option>
                  {options(assets.background)}
                </select>
              </label>
              <button
                type="button"
                data-testid="full-show-apply-background"
                disabled={locked || !background}
                onClick={() => {
                  const asset = choose(assets.background, background)

                  if (asset) {
                    void onApply({ kind: "set-background", asset: asset.ref })
                  }
                }}
              >
                {t("apply")}
              </button>
            </div>
            <div className="widget-control-row">
              <label>
                {t("votingMusic")}
                <select
                  data-testid="full-show-music"
                  value={music}
                  onChange={(event) => setMusic(event.target.value)}
                >
                  <option value="">{t("choose")}</option>
                  {options(assets.audio)}
                </select>
              </label>
              <button
                type="button"
                data-testid="full-show-apply-music"
                disabled={locked || !music}
                onClick={() => {
                  const asset = choose(assets.audio, music)

                  if (asset) {
                    void onApply({ kind: "set-voting-music", asset: asset.ref })
                  }
                }}
              >
                {t("apply")}
              </button>
            </div>
            <div className="widget-control-row">
              <label>
                {t("theme")}
                <select
                  data-testid="full-show-theme"
                  value={selectedTheme}
                  onChange={(event) => setSelectedTheme(event.target.value)}
                >
                  <option value="">{t("choose")}</option>
                  {assets.themes.map((theme) => (
                    <option
                      key={`${theme.themeId}:${theme.version}`}
                      value={`${theme.themeId}:${theme.version}`}
                    >
                      {theme.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                data-testid="full-show-apply-theme"
                disabled={locked || !selectedTheme}
                onClick={() => {
                  const theme = assets.themes.find(
                    (value) =>
                      `${value.themeId}:${value.version}` === selectedTheme,
                  )

                  if (theme) {
                    void onApply({
                      kind: "select-theme",
                      theme: { id: theme.themeId, version: theme.version },
                    })
                  }
                }}
              >
                {t("apply")}
              </button>
            </div>
            {currentQuestion && currentQuestion.choices.length > 0 && (
              <fieldset className="widget-picture-options">
                <legend>{t("answerPictures")}</legend>
                {currentQuestion.choices.map((answer, index) => (
                  <label key={answer.id}>
                    {t("answerNumber", { number: index + 1 })}
                    <select
                      data-testid={`full-show-picture-${index + 1}`}
                      value={pictures[answer.id] ?? ""}
                      onChange={(event) =>
                        setPictures((previous) => ({
                          ...previous,
                          [answer.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{t("unchanged")}</option>
                      {options(assets.pictures)}
                    </select>
                  </label>
                ))}
                <button
                  type="button"
                  data-testid="full-show-apply-pictures"
                  disabled={locked || !Object.values(pictures).some(Boolean)}
                  onClick={() => void applyPictures()}
                >
                  {t("apply")}
                </button>
              </fieldset>
            )}
          </>
        )}
      </details>
    </section>
  )
}
