import { EVENTS } from "@razzia/common/constants"
import type { Player } from "@razzia/common/types/game"
import type { ActiveSceneData, Interlude } from "@razzia/extensions/core"
import type { SceneDescriptor } from "@razzia/extensions/presentation"
import { TADAZZ_LOGO_URL } from "@razzia/extensions/presentation"
import { useEvent, useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { Lock, X } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { AlertDialog } from "radix-ui"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"
import { useTadazzShellText } from "./useTadazzLabels"

/* All screens render inside the canonical `.tz-screen` slot of the 1920×1080
 * stage and only use canonical tokens (see tadazz-show-adaptations.css). */

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
  inviteCode,
  isManager,
  text,
}: {
  inviteCode?: string
  isManager: boolean
  text?: string
}) {
  const { t } = useTranslation()
  const tx = useTadazzShellText()
  const { gameId, players, locked } = useManagerStore()
  const { socket } = useSocket()
  const [list, setList] = useState<Array<Player & { timedOut?: boolean }>>(players)
  const [qrOpen, setQrOpen] = useState(false)
  const webUrl = typeof window !== "undefined" ? window.location.origin : ""
  const host = typeof window !== "undefined" ? window.location.host : ""

  // Same live roster events as the legacy Room screen (manager only).
  useEvent(EVENTS.MANAGER.NEW_PLAYER, (player) => setList((l) => (l.some((p) => p.id === player.id) ? l : [...l, player])))
  useEvent(EVENTS.MANAGER.REMOVE_PLAYER, (playerId) => setList((l) => l.filter((p) => p.id !== playerId)))
  useEvent(EVENTS.MANAGER.PLAYER_KICKED, (playerId) => setList((l) => l.filter((p) => p.id !== playerId)))
  useEvent(EVENTS.MANAGER.PLAYER_UPDATED, ({ previousId, player, timedOut }) =>
    setList((l) => l.map((p) => (p.id === previousId ? { ...player, timedOut } : p))),
  )

  const kick = (playerId: string) => {
    if (!isManager || !gameId) return
    socket.emit(EVENTS.MANAGER.KICK_PLAYER, { gameId, playerId })
  }

  const isLocked = isManager ? locked : false

  return (
    <div className="tz-x-fill" data-testid="tadazz-screen-lobby">
      <div className="tz-x-eyebrow">{tx("lobbyEyebrow", "JOIN THE SHOW")}</div>
      <div className="tz-x-title">
        TADA<span>ZZ!</span>
      </div>
      <div className="tz-x-underline" />
      <div className="tz-lobby-join tz-x-panel">
        <div>
          <div className="tz-lobby-label">{t("game:joinInstruction")}</div>
          <div className="tz-lobby-url" data-testid="tadazz-lobby-url">{host || webUrl}</div>
        </div>
        <div className="tz-lobby-divider" />
        <div>
          <div className="tz-lobby-label">{t("game:gamePinLabel")}</div>
          <div className="tz-lobby-pin" data-testid="tadazz-lobby-pin">
            {inviteCode ? (isLocked ? inviteCode.replace(/./g, "#") : inviteCode) : "—"}
          </div>
        </div>
        {isLocked || !inviteCode ? (
          <div className="tz-lobby-qr tz-lobby-lock" aria-hidden="true" style={{ background: "transparent", border: 0, boxShadow: "none" }}>
            {isLocked ? <Lock className="size-28" /> : null}
          </div>
        ) : (
          <AlertDialog.Root open={qrOpen} onOpenChange={setQrOpen}>
            <AlertDialog.Trigger
              aria-label={t("game:showQrCode")}
              className="tz-lobby-qr cursor-pointer"
              data-testid="tadazz-lobby-qr"
            >
              <QRCodeSVG value={`${webUrl}?pin=${inviteCode}`} />
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70" onClick={() => setQrOpen(false)} />
              <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6">
                <button
                  type="button"
                  onClick={() => setQrOpen(false)}
                  aria-label={t("common:close")}
                  className="hover:bg-muted absolute -top-3 -right-3 rounded-full bg-white p-1.5 shadow-md"
                >
                  <X className="text-foreground size-6" />
                </button>
                <QRCodeSVG className="size-56 md:size-70 lg:size-95" value={`${webUrl}?pin=${inviteCode}`} />
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        )}
      </div>
      {isManager && (
        <>
          <div className="tz-lobby-count" data-testid="tadazz-lobby-count">
            <span>{t(text || "game:waitingForPlayers")}</span> <span>· {list.length}</span>
          </div>
          <div className="tz-lobby-players">
            {list.map((player) => (
              <button
                type="button"
                key={player.id}
                className={`tz-x-pill${player.connected === false ? " is-lost" : ""}`}
                title={tx("kickPlayer", "Remove player")}
                onClick={() => kick(player.id)}
              >
                {player.username}
              </button>
            ))}
          </div>
        </>
      )}
      {!isManager && <div className="tz-lobby-count">{t(text || "game:waitingForPlayers")}</div>}
    </div>
  )
}

export function TadazzMessageScreen({ eyebrow, headline, sub }: { eyebrow?: string; headline?: string; sub?: string }) {
  return (
    <div className="tz-x-center" data-testid="tadazz-screen-message">
      {eyebrow && <div className="tz-x-sub">{eyebrow}</div>}
      {headline && <div className="tz-x-headline">{headline}</div>}
      {sub && <div className="tz-x-sub" style={{ letterSpacing: ".14em", fontSize: 28 }}>{sub}</div>}
    </div>
  )
}

export function TadazzWaitScreen({ text }: { text: string; playerName?: string }) {
  const { t } = useTranslation()
  return (
    <div className="tz-x-center" data-testid="tadazz-screen-wait">
      <img className="tz-x-logo" src={TADAZZ_LOGO_URL} alt="TADAZZ!" style={{ width: 520 }} />
      <div className="tz-x-sub">{text ? t(text) : ""}</div>
    </div>
  )
}

export function TadazzStartScreen({ subject, time }: { subject: string; time: number }) {
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

export function TadazzPreparedScreen({ questionNumber, total }: { questionNumber: number; total: number | null }) {
  const tx = useTadazzShellText()
  return (
    <div className="tz-x-center" data-testid="tadazz-screen-prepared">
      <div className="tz-x-sub">{tx("getReady", "GET READY")}</div>
      <div className="tz-x-headline">
        {total
          ? tx("questionOfTotal", "QUESTION {{n}} / {{total}}", { n: String(questionNumber).padStart(2, "0"), total })
          : tx("questionNumber", "QUESTION {{n}}", { n: String(questionNumber).padStart(2, "0") })}
      </div>
    </div>
  )
}

export function TadazzSummaryScreen({ subject, totalPlayers, totalQuestions }: { subject: string; totalPlayers: number; totalQuestions: number }) {
  const { t } = useTranslation()
  return (
    <div className="tz-x-center" data-testid="tadazz-screen-summary">
      <div className="tz-x-sub">{t("game:summary.title")}</div>
      <div className="tz-x-headline">{subject}</div>
      <div style={{ display: "flex", gap: 24 }}>
        <div className="tz-x-pill">
          {totalPlayers} · {t("game:summary.participants")}
        </div>
        <div className="tz-x-pill">
          {totalQuestions} · {t("game:summary.questions")}
        </div>
      </div>
    </div>
  )
}

export function TadazzPlayerResultScreen({
  correct,
  message,
  points,
  rank,
  aheadOfMe,
  survey,
}: {
  correct: boolean
  message: string
  points: number
  rank: number
  aheadOfMe: string | null
  survey: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="tz-x-center" data-testid="tadazz-screen-player-result">
      {!survey && <div className={`tz-result-badge${correct ? "" : " is-wrong"}`}>{correct ? "✓" : "✕"}</div>}
      <div className="tz-x-headline">{t(message)}</div>
      {!survey && (
        <div className="tz-x-sub" style={{ letterSpacing: ".12em" }}>
          {t("game:resultTop")}
          {t("game:rank", { count: rank, ordinal: true })}
          {aheadOfMe ? `${t("game:resultBehind")}${aheadOfMe}` : ""}
        </div>
      )}
      {!survey && correct && <div className="tz-x-big" style={{ fontSize: 120 }}>+{points}</div>}
    </div>
  )
}

export function TadazzPlayerFinishedScreen({ rank, subject, points }: { rank?: number; subject?: string; points: number }) {
  const { t } = useTranslation()
  const tx = useTadazzShellText()
  return (
    <div className="tz-x-center" data-testid="tadazz-screen-player-finished">
      <img className="tz-x-logo" src={TADAZZ_LOGO_URL} alt="TADAZZ!" style={{ width: 520 }} />
      {subject && <div className="tz-x-sub">{subject}</div>}
      <div className="tz-x-headline">{typeof rank === "number" ? t("game:rank", { count: rank, ordinal: true }) : "—"}</div>
      <div className="tz-x-pill">{tx("pointsShort", "{{points}} pts", { points })}</div>
    </div>
  )
}

/** Countdown driven by the authoritative server start time. */
export function TadazzCountdownScreen({ title, startedAt, seconds }: { title?: string; startedAt?: number; seconds: number }) {
  const compute = () => Math.max(0, Math.ceil(seconds - (Date.now() - (startedAt ?? Date.now())) / 1000))
  const [left, setLeft] = useState(compute)
  useEffect(() => {
    const id = setInterval(() => setLeft(compute()), 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, seconds])
  return (
    <div className="tz-x-center" data-testid="tadazz-screen-countdown">
      {title && <div className="tz-x-sub">{title}</div>}
      <div className="tz-x-big">{left}</div>
    </div>
  )
}

export function TadazzRecapScreen({ title, recap }: { title?: string; recap: NonNullable<ActiveSceneData["answerRecap"]> }) {
  const tx = useTadazzShellText()
  const items = recap.items.slice(0, Math.max(1, Math.min(6, recap.maxItemsPerPage || 4)))
  return (
    <div className="tz-x-fill" data-testid="tadazz-screen-recap">
      <div className="tz-x-eyebrow">{tx("recapEyebrow", "THE AUDIENCE HAS SPOKEN")}</div>
      <div className="tz-x-title" style={{ fontSize: 72 }}>{title || tx("recapTitle", "ANSWER RECAP")}</div>
      <div className="tz-x-underline" />
      <div className="tz-recap-rows">
        {items.length === 0 && <div className="tz-x-sub" style={{ textAlign: "center" }}>{tx("noResponses", "No responses recorded yet.")}</div>}
        {items.map((item) => {
          const option = (recap.mode === "correctAnswer" ? item.correctOptions?.[0] : undefined) ?? item.winningOptions[0]
          return (
            <div key={item.questionId} className="tz-leader-row tz-recap-row">
              <div className="tz-rank">{item.questionNumber}</div>
              <div className="tz-team-name">
                <div style={{ fontSize: 22, color: "#d1b1ff", fontWeight: 800 }}>{item.questionText}</div>
                <div>{option ? option.label : tx("noResponses", "No responses recorded yet.")}</div>
              </div>
              {option?.imageUrl && <img src={option.imageUrl} alt={option.alt || option.label} />}
              {option && recap.showPercentages && <div className="tz-team-score">{Math.round(option.percentage)}%</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TadazzSceneTitleScreen({ scene }: { scene: SceneDescriptor }) {
  return <TadazzMessageScreen headline={scene.title} sub={scene.subtitle ?? scene.description} />
}

export function TadazzInterludeScreen({ interlude, startedAt }: { interlude: Interlude; startedAt?: number }) {
  if (interlude.kind === "countdown") {
    return <TadazzCountdownScreen title={interlude.title} startedAt={startedAt} seconds={Math.round(interlude.durationMs / 1000)} />
  }
  return <TadazzMessageScreen headline={interlude.title} />
}

export function TadazzEstimationResultScreen({
  question,
  estimation,
}: {
  question: string
  estimation?: { target: number; closestGuess?: number; median?: number; guessesCount: number }
}) {
  const tx = useTadazzShellText()
  return (
    <div className="tz-x-center" data-testid="tadazz-screen-estimation">
      <div className="tz-x-sub">{question}</div>
      {estimation ? (
        <>
          <div className="tz-x-big">{estimation.target}</div>
          <div style={{ display: "flex", gap: 24 }}>
            {estimation.closestGuess !== undefined && <div className="tz-x-pill">{tx("closestGuess", "Closest: {{v}}", { v: estimation.closestGuess })}</div>}
            {estimation.median !== undefined && <div className="tz-x-pill">{tx("median", "Median: {{v}}", { v: estimation.median })}</div>}
            <div className="tz-x-pill">{tx("guesses", "{{n}} guesses", { n: estimation.guessesCount })}</div>
          </div>
        </>
      ) : (
        <div className="tz-x-headline">{tx("noResponses", "No responses recorded yet.")}</div>
      )}
    </div>
  )
}
