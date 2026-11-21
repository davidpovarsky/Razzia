import { SESSION_ROLES } from "@razzia/common/constants"
import type { SessionClaims } from "@razzia/common/types/auth"
import type Game from "./game"
import type { Socket } from "@razzia/common/types/game/socket"
import { ManagedClientStore } from "./managed-clients"

/** Rechecked for each room request/action; assignment and rotation are immediate. */
export function canHostGame(claims: SessionClaims, game: Game): boolean {
  if (
    claims.role !== SESSION_ROLES.MANAGER ||
    game.manager.clientId !== claims.sub
  ) {
    return false
  }

  if (!claims.managedClientId) {
    return !game.managedClientId
  }

  if (game.managedClientId !== claims.managedClientId || !game.sourceQuizId) {
    return false
  }

  const store = new ManagedClientStore()
  const principal = store.session(claims.sub, claims.sid)

  return Boolean(
    principal &&
    principal.ownerId === game.contentOwnerId &&
    store.assigned(principal.id, principal.ownerId, game.sourceQuizId),
  )
}

/** Legacy unit doubles omit claims; real sockets always carry verified claims. */
export function canSocketHostGame(socket: Socket, game: Game): boolean {
  if (socket.data.claims) {
    return canHostGame(socket.data.claims, game)
  }

  return (
    !game.managedClientId &&
    socket.data.role === "manager" &&
    game.manager.clientId === socket.data.clientId
  )
}
