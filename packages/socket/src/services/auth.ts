import { SESSION_ROLES } from "@razzia/common/constants"
import type {
  JoinTicketClaims,
  SessionClaims,
  SessionResponse,
  SessionRole,
} from "@razzia/common/types/auth"
import {
  joinTicketClaimsValidator,
  sessionClaimsValidator,
} from "@razzia/common/validators/auth"
import { jwtSecret } from "@razzia/socket/env"
import { accountsEnabled } from "@razzia/socket/services/account-scope"
import {
  activeAccount,
  createAccountSession,
  isAccountSessionValid,
} from "@razzia/socket/services/account-auth"
import { sign, verify } from "hono/jwt"
import { v7 as uuid } from "uuid"

const ALGORITHM = "HS256"
const PLAYER_TTL = 60 * 60 * 24 * 30
const MANAGER_TTL = 60 * 60 * 12

export const newClientId = (): string => uuid()

const parseClaims = (payload: unknown): SessionClaims => {
  const result = sessionClaimsValidator.safeParse(payload)

  if (!result.success) {
    throw new Error("Invalid session claims")
  }

  return result.data
}

export const mintToken = async (
  sub: string,
  role: SessionRole,
): Promise<SessionResponse> => {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + (role === SESSION_ROLES.MANAGER ? MANAGER_TTL : PLAYER_TTL)

  const sid = (() => {
    if (accountsEnabled() && role === SESSION_ROLES.MANAGER) {
      if (activeAccount(sub)) {
        return createAccountSession(sub, exp)
      }

      return (() => {
        throw new Error("Account inactive")
      })()
    }

    return undefined
  })()
  const token = await sign(
    { sub, role, iat, exp, ...(sid ? { sid } : {}) },
    jwtSecret,
    ALGORITHM,
  )

  return { token, clientId: sub, role, expiresAt: exp }
}

export const verifyToken = async (token: string): Promise<SessionClaims> => {
  const claims = parseClaims(await verify(token, jwtSecret, ALGORITHM))

  if (
    accountsEnabled() &&
    claims.role === SESSION_ROLES.MANAGER &&
    !isAccountSessionValid(claims.sub, claims.sid)
  ) {
    throw new Error("Manager session revoked or invalid")
  }

  return claims
}

export const verifyIgnoringExpiry = async (
  token: string,
): Promise<SessionClaims> =>
  parseClaims(await verify(token, jwtSecret, { alg: ALGORITHM, exp: false }))

const JOIN_TICKET_TTL = 60 * 5

export interface MintJoinTicketOptions {
  username?: string
  rosterPlayerId?: string
  phoneE164?: string
  source?: "web" | "phone"
}

export const mintJoinTicket = (
  sub: string,
  gameId: string,
  usernameOrOptions?: string | MintJoinTicketOptions,
): Promise<string> => {
  const iat = Math.floor(Date.now() / 1000)
  const opts: MintJoinTicketOptions =
    typeof usernameOrOptions === "string"
      ? { username: usernameOrOptions }
      : (usernameOrOptions ?? {})

  return sign(
    {
      sub,
      gameId,
      username: opts.username,
      ...(opts.rosterPlayerId ? { rosterPlayerId: opts.rosterPlayerId } : {}),
      ...(opts.phoneE164 ? { phoneE164: opts.phoneE164 } : {}),
      ...(opts.source ? { source: opts.source } : {}),
      iat,
      exp: iat + JOIN_TICKET_TTL,
    },
    jwtSecret,
    ALGORITHM,
  )
}

export const verifyJoinTicket = async (
  ticket: string,
): Promise<JoinTicketClaims> => {
  const result = joinTicketClaimsValidator.safeParse(
    await verify(ticket, jwtSecret, ALGORITHM),
  )

  if (!result.success) {
    throw new Error("Invalid join ticket")
  }

  return result.data
}
