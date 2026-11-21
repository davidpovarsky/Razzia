import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"
import { isNewerEnvelope } from "@razzia/web/features/game/contexts/extension-state-context"
import {
  socketClient,
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useSocketConnection } from "@razzia/web/features/game/hooks/useSocketConnection"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { createStatus } from "@razzia/web/features/game/utils/createStatus"
import {
  GAME_STATE_COMPONENTS_MANAGER,
  isKeyOf,
} from "@razzia/web/features/game/utils/constants"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useEffect } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { isManagedClientMode } from "@razzia/web/lib/managed-client-session"

const ManagerGamePage = () => {
  const navigate = useNavigate()
  const { gameId: gameIdParam } = useParams({ from: "/party/manager/$gameId" })
  const { socket, isConnected } = useSocket()
  const { gameId, status, updateManager, resetManager } = useManagerStore()
  const { setQuestionStates } = useQuestionStore()
  const { t } = useTranslation()
  const returnToLibrary = () => {
    resetManager()
    setQuestionStates(null)

    if (isManagedClientMode()) {
      // Stay inside the native router so onLeave sends the normal room exit.
      void navigate({ href: "/client" })
    } else {
      void navigate({ to: "/manager/config" })
    }
  }

  useSocketConnection()

  useEvent(EVENTS.GAME.STATUS, ({ name, data }) => {
    if (name in GAME_STATE_COMPONENTS_MANAGER) {
      updateManager({ status: createStatus(name, data) })
    }
  })

  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    const current = useManagerStore.getState().extensionState

    if (isNewerEnvelope(payload, current)) {
      updateManager({ extensionState: payload })
    }
  })

  useEffect(() => {
    if (isConnected && gameIdParam) {
      socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: gameIdParam })
    }
  }, [isConnected, gameIdParam, socket])

  useEvent(
    EVENTS.MANAGER.SUCCESS_RECONNECT,
    ({
      gameId: reconnectGameId,
      inviteCode,
      settings,
      locked,
      status: reconnectStatus,
      players,
      currentQuestion,
    }) => {
      updateManager({
        gameId: reconnectGameId,
        inviteCode,
        settings,
        locked,
        status: createStatus(reconnectStatus.name, reconnectStatus.data),
        players,
      })
      setQuestionStates(currentQuestion)
    },
  )

  useEvent(EVENTS.MANAGER.LOCK_UPDATED, (locked) => {
    updateManager({ locked })
  })

  useEvent(EVENTS.GAME.RESET, (message) => {
    returnToLibrary()
    toast.error(t(message))
  })

  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message) => {
    if (
      isManagedClientMode() &&
      ["errors:auth.unauthorized", "errors:game.notFound"].includes(message)
    ) {
      returnToLibrary()
    }
  })

  const handleSkip = () => {
    if (!status) {
      return
    }

    if (status.name === STATUS.FINISHED || status.name === STATUS.SUMMARY) {
      returnToLibrary()

      return
    }

    if (!gameId) {
      return
    }

    if (status.name === STATUS.SHOW_ROOM) {
      socket.emit(EVENTS.MANAGER.START_GAME, { gameId })

      return
    }

    socket.emit(EVENTS.MANAGER.ADVANCE, { gameId })
  }

  const CurrentComponent =
    status && isKeyOf(GAME_STATE_COMPONENTS_MANAGER, status.name)
      ? GAME_STATE_COMPONENTS_MANAGER[status.name]
      : null

  if (!status) {
    return null
  }

  return (
    <GameWrapper
      statusName={status.name}
      onNext={handleSkip}
      onBack={returnToLibrary}
      manager
    >
      {CurrentComponent && <CurrentComponent data={status.data as never} />}
    </GameWrapper>
  )
}

export const Route = createFileRoute("/party/manager/$gameId")({
  component: ManagerGamePage,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.MANAGER.LEAVE, { gameId })
  },
})
