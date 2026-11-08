import type { Player } from "@razzia/common/types/game"
import {
  EXTENSION_EVENTS,
  type ExtensionStateEnvelope,
  type TeamDefinition,
} from "@razzia/extensions/core"
import {
  TeamLeaderboardPanel,
  LobbyTeamAssignment,
} from "@razzia/extensions/presentation"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

function useLiveTeamEnvelope() {
  const { extensionState: storeExtensionState } = useManagerStore()
  const [extensionState, setExtensionState] =
    useState<ExtensionStateEnvelope | null>(storeExtensionState)

  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    setExtensionState(payload)
  })

  return extensionState
}

export function TeamLeaderboardAdapter({
  players,
  children,
}: {
  players: Player[]
  children: ReactNode
}) {
  const extensionState = useLiveTeamEnvelope()
  const { t } = useTranslation()
  const teamsData = extensionState?.extras.teams as
    | {
        enabled?: boolean
        teams?: TeamDefinition[]
        assignments?: Record<string, string>
      }
    | undefined

  return (
    <>
      {" "}
      {teamsData?.enabled && teamsData.teams && teamsData.teams.length >= 2 ? (
        <TeamLeaderboardPanel
          teams={teamsData.teams}
          players={players}
          teamAssignments={teamsData.assignments ?? {}}
          individualView={children}
          t={(key, opts, fb) =>
            t(
              key,
              typeof opts === "object" ? opts : { defaultValue: fb ?? opts },
            )
          }
        />
      ) : (
        children
      )}
    </>
  )
}

export function LobbyTeamAssignmentAdapter({
  players,
  gameId,
  locked,
}: {
  players: Player[]
  gameId: string | null
  locked: boolean
}) {
  const extensionState = useLiveTeamEnvelope()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const teamsData = extensionState?.extras.teams as
    | {
        enabled?: boolean
        teams?: TeamDefinition[]
        assignments?: Record<string, string>
      }
    | undefined

  const handleReassignTeam = ({
    playerId,
    teamId,
  }: {
    playerId: string
    teamId: string
  }) => {
    if (!gameId) {
      return
    }

    const player = players.find((p) => p.id === playerId)
    const clientId = player?.clientId ?? playerId

    socket.emit(EXTENSION_EVENTS.COMMAND, {
      v: 1,
      gameId,
      action: "ASSIGN_TEAM",
      payload: {
        clientId,
        teamId,
      },
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    })
  }

  return (
    <>
      {" "}
      {(teamsData?.enabled ?? Boolean(teamsData?.teams)) &&
        teamsData?.teams && (
          <LobbyTeamAssignment
            teams={teamsData.teams}
            players={players}
            teamAssignments={teamsData.assignments ?? {}}
            isManager={true}
            isLocked={locked}
            onReassignTeam={handleReassignTeam}
            t={(key, opts, fb) =>
              t(
                key,
                typeof opts === "object" ? opts : { defaultValue: fb ?? opts },
              )
            }
          />
        )}
    </>
  )
}
