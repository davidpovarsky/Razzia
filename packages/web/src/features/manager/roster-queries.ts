import type { RosterParticipant } from "@razzia/extensions/core"
import { api, unwrap } from "@razzia/web/lib/api"

export const fetchGameRoster = (gameId: string) =>
  unwrap(api.games[":gameId"].roster.$get({ param: { gameId } }))

export const updateGameRosterSettings = ({
  gameId,
  phoneInviteOnly,
}: {
  gameId: string
  phoneInviteOnly: boolean
}) =>
  unwrap(
    api.games[":gameId"].roster.settings.$patch({
      param: { gameId },
      json: { phoneInviteOnly },
    }),
  )

export const upsertGameRosterParticipant = ({
  gameId,
  rosterPlayerId,
  displayName,
  phone,
}: {
  gameId: string
  rosterPlayerId?: string
  displayName: string
  phone?: string | null
}) =>
  unwrap(
    api.games[":gameId"].roster.$post({
      param: { gameId },
      json: { rosterPlayerId, displayName, phone },
    }),
  )

export const deleteGameRosterParticipant = ({
  gameId,
  rosterPlayerId,
}: {
  gameId: string
  rosterPlayerId: string
}) =>
  unwrap(
    api.games[":gameId"].roster[":rosterPlayerId"].$delete({
      param: { gameId, rosterPlayerId },
    }),
  )

export const commitGameRosterParticipants = ({
  gameId,
  participants,
  phoneInviteOnly,
}: {
  gameId: string
  participants: RosterParticipant[]
  phoneInviteOnly?: boolean
}) =>
  unwrap(
    api.games[":gameId"].roster.participants.$put({
      param: { gameId },
      json: { participants, phoneInviteOnly },
    }),
  )
