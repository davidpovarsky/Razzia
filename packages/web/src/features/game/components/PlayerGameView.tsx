import { STATUS, type Status } from "@razzia/common/types/game/status"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"
import Wait from "@razzia/web/features/game/components/states/Wait"
import { TadazzRawStatusContext } from "@razzia/web/features/game/components/tadazz-show/raw-status-context"
import type { ViewRole } from "@razzia/web/features/game/contexts/view-role-context"
import {
  GAME_STATE_COMPONENTS,
  isKeyOf,
} from "@razzia/web/features/game/utils/constants"

export interface PlayerGameViewProps {
  status: { name: Status; data: Record<string, unknown> } | null
  viewRole?: ViewRole
}

export const PlayerGameView = ({
  status,
  viewRole = "player",
}: PlayerGameViewProps) => {
  const currentStatus = status ?? {
    name: STATUS.WAIT,
    data: { text: "game:waitingForPlayers" },
  }

  // Authoritative registry:
  // If status is SHOW_ROOM (lobby), player/spectator screen renders Wait ("waiting for players")
  const isRoomStatus = currentStatus.name === STATUS.SHOW_ROOM
  const effectiveStatusName = isRoomStatus ? STATUS.WAIT : currentStatus.name
  const statusData = isRoomStatus
    ? { text: "game:waitingForPlayers" }
    : currentStatus.data

  const CurrentComponent = isKeyOf(GAME_STATE_COMPONENTS, effectiveStatusName)
    ? GAME_STATE_COMPONENTS[effectiveStatusName]
    : null

  return (
    <TadazzRawStatusContext.Provider value={status}>
      <GameWrapper statusName={effectiveStatusName} viewRole={viewRole}>
        {CurrentComponent && <CurrentComponent data={statusData as never} />}
      </GameWrapper>
    </TadazzRawStatusContext.Provider>
  )
}

export default PlayerGameView
