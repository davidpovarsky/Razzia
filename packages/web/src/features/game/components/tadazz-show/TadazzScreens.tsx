// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import { EVENTS } from "@razzia/common/constants"
import {
  TADAZZ_BACKDROP_URL,
  NativeClassicLobbyPanel,
  TADAZZ_LOGO_URL,
  useRoomJoin,
  TadazzMessageScreen,
  TadazzCountdownScreen,
} from "@razzia/extensions/presentation"
import type { Player } from "@razzia/common/types/game"
import type { Interlude } from "@razzia/extensions/core"

import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"
import { useTadazzShellText } from "./useTadazzLabels"

export {
  TadazzMessageScreen,
  TadazzCountdownScreen,
  TadazzRecapScreen,
  TadazzSceneTitleScreen,
} from "@razzia/extensions/presentation"

// All screens render inside the canonical `.tz-screen` slot of the 1920×1080
// stage and only use canonical tokens (see tadazz-show-adaptations.css).

export function TadazzStandbyScreen() {
  return (
    <div
      className="tz-x-center"
      data-testid="tadazz-screen-standby"
      style={{
        backgroundImage: `url(${TADAZZ_BACKDROP_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        width: "100%",
        height: "100%",
      }}
    >
      <img className="tz-x-logo" src={TADAZZ_LOGO_URL} alt="TADAZZ!" />
    </div>
  )
}

export function TadazzConnectingScreen() {
  const { t } = useTranslation()

  return (
    <div className="tz-x-center" data-testid="tadazz-screen-connecting">
      <img className="tz-x-logo" src={TADAZZ_LOGO_URL} alt="TADAZZ!" />
      <div className="tz-x-sub">{t("common:connecting")}</div>
    </div>
  )
}

export function TadazzLobbyScreen({
  inviteCode: rawInviteCode,
  isManager,
  fullShowData,
  text,
}: {
  inviteCode?: string
  isManager: boolean
  fullShowData?: {
    dialNumber?: string
    representatives?: Array<{ table: number; name: string }>
    connectedTables?: number[]
  }
  text?: string
}) {
  const tx = useTadazzShellText()
  const { gameId, players, locked } = useManagerStore()
  const { socket } = useSocket()
  const [list, setList] =
    useState<Array<Player & { timedOut?: boolean }>>(players)
  const join = useRoomJoin({
    inviteCode: rawInviteCode,
    managerLocked: isManager ? locked : undefined,
    directory: fullShowData,
  })

  // Same live roster events as the legacy Room screen (manager only).
  useEvent(EVENTS.MANAGER.NEW_PLAYER, (player) =>
    setList((l) => (l.some((p) => p.id === player.id) ? l : [...l, player])),
  )
  useEvent(EVENTS.MANAGER.REMOVE_PLAYER, (playerId) =>
    setList((l) => l.filter((p) => p.id !== playerId)),
  )
  useEvent(EVENTS.MANAGER.PLAYER_KICKED, (playerId) =>
    setList((l) => l.filter((p) => p.id !== playerId)),
  )
  useEvent(EVENTS.MANAGER.PLAYER_UPDATED, ({ previousId, player, timedOut }) =>
    setList((l) =>
      l.map((p) => (p.id === previousId ? { ...player, timedOut } : p)),
    ),
  )

  const kick = (playerId: string) => {
    if (!isManager || !gameId) {
      return
    }

    socket.emit(EVENTS.MANAGER.KICK_PLAYER, { gameId, playerId })
  }

  return (
    <NativeClassicLobbyPanel
      join={join}
      isManager={isManager}
      fullShowData={fullShowData}
      text={text}
      players={list}
      onKick={kick}
      tx={tx}
    />
  )
}

export function TadazzWaitScreen({
  text,
}: {
  text: string
  playerName?: string
}) {
  const { t } = useTranslation()

  return (
    <div className="tz-x-center" data-testid="tadazz-screen-wait">
      <img
        className="tz-x-logo"
        src={TADAZZ_LOGO_URL}
        alt="TADAZZ!"
        style={{ width: 520 }}
      />
      <div className="tz-x-sub">{text ? t(text) : ""}</div>
    </div>
  )
}

export function TadazzStartScreen({
  subject,
  time,
}: {
  subject: string
  time: number
}) {
  const [showTitle, setShowTitle] = useState(true)
  const [cooldown, setCooldown] = useState(time)
  const [sfxBoump] = useSound(SFX.BOUMP_SOUND, { volume: 0.2 })
  useEvent(EVENTS.GAME.START_COOLDOWN, () => {
    sfxBoump()
    setShowTitle(false)
  })
  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    sfxBoump()
    setCooldown(sec)
  })

  return (
    <div className="tz-x-center" data-testid="tadazz-screen-start">
      <div className="tz-x-headline">{subject}</div>
      {!showTitle && <div className="tz-x-big">{cooldown}</div>}
    </div>
  )
}

export function TadazzPreparedScreen({
  questionNumber,
  total,
}: {
  questionNumber: number
  total: number | null
}) {
  const tx = useTadazzShellText()

  return (
    <div className="tz-x-center" data-testid="tadazz-screen-prepared">
      <div className="tz-x-sub">{tx("getReady", "GET READY")}</div>
      <div className="tz-x-headline">
        {total
          ? tx("questionOfTotal", "QUESTION {{n}} / {{total}}", {
              n: String(questionNumber).padStart(2, "0"),
              total,
            })
          : tx("questionNumber", "QUESTION {{n}}", {
              n: String(questionNumber).padStart(2, "0"),
            })}
      </div>
    </div>
  )
}

export function TadazzSummaryScreen({
  subject,
  totalPlayers,
  totalQuestions,
}: {
  subject: string
  totalPlayers: number
  totalQuestions: number
}) {
  const { t } = useTranslation()

  return (
    <div className="tz-x-center" data-testid="tadazz-screen-summary">
      <div className="tz-x-sub">{t("game:summary.title")}</div>
      <div className="tz-x-headline">{subject}</div>
      <div style={{ display: "flex", gap: 24 }}>
        <div className="hover:bg-accent font-display bg-white text-black">
          {totalPlayers} · {t("game:summary.participants")}
        </div>
        <div className="hover:bg-accent font-display bg-white text-black">
          {totalQuestions} · {t("game:summary.questions")}
        </div>
      </div>
    </div>
  )
}

export { NativeClassicPlayerResult as TadazzPlayerResultScreen } from "@razzia/extensions/presentation"

export function TadazzPlayerFinishedScreen({
  rank,
  subject,
  points,
}: {
  rank?: number
  subject?: string
  points: number
}) {
  const { t } = useTranslation()
  const tx = useTadazzShellText()

  return (
    <div className="tz-x-center" data-testid="tadazz-screen-player-finished">
      <img
        className="tz-x-logo"
        src={TADAZZ_LOGO_URL}
        alt="TADAZZ!"
        style={{ width: 520 }}
      />
      {subject && <div className="tz-x-sub">{subject}</div>}
      <div className="tz-x-headline">
        {typeof rank === "number"
          ? t("game:rank", { count: rank, ordinal: true })
          : "—"}
      </div>
      <div className="hover:bg-accent font-display bg-white text-black">
        {tx("pointsShort", "{{points}} pts", { points })}
      </div>
    </div>
  )
}

export function TadazzInterludeScreen({
  interlude,
  startedAt,
}: {
  interlude: Interlude
  startedAt?: number
}) {
  if (interlude.kind === "countdown") {
    return (
      <TadazzCountdownScreen
        title={interlude.title}
        startedAt={startedAt}
        seconds={Math.round(interlude.durationMs / 1000)}
      />
    )
  }

  return <TadazzMessageScreen headline={interlude.title} />
}

export function TadazzEstimationResultScreen({
  question,
  estimation,
}: {
  question: string
  estimation?: {
    target: number
    closestGuess?: number
    median?: number
    guessesCount: number
  }
}) {
  const tx = useTadazzShellText()

  return (
    <div className="tz-x-center" data-testid="tadazz-screen-estimation">
      <div className="tz-x-sub">{question}</div>
      {estimation ? (
        <>
          <div className="tz-x-big">{estimation.target}</div>
          <div style={{ display: "flex", gap: 24 }}>
            {estimation.closestGuess !== undefined && (
              <div className="hover:bg-accent font-display bg-white text-black">
                {tx("closestGuess", "Closest: {{v}}", {
                  v: estimation.closestGuess,
                })}
              </div>
            )}
            {estimation.median !== undefined && (
              <div className="hover:bg-accent font-display bg-white text-black">
                {tx("median", "Median: {{v}}", { v: estimation.median })}
              </div>
            )}
            <div className="hover:bg-accent font-display bg-white text-black">
              {tx("guesses", "{{n}} guesses", { n: estimation.guessesCount })}
            </div>
          </div>
        </>
      ) : (
        <div className="tz-x-headline">
          {tx("noResponses", "No responses recorded yet.")}
        </div>
      )}
    </div>
  )
}
