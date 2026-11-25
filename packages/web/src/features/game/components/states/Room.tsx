import { LobbyTeamAssignmentAdapter } from "../tadazz-show/team-adapters"
import { useRoomJoin } from "@razzia/extensions/presentation/room-join"
import { NativeRazziaRoomPanel } from "@razzia/extensions/presentation"
import { useExtensionState } from "@razzia/web/features/game/contexts/extension-state-context"
import { EVENTS } from "@razzia/common/constants"
import type { Player } from "@razzia/common/types/game"
import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import PlayerConnectionStatus from "@razzia/web/features/game/components/PlayerConnectionStatus"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useState } from "react"

interface Props {
  readOnly?: boolean
  data: ManagerStatusDataMap["SHOW_ROOM"]
}

const Room = ({ data: { text, inviteCode }, readOnly = false }: Props) => {
  const { gameId, players, locked: storeLocked } = useManagerStore()
  const { socket } = useSocket()
  const presence = useManagerStore((state) => state.hostPresence)
  const join = useRoomJoin({
    inviteCode,
    managerLocked: readOnly ? undefined : storeLocked,
    envelope: useExtensionState(),
    connectedCount: readOnly ? undefined : presence?.connectedNow,
    rosterCount: readOnly ? undefined : presence?.registeredTotal,
  })
  const { locked } = join
  const [playerList, setPlayerList] =
    useState<Array<Player & { timedOut?: boolean }>>(players)

  useEvent(EVENTS.MANAGER.NEW_PLAYER, (player) => {
    setPlayerList([...playerList, player])
  })

  useEvent(EVENTS.MANAGER.REMOVE_PLAYER, (playerId) => {
    setPlayerList(playerList.filter((p) => p.id !== playerId))
  })

  useEvent(EVENTS.MANAGER.PLAYER_KICKED, (playerId) => {
    setPlayerList(playerList.filter((p) => p.id !== playerId))
  })

  useEvent(
    EVENTS.MANAGER.PLAYER_UPDATED,
    ({ previousId, player, timedOut }) => {
      setPlayerList((list) =>
        list.map((p) => (p.id === previousId ? { ...player, timedOut } : p)),
      )
    },
  )

  const handleKick = (playerId: string) => () => {
    if (!gameId || readOnly) {
      return
    }

    socket.emit(EVENTS.MANAGER.KICK_PLAYER, {
      gameId,
      playerId,
    })
  }

  return (
    <NativeRazziaRoomPanel join={join} inviteCode={inviteCode} text={text}>
      {!readOnly && (
        <>
          <LobbyTeamAssignmentAdapter
            players={playerList}
            gameId={gameId}
            locked={locked}
          />

          <div className="flex flex-wrap gap-3">
            {playerList.map((player) => (
              <div
                key={player.id}
                className="bg-primary has-[[data-lost]]:bg-primary/50 relative rounded-xl px-4 py-3 font-bold text-white has-[[data-lost]]:text-white/60"
                onClick={handleKick(player.id)}
              >
                <span className="cursor-pointer text-3xl drop-shadow-sm hover:line-through hover:decoration-3">
                  {player.username}
                </span>
                {!player.connected && (
                  <PlayerConnectionStatus
                    key={String(player.timedOut)}
                    timedOut={player.timedOut}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </NativeRazziaRoomPanel>
  )
}

export default Room
