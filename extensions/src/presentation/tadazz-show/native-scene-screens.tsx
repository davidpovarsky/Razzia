// oxlint-disable typescript/no-unnecessary-condition -- Native recap snapshots may have empty option arrays; preserve existing runtime guards.
import { useEffect, useState } from "react"
import { useOptionalShowTheme } from "../show-themes/context"
import { FamilyMixupEvent } from "../family-mixup/FamilyMixupScene"
import { useTranslation } from "react-i18next"
import type { ActiveSceneData } from "../../core/studio-timeline-schema"
import type { SceneDescriptor } from "./presentation-scene"
import { CLASSIC_RECAP_MAX_ITEMS } from "./recap-page-limit"

// Native Classic custom-screen primitives, shared by the live show and editor.
// These use the canonical 1920x1080 stage slot and its existing CSS.

export function TadazzMessageScreen({
  eyebrow,
  headline,
  sub,
}: {
  eyebrow?: string
  headline?: string
  sub?: string
}) {
  return (
    <div className="tz-x-center" data-testid="tadazz-screen-message">
      {eyebrow && <div className="tz-x-sub">{eyebrow}</div>}
      {headline && <div className="tz-x-headline">{headline}</div>}
      {sub && (
        <div
          className="tz-x-sub"
          style={{ letterSpacing: ".14em", fontSize: 28 }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

export function TadazzCountdownScreen({
  title,
  startedAt,
  seconds,
  controlledTimeMs,
}: {
  title?: string
  startedAt?: number
  seconds: number
  controlledTimeMs?: number
}) {
  const compute = () =>
    Math.max(
      0,
      Math.ceil(seconds - (Date.now() - (startedAt ?? Date.now())) / 1000),
    )
  const [left, setLeft] = useState(compute)
  useEffect(() => {
    if (controlledTimeMs !== undefined) {
      return
    }

    const id = setInterval(() => setLeft(compute()), 250)

    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, seconds, controlledTimeMs])
  const displayed =
    controlledTimeMs === undefined
      ? left
      : Math.max(0, Math.ceil(seconds - controlledTimeMs / 1000))

  return (
    <div className="tz-x-center" data-testid="tadazz-screen-countdown">
      {title && <div className="tz-x-sub">{title}</div>}
      <div className="tz-x-big">{displayed}</div>
    </div>
  )
}

export function TadazzRecapScreen({
  title,
  recap,
}: {
  title?: string
  recap: NonNullable<ActiveSceneData["answerRecap"]>
}) {
  const { t } = useTranslation()
  const tx = (key: string, fallback: string) =>
    t(`extensions:tadazzShow.${key}`, { defaultValue: fallback })
  const items = recap.items.slice(
    0,
    Math.max(1, Math.min(CLASSIC_RECAP_MAX_ITEMS, recap.maxItemsPerPage || 4)),
  )

  return (
    <div className="tz-x-fill" data-testid="tadazz-screen-recap">
      <div className="tz-x-eyebrow">
        {tx("recapEyebrow", "THE AUDIENCE HAS SPOKEN")}
      </div>
      <div className="tz-x-title" style={{ fontSize: 72 }}>
        {title || tx("recapTitle", "ANSWER RECAP")}
      </div>
      <div className="tz-x-underline" />
      <div className="tz-recap-rows">
        {items.length === 0 && (
          <div className="tz-x-sub" style={{ textAlign: "center" }}>
            {tx("noResponses", "No responses recorded yet.")}
          </div>
        )}
        {items.map((item) => {
          const option =
            (recap.mode === "correctAnswer"
              ? item.correctOptions?.[0]
              : undefined) ?? item.winningOptions[0]

          return (
            <div key={item.questionId} className="tz-leader-row tz-recap-row">
              <div className="tz-rank">{item.questionNumber}</div>
              <div className="tz-team-name">
                <div
                  style={{ fontSize: 22, color: "#d1b1ff", fontWeight: 800 }}
                >
                  {item.questionText}
                </div>
                <div>
                  {option
                    ? option.label
                    : tx("noResponses", "No responses recorded yet.")}
                </div>
              </div>
              {option?.imageUrl && (
                <img src={option.imageUrl} alt={option.alt || option.label} />
              )}
              {option && recap.showPercentages && (
                <div className="tz-team-score">
                  {Math.round(option.percentage)}%
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TadazzSceneTitleScreen({ scene }: { scene: SceneDescriptor }) {
  const theme = useOptionalShowTheme()
  if (theme?.definition.id === "family-mixup")
    return <FamilyMixupEvent scene={scene} />
  return (
    <TadazzMessageScreen
      headline={scene.title}
      sub={scene.subtitle ?? scene.description}
    />
  )
}
