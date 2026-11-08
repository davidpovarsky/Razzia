import { normalizePhoneE164 } from "@razzia/extensions/core"

export interface GameJoinPort {
  readonly players: ReadonlyArray<{ clientId: string; username: string }>
  readonly settings: { generatedUsernames: boolean }
  readonly locked: boolean
  readonly phoneInviteOnly: boolean
  findRosterByPhone: (
    phone: string,
  ) => { rosterPlayerId: string; displayName: string } | null | undefined
}

interface JoinInput {
  clientId: string
  username?: string
  phone?: string
  source?: "web" | "phone"
}

export type JoinResolution =
  | { kind: "existing"; username: string }
  | {
      kind: "denied"
      error: "errors:game.locked" | "errors:auth.usernameTooShort"
      status: 400 | 403
      reason?: "phone_invite_only"
    }
  | {
      kind: "ticket"
      identity: {
        username?: string
        rosterPlayerId?: string
        phoneE164?: string
        source: "web" | "phone"
      }
    }

/** Pure downstream roster/phone/name policy; HTTP auth and ticket signing remain upstream. */
export function resolveGameJoin(
  game: GameJoinPort,
  input: JoinInput,
): JoinResolution {
  const phone = input.phone ? normalizePhoneE164(input.phone) : null
  const match = phone ? game.findRosterByPhone(phone) : null
  const existing = game.players.find(
    (player) => player.clientId === input.clientId,
  )

  if (existing && !match) {
    return { kind: "existing", username: existing.username }
  }

  if ((input.source === "phone" || phone) && !match && game.phoneInviteOnly) {
    return {
      kind: "denied",
      error: "errors:game.locked",
      status: 403,
      reason: "phone_invite_only",
    }
  }

  if (game.locked && !match) {
    return { kind: "denied", error: "errors:game.locked", status: 403 }
  }

  const name = match?.displayName ?? input.username

  if (!game.settings.generatedUsernames && !name) {
    return {
      kind: "denied",
      error: "errors:auth.usernameTooShort",
      status: 400,
    }
  }

  return {
    kind: "ticket",
    identity: {
      username: game.settings.generatedUsernames && !match ? undefined : name,
      rosterPlayerId: match?.rosterPlayerId,
      phoneE164: phone ?? undefined,
      source: input.source ?? (phone ? "phone" : "web"),
    },
  }
}
