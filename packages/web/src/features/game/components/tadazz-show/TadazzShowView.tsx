import { EVENTS, MEDIA_TYPES, QUIZZ_MODES } from "@razzia/common/constants"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  isCreatingWorldsPreset,
  type CardAudioOverrides,
  type CueId,
  type ExtensionStateEnvelope,
  type QuizExtrasV1,
  type TeamDefinition,
} from "@razzia/extensions/core"
import {
  AudioCuePlayer,
  STORY_ASSETS,
  CinematicLayerStack,
  TadazzOpening,
  TadazzStage,
  TadazzV4StageAdapter,
  collapseForResume,
  computeShowScene,
  isFullShowScene,
  isTadazzV4Active,
  planTransition,
  preloadOpeningAssets,
  resolveStageBackdrop,
  resolveTadazzAudioPolicy,
  acceptsQuestionMilestone,
  timerEndTransition,
  type TimerEndState,
  runSteps,
  type CinematicLayerStackProps,
  type SceneDescriptor,
  type ShowScene,
  type StageStep,
  type TadazzStageHandle,
} from "@razzia/extensions/presentation"
import Tooltip from "@razzia/web/components/Tooltip"
import GameSettingsModal from "@razzia/web/features/game/components/GameSettingsModal"
import HostPlayersModal from "@razzia/web/features/game/components/HostPlayersModal"
import HostShortcutsDialog from "@razzia/web/features/game/components/HostShortcutsDialog"
import ManagerControlToolbar from "@razzia/web/features/game/components/ManagerControlToolbar"
import QuestionDialog from "@razzia/web/features/game/components/QuestionDialog"
import RoomLockButton from "@razzia/web/features/game/components/RoomLockButton"
import { ExtensionStateProvider } from "@razzia/web/features/game/contexts/extension-state-context"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import {
  ViewRoleContext,
  type ViewRole,
} from "@razzia/web/features/game/contexts/view-role-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  MANAGER_SKIP_BTN,
  SFX,
} from "@razzia/web/features/game/utils/constants"
import { useFullscreen } from "@razzia/web/hooks/useFullscreen"
import {
  CircleQuestionMark,
  Image,
  LogOut,
  Maximize,
  Minimize,
  PhoneCall,
  SkipForward,
  Users,
  Video,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"
import { resolveMonotonicCooldownDeadline } from "./cooldown-sync"
import { useTimerBeeps } from "./use-timer-beeps"
import { useTadazzRawStatus } from "./raw-status-context"
import { TadazzAnswerPad } from "./TadazzAnswerPad"
import { LiveParticipation } from "./LiveParticipation"
import {
  TadazzConnectingScreen,
  TadazzCountdownScreen,
  TadazzEstimationResultScreen,
  TadazzInterludeScreen,
  TadazzLobbyScreen,
  TadazzMessageScreen,
  TadazzPlayerFinishedScreen,
  TadazzPlayerResultScreen,
  TadazzPreparedScreen,
  TadazzRecapScreen,
  TadazzSceneTitleScreen,
  TadazzStartScreen,
  TadazzSummaryScreen,
  TadazzWaitScreen,
} from "./TadazzScreens"
import {
  useTadazzShellText,
  useTadazzStageLabels,
  useTadazzV4Labels,
} from "./useTadazzLabels"

export interface TadazzShowViewProps {
  manager: boolean
  role: ViewRole
  statusName: Status | undefined
  extensionState: ExtensionStateEnvelope | null
  onNext?: () => void
  onBack?: () => void
  countdown: { seconds: number; total: number } | null
  totalPlayers: number | null
  roomMediaReady: boolean
  audioCueId?: CueId
  hasCompetingMediaAudio: boolean
  activeCardKey: string
  sceneAudio?: unknown
  isHostPresenting: boolean
  onPresent: () => void
  onExitPresentation: () => void
  presentationRootRef: (_node: HTMLElement | null) => void
}

const OPENING_SEEN_KEY = (gameId: string) => `tadazz:opening-seen:${gameId}`

function openingSeen(gameId: string): boolean {
  try {
    return window.sessionStorage.getItem(OPENING_SEEN_KEY(gameId)) === "1"
  } catch {
    return false
  }
}

function markOpeningSeen(gameId: string) {
  try {
    window.sessionStorage.setItem(OPENING_SEEN_KEY(gameId), "1")
  } catch {
    /* Private mode */
  }
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

const CINEMATIC_SCENE_KINDS = new Set([
  "opening",
  "closing",
  "media",
  "animation",
])

function isCinematicScene(scene: SceneDescriptor): boolean {
  if (!CINEMATIC_SCENE_KINDS.has(scene.kind)) {
    return false
  }
  return Boolean(
    scene.mediaUrl?.trim() ||
    scene.lottieUrl ||
    (scene.overlayAnimations?.length ?? 0) > 0,
  )
}

/**
 * The TADAZZ show shell. It owns the whole game screen when the show is active
 * (Razzia's GameBackground and state components are never mounted), renders
 * the ported Motion Kit stage for manager, player and projector from the same
 * authoritative state, and keeps every host/player capability.
 */
export function TadazzShowView(props: TadazzShowViewProps) {
  const {
    manager,
    role,
    extensionState,
    onNext,
    onBack,
    countdown,
    totalPlayers,
    roomMediaReady,
    isHostPresenting,
    onPresent,
    presentationRootRef,
  } = props
  const { t } = useTranslation()
  const tx = useTadazzShellText()
  const labels = useTadazzStageLabels()
  const { socket, isConnected, clientId } = useSocket()
  const rawStatus = useTadazzRawStatus()
  const managerState = useManagerStore()
  const {
    player,
    gameId: playerGameId,
    gameMode,
    updatePlayer,
  } = usePlayerStore()
  const playerStatus = usePlayerStore((s) => s.status)
  const { questionStates } = useQuestionStore()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const [playersModalOpen, setPlayersModalOpen] = useState(false)
  const tieRequestPendingRef = useRef(false)
  const reduced = useMemo(prefersReducedMotion, [])
  const [serverClockOffset, setServerClockOffset] = useState(0)
  useEffect(() => {
    if (!isConnected) return
    let alive = true
    let bestRtt = Infinity
    const sample = () => {
      const sent = Date.now()
      socket.emit("extensions:clock", (serverNow) => {
        const received = Date.now()
        const rtt = received - sent
        if (alive && Number.isFinite(serverNow) && rtt < bestRtt) {
          bestRtt = rtt
          setServerClockOffset(serverNow - (sent + received) / 2)
        }
      })
    }
    sample()
    const second = setTimeout(sample, 250)
    const third = setTimeout(sample, 750)
    return () => {
      alive = false
      clearTimeout(second)
      clearTimeout(third)
    }
  }, [isConnected, socket])

  const status = useMemo(() => {
    if (manager && managerState.status) {
      return {
        name: managerState.status.name,
        data: managerState.status.data,
      }
    }
    if (rawStatus) {
      return rawStatus
    }
    if (playerStatus) {
      return {
        name: playerStatus.name,
        data: playerStatus.data,
      }
    }
    return null
  }, [manager, managerState.status, rawStatus, playerStatus])

  const scene = useMemo(() => {
    const next = computeShowScene({
      role,
      isConnected,
      status,
      envelope: extensionState,
      questionStates,
    })
    if (next.kind === "voting") {
      if (next.votingStartsAt !== undefined)
        next.votingStartsAt -= serverClockOffset
      if (next.votingEndsAt !== undefined)
        next.votingEndsAt -= serverClockOffset
    }
    if (next.kind === "scene" && next.startedAt !== undefined)
      next.startedAt -= serverClockOffset
    return next
  }, [
    role,
    isConnected,
    status,
    extensionState,
    questionStates,
    serverClockOffset,
  ])
  const sceneIdentity = useMemo(
    () =>
      scene.kind === "voting" ||
      (scene.kind === "scene" &&
        scene.scene.kind === "animation" &&
        isFullShowScene((scene.scene as { preset?: string }).preset ?? ""))
        ? scene.key
        : JSON.stringify(scene),
    [scene],
  )

  const showGameId =
    managerState.gameId ?? extensionState?.gameId ?? playerGameId ?? "show"
  const backdrop = resolveStageBackdrop(extensionState)
  // TADAZZ v4 design kit is the default stage; goldy-20261105 / legacy stay available as rollback.
  const useV4 = isTadazzV4Active(extensionState)
  const v4Labels = useTadazzV4Labels()

  if (typeof document !== "undefined") {
    document.documentElement.style.background = "#08011a"
    document.body.style.background = "#08011a"
  }

  useEffect(
    () => () => {
      document.documentElement.style.background = ""
      document.body.style.background = ""
    },
    [],
  )

  // ── Opening (MP4 + Lottie) before the join screen ─────────────────────
  useEffect(() => {
    preloadOpeningAssets()
  }, [])
  const [openingActive, setOpeningActive] = useState(
    () => role !== "player" && !reduced && !openingSeen(showGameId),
  )
  const configuredAudio = extensionState?.extras.audio as
    QuizExtrasV1["audio"] | undefined
  const hasOpeningSoundtrack =
    configuredAudio?.soundtrack?.openingIntro?.mode === "media"
  const [openingMusicDeadline, setOpeningMusicDeadline] = useState<
    number | null
  >(() =>
    role !== "player" &&
    !reduced &&
    !openingSeen(showGameId) &&
    !hasOpeningSoundtrack
      ? Date.now() + 12000
      : null,
  )
  const [openingMusicActive, setOpeningMusicActive] = useState(
    () => role !== "player" && !reduced && !openingSeen(showGameId),
  )
  useEffect(() => {
    if (
      hasOpeningSoundtrack ||
      !openingMusicActive ||
      openingMusicDeadline === null
    ) {
      return
    }
    const remaining = Math.max(0, openingMusicDeadline - Date.now())
    const timer = setTimeout(() => setOpeningMusicActive(false), remaining)

    return () => clearTimeout(timer)
  }, [hasOpeningSoundtrack, openingMusicActive, openingMusicDeadline])

  const enableOpeningSound = useCallback(() => {
    setOpeningMusicActive(true)
    setOpeningMusicDeadline(hasOpeningSoundtrack ? null : Date.now() + 12000)
    window.dispatchEvent(new Event("tadazz:audio-unlock"))
  }, [hasOpeningSoundtrack])

  const openingEligible =
    role !== "player" &&
    (scene.kind === "lobby" ||
      ((scene.kind === "connecting" || scene.kind === "wait") &&
        !questionStates))
  const stageRef = useRef<TadazzStageHandle>(null)
  const showRootRef = useRef<HTMLElement | null>(null)
  const isPaused = Boolean(extensionState?.pause?.paused)
  const resolveStoryTie = useCallback((contestantIndex: number) => {
    if (role !== "manager" || isPaused || !isConnected || !extensionState || tieRequestPendingRef.current) return
    const fullShow = extensionState.extras.activeSceneData as
      { fullShow?: { tieCandidates?: Array<{ answerIndex: number }> } } | undefined
    const candidate = fullShow?.fullShow?.tieCandidates?.[contestantIndex]
    if (!candidate) return
    tieRequestPendingRef.current = true
    socket.emit(EXTENSION_EVENTS.COMMAND, {
      v: 1, gameId: extensionState.gameId, requestId: crypto.randomUUID(),
      action: "RESOLVE_STORY_TIE",
      payload: { answerIndex: candidate.answerIndex, epoch: extensionState.epoch },
    })
    setTimeout(() => { tieRequestPendingRef.current = false }, 800)
  }, [role, isPaused, isConnected, extensionState, socket])
  const referenceStoryTrack = useMemo(() => {
    if (scene.kind !== "scene" || scene.scene.kind !== "animation") return undefined
    const preset = (scene.scene as {preset?:string}).preset
    if (preset !== "story-assembly") return undefined
    return {
      key: scene.key,
      url: STORY_ASSETS.mixerMusic,
      startedAt: scene.startedAt,
      elapsedMs: scene.elapsedMs,
      durationMs: 60000,
      volume: 0.62,
    }
  }, [scene])
  const votingStartsAt =
    scene.kind === "voting" ? scene.votingStartsAt : undefined
  const votingEndsAt = scene.kind === "voting" ? scene.votingEndsAt : undefined
  const [votingOpen, setVotingOpen] = useState(false)
  useEffect(() => {
    const delay = Math.max(0, (votingStartsAt ?? 0) - Date.now())
    setVotingOpen(scene.kind === "voting" && delay === 0)
    if (scene.kind !== "voting" || delay === 0 || isPaused) return
    const timer = setTimeout(() => setVotingOpen(true), delay)
    return () => clearTimeout(timer)
  }, [scene.kind, votingStartsAt, isPaused])
  useEffect(() => {
    const stage = stageRef.current
    const media = showRootRef.current?.querySelectorAll("video, audio") ?? []

    if (isPaused) {
      stage?.pauseAnimations?.()
      media.forEach((element) => (element as HTMLMediaElement).pause())

      return
    }

    stage?.resumeAnimations?.()
    media.forEach((element) => {
      const mediaElement = element as HTMLMediaElement

      if (mediaElement.autoplay) {
        void mediaElement.play().catch(() => undefined)
      }
    })
  }, [isPaused])

  const finishOpening = useCallback(() => {
    markOpeningSeen(showGameId)
    setOpeningActive(false)
  }, [showGameId])
  // Leaving the lobby (host started) ends any opening still on screen.
  useEffect(() => {
    if (scene.kind === "lobby" || scene.kind === "connecting" || scene.kind === "wait") return
    if (openingActive) {
      markOpeningSeen(showGameId)
      setOpeningActive(false)
    }
    if (openingMusicActive) setOpeningMusicActive(false)
  }, [openingActive, openingMusicActive, scene.kind, showGameId])

  // ── Director: authoritative scene → reference animation methods ────────
  const prevSceneRef = useRef<ShowScene | null>(null)
  const pendingRef = useRef<ShowScene | null>(null)
  const busyRef = useRef(false)
  const resumeRef = useRef(true)
  const tokenRef = useRef(0)
  const roleRef = useRef(role)
  roleRef.current = role

  const pump = useCallback(async () => {
    if (busyRef.current) {
      stageRef.current?.setReducedMotion(true)
      stageRef.current?.finishAnimations()

      return
    }

    busyRef.current = true

    try {
      while (pendingRef.current) {
        const next = pendingRef.current
        pendingRef.current = null
        const handle = stageRef.current

        if (!handle) {
          break
        }
        handle.setReducedMotion(reduced)
        let steps: StageStep[] = planTransition(prevSceneRef.current, next, {
          questionKey: handle.questionKey,
          mode: handle.mode,
        })

        if (next.kind === "results" && next.question.options.length === 0) {
          steps = [{ op: "custom" }]
        }
        if (next.kind === "finale" && roleRef.current === "player") {
          steps = [{ op: "custom" }]
        }
        if (next.kind === "results" && next.questionType === "estimation") {
          steps = [{ op: "custom" }]
        }
        if (next.kind === "scene" && isCinematicScene(next.scene)) {
          steps = [{ op: "custom" }]
        }
        const resume = resumeRef.current
        resumeRef.current = false

        if (resume) {
          steps = collapseForResume(steps)
          handle.setReducedMotion(true)
        }

        prevSceneRef.current = next
        const token = ++tokenRef.current

        try {
          await runSteps(
            handle,
            steps,
            () => token === tokenRef.current && pendingRef.current === null,
          )
        } catch (error) {
          console.warn("TADAZZ stage step failed", error)
        }

        handle.setReducedMotion(reduced)
      }
    } finally {
      busyRef.current = false
    }
  }, [reduced])

  useEffect(() => {
    // Keep the painted scene and director history until status content and its
    // separately delivered counter/extension envelope describe one question.
    if (scene.kind === "wait" && scene.key === "wait:question-content") return
    pendingRef.current = scene
    void pump()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIdentity, pump])

  useLayoutEffect(() => {
    if (scene.kind !== "scene" || scene.scene.kind !== "animation") {
      return
    }
    const step = planTransition(null, scene, {
      questionKey: stageRef.current?.questionKey ?? null,
      mode: stageRef.current?.mode ?? "idle",
    }).find((step) => step.op === "showFullShowScene")

    if (step?.op === "showFullShowScene") {
      stageRef.current?.updateFullShowData?.(step.data)
    }
  }, [extensionState?.seq])

  // Server cooldown ticks patch the active voting clock. They never start the
  // voting scene themselves, and delayed ticks can only shorten the deadline.
  // This prevents a second entrance while the director is still opening cards.
  const deadlineRef = useRef<number | null>(null)
  useEvent(EVENTS.GAME.COOLDOWN, (sec: number) => {
    if (scene.kind !== "voting" || typeof sec !== "number") {
      return
    }
    const deadline = resolveMonotonicCooldownDeadline(
      deadlineRef.current,
      votingEndsAt ?? Date.now() + sec * 1000,
    )
    deadlineRef.current = deadline
    const handle = stageRef.current

    if (handle?.mode === "voting") {
      void handle.openVoting(scene.seconds, deadline)
    }
  })
  useEffect(() => {
    deadlineRef.current = null
  }, [scene.key])
  useEffect(() => {
    if (isPaused) {
      deadlineRef.current = null
    }
  }, [isPaused])
  useEffect(() => {
    if (scene.kind !== "voting" || votingEndsAt === undefined) return
    deadlineRef.current = votingEndsAt
    if (stageRef.current?.mode === "voting")
      void stageRef.current.openVoting(scene.seconds, votingEndsAt)
  }, [votingEndsAt])

  // ── Player answering (same socket contract as the registry components) ──
  const isPlayer = role === "player" && Boolean(player)
  const [selected, setSelected] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [answerPending, setAnswerPending] = useState(false)
  const [sfxPop] = useSound(
    useV4 ? "/sounds/tadazz-confirm-20261108.mp3" : SFX.ANSWERS.SOUND,
    { volume: 0.2 },
  )
  const questionKey = "question" in scene ? scene.question.key : null
  const revealAttemptRef = useRef(0)
  if (scene.kind === "voting")
    revealAttemptRef.current = extensionState?.epoch ?? 0
  const timerEndRef = useRef<TimerEndState | null>(null)
  useEffect(() => {
    const next = timerEndTransition(timerEndRef.current, {
      enabled: useV4 && role !== "player", gameId: showGameId,
      questionId: extensionState?.questionId ?? questionKey,
      epoch: extensionState?.epoch ?? 0, voting: scene.kind === "voting",
      results: extensionState?.phase === "responses", paused: isPaused,
    })
    timerEndRef.current = next.state
    if (next.cue) window.dispatchEvent(new CustomEvent("tadazz:sfx", {
      detail: { name: "timer-ended", identity: next.cue, volume: 0.8 },
    }))
  }, [useV4, role, showGameId, extensionState?.questionId, extensionState?.epoch, extensionState?.phase, questionKey, scene.kind, isPaused])
  useTimerBeeps({
    enabled:
      useV4 &&
      role !== "player" &&
      scene.kind === "voting" &&
      (votingStartsAt === undefined ||
        extensionState?.startedAt === undefined ||
        votingStartsAt >= extensionState.startedAt - serverClockOffset),
    gameId: showGameId,
    questionKey,
    epoch: extensionState?.epoch ?? 0,
    startsAt: votingStartsAt,
    endsAt: votingEndsAt,
    paused: isPaused,
  })
  useEffect(() => {
    if (scene.kind === "wait") {
      return
    }
    setSelected([])
    setSubmitted(false)
    setAnswerPending(false)
    stageRef.current?.setSelectedOptions([])
  }, [questionKey, scene.kind])
  const submit = useCallback(
    (answerKeys: number[]) => {
      if (
        !isPlayer ||
        !playerGameId ||
        submitted ||
        answerPending ||
        isPaused ||
        !votingOpen ||
        scene.kind !== "voting"
      ) {
        return
      }
      setAnswerPending(true)
      socket.emit(
        EVENTS.PLAYER.SELECTED_ANSWER,
        {
          gameId: playerGameId,
          data: { answerKeys },
        },
        (result) => {
          setAnswerPending(false)

          if (!result.accepted) {
            return
          }
          sfxPop()
          setSubmitted(true)
          setSelected(answerKeys)
          stageRef.current?.setSelectedOptions(answerKeys)

          if (
            role === "player" &&
            scene.kind === "voting" &&
            scene.questionType !== "estimation"
          ) {
            void stageRef.current?.showChosen?.(answerKeys)
          }
        },
      )
    },
    [
      answerPending,
      isPaused,
      votingOpen,
      isPlayer,
      playerGameId,
      submitted,
      scene,
      socket,
      sfxPop,
      role,
    ],
  )
  const toggle = useCallback((index: number) => {
    setSelected((prev) => {
      const next = prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
      stageRef.current?.setSelectedOptions(next)

      return next
    })
  }, [])
  const onSelectOption = useCallback(
    (index: number) => {
      if (scene.kind !== "voting") {
        return
      }
      if (scene.questionType === "multi") {
        toggle(index)
      } else {
        submit([index])
      }
    },
    [scene, submit, toggle],
  )

  // Personal scores update here; the presenter owns the shared reveal sound.
  useEffect(() => {
    if (scene.kind !== "player-result") {
      return
    }
    updatePlayer(({ player: p }) => ({
      player: p ? { ...p, points: scene.myPoints } : p,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.key])

  // ── Custom screen content per scene ─────────────────────────────────────
  const isSurveyGame = gameMode === QUIZZ_MODES.SURVEY
  const customScreen = (() => {
    switch (scene.kind) {
      case "connecting":
        return <TadazzConnectingScreen />

      case "lobby":
        return (
          <TadazzLobbyScreen
            inviteCode={
              scene.inviteCode ?? managerState.inviteCode ?? undefined
            }
            isManager={manager && !isHostPresenting}
            fullShowData={
              (extensionState?.extras.lobbyFullShow ??
                (managerState.hostPresence?.players.length
                  ? {
                      representatives: managerState.hostPresence.players.map(
                        (p, i) => ({
                          table: p.tableNumber ?? i + 1,
                          name: p.displayName,
                        }),
                      ),
                      connectedTables:
                        managerState.hostPresence.players.flatMap((p, i) =>
                          p.status === "connected"
                            ? [p.tableNumber ?? i + 1]
                            : [],
                        ),
                    }
                  : undefined)) as
                | {
                    dialNumber?: string
                    representatives?: Array<{ table: number; name: string }>
                    connectedTables?: number[]
                  }
                | undefined
            }
            text={scene.text}
          />
        )

      case "wait":
        if (submitted || Boolean(stageRef.current?.questionKey)) {
          return null
        }
        return (
          <TadazzWaitScreen
            text={scene.text}
            playerName={role === "player" ? player?.username : undefined}
          />
        )

      case "start":
        return <TadazzStartScreen subject={scene.subject} time={scene.time} />

      case "prepared":
        return (
          <TadazzPreparedScreen
            questionNumber={scene.questionNumber}
            total={questionStates?.total ?? null}
          />
        )

      case "summary":
        return (
          <TadazzSummaryScreen
            subject={scene.subject}
            totalPlayers={scene.totalPlayers}
            totalQuestions={scene.totalQuestions}
          />
        )

      case "player-result":
        return (
          <TadazzPlayerResultScreen
            correct={scene.correct}
            message={scene.message}
            points={scene.points}
            rank={scene.rank}
            aheadOfMe={scene.aheadOfMe}
            survey={isSurveyGame}
          />
        )

      case "finale":
        return role === "player" ? (
          <TadazzPlayerFinishedScreen
            rank={scene.rank}
            subject={scene.subject}
            points={player?.points ?? 0}
          />
        ) : null

      case "results":
        return scene.questionType === "estimation" ? (
          <TadazzEstimationResultScreen
            question={scene.question.question}
            estimation={scene.estimation}
          />
        ) : null

      case "interlude":
        return (
          <TadazzInterludeScreen
            interlude={scene.interlude}
            startedAt={scene.startedAt}
          />
        )

      case "scene": {
        const s = scene.scene

        if (
          s.kind === "animation" &&
          isCreatingWorldsPreset((s as { preset?: string }).preset ?? "")
        ) {
          return null
        }
        if (s.kind === "countdown") {
          return (
            <TadazzCountdownScreen
              title={s.title}
              startedAt={scene.startedAt}
              seconds={s.durationSeconds ?? 10}
            />
          )
        }
        if (s.kind === "answerRecap" && scene.activeSceneData?.answerRecap) {
          return (
            <TadazzRecapScreen
              title={s.title}
              recap={scene.activeSceneData.answerRecap}
            />
          )
        }
        if (s.kind === "interimResults" || s.kind === "leaderboard") {
          return (
            <TadazzMessageScreen
              headline={s.title}
              sub={tx("noResponses", "No responses recorded yet.")}
            />
          )
        }
        return <TadazzSceneTitleScreen scene={s} />
      }

      default:
        return null
    }
  })()

  // ── Cinematic overlay: opening compositor, media/opening/closing scenes ──
  const emitTimeline = useCallback(
    (action: "ADVANCE_TIMELINE_SCENE", reason: string) => {
      if (!manager || !extensionState?.gameId || scene.kind !== "scene") {
        return
      }
      socket.emit(EXTENSION_EVENTS.COMMAND, {
        v: 1,
        gameId: extensionState.gameId,
        action,
        payload: {
          epoch: extensionState.epoch,
          sceneId: scene.scene.id,
          timelineStepIndex: scene.stepIndex,
          reason,
        },
        requestId: `tadazz-${reason}-${extensionState.epoch}-${scene.stepIndex ?? 0}`,
      })
    },
    [manager, extensionState, scene, socket],
  )

  const handleStageCue = useCallback(
    (cue: { name: string; scene: string; questionKey?: string; questionNumber?: number }) => {
      // The browser clock can finish during skips/fast-forward too. Only the
      // authoritative result scene owns the audible end-of-question cue.
      if (cue.name === "countdown-ended") return
      // Finishing an old animation during restart/skip may emit its final cue.
      // Only the authoritative results screen may make that reveal audible.
      if (!acceptsQuestionMilestone({
        name: cue.name, paintedScene: cue.scene, paintedQuestion: cue.questionNumber,
        currentQuestion: questionStates?.current, currentKind: scene.kind, currentPhase: extensionState?.phase,
        paintedQuestionKey: cue.questionKey,
        currentQuestionText: "question" in scene ? scene.question.question : scene.kind === "scene" ? scene.activeSceneData?.interimResults?.questionText : undefined,
        currentPreset: scene.kind === "scene" && "preset" in scene.scene ? String(scene.scene.preset) : undefined,
        currentSceneKind: scene.kind === "scene" ? scene.scene.kind : undefined,
      })) return
      window.dispatchEvent(
        new CustomEvent("tadazz:sfx", {
          detail: {
            name: cue.name,
            identity:
              cue.name === "survey-reveal" || cue.name === "top-pick-reveal"
                ? `${showGameId}:${cue.questionKey ?? extensionState?.questionId ?? questionKey ?? scene.key}:${revealAttemptRef.current}:${cue.name}`
                : `${showGameId}:${extensionState?.epoch ?? 0}:${scene.key}:${cue.scene}:${cue.name}`,
            volume: cue.name === "survey-reveal" ? 0.9 : cue.name === "top-pick-reveal" ? 0.7 : 0.55,
          },
        }),
      )
    },
    [
      extensionState?.epoch,
      extensionState?.phase,
      extensionState?.questionId,
      questionKey,
      questionStates?.current,
      sceneIdentity,
      scene,
      showGameId,
    ],
  )

  const audioPolicy = useMemo(() => {
    const descriptor = scene.kind === "scene" ? scene.scene : null

    return resolveTadazzAudioPolicy({
      statusName: props.statusName,
      extensionPhase: extensionState?.phase,
      sceneKind: descriptor?.kind ?? scene.kind,
      scenePreset:
        descriptor &&
        "preset" in descriptor &&
        typeof descriptor.preset === "string"
          ? descriptor.preset
          : null,
      openingActive: openingMusicActive,
    })
  }, [extensionState?.phase, openingMusicActive, props.statusName, scene])

  let overlay: React.ReactNode = null

  if (openingActive && openingEligible) {
    overlay = (
      <TadazzOpening
        eventArtworkPending={!extensionState}
        eventArtworkUrl={
          extensionState?.extras.lobbyFullShow ||
          Boolean(managerState.hostPresence?.players.length)
            ? "/tadazz-show/second-library/creating-worlds-intro.png"
            : undefined
        }
        onFinished={finishOpening}
        onEnableSound={
          manager && !isHostPresenting ? enableOpeningSound : undefined
        }
        canSkip={manager && !isHostPresenting}
        labels={{
          skip: tx("skipOpening", "Skip"),
          enableSound: tx("enableSound", "Enable sound"),
        }}
      />
    )
  } else if (scene.kind === "scene" && isCinematicScene(scene.scene)) {
    const s = scene.scene
    const kind: CinematicLayerStackProps["sceneKind"] =
      s.kind === "opening" || s.kind === "closing" ? s.kind : "media"
    overlay = (
      <div
        className="tz-scene-media"
        style={{ zIndex: 20 }}
        data-testid="tadazz-cinematic-scene"
      >
        <CinematicLayerStack
          sceneId={s.id ?? s.kind}
          sceneKind={kind}
          epoch={extensionState?.epoch}
          serverStartedAt={scene.startedAt}
          mediaUrl={s.mediaUrl}
          mediaType={s.mediaType}
          mediaFit={s.mediaFit}
          volume={s.volume}
          loop={s.loop}
          muted={s.muted}
          endBehavior={s.endBehavior}
          contrastOverlayOpacity={0}
          lottieUrl={s.lottieUrl}
          lottieFit={s.lottieFit}
          lottieLoop={s.lottieLoop}
          lottieSpeed={s.lottieSpeed}
          overlayAnimations={
            s.overlayAnimations as CinematicLayerStackProps["overlayAnimations"]
          }
          controlledPaused={isPaused}
          showAutoplayControl={!isHostPresenting}
          activateAudioLabel={tx("enableSound", "Enable sound")}
          onForegroundMediaEnded={() =>
            emitTimeline("ADVANCE_TIMELINE_SCENE", "mediaEnded")
          }
        />
      </div>
    )
  } else if (
    scene.kind === "interlude" &&
    scene.interlude.url &&
    (scene.interlude.kind === "image" || scene.interlude.kind === "video")
  ) {
    overlay = (
      <div
        className="tz-scene-media"
        style={{ zIndex: 20 }}
        data-testid="tadazz-interlude-media"
      >
        <CinematicLayerStack
          sceneId={`interlude-${extensionState?.epoch ?? 0}`}
          sceneKind="media"
          epoch={extensionState?.epoch}
          serverStartedAt={scene.startedAt}
          mediaUrl={scene.interlude.url}
          mediaType={scene.interlude.kind}
          mediaFit="contain"
          controlledPaused={isPaused}
          contrastOverlayOpacity={0}
        />
      </div>
    )
  }

  // ── Layout ──────────────────────────────────────────────────────────────
  const [viewportSize, setViewportSize] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1920,
    h: typeof window !== "undefined" ? window.innerHeight : 1080,
  }))
  useEffect(() => {
    const onResize = () =>
      setViewportSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)

    return () => window.removeEventListener("resize", onResize)
  }, [])
  const portrait = viewportSize.h > viewportSize.w
  const isMobilePhone = viewportSize.w < 640
  const showPad =
    isPlayer &&
    scene.kind === "voting" &&
    (portrait || scene.questionType === "estimation")
  const playerAnswersOnly = Boolean(
    isPlayer && scene.kind === "voting" && scene.answersOnly,
  )

  // Question media (image/video) is shown inside the stage under the panel (except on mobile player popup / answersOnly).
  const questionMedia =
    (scene.kind === "question" || scene.kind === "voting") && scene.media
      ? scene.media
      : null
  const isPopupMedia = Boolean(
    questionMedia &&
    (questionMedia.type === MEDIA_TYPES.IMAGE ||
      questionMedia.type === MEDIA_TYPES.VIDEO),
  )
  const showMediaInPopup =
    isPlayer && isMobilePhone && isPopupMedia && !playerAnswersOnly
  // V4 question-image layout paints the question photo itself (left panel), so no full-stage underlay.
  const v4PhotoQuestion =
    useV4 && scene.kind === "voting" && Boolean(scene.question.questionImage)
  const underlay =
    isPopupMedia &&
    questionMedia &&
    !playerAnswersOnly &&
    !showMediaInPopup &&
    !v4PhotoQuestion ? (
      <div className="tz-scene-media" data-testid="tadazz-question-media">
        {questionMedia.type === MEDIA_TYPES.VIDEO ? (
          <video
            src={questionMedia.url}
            autoPlay
            playsInline
            muted={scene.kind === "voting"}
            style={{ objectFit: "contain" }}
          />
        ) : (
          <img
            src={questionMedia.url}
            alt={
              scene.kind === "question" || scene.kind === "voting"
                ? scene.question.question
                : ""
            }
            style={{ objectFit: "contain" }}
          />
        )}
      </div>
    ) : null
  const questionAudio =
    questionMedia && questionMedia.type === MEDIA_TYPES.AUDIO
      ? questionMedia.url
      : null
  const hostNextKey = props.statusName
    ? MANAGER_SKIP_BTN[props.statusName]
    : null

  const teamsData = extensionState?.extras.teams as
    | { teams?: TeamDefinition[]; assignments?: Record<string, string> }
    | undefined
  const assignedTeam = (() => {
    const id =
      (clientId ? teamsData?.assignments?.[clientId] : undefined) ??
      teamsData?.assignments?.[
        (player as { id?: string } | null)?.id ?? player?.username ?? ""
      ]

    return teamsData?.teams?.find((team) => team.id === id)
  })()

  const isEnhanced = Boolean(extensionState?.gameId)
  const connectedCount =
    managerState.hostPresence?.connectedNow ??
    managerState.players.filter((p) => p.connected).length
  const registeredCount =
    managerState.hostPresence?.registeredTotal ??
    totalPlayers ??
    managerState.players.length
  const participation = extensionState?.extras.participation as
    { connected: number; answered: number } | undefined
  const publicConnected = participation?.connected ?? (manager ? connectedCount : 0)
  const publicAnswered = participation?.answered ?? 0
  const isStoryReading = scene.kind === "scene" && scene.scene.preset === "story-live"

  return (
    <ExtensionStateProvider value={extensionState}>
      <ViewRoleContext.Provider value={role}>
        <section
          ref={(node) => {
            showRootRef.current = node
            presentationRootRef(node)
          }}
          className="relative isolate flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden"
          style={{
            background: "#08011a",
            width: "100vw",
            maxWidth: "100vw",
            height: "100dvh",
            maxHeight: "100dvh",
            overflow: "hidden",
          }}
          data-testid="tadazz-show"
          data-show-scene={scene.kind}
          data-role={role}
          data-host-presenting={isHostPresenting ? "true" : "false"}
          data-game-paused={isPaused ? "true" : "false"}
          data-voting-open={votingOpen && !isPaused ? "true" : "false"}
          data-voting-starts-at={votingStartsAt}
          data-voting-ends-at={votingEndsAt}
          aria-label={isHostPresenting ? "Public game presentation" : undefined}
        >
          {manager &&
            !isHostPresenting &&
            (isEnhanced ? (
              <ManagerControlToolbar
                statusName={props.statusName ?? null}
                extensionState={extensionState}
                questionStates={questionStates}
                onExit={onBack ?? (() => undefined)}
                onStartGame={
                  props.statusName === STATUS.SHOW_ROOM ? onNext : undefined
                }
                onAdvanceFallback={onNext}
                onPresent={onPresent}
                countdown={countdown}
              />
            ) : (
              <div className="tz-player-bar" data-testid="tadazz-host-bar">
                <button
                  type="button"
                  className="tz-x-pill"
                  style={{ fontSize: 14, padding: "6px 14px" }}
                  onClick={onBack}
                >
                  <LogOut className="inline size-4" /> {t("common:exit")}
                </button>
                {questionStates && (
                  <span>{`${questionStates.current} / ${questionStates.total ?? "?"}`}</span>
                )}
                {onNext && hostNextKey && (
                  <button
                    type="button"
                    className="tz-pad-submit"
                    style={{ marginTop: 0, padding: "8px 18px" }}
                    onClick={onNext}
                    data-testid="tadazz-host-next"
                  >
                    <SkipForward className="inline size-4" /> {t(hostNextKey)}
                  </button>
                )}
              </div>
            ))}

          <div
            className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden"
            style={{
              position: "relative",
              flex: "1 1 0%",
              minWidth: 0,
              minHeight: 0,
              width: "100%",
              overflow: "hidden",
            }}
          >
            {useV4 ? (
              <TadazzV4StageAdapter
                ref={stageRef}
                labels={labels}
                v4Labels={v4Labels}
                onCue={handleStageCue}
                onResolveStoryTie={role === "manager" ? resolveStoryTie : undefined}
                backdropUrl={backdrop?.url}
                backdropFit={backdrop?.fit}
                interactive={
                  isPlayer &&
                  scene.kind === "voting" &&
                  !submitted &&
                  !answerPending &&
                  !isPaused &&
                  !showPad
                }
                multiSelect={
                  scene.kind === "voting" && scene.questionType === "multi"
                }
                onSelectOption={onSelectOption}
                customScreen={customScreen}
                underlay={underlay}
                overlay={overlay}
                reducedMotion={reduced}
                fitRevision={isHostPresenting ? 1 : 0}
              />
            ) : (
              <TadazzStage
                ref={stageRef}
                labels={labels}
                backdropUrl={backdrop?.url}
                backdropFit={backdrop?.fit}
                interactive={
                  isPlayer &&
                  scene.kind === "voting" &&
                  !submitted &&
                  !answerPending &&
                  !isPaused &&
                  !showPad
                }
                multiSelect={
                  scene.kind === "voting" && scene.questionType === "multi"
                }
                onSelectOption={onSelectOption}
                customScreen={customScreen}
                underlay={underlay}
                overlay={overlay}
                reducedMotion={reduced}
              />
            )}
            {role !== "player" && <LiveParticipation
              connected={publicConnected} answered={publicAnswered}
              voting={scene.kind === "voting" && votingOpen}
            />}
            {playerAnswersOnly && scene.kind === "voting" && (
              <QuestionDialog
                question={scene.fullQuestion ?? ""}
                media={questionMedia as never}
                showQuestion
                label={t("game:question.show")}
                className="tz-x-pill absolute top-3 right-3 z-30 flex items-center justify-center"
              >
                <CircleQuestionMark className="size-5" />
              </QuestionDialog>
            )}
            {showMediaInPopup && scene.kind === "voting" && questionMedia && (
              <QuestionDialog
                question={scene.question.question}
                media={questionMedia as never}
                className="tz-x-pill absolute top-3 right-3 z-30 flex items-center gap-1.5"
              >
                {questionMedia.type === MEDIA_TYPES.VIDEO ? (
                  <Video className="size-4" />
                ) : (
                  <Image className="size-4" />
                )}
                {t(
                  questionMedia.type === MEDIA_TYPES.VIDEO
                    ? "game:media.showVideo"
                    : "game:media.showImage",
                )}
              </QuestionDialog>
            )}
            {questionAudio && (
              <audio
                src={questionAudio}
                autoPlay
                controls={!manager || !isHostPresenting}
                className="absolute bottom-3 left-1/2 z-30 w-full max-w-md -translate-x-1/2 rounded-md"
                data-testid="tadazz-question-audio"
              />
            )}
          </div>

          {showPad && scene.kind === "voting" && (
            <TadazzAnswerPad
              question={scene.question}
              questionType={scene.questionType}
              options={scene.options}
              selected={selected}
              submitted={submitted}
              disabled={!isPlayer || isPaused || !votingOpen || answerPending}
              onToggle={toggle}
              onSubmit={submit}
            />
          )}
          {!showPad &&
            isPlayer &&
            scene.kind === "voting" &&
            scene.questionType === "multi" &&
            !submitted && (
              <div className="tz-pad">
                <button
                  type="button"
                  className="tz-pad-submit"
                  disabled={
                    selected.length === 0 ||
                    isPaused ||
                    !votingOpen ||
                    answerPending
                  }
                  onClick={() => submit([...selected].sort((a, b) => a - b))}
                >
                  {t("game:confirm")}
                </button>
              </div>
            )}

          {extensionState && role !== "player" && (
            <AudioCuePlayer
              showTrack={referenceStoryTrack}
              stageOwnsReveal={useV4}
              cueId={props.audioCueId}
              audioExtras={
                extensionState.extras.audio as QuizExtrasV1["audio"] | undefined
              }
              cardAudioCues={
                extensionState.extras.cardAudioCues as
                  CardAudioOverrides | undefined
              }
              sceneAudio={(isStoryReading ? undefined : props.sceneAudio) as never}
              gameId={extensionState.gameId}
              activeCardKey={props.activeCardKey}
              phase={
                extensionState.phase === "scene"
                  ? "scene"
                  : (props.statusName ?? extensionState.phase)
              }
              epoch={extensionState.epoch}
              soundtrackSlot={audioPolicy.slot}
              continuityKey={audioPolicy.continuityKey}
              paused={isPaused}
              autoPlay={!manager || roomMediaReady}
              onEnded={() => {
                if (audioPolicy.slot === "openingIntro")
                  setOpeningMusicActive(false)
              }}
              showControls={manager && !isHostPresenting}
              controlLabels={{
                enable: t("extensions:audio.enableSound", "Enable sound"),
                volume: t("extensions:audio.volume", "Volume"),
                mute: t("extensions:audio.mute", "Mute"),
                unmute: t("extensions:audio.unmute", "Unmute"),
                pause: t("extensions:audio.pauseAudio", "Pause audio"),
                play: t("extensions:audio.playAudio", "Play audio"),
                track: t("extensions:audio.track", "Track"),
                followShow: t("extensions:audio.followShow", "Follow show"),
              }}
              soundtrackLabels={{
                openingIntro: t(
                  "extensions:audio.slotOpeningIntro",
                  "Opening intro",
                ),
                lobby: t("extensions:audio.slotLobby", "Lobby / QR"),
                roundStart: t("extensions:audio.slotRoundStart", "Round start"),
                question: t("extensions:audio.slotQuestion", "Question"),
                voting: t("extensions:audio.slotVoting", "Voting"),
                results: t("extensions:audio.slotResults", "Results"),
                leaderboard: t(
                  "extensions:audio.slotLeaderboard",
                  "Leaderboard",
                ),
                recap: t("extensions:audio.slotRecap", "Recap"),
                finale: t("extensions:audio.slotFinale", "Finale"),
              }}
              hasCompetingMedia={props.hasCompetingMediaAudio}
            />
          )}

          {manager ? (
            isHostPresenting ? (
              <div className="absolute top-3 right-3 z-40">
                <HostShortcutsDialog compact />
              </div>
            ) : (
              <div
                className="z-50 box-border flex max-w-full flex-wrap items-center gap-2 p-2 sm:gap-3"
                style={{ background: "#08011a" }}
                data-testid="tadazz-host-controls"
              >
                {managerState.inviteCode &&
                  props.statusName !== STATUS.SHOW_ROOM && (
                    <div
                      className="tz-x-pill flex shrink-0 items-center gap-2"
                      style={{ fontSize: 16, padding: "6px 14px" }}
                    >
                      {!managerState.locked && (
                        <>
                          <span className="max-w-[160px] truncate sm:max-w-none">
                            {window.location.host}
                          </span>
                          <span className="h-4 w-px bg-white/40" />
                          <span>{managerState.inviteCode}</span>
                        </>
                      )}
                      <RoomLockButton className="-mx-1 rounded-md p-1 hover:bg-white/20" />
                    </div>
                  )}
                {props.statusName === STATUS.SHOW_ROOM && (
                  <RoomLockButton className="tz-x-pill" />
                )}
                <Tooltip
                  content={t(
                    "extensions:roster.liveModalTitle",
                    "Players & Live Connection Status",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPlayersModalOpen(true)}
                    data-testid="host-bottom-players-btn"
                    className="tz-x-pill ml-auto flex shrink-0 items-center gap-1.5"
                    style={{
                      fontSize: 16,
                      padding: "6px 14px",
                      opacity: isConnected ? 1 : 0.6,
                    }}
                  >
                    <Users className="size-5" />
                    <span data-testid="host-connected-counter">
                      {registeredCount > 0 &&
                      (registeredCount !== connectedCount ||
                        managerState.hostPresence)
                        ? `${connectedCount} / ${registeredCount}`
                        : String(totalPlayers ?? managerState.players.length)}
                    </span>
                    <PhoneCall className="size-3" />
                  </button>
                </Tooltip>
                <GameSettingsModal
                  onOpenRoster={() => setPlayersModalOpen(true)}
                />
                <HostPlayersModal
                  open={playersModalOpen}
                  onOpenChange={setPlayersModalOpen}
                />
                <Tooltip
                  content={t(
                    isFullscreen
                      ? "common:exitFullscreen"
                      : "common:fullscreen",
                  )}
                >
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={t(
                      isFullscreen
                        ? "common:exitFullscreen"
                        : "common:fullscreen",
                    )}
                    className="tz-x-pill flex items-center justify-center"
                    style={{ padding: "6px 12px" }}
                  >
                    {isFullscreen ? (
                      <Minimize className="size-5" />
                    ) : (
                      <Maximize className="size-5" />
                    )}
                  </button>
                </Tooltip>
              </div>
            )
          ) : role === "spectator" ? null : (
            <div className="tz-player-bar" data-testid="tadazz-player-bar">
              <div className="flex items-center gap-2">
                <span>{player?.username}</span>
                {assignedTeam && (
                  <span
                    className="tz-player-team"
                    style={{ backgroundColor: assignedTeam.color }}
                  >
                    {assignedTeam.name}
                  </span>
                )}
              </div>
              {(gameMode !== QUIZZ_MODES.SURVEY ||
                (player?.points !== undefined && player.points > 0)) && (
                <span className="tz-player-score">{player?.points ?? 0}</span>
              )}
            </div>
          )}
        </section>
      </ViewRoleContext.Provider>
    </ExtensionStateProvider>
  )
}

export default TadazzShowView
