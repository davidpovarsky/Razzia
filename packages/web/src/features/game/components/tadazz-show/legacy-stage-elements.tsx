import NativeButton from "@razzia/web/components/Button"
import { NativeAudioCuePlayer as AudioCuePlayer } from "./NativeAudioCuePlayer"
import type { Player } from "@razzia/common/types/game"
import type { Status } from "@razzia/common/types/game/status"
import type {
  CardAudioOverrides,
  CueId,
  ExtensionStateEnvelope,
  HostPresenceSnapshot,
  QuizExtrasV1,
  TeamDefinition,
} from "@razzia/extensions/core"
import { TadazzAnimatedBackdrop } from "@razzia/extensions/presentation"
import Tooltip from "@razzia/web/components/Tooltip"
import type { ViewRole } from "@razzia/web/features/game/contexts/view-role-context"
import clsx from "clsx"
import { PhoneCall, Users } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { useLegacyPresentation } from "./use-legacy-presentation"

type Legacy = ReturnType<typeof useLegacyPresentation>

export function LegacyStageBackdrops({
  contained = false,
  showBase = true,
  tadazzBackdrop,
  setTadazzImageUnavailable,
  showCustomCardBackground,
  effectiveBackground,
  setCardBgErrorUrl,
}: Pick<
  Legacy,
  | "tadazzBackdrop"
  | "setTadazzImageUnavailable"
  | "showCustomCardBackground"
  | "effectiveBackground"
  | "setCardBgErrorUrl"
> & { contained?: boolean; showBase?: boolean }) {
  return (
    <>
      {" "}
      {showBase &&
        (tadazzBackdrop.source === "tadazz" ||
          tadazzBackdrop.source === "static") && (
          <div
            className={clsx(
              "pointer-events-none inset-0 z-[1] overflow-hidden",
              contained ? "absolute" : "fixed",
            )}
          >
            <TadazzAnimatedBackdrop
              state={tadazzBackdrop}
              onImageFailure={() => setTadazzImageUnavailable(true)}
            />
          </div>
        )}
      {showCustomCardBackground && effectiveBackground.url && (
        <div
          data-testid="stage-card-background"
          data-bg-url={effectiveBackground.url}
          data-bg-fit={effectiveBackground.fit}
          data-bg-position={effectiveBackground.position}
          className={clsx(
            "pointer-events-none inset-0 z-[1] overflow-hidden",
            contained ? "absolute" : "fixed",
          )}
        >
          <img
            src={effectiveBackground.url}
            alt=""
            onError={() => setCardBgErrorUrl(effectiveBackground.url ?? null)}
            className={clsx(
              "pointer-events-none h-full w-full select-none",
              effectiveBackground.fit === "contain"
                ? "object-contain"
                : "object-cover",
              effectiveBackground.position === "top" && "object-top",
              effectiveBackground.position === "bottom" && "object-bottom",
              effectiveBackground.position === "left" && "object-left",
              effectiveBackground.position === "right" && "object-right",
              effectiveBackground.position === "center" && "object-center",
            )}
          />
          {effectiveBackground.overlayOpacity > 0 && (
            <div
              data-testid="stage-card-background-overlay"
              className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: effectiveBackground.overlayOpacity }}
            />
          )}
        </div>
      )}
    </>
  )
}

export function LegacyStageAudio({
  extensionState,
  effectiveRole,
  manager,
  roomMediaReady,
  activePhaseCueId,
  currentSceneObj,
  activeCardKey,
  statusName,
  isHostPresenting,
  hasCompetingMediaAudio,
}: Pick<
  Legacy,
  | "activePhaseCueId"
  | "currentSceneObj"
  | "activeCardKey"
  | "hasCompetingMediaAudio"
> & {
  extensionState: ExtensionStateEnvelope | null
  effectiveRole: ViewRole
  manager?: boolean
  roomMediaReady: boolean
  statusName: Status | undefined
  isHostPresenting: boolean
}) {
  const { t } = useTranslation()

  return (
    <>
      {" "}
      {extensionState &&
        effectiveRole !== "player" &&
        (!manager || roomMediaReady) && (
          <AudioCuePlayer
            cueId={activePhaseCueId}
            audioExtras={
              extensionState.extras.audio as QuizExtrasV1["audio"] | undefined
            }
            cardAudioCues={
              extensionState.extras.cardAudioCues as
                CardAudioOverrides | undefined
            }
            sceneAudio={
              (extensionState.extras.sceneAudio as
                | {
                    mode?: "inherit" | "mute" | "custom"
                    cueId?: CueId
                    url?: string
                    volume?: number
                    loop?: boolean
                  }
                | undefined) ?? currentSceneObj?.audio
            }
            gameId={extensionState.gameId}
            activeCardKey={activeCardKey}
            phase={
              extensionState.phase === "scene"
                ? "scene"
                : (statusName ?? extensionState.phase)
            }
            epoch={extensionState.epoch}
            paused={extensionState.pause?.paused}
            showControls={Boolean(manager && !isHostPresenting)}
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
              leaderboard: t("extensions:audio.slotLeaderboard", "Leaderboard"),
              recap: t("extensions:audio.slotRecap", "Recap"),
              finale: t("extensions:audio.slotFinale", "Finale"),
            }}
            hasCompetingMedia={hasCompetingMediaAudio}
          />
        )}
    </>
  )
}

export function HostPresenceButton({
  hostPresence,
  players,
  totalPlayers,
  isConnected,
  onClick,
}: {
  hostPresence: HostPresenceSnapshot | null
  players: Player[]
  totalPlayers: number | null
  isConnected: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()

  return (
    <Tooltip
      content={t(
        "extensions:roster.liveModalTitle",
        "Players & Live Connection Status",
      )}
    >
      <NativeButton size="sm"
        type="button"
        onClick={onClick}
        data-testid="host-bottom-players-btn"
        className={clsx(
          "ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-black/40 px-2.5 py-1 text-sm font-bold text-white drop-shadow-md transition-colors hover:bg-black/60 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-base md:text-xl",
          !isConnected && "opacity-60",
        )}
      >
        <Users className="size-5" />
        <span data-testid="host-connected-counter">
          {(() => {
            const connectedCount =
              hostPresence?.connectedNow ??
              players.filter((p) => p.connected).length
            const registeredCount =
              hostPresence?.registeredTotal ?? totalPlayers ?? players.length

            if (
              (registeredCount > 0 && registeredCount !== connectedCount) ||
              hostPresence
            ) {
              return `${connectedCount} / ${registeredCount}`
            }

            return String(totalPlayers ?? players.length)
          })()}
        </span>
        <span className="ml-1 hidden items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-xs font-semibold sm:inline-flex">
          <PhoneCall className="size-3" />
          {t("extensions:roster.playersButton", "Players")}
        </span>
      </NativeButton>
    </Tooltip>
  )
}

export function PlayerTeamBadge({
  extensionState,
  clientId,
  player,
}: {
  extensionState: ExtensionStateEnvelope | null
  clientId: string | null
  player: { username?: string; points?: number } | null
}) {
  const teamsData = extensionState?.extras.teams as
    | {
        teams?: TeamDefinition[]
        assignments?: Record<string, string>
      }
    | undefined
  const assignedTeamId =
    (clientId ? teamsData?.assignments?.[clientId] : undefined) ??
    teamsData?.assignments?.[
      (player as { id?: string } | null)?.id ?? player?.username ?? ""
    ]
  const assignedTeam = teamsData?.teams?.find(
    (team) => team.id === assignedTeamId,
  )

  if (!assignedTeam) {
    return null
  }

  return (
    <span
      className="rounded-md px-2 py-0.5 text-xs font-bold text-white shadow-sm"
      style={{ backgroundColor: assignedTeam.color }}
    >
      {assignedTeam.name}
    </span>
  )
}
