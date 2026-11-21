import type { SessionClaims } from "@razzia/common/types/auth"
import type {
  ManagedClientGamesResponse,
  ManagedClientLaunchResponse,
} from "@razzia/common/types/managed-clients"
import {
  managedClientGameId,
  managedClientLaunchValidator,
} from "@razzia/common/validators/managed-clients"
import { withAccount } from "./account-scope"
import { getQuizz } from "./config"
import { GameCreationRequestConflict, launchNativeGame } from "./game-launch"
import { describeManagedClientGame } from "./managed-client-owner"
import { ManagedClientFailure, ManagedClientStore } from "./managed-clients"

export function requireManagedClientPrincipal(claims: SessionClaims) {
  const principal =
    claims.managedClientId && claims.sid
      ? new ManagedClientStore().session(claims.sub, claims.sid)
      : undefined

  if (!principal) {
    throw new ManagedClientFailure("client-session-expired", 401)
  }

  return principal
}

export async function listManagedClientGames(
  claims: SessionClaims,
): Promise<ManagedClientGamesResponse> {
  const principal = requireManagedClientPrincipal(claims)
  const client = new ManagedClientStore().get(principal.ownerId, principal.id)

  return await withAccount(principal.ownerId, () => {
    const owned = getQuizz()

    return {
      games: client.gameIds.map((id) => {
        const quiz = owned.find((item) => item.id === id)

        return quiz
          ? describeManagedClientGame(principal.ownerId, quiz)
          : {
              id,
              title: "",
              questionCount: 0,
              themeId: null,
              customTheme: false,
              available: false,
              unavailableReason: "game-unavailable" as const,
            }
      }),
    }
  })
}

export async function launchManagedClientGame(
  claims: SessionClaims,
  quizId: string,
  input: unknown,
): Promise<ManagedClientLaunchResponse> {
  const request = managedClientLaunchValidator.safeParse(input)

  if (!request.success || !managedClientGameId.safeParse(quizId).success) {
    throw new ManagedClientFailure("client-invalid-request", 400)
  }

  const principal = requireManagedClientPrincipal(claims)
  const store = new ManagedClientStore()

  if (!store.assigned(principal.id, principal.ownerId, quizId)) {
    throw new ManagedClientFailure("client-game-unavailable", 404)
  }

  return await withAccount(principal.ownerId, () => {
    const quiz = getQuizz().find((item) => item.id === quizId)

    if (!quiz) {
      throw new ManagedClientFailure("client-game-unavailable", 404)
    }

    if (!describeManagedClientGame(principal.ownerId, quiz).available) {
      throw new ManagedClientFailure("client-game-theme-unavailable", 409)
    }

    try {
      const game = launchNativeGame({
        managerId: principal.id,
        quiz,
        requestId: request.data.requestId,
        delegation: {
          contentOwnerId: principal.ownerId,
          managedClientId: principal.id,
          sourceQuizId: quizId,
        },
      })

      return {
        gameId: game.gameId,
        inviteCode: game.inviteCode,
        hostUrl: `/party/manager/${game.gameId}`,
      }
    } catch (error) {
      if (error instanceof GameCreationRequestConflict) {
        throw new ManagedClientFailure("client-launch-request-conflict", 409)
      }

      throw error
    }
  })
}
