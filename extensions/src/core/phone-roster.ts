import { v7 as uuidv7 } from "uuid"
import { z } from "zod"

/**
 * Generates a stable UUIDv7 for a roster participant.
 */
export const generateRosterPlayerId = (): string => uuidv7()

/**
 * Normalizes a telephone number into canonical E.164 format (+[country][subscriber]).
 *
 * Supported formats:
 * - Already international E.164 or 00-prefixed: +972..., +44..., +1..., 00972..., 0044...
 * - Domestic Israeli numbers: 05X-XXX-XXXX (10 digits) or 07X-XXX-XXXX / 02..09 (9-10 digits) -> +972...
 * - Domestic UK numbers: 07XXX-XXXXXX (11 digits) or 01/02/03 (10-11 digits) -> +44...
 * - Bare international digits starting with 972 (11-12 digits) or 44 (11-12 digits) -> +972... / +44...
 *
 * Rejects hidden/anonymous caller IDs, short numbers (< 8 digits), long numbers (> 15 digits),
 * or ambiguous/unparseable strings.
 */
export function normalizePhoneE164(
  rawPhone: string | number | null | undefined,
  defaultCountry: "IL" | "UK" = "IL",
): string | null {
  if (rawPhone === null || rawPhone === undefined) {
    return null
  }

  let str = String(rawPhone).trim()

  // Strip leading spreadsheet text-format apostrophe if present (e.g. '+97250... or '050...)
  if (str.startsWith("'")) {
    str = str.slice(1).trim()
  }

  if (!str) {
    return null
  }

  // Reject scientific notation or formula strings
  if (/^[=+\-@]/u.test(str) && !/^\+\d/u.test(str)) {
    return null
  }

  if (/\d+\.\d+[eE][+-]?\d+/u.test(str)) {
    return null
  }

  // Reject hidden / anonymous / private caller IDs
  const lower = str.toLowerCase()

  if (
    lower.includes("anonymous") ||
    lower.includes("unknown") ||
    lower.includes("private") ||
    lower.includes("blocked") ||
    lower.includes("withheld") ||
    lower.includes("restricted") ||
    lower.includes("***") ||
    lower.includes("redacted")
  ) {
    return null
  }

  // Strip visual formatting characters: spaces, hyphens, parentheses, dots, LTR/RTL marks
  str = str.replaceAll(/[\s\-().\u200E\u200F\u202A-\u202E]/gu, "")

  // Convert 00 international prefix to +
  if (str.startsWith("00")) {
    str = `+${str.slice(2)}`
  }

  if (str.startsWith("+")) {
    const digits = str.slice(1)

    if (!/^\d{8,15}$/u.test(digits)) {
      return null
    }

    // Normalize +9720... (common mistake where leading 0 is kept after +972)
    if (digits.startsWith("9720") && digits.length >= 12) {
      return `+972${digits.slice(4)}`
    }

    // Normalize +440... (common mistake where leading 0 is kept after +44)
    if (digits.startsWith("440") && digits.length >= 12) {
      return `+44${digits.slice(3)}`
    }

    if (digits.startsWith("0")) {
      return null
    }

    return `+${digits}`
  }

  // Digits only from here
  if (!/^\d+$/u.test(str)) {
    return null
  }

  // Check if starts with 0 (domestic number with leading zero)
  if (str.startsWith("0")) {
    // UK domestic mobile/landline: 11 digits starting with 07, 01, 02, 03, 08
    if (str.length === 11 && /^0[12378]\d{9}$/u.test(str)) {
      return `+44${str.slice(1)}`
    }

    // Israeli domestic: 9 or 10 digits starting with 02, 03, 04, 05, 07, 08, 09
    if (
      (str.length === 9 || str.length === 10) &&
      /^0[2345789]\d{7,8}$/u.test(str)
    ) {
      return `+972${str.slice(1)}`
    }

    // UK 10-digit landline (01/02) if defaultCountry is UK
    if (
      defaultCountry === "UK" &&
      str.length === 10 &&
      /^0[1237]\d{8}$/u.test(str)
    ) {
      return `+44${str.slice(1)}`
    }

    return null
  }

  // Bare international digits without + or leading 0
  if (str.startsWith("972") && (str.length === 11 || str.length === 12)) {
    return `+${str}`
  }

  if (str.startsWith("44") && (str.length === 11 || str.length === 12)) {
    return `+${str}`
  }

  // 9-digit Israeli mobile missing leading 0 (e.g. Excel stripped leading 0 from 0521234567 -> 521234567)
  // Note: Only if explicitly 9 digits starting with 5 or 72/73/74/76/77/79
  if (
    defaultCountry === "IL" &&
    str.length === 9 &&
    /^(?:5\d|7[234679])\d{7}$/u.test(str)
  ) {
    return `+972${str}`
  }

  // Other bare international E.164 (10 to 15 digits starting with 1-9)
  if (str.length >= 10 && str.length <= 15 && /^[1-9]\d+$/u.test(str)) {
    return `+${str}`
  }

  return null
}

/**
 * Formats an E.164 phone number or raw input cleanly for display while keeping it FULL and UNMASKED.
 */
export function formatFullPhoneDisplay(
  phoneE164: string | null | undefined,
): string {
  if (!phoneE164?.trim()) {
    return "—"
  }

  return phoneE164.trim()
}

export const rosterParticipantSchema = z.strictObject({
  rosterPlayerId: z.string().min(1),
  displayName: z.string().trim().min(1).max(40),
  phoneE164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/u, "errors:extensions.invalidPhoneNumber")
    .nullable()
    .optional()
    .transform((val) => val ?? null),
  phoneRaw: z.string().max(40).optional(),
  tableNumber: z.number().int().min(1).max(2000).optional(),
  phoneNeedsReview: z.boolean().optional(),
})

export type RosterParticipant = z.infer<typeof rosterParticipantSchema>

export const rosterExtrasSchema = z
  .strictObject({
    phoneInviteOnly: z.boolean().default(false),
    participants: z.array(rosterParticipantSchema).max(2000).default([]),
  })
  .superRefine((data, ctx) => {
    const seenIds = new Set<string>()
    const seenPhones = new Set<string>()

    for (let i = 0; i < data.participants.length; i += 1) {
      const p = data.participants[i]

      if (seenIds.has(p.rosterPlayerId)) {
        ctx.addIssue({
          code: "custom",
          path: ["participants", i, "rosterPlayerId"],
          message: "errors:extensions.duplicateRosterPlayerId",
        })
      }

      seenIds.add(p.rosterPlayerId)

      if (p.phoneE164) {
        if (seenPhones.has(p.phoneE164)) {
          ctx.addIssue({
            code: "custom",
            path: ["participants", i, "phoneE164"],
            message: `errors:extensions.duplicatePhoneNumber:${p.phoneE164}`,
          })
        }

        seenPhones.add(p.phoneE164)
      }
    }
  })

export type RosterExtras = z.infer<typeof rosterExtrasSchema>

export const createDefaultRosterExtras = (): RosterExtras => ({
  phoneInviteOnly: false,
  participants: [],
})

export const hostPlayerStatusSchema = z.strictObject({
  rosterPlayerId: z.string().min(1),
  clientId: z.string().nullable(),
  displayName: z.string().min(1),
  phoneE164: z.string().nullable(),
  tableNumber: z.number().int().min(1).max(2000).optional(),
  phoneNeedsReview: z.boolean().optional(),
  source: z.enum(["web", "phone"]),
  status: z.enum(["not_joined", "connected", "disconnected"]),
  timedOut: z.boolean().optional(),
  points: z.number(),
  answeredCurrentQuestion: z.boolean().optional(),
  lastSeenAt: z.number().optional(),
})

export type HostPlayerStatus = z.infer<typeof hostPlayerStatusSchema>

export const hostPresenceSnapshotSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  phoneInviteOnly: z.boolean(),
  registeredTotal: z.number().int().nonnegative(),
  connectedNow: z.number().int().nonnegative(),
  disconnectedNow: z.number().int().nonnegative(),
  notJoinedNow: z.number().int().nonnegative().optional(),
  players: z.array(hostPlayerStatusSchema),
})

export type HostPresenceSnapshot = z.infer<typeof hostPresenceSnapshotSchema>
