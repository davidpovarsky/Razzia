import { EVENTS } from "@razzia/common/constants"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import GameBackground from "@razzia/web/components/GameBackground"
import Loader from "@razzia/web/components/Loader"
import PlayerGameView from "@razzia/web/features/game/components/PlayerGameView"
import {
  socketClient,
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useSocketConnection } from "@razzia/web/features/game/hooks/useSocketConnection"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { Tv } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface StatusState {
  name: Status
  data: Record<string, unknown>
}

const AudienceDisplayPage = () => {
  const { gameId } = useParams({ from: "/display/$gameId" })
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation()

  const [joined, setJoined] = useState(false)
  const [status, setStatus] = useState<StatusState | null>(null)
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

    // Obtain temporary room-media authorization before joining the public display.
    // This uses the active room ID and never requires a manager account.
    let disposed = false
    void fetch(`/api/games/${encodeURIComponent(gameId)}/display-media`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Room no longer exists")
        if (!disposed) socket.emit(EVENTS.SPECTATOR.JOIN, { gameId })
      })
      .catch(() => {
        if (!disposed) {
          syncedRef.current = false
          setResetMessage("errors:game.notFound")
        }
      })
    return () => {
      disposed = true
    }
  }, [isConnected, gameId, socket])

  useEvent(EVENTS.SPECTATOR.SUCCESS_JOIN, () => {
    setJoined(true)
    setStatus(
      (prev) =>
        prev ?? {
          name: STATUS.WAIT as Status,
          data: { text: "game:waitingForPlayers" },
        },
    )
  })

  useEvent(
    EVENTS.GAME.STATUS,
    ({ name, data }: { name: Status; data: Record<string, unknown> }) => {
      setStatus({ name, data })
    },
  )

  useEvent(EVENTS.GAME.RESET, (message: string) => {
    setResetMessage(message || "errors:game.notFound")
  })

  if (resetMessage) {
    return (
      <main className="relative flex h-screen w-full items-center justify-center p-4">
        <GameBackground />
        <div className="z-10 flex max-w-md flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/70 p-8 text-center text-white shadow-2xl backdrop-blur-md">
          <Tv className="size-16 text-white/50" />
          <h1 className="text-2xl font-black">
            {t(resetMessage, "Show Concluded")}
          </h1>
          <p className="text-sm text-white/70">{t("game:summary.title")}</p>
        </div>
      </main>
    )
  }

  return (
    <main
      className="relative flex min-h-dvh w-full flex-col overflow-x-hidden text-white"
      data-testid="audience-display"
      data-role="spectator"
    >
      <PlayerGameView status={status} viewRole="spectator" />
    </main>
  )
}

export const Route = createFileRoute("/display/$gameId")({
  component: AudienceDisplayPage,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.SPECTATOR.LEAVE, { gameId })
  },
})
