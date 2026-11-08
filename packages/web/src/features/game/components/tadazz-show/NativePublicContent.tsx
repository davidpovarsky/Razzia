import type { PropsWithChildren } from "react"
import { STATUS } from "@razzia/common/types/game/status"
import {
  RAZZIA_THEME_ID,
  type ResolvedShowTheme,
} from "@razzia/extensions/core"
import Room from "../states/Room"
import { useTadazzRawStatus } from "./raw-status-context"
import type { ViewRole } from "../../contexts/view-role-context"

/** Reuse the real upstream invitation/QR composition, with management disabled. */
export function NativePublicContent({
  children,
  role,
  theme,
}: PropsWithChildren<{ role: ViewRole; theme: ResolvedShowTheme }>) {
  const status = useTadazzRawStatus()
  if (
    role === "spectator" &&
    theme.definition.id === RAZZIA_THEME_ID &&
    status?.name === STATUS.SHOW_ROOM
  ) {
    const inviteCode =
      typeof status.data.inviteCode === "string"
        ? status.data.inviteCode
        : undefined
    return (
      <Room
        readOnly
        data={{
          text:
            typeof status.data.text === "string"
              ? status.data.text
              : "game:waitingForPlayers",
          inviteCode,
        }}
      />
    )
  }
  return children
}
