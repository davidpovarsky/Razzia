import type { Ref } from "react"
import { useTranslation } from "react-i18next"
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { Button } from "./button"
import { PlatformScope } from "./scope"
import {
  presentationControlText,
  type PresentationControlTextKey,
} from "./presentation-control-labels"

export interface PresentationAction {
  onClick: () => void
  disabled?: boolean
  testId?: string
  description?: string
  ref?: Ref<HTMLButtonElement>
}

export interface PresentationControlsProps {
  previous?: PresentationAction
  playback?: PresentationAction & { state: "start" | "playing" | "paused" }
  next?: PresentationAction & {
    state?: "next" | "start" | "replay" | "endTimer"
    progress?: number
  }
  replay?: PresentationAction & { question?: boolean }
  sound?: PresentationAction & { enabled: boolean }
  reveal?: PresentationAction & { revealed: boolean }
  expand?: PresentationAction & { expanded: boolean }
  close?: PresentationAction
}

const playbackLabels = {
  start: "start",
  playing: "pause",
  paused: "resume",
} as const

const nextIcons = {
  next: ArrowRight,
  start: Play,
  replay: RotateCcw,
  endTimer: Timer,
}

/** One platform control root. Consumers supply capabilities, never appearance or order. */
export function PresentationControls({
  previous,
  playback,
  next,
  replay,
  sound,
  reveal,
  expand,
  close,
}: PresentationControlsProps) {
  const { i18n } = useTranslation()
  const text = (key: PresentationControlTextKey) =>
    presentationControlText(i18n.resolvedLanguage ?? i18n.language, key)
  const actions = [
    previous && {
      key: "previous",
      action: previous,
      label: "previous" as const,
      Icon: ArrowLeft,
    },
    playback && {
      key: "playback",
      action: playback,
      label: playbackLabels[playback.state],
      Icon: playback.state === "playing" ? Pause : Play,
    },
    next && {
      key: "next",
      action: next,
      label: next.state ?? "next",
      Icon: nextIcons[next.state ?? "next"],
    },
    replay && {
      key: "replay",
      action: replay,
      label: replay.question
        ? ("restartQuestion" as const)
        : ("replay" as const),
      Icon: RotateCcw,
    },
    sound && {
      key: "sound",
      action: sound,
      label: sound.enabled ? ("mute" as const) : ("unmute" as const),
      Icon: sound.enabled ? Volume2 : VolumeX,
      pressed: sound.enabled,
    },
    reveal && {
      key: "reveal",
      action: reveal,
      label: reveal.revealed ? ("resetReveal" as const) : ("reveal" as const),
      Icon: reveal.revealed ? EyeOff : Eye,
      pressed: reveal.revealed,
    },
    expand && {
      key: "expand",
      action: expand,
      label: expand.expanded ? ("collapse" as const) : ("expand" as const),
      Icon: expand.expanded ? Minimize : Maximize,
      expanded: expand.expanded,
    },
    close && { key: "close", action: close, label: "close" as const, Icon: X },
  ].filter((item) => item !== undefined)

  if (!actions.length) {
    return null
  }

  return (
    <PlatformScope
      context="platform.host"
      appearance="dark"
      dir={i18n.dir()}
      className="tds-presentation-controls"
      role="toolbar"
      aria-label={text("controls")}
      data-platform-component="presentation-controls"
    >
      {actions.map(({ key, action, label, Icon, ...state }) => (
        <Button
          key={key}
          ref={action.ref}
          size="sm"
          variant={
            key === "next" ||
            (key === "playback" && playback?.state === "start")
              ? "primary"
              : "secondary"
          }
          className="tds-presentation-control"
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={text(label)}
          title={action.description ?? text(label)}
          aria-pressed={"pressed" in state ? state.pressed : undefined}
          aria-expanded={"expanded" in state ? state.expanded : undefined}
          data-testid={action.testId}
          data-presentation-action={key}
        >
          <span className="tds-presentation-control-icon">
            <Icon size={18} aria-hidden="true" />
          </span>
          <span className="tds-presentation-control-label">{text(label)}</span>
          {key === "next" && next?.progress !== undefined && (
            <span
              className="tds-presentation-control-progress"
              aria-hidden="true"
              style={{
                transform: `scaleX(${Math.max(0, Math.min(1, next.progress))})`,
              }}
            />
          )}
        </Button>
      ))}
    </PlatformScope>
  )
}
