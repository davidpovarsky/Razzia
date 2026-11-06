import { EVENTS } from "@razzia/common/constants"
import { STATUS, type Status } from "@razzia/common/types/game/status"
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

  const [, setJoined] = useState(false)
  const [status, setStatus] = useState<StatusState | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const syncedRef = useRef(false)

  useSocketConnection()

  useEffect(() => {
    if (!isConnected || !gameId) {
      syncedRef.current = false

      return
    }

    if (syncedRef.current) {
      return
    }
    syncedRef.current = true

    // Obtain temporary room-media authorization before joining the public display.
    // This uses the active room ID and never requires a manager account.
    let disposed = false
    void fetch(`/api/games/${encodeURIComponent(gameId)}/display-media`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Room no longer exists")
        }
        if (!disposed) {
          socket.emit(EVENTS.SPECTATOR.JOIN, { gameId })
        }
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

  useEvent(EVENTS.SPECTATOR.SUCCESS_JOIN, ({ inviteCode }) => {
    setJoined(true)
    setStatus(
      (prev) =>
        prev ?? {
          name: STATUS.SHOW_ROOM as Status,
          data: { text: "game:waitingForPlayers", inviteCode },
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
    // TADAZZ show: the concluded/unknown-room screen stays in the show brand
    // (canonical #viewport colour) instead of the legacy Razzia background.
    return (
      <main
        className="relative flex h-screen w-full items-center justify-center p-4"
        style={{ background: "#08011a" }}
        data-testid="audience-display-ended"
      >
        <div className="z-10 flex max-w-md flex-col items-center gap-4 rounded-[44px] border-2 border-[rgba(225,151,255,.72)] bg-[linear-gradient(150deg,rgba(63,13,119,.92),rgba(37,6,82,.93)_72%)] p-8 text-center text-[#fff8ec] shadow-2xl">
          <Tv className="size-16 text-[#d1b1ff]" />
          <h1 className="text-2xl font-black">
            {t(resetMessage, "Show Concluded")}
          </h1>
          <p className="text-sm text-[#d1b1ff]">{t("game:summary.title")}</p>
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
