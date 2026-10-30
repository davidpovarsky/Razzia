import { EVENTS, MEDIA_TYPES, NO_TIME_LIMIT } from "@razzia/common/constants"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type AnswerVisual,
  type ExtensionStateEnvelope,
  type RevealDistributionSnapshot,
} from "@razzia/extensions/core"
import { ScenePresenter } from "@razzia/extensions/presentation"
import GameBackground from "@razzia/web/components/GameBackground"
import Loader from "@razzia/web/components/Loader"
import PhotoCardGrid from "@razzia/web/features/game/components/PhotoCardGrid"
import {
  ExtensionStateProvider,
  getAuthoritativeEnvelope,
} from "@razzia/web/features/game/contexts/extension-state-context"
import {
  socketClient,
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useSocketConnection } from "@razzia/web/features/game/hooks/useSocketConnection"
import { useFullscreen } from "@razzia/web/hooks/useFullscreen"
import { createFileRoute, useParams } from "@tanstack/react-router"
import clsx from "clsx"
import { Maximize, Minimize, Tv } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface StatusState {
  name: Status
  data: Record<string, unknown>
}

const AudienceDisplayPage = () => {
  const { gameId } = useParams({ from: "/display/$gameId" })
  const { socket, isConnected } = useSocket()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const { t } = useTranslation()

  const [joined, setJoined] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusState | null>(null)
  const [cooldown, setCooldown] = useState<number | null>(null)
  const [extensionState, setExtensionState] =
    useState<ExtensionStateEnvelope | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const syncedRef = useRef(false)

  useSocketConnection()

  useEffect(() => {
    if (!isConnected || !gameId) {
      syncedRef.current = false
      return
    }

    if (syncedRef.current) return
    syncedRef.current = true

    socket.emit(EVENTS.SPECTATOR.JOIN, { gameId })
  }, [isConnected, gameId, socket])

  useEvent(
    EVENTS.SPECTATOR.SUCCESS_JOIN,
    ({
      gameId: joinedGameId,
      inviteCode: code,
    }: {
      gameId: string
      inviteCode?: string
      gameMode?: string
    }) => {
      setJoined(true)
      if (code) setInviteCode(code)
    },
  )

  useEvent(
    EVENTS.GAME.STATUS,
    ({ name, data }: { name: Status; data: Record<string, unknown> }) => {
      setStatus({ name, data })
      if (name === STATUS.SELECT_ANSWER && typeof data.time === "number") {
        setCooldown(data.time)
      }
    },
  )

  useEvent(EVENTS.GAME.COOLDOWN, (sec: number) => {
    setCooldown(sec)
  })

  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    setExtensionState((prev) => getAuthoritativeEnvelope(prev, payload))
  })

  useEvent(EVENTS.GAME.RESET, (message: string) => {
    setResetMessage(message || "errors:game.notFound")
  })

  // Sourcing visuals
  const answerVisuals = useMemo(() => {
    const raw = extensionState?.extras?.answerVisuals as
      | AnswerVisual[]
      | undefined
    return raw && raw.length > 0 ? raw : undefined
  }, [extensionState])

  // Active scene / timeline step
  const activeTimelineStep = extensionState?.extras?.activeTimelineStep as
    | {
        id: string
        kind: string
        stepIndex: number
        totalSteps: number
        startedAt?: number
        durationMs?: number
        sceneId?: string
      }
    | undefined

  const isSceneActive = Boolean(
    activeTimelineStep && activeTimelineStep.kind !== "question",
  )

  if (resetMessage) {
    return (
      <main className="relative flex h-screen w-full items-center justify-center p-4">
        <GameBackground />
        <div className="z-10 flex max-w-md flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/70 p-8 text-center text-white backdrop-blur-md shadow-2xl">
          <Tv className="size-16 text-white/50" />
          <h1 className="text-2xl font-black">{t(resetMessage, "Show Concluded")}</h1>
          <p className="text-sm text-white/70">
            {t("game:summary.title")}
          </p>
        </div>
      </main>
    )
  }

  if (!joined && !status) {
    return (
      <main className="relative flex h-screen w-full items-center justify-center">
        <GameBackground />
        <div className="z-10 flex flex-col items-center gap-4 text-white">
          <Loader className="size-10" />
          <p className="text-lg font-bold">
            {t("common:connecting")}
          </p>
        </div>
      </main>
    )
  }

  return (
    <ExtensionStateProvider value={extensionState}>
      <main
        className="relative flex h-screen w-full flex-col overflow-hidden text-white"
        data-testid="audience-display"
        data-role="spectator"
      >
        <GameBackground />

        {/* Discreet fullscreen button in top corner outside content flow */}
        <div className="absolute top-3 right-3 z-50">
          <button
            type="button"
            onClick={toggleFullscreen}
            data-testid="audience-fullscreen-btn"
            aria-label={t(
              isFullscreen ? "common:exitFullscreen" : "common:fullscreen",
            )}
            className="flex size-9 items-center justify-center rounded-lg bg-black/40 text-white/80 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
          >
            {isFullscreen ? (
              <Minimize className="size-4" />
            ) : (
              <Maximize className="size-4" />
            )}
          </button>
        </div>

        {/* Main Public Stage */}
        <div className="relative z-10 flex h-full w-full flex-1 flex-col items-center justify-between p-4 sm:p-6 md:p-8">
          {/* 1. Studio V2 Scene Presentation (opening, closing, interimResults, leaderboard, animation) */}
          {isSceneActive ? (
            <div className="flex h-full w-full flex-1 items-center justify-center">
              <ScenePresenter
                step={activeTimelineStep as never}
                scene={extensionState?.extras?.currentScene as never}
                activeSceneData={
                  extensionState?.extras?.activeSceneData as never
                }
                serverStartedAt={activeTimelineStep?.startedAt}
                isManager={false}
              />
            </div>
          ) : status?.name === STATUS.SELECT_ANSWER ||
            status?.name === STATUS.SHOW_QUESTION ? (
            /* 2. Live Question / Voting Stage */
            <div className="flex h-full w-full flex-1 flex-col items-center justify-between gap-4">
              {/* Question Header & Timer */}
              <div className="flex w-full max-w-5xl flex-col items-center gap-3 text-center">
                <h1
                  className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-2xl"
                  data-testid="audience-question-title"
                >
                  {String(status.data.question ?? "")}
                </h1>

                {/* Cooldown Timer */}
                {cooldown !== null && cooldown !== NO_TIME_LIMIT && (
                  <div
                    data-testid="audience-cooldown"
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-5 py-1.5 font-mono text-lg font-bold text-white shadow-lg backdrop-blur-md"
                  >
                    <span className="text-xs uppercase tracking-wider text-white/70">
                      {t("game:hud.time", "Time")}
                    </span>
                    <span className="text-xl text-primary font-black">{cooldown}s</span>
                  </div>
                )}
              </div>

              {/* Photo Card Grid for 5 options (3+2 centered) */}
              <div className="w-full flex-1 flex items-center justify-center">
                <PhotoCardGrid
                  answers={(status.data.answers as string[]) ?? []}
                  visuals={answerVisuals}
                  readOnly
                  isSurvey={true}
                />
              </div>
            </div>
          ) : status?.name === STATUS.SHOW_RESPONSES ? (
            /* 3. Authoritative Result / Reveal Stage */
            (() => {
              const answers = (status.data.answers as string[]) ?? []
              const responses =
                (status.data.responses as Record<number, number> | number[]) ??
                {}
              const revealDistribution = extensionState?.extras
                ?.revealDistribution as RevealDistributionSnapshot | undefined

              // Target percentages from authoritative reveal distribution or responses
              const percentages: Record<number, number> = {}
              if (revealDistribution?.options) {
                for (const [idx, opt] of Object.entries(
                  revealDistribution.options,
                )) {
                  percentages[Number(idx)] = opt.percentage
                }
              } else {
                const totalVotes = Object.values(responses).reduce(
                  (acc: number, c) => acc + (Number(c) || 0),
                  0,
                )
                answers.forEach((_, idx) => {
                  const count = Array.isArray(responses)
                    ? responses[idx]
                    : responses[idx] ?? 0
                  percentages[idx] =
                    totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                })
              }

              // Compute plurality leaders
              let maxCount = 0
              for (const c of Object.values(responses)) {
                const num = Number(c) || 0
                if (num > maxCount) maxCount = num
              }
              const winnerIndices =
                maxCount > 0
                  ? answers
                      .map((_, i) => i)
                      .filter(
                        (i) =>
                          (Array.isArray(responses)
                            ? responses[i]
                            : responses[i] ?? 0) === maxCount,
                      )
                  : []
              const isTie = winnerIndices.length > 1

              return (
                <div className="flex h-full w-full flex-1 flex-col items-center justify-between gap-4">
                  <div className="flex w-full max-w-5xl flex-col items-center gap-3 text-center">
                    <h1
                      className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-2xl"
                      data-testid="audience-question-title"
                    >
                      {String(status.data.question ?? "")}
                    </h1>

                    {/* Responders ratio badge */}
                    {revealDistribution && (
                      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-1.5 text-sm font-semibold text-white/90 shadow-md backdrop-blur-md">
                        <span>
                          {t("extensions:reveal.answeredRatio", {
                            responders: revealDistribution.totalResponders,
                            eligible: revealDistribution.eligiblePlayers,
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Photo Cards with Authoritative Reveal & Winner Spotlight */}
                  <div className="w-full flex-1 flex items-center justify-center">
                    <PhotoCardGrid
                      answers={answers}
                      visuals={answerVisuals}
                      responses={responses}
                      percentages={percentages}
                      winners={winnerIndices}
                      isTie={isTie}
                      isRevealed={true}
                      isSurvey={true}
                      readOnly
                    />
                  </div>
                </div>
              )
            })()
          ) : status?.name === STATUS.SHOW_ROOM ? (
            /* 4. Room / Waiting Lobby Stage */
            <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-6 text-center">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black drop-shadow-2xl">
                {String(status.data.subject || "Tada Interactive Show")}
              </h1>
              {inviteCode && (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-black/50 p-6 shadow-2xl backdrop-blur-md">
                  <span className="text-sm font-bold uppercase tracking-wider text-white/70">
                    {t("game:pinLabel")}
                  </span>
                  <span className="font-mono text-4xl sm:text-5xl font-black tracking-widest text-primary">
                    {inviteCode}
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* 5. Generic Public Transition State */
            <div className="flex h-full w-full flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md">
                <Loader className="size-8" />
                <span className="text-lg font-bold">
                  {t("common:loading")}
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    </ExtensionStateProvider>
  )
}

export const Route = createFileRoute("/display/$gameId")({
  component: AudienceDisplayPage,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.SPECTATOR.LEAVE, { gameId })
  },
})

export default AudienceDisplayPage
