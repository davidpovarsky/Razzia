import type { GameSettings } from "@razzia/common/types/game"
import type { QuizzValidated } from "@razzia/common/validators/quizz"
import type { RosterParticipant } from "@razzia/extensions/core"
import { api, unwrap, unwrapEmpty } from "@razzia/web/lib/api"
import { queryOptions } from "@tanstack/react-query"

export const quizzKeys = {
  all: ["quizz"] as const,
  detail: (id: string) => ["quizz", id] as const,
}

export const resultKeys = {
  all: ["results"] as const,
  detail: (id: string) => ["results", id] as const,
}

export const quizzListQuery = () =>
  queryOptions({
    queryKey: quizzKeys.all,
    queryFn: () => unwrap(api.quizz.$get()),
  })

export const quizzQuery = (id: string) =>
  queryOptions({
    queryKey: quizzKeys.detail(id),
    queryFn: () => unwrap(api.quizz[":id"].$get({ param: { id } })),
  })

export const resultsListQuery = () =>
  queryOptions({
    queryKey: resultKeys.all,
    queryFn: () => unwrap(api.results.$get()),
  })

export const resultQuery = (id: string) =>
  queryOptions({
    queryKey: resultKeys.detail(id),
    queryFn: () => unwrap(api.results[":id"].$get({ param: { id } })),
  })

export const createQuizz = (json: QuizzValidated) =>
  unwrap(api.quizz.$post({ json }))

export const updateQuizz = ({
  id,
  json,
}: {
  id: string
  json: QuizzValidated
}) => unwrap(api.quizz[":id"].$patch({ param: { id }, json }))

export const deleteQuizz = (id: string) =>
  unwrapEmpty(api.quizz[":id"].$delete({ param: { id } }))

export const deleteResult = (id: string) =>
  unwrapEmpty(api.results[":id"].$delete({ param: { id } }))

export const createGame = (quizzId: string) =>
  unwrap(api.games.$post({ json: { quizzId } }))

export const updateGameSettings = ({
  gameId,
  json,
}: {
  gameId: string
  json: Partial<GameSettings>
}) => unwrap(api.games[":gameId"].settings.$patch({ param: { gameId }, json }))

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

export const managerLogin = (password: string) =>
  unwrap(api.auth.manager.$post({ json: { password } }))

export const managerLogout = () => unwrap(api.auth.logout.$post())
