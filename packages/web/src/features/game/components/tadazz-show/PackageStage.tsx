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
  createPackageQuestionAdmission,
  createPackageSceneContinuity,
  packageQuestionContentSupported,
  packageRuntimePhase,
  packageUsesSandboxForPhase,
  projectPackageClock,
  projectPackageScene,
  selectPackageFrame,
  useShowTheme,
  type ShowScene,
} from "@razzia/extensions/presentation"
import type { RuntimeSnapshot } from "@razzia/extensions/core"
import { requestAuthHeaders } from "@razzia/web/lib/request-auth"
import type { PublicLobbyDirectory } from "./lobby-directory"

interface CapabilityIdentity {
  key: string
  lifetime: string
}

type CapabilityState = CapabilityIdentity &
  (
    | { status: "pending" | "unavailable" }
    | { status: "ready"; url: string; issuedAt: number }
  )

/** Public fields are copied explicitly; never post raw status/envelope/extras. */
export function PackageStage({
  scene: incomingScene,
  roomId,
  questionId: incomingQuestionId,
  epoch: incomingEpoch,
  sequence: incomingSequence,
  role,
  paused,
  canAnswer: incomingCanAnswer,
  voteLocked,
  remainingMs: incomingRemainingMs,
  deadline: incomingDeadline,
  serverTime,
  serverClockOffset = 0,
  onSubmit,
  onFallback,
  backgroundUrl: incomingBackgroundUrl,
  trustedOverlay,
  lobbyData,
  phaseElapsedMs: incomingPhaseElapsedMs,
  revealStage: incomingRevealStage,
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
  serverClockOffset?: number
  onSubmit: (keys: number[]) => void
  children: ReactNode
  onFallback: () => void
  backgroundUrl?: string
  trustedOverlay?: ReactNode
  lobbyData?: PublicLobbyDirectory
  phaseElapsedMs?: number
  revealStage?: "pending" | "audience" | "correct"
}) {
  const theme = useShowTheme(role)
  const { t, i18n } = useTranslation()
  const pin = theme.definition.runtime
  const sourceDigest = pin?.sourceDigest
  const [continuity] = useState(() => createPackageSceneContinuity())
  const frameScope = JSON.stringify([
    roomId,
    role,
    theme.definition.id,
    sourceDigest,
    pin?.buildDigest,
  ])
  const { presentation, holding } = continuity.select(frameScope, {
    scene: incomingScene,
    questionId: incomingQuestionId,
    epoch: incomingEpoch,
    sequence: incomingSequence,
    remainingMs: incomingRemainingMs,
    deadline: incomingDeadline,
    backgroundUrl: incomingBackgroundUrl,
    phaseElapsedMs: incomingPhaseElapsedMs,
    revealStage: incomingRevealStage,
  })
  const {
    scene,
    questionId,
    epoch,
    sequence,
    remainingMs,
    deadline,
    backgroundUrl,
    phaseElapsedMs,
    revealStage,
  } = presentation
  const canAnswer = incomingCanAnswer && !holding
  const phase = packageRuntimePhase(scene, voteLocked)
  const questionFamily =
    scene.kind === "question" ||
    scene.kind === "voting" ||
    scene.kind === "results" ||
    scene.kind === "player-result" ||
    (scene.kind === "wait" && phase === "voteLocked")
  const question = "question" in scene ? scene.question : null
  const questionIdentity = JSON.stringify([frameScope, questionId])
  const [selectedFrame, setSelectedFrame] = useState<ReturnType<
    typeof selectPackageFrame
  > | null>(null)
  const frame = selectPackageFrame(
    selectedFrame,
    frameScope,
    scene.kind === "prepared"
      ? { kind: "prepared", number: scene.questionNumber }
      : questionFamily
        ? {
            kind: "question",
            identity: questionIdentity,
            number: question?.number,
          }
        : { kind: "other" },
  )

  if (selectedFrame !== frame) {
    setSelectedFrame(frame)
  }

  const frameKey = JSON.stringify([frame.scope, frame.generation])
  // Keep the already loaded document and ticket through preparation and reading.
  const capabilityLifetime = frame.scene.kind === "other" ? scene.key : frameKey
  const capabilityKey = `${roomId}/${sourceDigest}/${theme.definition.id}`
  const [capabilityState, setCapability] = useState<CapabilityState>(() => ({
    key: capabilityKey,
    lifetime: capabilityLifetime,
    status: "pending",
  }))
  let capability = capabilityState

  if (
    capability.key !== capabilityKey ||
    capability.lifetime !== capabilityLifetime
  ) {
    const nextIdentity = {
      key: capabilityKey,
      lifetime: capabilityLifetime,
    }
    // A boundary is observed before committing a new document. Clock changes
    // inside that lifetime never expire or replace its already-loaded iframe.
    const reusable =
      capability.key === capabilityKey &&
      capability.status === "ready" &&
      serverTime - serverClockOffset - capability.issuedAt < 240_000
    capability = reusable
      ? { ...capability, ...nextIdentity }
      : { ...nextIdentity, status: "pending" }
    // Admission also sees the new identity during React's discarded render.
    setCapability(capability)
  }

  const [images, setImages] = useState<Record<string, string>>({})
  const [assetState, setAssetState] = useState<{
    key: string
    unavailable: boolean
  } | null>(null)
  const questionImage =
    question?.questionImage ??
    ((scene.kind === "question" || scene.kind === "voting") &&
    scene.media?.type.toLowerCase() === "image"
      ? scene.media.url
      : undefined)
  const options = question?.options ?? []
  const imageKey = [
    ...options.map((a) => a.image ?? ""),
    ...(scene.kind === "scene" && scene.scene.kind === "interimResults"
      ? (scene.activeSceneData?.interimResults?.options ?? []).map(
          (option) => option.imageUrl ?? "",
        )
      : []),
    questionImage ?? "",
    backgroundUrl ?? "",
  ].join("|")
  const imageUrls = useMemo(
    () => [...new Set(imageKey.split("|").filter(Boolean))],
    [imageKey],
  )
  const assetKey = JSON.stringify([sourceDigest, imageKey])
  useEffect(() => {
    if (!sourceDigest || capability.status !== "pending") {
      return
    }

    const controller = new AbortController()
    void requestAuthHeaders()
      .then(async (headers) => {
        controller.signal.throwIfAborted()
        const response = await fetch(
          `/api/packages/runtime/${sourceDigest}/${theme.definition.id}?roomId=${encodeURIComponent(roomId)}`,
          {
            headers,
            signal: controller.signal,
            redirect: "error",
            cache: "no-store",
          },
        )

        if (!response.ok) {
          throw new Error("Runtime unavailable")
        }

        return response.json() as Promise<{ url: string }>
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          // Ticket age uses the local clock at both ends. Server-clock calibration
          // changes snapshots, but must not age or rejuvenate a launch capability.
          const issuedAt = Date.now()
          setCapability((current) =>
            current === capability
              ? { ...capability, status: "ready", url: result.url, issuedAt }
              : current,
          )
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCapability((current) =>
            current === capability
              ? { ...capability, status: "unavailable" }
              : current,
          )
        }
      })

    return () => controller.abort()
  }, [sourceDigest, theme.definition.id, roomId, capability])
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
          setAssetState({
            key: assetKey,
            unavailable: items.some((item) => !item?.[1]),
          })
          setImages(
            Object.fromEntries(
              items.filter((v): v is [string, string] => Boolean(v)),
            ),
          )
        }
      })
      .catch(() => {
        if (alive) {
          setAssetState({ key: assetKey, unavailable: true })
        }
      })

    return () => {
      alive = false
      controller.abort()
    }
  }, [sourceDigest, imageUrls, assetKey])
  const [questionAdmission] = useState(() => createPackageQuestionAdmission())
  const sandboxSupported = Boolean(
    pin &&
    packageUsesSandboxForPhase(theme.definition.sandbox?.slots, phase) &&
    theme.definition.sandbox?.roles.includes(role),
  )
  const capabilityPending = capability.status === "pending"
  const capabilityUnavailable = capability.status === "unavailable"
  const url = capability.status === "ready" ? capability.url : ""
  const assetsPending = imageUrls.length > 0 && assetState?.key !== assetKey
  const assetsUnavailable =
    assetState?.key === assetKey && assetState.unavailable
  const pending =
    sandboxSupported &&
    !capabilityUnavailable &&
    !assetsUnavailable &&
    (capabilityPending || assetsPending)
  const available = Boolean(
    sandboxSupported &&
    !pending &&
    !capabilityUnavailable &&
    !assetsUnavailable &&
    url,
  )
  const content =
    "questionType" in scene
      ? {
          questionType: scene.questionType,
          mediaType: scene.questionMediaType,
        }
      : undefined
  const [runtimeFailure, setRuntimeFailure] = useState<string | null>(null)

  if (
    runtimeFailure !== null &&
    (!questionFamily || runtimeFailure !== questionIdentity)
  ) {
    setRuntimeFailure(null)
  }

  const retainingRuntimeFallback =
    questionFamily && runtimeFailure === questionIdentity
  const runtimeFallbackPending = useRef(false)
  const usingSandbox = questionFamily
    ? questionAdmission.select({
        identity: questionIdentity,
        supported: questionId
          ? packageQuestionContentSupported(content)
          : undefined,
        available,
        pending,
      })
    : available
  const awaitingSandbox =
    questionFamily &&
    packageQuestionContentSupported(content) === true &&
    pending &&
    !usingSandbox
  const wasSandbox = useRef(false)
  const wasAwaitingSandbox = useRef(false)
  const fallbackCallback = useRef(onFallback)
  useLayoutEffect(() => {
    fallbackCallback.current = onFallback
  }, [onFallback])
  useEffect(() => {
    if (
      !usingSandbox &&
      !awaitingSandbox &&
      (wasSandbox.current ||
        wasAwaitingSandbox.current ||
        runtimeFallbackPending.current)
    ) {
      runtimeFallbackPending.current = false
      fallbackCallback.current()
    }

    wasSandbox.current = usingSandbox
    wasAwaitingSandbox.current = awaitingSandbox
  }, [usingSandbox, awaitingSandbox])
  const snapshot = useMemo<RuntimeSnapshot>(
    () => ({
      roomId,
      questionId,
      epoch,
      sequence,
      role,
      ...projectPackageScene({
        scene,
        voteLocked,
        serverTime,
        paused,
        images,
        backgroundUrl,
        lobby: lobbyData,
        phaseElapsedMs,
        revealStage,
      }),
      ...(scene.kind === "lobby"
        ? {
            joinCode: scene.inviteCode ?? "",
            joinUrl: `${window.location.origin}/game`,
          }
        : {}),
      locale: i18n.language,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      serverTime,
      ...projectPackageClock({ phase, deadline, remainingMs }),
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
      scene,
      phase,
      voteLocked,
      backgroundUrl,
      lobbyData,
      phaseElapsedMs,
      revealStage,
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
  if (!usingSandbox && !retainingRuntimeFallback) {
    // Do not paint a native question while its chosen renderer is still loading:
    // replacing that visible fallback with the sandbox repeats the question.
    if (awaitingSandbox) {
      return (
        <div
          className="h-full w-full"
          data-testid="package-runtime-loading"
          aria-busy="true"
        />
      )
    }

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
        key={frameKey}
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
        onFallback={() => {
          if (questionFamily) {
            if (questionAdmission.reject(questionIdentity)) {
              // Notify the host after its replacement native stage mounts.
              runtimeFallbackPending.current = true
              // Keep the failed host and its native fallback mounted for this
              // question, preserving the error and the replacement stage ref.
              setRuntimeFailure(questionIdentity)
            }

            return
          }

          onFallback()
        }}
        fallback={children}
        overlay={trustedOverlay}
      />
    </div>
  )
}
