import type { Status } from "@razzia/common/types/game/status"
import { createContext, useContext } from "react"

export interface RawShowStatus {
  name: Status
  data: Record<string, unknown>
}

/**
 * Carries the untouched authoritative status (e.g. SHOW_ROOM with inviteCode
 * for the projector) to the TADAZZ show stage. Player/spectator pages provide
 * it from `PlayerGameView`; the manager stage reads its own store.
 */
export const TadazzRawStatusContext = createContext<RawShowStatus | null>(null)

export const useTadazzRawStatus = () => useContext(TadazzRawStatusContext)
