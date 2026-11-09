import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ThemeSandboxHost } from "@razzia/extensions/presentation"
import { RUNTIME_PHASES, type RuntimeSnapshot } from "@razzia/extensions/core"
import Button from "@razzia/web/components/Button"
import { packageJson, type PackageReceipt } from "./package-api"
import { PackageDeclarativePreview } from "./PackageDeclarativePreview"

export function PackageRuntimePreview({
  receipt,
}: {
  receipt: PackageReceipt
}) {
  const { t, i18n } = useTranslation()
  const [url, setUrl] = useState("")
  const [phase, setPhase] = useState<RuntimeSnapshot["phase"]>("question")
  const [serverTime] = useState(() => Date.now())
  const themes = receipt.manifest.contents.filter((c) => c.kind !== "game")
  const [themeId, setThemeId] = useState(() => themes[0]?.id)
  const code =
    themes.find((c) => c.id === themeId)?.kind === "sandboxed-react-theme"
  useEffect(() => {
    if (!themeId || !code) {
      return
    }

    let active = true
    void packageJson<{ url: string }>(
      `/runtime/${receipt.sourceDigest}/${themeId}`,
    )
      .then((r) => {
        if (active) {
          setUrl(r.url)
        }
      })
      .catch(() => {
        if (active) {
          setUrl("")
        }
      })

    return () => {
      active = false
    }
  }, [receipt.sourceDigest, themeId, code])
  const snapshot: RuntimeSnapshot = {
    roomId: "preview",
    questionId: "preview-question",
    epoch: 0,
    sequence: 1,
    role: "manager",
    phase,
    locale: i18n.language,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    title: receipt.manifest.displayName,
    question: t("extensions:packages.preview"),
    answers: Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      label: String(i + 1),
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
    <div className="space-y-2" data-testid="package-preview">
      {themes.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {themes.map((theme) => (
            <Button
              key={theme.id}
              size="sm"
              aria-pressed={theme.id === themeId}
              onClick={() => setThemeId(theme.id)}
            >
              {theme.id}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {RUNTIME_PHASES.map((s) => (
          <Button
            size="sm"
            key={s}
            onClick={() => setPhase(s)}
            aria-pressed={phase === s}
          >
            {t(`extensions:packages.phases.${s}`)}
          </Button>
        ))}
      </div>
      <div className="border-accent aspect-video overflow-hidden rounded-lg border">
        {!code && themeId && (
          <PackageDeclarativePreview
            upload={receipt.uploadId}
            themeId={themeId}
            phase={phase}
          />
        )}
        {code && url && (
          <ThemeSandboxHost
            url={url}
            snapshot={snapshot}
            onAnswer={() => undefined}
            title={t("extensions:packages.preview")}
            fallback={
              <p role="status">{t("extensions:packages.runtimeFailed")}</p>
            }
          />
        )}
      </div>
    </div>
  )
}
