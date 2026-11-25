import { sign, verify } from "hono/jwt"
import { jwtSecret } from "@razzia/socket/env"
import { setCookie } from "hono/cookie"
import { accountsEnabled } from "./account-scope"

export interface MediaAccessClaims {
  purpose: "room-media"
  gameId: string
  exp: number
}

export const mediaAccessTtl = 6 * 60 * 60

export /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
async function mintMediaAccess(gameId: string): Promise<string> {
  return sign(
    {
      purpose: "room-media",
      gameId,
      exp: Math.floor(Date.now() / 1000) + mediaAccessTtl,
    },
    jwtSecret,
    "HS256",
  )
}

/* oxlint-enable require-await, typescript/require-await */
export async function verifyMediaAccess(
  token: string,
): Promise<MediaAccessClaims> {
  const claims = await verify(token, jwtSecret, "HS256")

  if (claims.purpose !== "room-media" || typeof claims.gameId !== "string") {
    throw new Error("Not a room media ticket")
  }

  return claims as unknown as MediaAccessClaims
}

/** Room-scoped access to content that the active show actually references. */
export async function grantMediaForGuest(
  c: import("hono").Context,
  gameId: string,
): Promise<void> {
  if (!accountsEnabled()) {
    return
  }

  const ticket = await mintMediaAccess(gameId)
  setCookie(c, "tdz_room", ticket, {
    path: "/media",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: mediaAccessTtl,
  })
}
