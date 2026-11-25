import { Switch } from "@razzia/extensions/platform-ui"
import Tooltip from "@razzia/web/components/Tooltip"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { updateGameRosterSettings } from "@razzia/web/features/manager/roster-queries"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

type SaveStatus = "idle" | "pending" | "saved" | "error"

/** Live owner control. The roster response, not optimistic local state, is authoritative. */
export default function HostGuestJoinToggle() {
  const { gameId, hostPresence } = useManagerStore()
  const { isConnected } = useSocket()
  const { t } = useTranslation()
  const descriptionId = useId()
  const pendingRef = useRef(false)
  const requestVersion = useRef(0)
  const [feedback, setFeedback] = useState<{
    gameId: string | null
    status: SaveStatus
  }>({ gameId, status: "idle" })
  const status = feedback.gameId === gameId ? feedback.status : "idle"
  const setStatus = (value: SaveStatus) =>
    setFeedback({ gameId, status: value })

  useEffect(() => {
    requestVersion.current += 1
    pendingRef.current = false

    return () => {
      requestVersion.current += 1
    }
  }, [gameId])

  const presence = hostPresence?.gameId === gameId ? hostPresence : null
  const ready = presence?.allowUnregisteredPlayers !== undefined
  const allowed = presence?.allowUnregisteredPlayers ?? false
  const description = [
    t("extensions:roster.allowUnregisteredPlayersDescription"),
    allowed && presence?.phoneInviteOnly
      ? t("extensions:roster.allowUnregisteredPlayersPhoneRestricted")
      : "",
  ]
    .filter(Boolean)
    .join(" ")

  const save = async (allowUnregisteredPlayers: boolean) => {
    if (!gameId || !isConnected || !ready || pendingRef.current) {
      return
    }

    const requestedGameId = gameId
    const version = requestVersion.current
    pendingRef.current = true
    setStatus("pending")

    try {
      const { presence: saved } = await updateGameRosterSettings({
        gameId: requestedGameId,
        allowUnregisteredPlayers,
      })
      const current = useManagerStore.getState()

      if (
        requestVersion.current !== version ||
        current.gameId !== requestedGameId ||
        saved.gameId !== requestedGameId
      ) {
        return
      }

      if (!current.hostPresence || saved.seq >= current.hostPresence.seq) {
        current.updateManager({ hostPresence: saved })
      }

      setStatus("saved")
    } catch {
      if (
        requestVersion.current === version &&
        useManagerStore.getState().gameId === requestedGameId
      ) {
        setStatus("error")
      }
    } finally {
      if (requestVersion.current === version) {
        pendingRef.current = false
      }
    }
  }

  return (
    <section
      className="max-w-full min-w-0 rounded-lg bg-black/40 px-2.5 py-1.5 text-sm text-white [&_.tds-switch-row]:min-w-0 [&_.tds-switch-row]:text-sm"
      aria-busy={status === "pending"}
      data-testid="host-guest-join-control"
    >
      <Tooltip content={description}>
        <div className="min-w-0">
          <Switch
            label={t("extensions:roster.allowUnregisteredPlayers")}
            checked={allowed}
            disabled={!ready || !gameId || !isConnected || status === "pending"}
            onCheckedChange={(next) => void save(next)}
            aria-describedby={descriptionId}
            className="shrink-0"
            data-testid="host-guest-join-toggle"
          />
        </div>
      </Tooltip>
      <p id={descriptionId} className="sr-only">
        {description}
      </p>
      {(status === "pending" || status === "saved") && (
        <span role="status" className="sr-only">
          {t(
            status === "pending"
              ? "extensions:roster.saving"
              : "extensions:roster.saved",
          )}
        </span>
      )}
      {status === "error" && (
        <span role="alert" className="block max-w-xs text-sm">
          {t("errors:route.description")}
        </span>
      )}
    </section>
  )
}
