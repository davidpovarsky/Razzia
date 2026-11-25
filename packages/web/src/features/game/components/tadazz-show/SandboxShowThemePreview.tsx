/* oxlint-disable eslint/no-nested-ternary -- Closed slot identifiers map directly to their public preview phases. */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ThemeSandboxHost } from "@razzia/extensions/presentation"
import type { RuntimeSnapshot } from "@razzia/extensions/core"
import { packageJson } from "@razzia/web/features/manager/components/packages/package-api"
import {
  ClassicShowThemePreview,
  type ShowThemePreviewProps,
} from "./ClassicShowThemePreview"

export function SandboxShowThemePreview(props: ShowThemePreviewProps) {
  const { theme, slot, reducedMotion, previewTitle } = props
  const { t, i18n } = useTranslation()
  const [url, setUrl] = useState("")
  const [serverTime] = useState(() => Date.now())
  const sourceDigest = theme.definition.runtime?.sourceDigest
  useEffect(() => {
    let alive = true

    if (sourceDigest) {
      void packageJson<{ url: string }>(
        `/runtime/${sourceDigest}/${theme.definition.id}`,
      )
        .then((r) => {
          if (alive) {
            setUrl(r.url)
          }
        })
        .catch(() => {
          if (alive) {
            setUrl("")
          }
        })
    }

    return () => {
      alive = false
    }
  }, [sourceDigest, theme.definition.id])
  const phase: RuntimeSnapshot["phase"] =
    slot === "timer"
      ? "voting"
      : slot === "voteLock"
        ? "voteLocked"
        : slot === "resultsReveal"
          ? "results"
          : slot === "rankUpdate"
            ? "leaderboard"
            : slot === "firstPaint" || slot === "zzTransition"
              ? "interlude"
              : slot
  const fallback = <ClassicShowThemePreview {...props} />

  if (!url) {
    return fallback
  }

  const snapshot: RuntimeSnapshot = {
    roomId: "studio-preview",
    questionId: "preview-question",
    epoch: 0,
    sequence: 1,
    role: "manager",
    phase,
    locale: i18n.language,
    reducedMotion,
    title: previewTitle,
    question: previewTitle,
    answers: ["A", "B", "C", "D"].map((label, i) => ({
      id: String(i),
      label,
      ...(phase === "results" ? { percent: 0 } : {}),
    })),
    leaders: [],
    personalResult: null,
    serverTime,
    deadline: null,
    remainingMs: 20_000,
    paused: true,
    canAnswer: false,
    labels: {
      submit: t("game:confirm"),
      waiting: t("extensions:packages.preview"),
      results: t("extensions:packages.phases.results"),
    },
  }

  return (
    <ThemeSandboxHost
      url={url}
      snapshot={snapshot}
      onAnswer={() => undefined}
      fallback={fallback}
      title={previewTitle}
    />
  )
}
