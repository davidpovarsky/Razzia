import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
/* oxlint-disable eslint/no-nested-ternary -- A finite scene union is projected into public phase/result fields, never arbitrary server extras. */
import {
  ThemeSandboxHost,
  useShowTheme,
  type ShowScene,
} from "@razzia/extensions/presentation"
import type { RuntimeSnapshot } from "@razzia/extensions/core"
import { ensureSession } from "@razzia/web/lib/session"

/** Public fields are copied explicitly; never post raw status/envelope/extras. */
export function PackageStage({
  scene,
  roomId,
  questionId,
  epoch,
  sequence,
  role,
  paused,
  canAnswer,
  voteLocked,
  remainingMs,
  deadline,
  serverTime,
  onSubmit,
  onFallback,
  backgroundUrl,
  trustedOverlay,
  children,
}: {
  scene: ShowScene
  roomId: string
  questionId: string
  epoch: number
  sequence: number
  role: RuntimeSnapshot["role"]
  paused: boolean
  canAnswer: boolean
  voteLocked: boolean
  remainingMs: number
  deadline: number | null
  serverTime: number
  onSubmit: (keys: number[]) => void
  children: ReactNode
  onFallback: () => void
  backgroundUrl?: string
  trustedOverlay?: ReactNode
}) {
  const theme = useShowTheme(role)
  const { t, i18n } = useTranslation()
  const pin = theme.definition.runtime
  const sourceDigest = pin?.sourceDigest
  const [url, setUrl] = useState("")
  const capability = useRef<{ key: string; issuedAt: number } | null>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  const [assetsUnavailable, setAssetsUnavailable] = useState(false)
  const question = "question" in scene ? scene.question : null
  const questionImage =
    question?.questionImage ??
    ((scene.kind === "question" || scene.kind === "voting") &&
    scene.media?.type.toLowerCase() === "image"
      ? scene.media.url
      : undefined)
  const options = useMemo(() => question?.options ?? [], [question?.options])
  const imageKey = [
    ...options.map((a) => a.image ?? ""),
    questionImage ?? "",
    backgroundUrl ?? "",
  ].join("|")
  const imageUrls = useMemo(
    () => [...new Set(imageKey.split("|").filter(Boolean))],
    [imageKey],
  )
  useEffect(() => {
    if (!sourceDigest) {
      return
    }

    const key = `${roomId}/${sourceDigest}/${theme.definition.id}`

    if (
      capability.current?.key === key &&
      Date.now() - capability.current.issuedAt < 240_000
    ) {
      return
    }

    let alive = true
    void ensureSession()
      .then(async ({ token }) => {
        const response = await fetch(
          `/api/packages/runtime/${sourceDigest}/${theme.definition.id}?roomId=${encodeURIComponent(roomId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            redirect: "error",
            cache: "no-store",
          },
        )

        if (!response.ok) {
          throw new Error("Runtime unavailable")
        }

        return response.json() as Promise<{ url: string }>
      })
      .then((r) => {
        if (alive) {
          capability.current = { key, issuedAt: Date.now() }
          setUrl(r.url)
        }
      })
      .catch(() => {
        if (alive) {
          capability.current = null
          setUrl("")
        }
      })

    return () => {
      alive = false
    }
  }, [sourceDigest, theme.definition.id, roomId, scene.key])
  useEffect(() => {
    if (!sourceDigest) {
      return
    }

    let alive = true
    const controller = new AbortController()
    void Promise.all(
      imageUrls.map(async (image) => {
        if (!image.startsWith("/media/")) {
          return null
        }

        const response = await fetch(image, {
          signal: controller.signal,
          cache: "force-cache",
        })

        if (!response.ok) {
          return null
        }

        const blob = await response.blob()

        if (
          blob.size > 5_000_000 ||
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            blob.type,
          )
        ) {
          return null
        }

        return new Promise<[string, string]>((resolve) => {
          const reader = new FileReader()
          reader.onload = () =>
            resolve([
              image,
              typeof reader.result === "string" ? reader.result : "",
            ])
          reader.onerror = () => resolve([image, ""])
          reader.readAsDataURL(blob)
        })
      }),
    )
      .then((items) => {
        if (alive) {
          setAssetsUnavailable(items.some((item) => !item?.[1]))
          setImages(
            Object.fromEntries(
              items.filter((v): v is [string, string] => Boolean(v)),
            ),
          )
        }
      })
      .catch(() => {
        if (alive) {
          setAssetsUnavailable(true)
        }
      })

    return () => {
      alive = false
      controller.abort()
    }
  }, [sourceDigest, imageUrls])
  const phase: RuntimeSnapshot["phase"] =
    (scene.kind === "wait" || scene.kind === "voting") && voteLocked
      ? "voteLocked"
      : scene.kind === "scene" && scene.scene.kind === "opening"
        ? "opening"
        : scene.kind === "scene" && scene.scene.kind === "closing"
          ? "closing"
          : scene.kind === "start"
            ? "opening"
            : scene.kind === "prepared"
              ? "answerCards"
              : scene.kind === "player-result"
                ? "personalResult"
                : scene.kind === "finale" || scene.kind === "summary"
                  ? "closing"
                  : scene.kind === "scene" || scene.kind === "interlude"
                    ? "interlude"
                    : [
                          "voting",
                          "results",
                          "question",
                          "leaderboard",
                          "lobby",
                        ].includes(scene.kind)
                      ? (scene.kind as RuntimeSnapshot["phase"])
                      : "lobby"
  const usingSandbox = Boolean(
    pin &&
    url &&
    !assetsUnavailable &&
    theme.definition.sandbox?.slots[phase] === "implemented" &&
    theme.definition.sandbox.roles.includes(role) &&
    !(scene.kind === "voting" && scene.questionType === "estimation") &&
    !(
      (scene.kind === "voting" || scene.kind === "question") &&
      scene.media?.type === "video"
    ),
  )
  const wasSandbox = useRef(false)
  const fallbackCallback = useRef(onFallback)
  useLayoutEffect(() => {
    fallbackCallback.current = onFallback
  }, [onFallback])
  useEffect(() => {
    if (!usingSandbox && wasSandbox.current) {
      fallbackCallback.current()
    }

    wasSandbox.current = usingSandbox
  }, [usingSandbox])
  const snapshot = useMemo<RuntimeSnapshot>(
    () => ({
      roomId,
      questionId,
      epoch,
      sequence,
      role,
      phase,
      title:
        (scene.kind === "scene"
          ? scene.scene.title
          : "subject" in scene
            ? scene.subject
            : "") ?? "",
      question: question?.question ?? "",
      ...(questionImage && images[questionImage]
        ? { questionImage: images[questionImage] }
        : {}),
      ...(backgroundUrl && images[backgroundUrl]
        ? { backgroundImage: images[backgroundUrl] }
        : {}),
      ...(scene.kind === "lobby"
        ? {
            joinCode: scene.inviteCode ?? "",
            joinUrl: `${window.location.origin}/game`,
          }
        : {}),
      answers: options.map((answer, i) => ({
        id: String(i),
        label: answer.label,
        ...(answer.image && images[answer.image]
          ? { image: images[answer.image] }
          : {}),
        ...(scene.kind === "results"
          ? {
              percent:
                scene.reveal.percentages?.[i] ??
                (scene.reveal.counts.reduce((n, v) => n + v, 0) > 0
                  ? ((scene.reveal.counts[i] ?? 0) * 100) /
                    scene.reveal.counts.reduce((n, v) => n + v, 0)
                  : 0),
              votes: scene.reveal.counts[i] ?? 0,
              ...(scene.reveal.mode === "quiz"
                ? { correct: scene.reveal.solutions?.includes(i) ?? false }
                : {}),
            }
          : {}),
      })),
      leaders:
        scene.kind === "leaderboard"
          ? scene.entries
              .slice(0, 100)
              .map((e, i) => ({ label: e.name, score: e.score, rank: i + 1 }))
          : scene.kind === "finale" && scene.winner
            ? [{ label: scene.winner.name, score: scene.winner.score, rank: 1 }]
            : [],
      personalResult:
        scene.kind === "player-result"
          ? { correct: scene.correct, points: scene.points, rank: scene.rank }
          : null,
      locale: i18n.language,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      serverTime,
      deadline,
      remainingMs,
      paused,
      canAnswer,
      labels: {
        submit: t("game:confirm"),
        waiting: t("extensions:packages.phases.lobby"),
        results: t("extensions:packages.phases.results"),
      },
    }),
    [
      roomId,
      questionId,
      epoch,
      sequence,
      role,
      phase,
      scene,
      question,
      questionImage,
      backgroundUrl,
      options,
      images,
      i18n.language,
      deadline,
      serverTime,
      remainingMs,
      paused,
      canAnswer,
      t,
    ],
  )

  // Explicit unsupported slots/roles always use the existing compiled stage.
  if (!usingSandbox) {
    if (assetsUnavailable && pin) {
      return (
        <div
          className="h-full w-full"
          data-testid="package-runtime-fallback"
          data-runtime-error="ASSET_PROJECTION_UNAVAILABLE"
        >
          {children}
        </div>
      )
    }

    return children
  }

  return (
    <div className="relative h-full w-full">
      <ThemeSandboxHost
        key={roomId}
        url={url}
        snapshot={snapshot}
        title={t("extensions:packages.theme")}
        onAnswer={(ids) => onSubmit(ids.map(Number))}
        onAudioCue={(cue) => {
          // The frame requests only presentation effects; music/timer/result cues
          // are driven by existing core events, never by an uploaded renderer.
          if (
            role !== "player" ||
            !canAnswer ||
            paused ||
            cue !== "answerSelected"
          ) {
            return
          }

          window.dispatchEvent(
            new CustomEvent("tadazz:sfx", {
              detail: {
                name: "answer-selected",
                identity: `${roomId}:${questionId}:${epoch}:package-selection`,
              },
            }),
          )
        }}
        onFallback={onFallback}
        fallback={children}
      />
      {trustedOverlay}
    </div>
  )
}
