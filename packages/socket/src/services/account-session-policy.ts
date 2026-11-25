import { SESSION_ROLES } from "@razzia/common/constants"
import type { SessionClaims } from "@razzia/common/types/auth"
import { accountsEnabled } from "./account-scope"
import { revokeAccountSession } from "./account-auth"
import { ManagedClientStore } from "./managed-clients"

export function canRefreshAsPlayer(claims: SessionClaims): boolean {
  return claims.role === SESSION_ROLES.PLAYER || !accountsEnabled()
}

export function retireManagerClaims(claims: SessionClaims): void {
  if (accountsEnabled() && claims.managedClientId && claims.sid) {
    new ManagedClientStore().revokeSession(claims.sid)

    return
  }

  if (
    accountsEnabled() &&
    claims.role === SESSION_ROLES.MANAGER &&
    claims.sid
  ) {
    revokeAccountSession(claims.sid)
  }
}
