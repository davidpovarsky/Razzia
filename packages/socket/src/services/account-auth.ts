import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto"
import { getAccountDb } from "./account-db"

const OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const VALID_CODE_MS = 10 * 60 * 1000

type RawAccount = {
  id: string
  email: string
  salt: string
  hash: string
  verified_at: number | null
  disabled: number
}
export type PublicAccount = { id: string; email: string; verified: boolean }
export const canonicalEmail = (email: string) => email.trim().toLowerCase()

const passwordHash = (password: string, salt: Buffer): Promise<string> =>
  new Promise((resolve, reject) => {
    scryptCb(password, salt, 64, OPTIONS, (error, derived) => {
      if (error) reject(error)
      else resolve(derived.toString("hex"))
    })
  })

const account = (email: string): RawAccount | undefined =>
  getAccountDb()
    .prepare("SELECT * FROM accounts WHERE email=?")
    .get(canonicalEmail(email)) as RawAccount | undefined

export function activeAccount(id: string): PublicAccount | null {
  const row = getAccountDb()
    .prepare("SELECT id,email,verified_at,disabled FROM accounts WHERE id=?")
    .get(id) as
    Pick<RawAccount, "id" | "email" | "verified_at" | "disabled"> | undefined
  return row && row.verified_at && !row.disabled
    ? { id: row.id, email: row.email, verified: true }
    : null
}

export function limitAction(
  key: string,
  limit: number,
  intervalMs: number,
): boolean {
  const now = Date.now()
  const db = getAccountDb()
  const row = db
    .prepare("SELECT period_at,attempts FROM limits WHERE key=?")
    .get(key) as { period_at: number; attempts: number } | undefined
  if (!row || now - row.period_at >= intervalMs) {
    db.prepare(
      "INSERT INTO limits(key,period_at,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET period_at=excluded.period_at,attempts=1",
    ).run(key, now)
    return true
  }
  if (row.attempts >= limit) return false
  db.prepare("UPDATE limits SET attempts=attempts+1 WHERE key=?").run(key)
  return true
}

export function validateNewPassword(password: string): void {
  if (
    password.length < 12 ||
    password.length > 128 ||
    Buffer.byteLength(password) > 256
  )
    throw new Error("Password length must be between 12 and 128 characters")
}

export async function registerAccount(
  email: string,
  password: string,
): Promise<PublicAccount> {
  validateNewPassword(password)
  const norm = canonicalEmail(email)
  const known = account(norm)
  if (known)
    return {
      id: known.id,
      email: known.email,
      verified: Boolean(known.verified_at),
    }
  const id = randomUUID()
  const salt = randomBytes(16)
  const hash = await passwordHash(password, salt)
  getAccountDb()
    .prepare(
      "INSERT INTO accounts(id,email,salt,hash,created_at) VALUES(?,?,?,?,?)",
    )
    .run(id, norm, salt.toString("hex"), hash, Date.now())
  return { id, email: norm, verified: false }
}

function digestCode(id: string, purpose: string, value: string): string {
  return createHmac("sha256", process.env.JWT_SECRET ?? "")
    .update([id, purpose, value].join(":"))
    .digest("hex")
}

export function canIssueCode(id: string, purpose: string): boolean {
  const row = getAccountDb()
    .prepare("SELECT sent_at FROM codes WHERE user_id=? AND purpose=?")
    .get(id, purpose) as { sent_at: number } | undefined
  return !row || Date.now() - row.sent_at >= 60000
}

export function issueCode(id: string, purpose: "verify" | "reset"): string {
  const value = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const now = Date.now()
  getAccountDb()
    .prepare(
      `INSERT INTO codes(user_id,purpose,digest,expires_at,sent_at) VALUES(?,?,?,?,?)
    ON CONFLICT(user_id,purpose) DO UPDATE SET digest=excluded.digest,expires_at=excluded.expires_at,sent_at=excluded.sent_at,attempts=0`,
    )
    .run(id, purpose, digestCode(id, purpose, value), now + VALID_CODE_MS, now)
  return value
}

export function accountForEmail(email: string): PublicAccount | null {
  const item = account(email)
  return item
    ? { id: item.id, email: item.email, verified: Boolean(item.verified_at) }
    : null
}

export function consumeCode(
  email: string,
  purpose: "verify" | "reset",
  value: string,
): PublicAccount | null {
  if (!/^\d{6}$/u.test(value)) return null
  const user = account(email)
  if (!user || user.disabled) return null
  const db = getAccountDb()
  const row = db
    .prepare(
      "SELECT digest,expires_at,attempts FROM codes WHERE user_id=? AND purpose=?",
    )
    .get(user.id, purpose) as
    { digest: string; expires_at: number; attempts: number } | undefined
  if (!row || row.expires_at < Date.now() || row.attempts >= 5) return null
  db.prepare(
    "UPDATE codes SET attempts=attempts+1 WHERE user_id=? AND purpose=?",
  ).run(user.id, purpose)
  const a = Buffer.from(digestCode(user.id, purpose, value), "hex")
  const b = Buffer.from(row.digest, "hex")
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  db.prepare("DELETE FROM codes WHERE user_id=? AND purpose=?").run(
    user.id,
    purpose,
  )
  if (purpose === "verify")
    db.prepare("UPDATE accounts SET verified_at=? WHERE id=?").run(
      Date.now(),
      user.id,
    )
  return {
    id: user.id,
    email: user.email,
    verified: purpose === "verify" || Boolean(user.verified_at),
  }
}

export async function authenticate(
  email: string,
  password: string,
): Promise<PublicAccount | null> {
  const normalized = canonicalEmail(email)
  const key = createHmac("sha256", process.env.JWT_SECRET ?? "")
    .update("login:" + normalized)
    .digest("hex")
  if (!limitAction(key, 12, 15 * 60 * 1000)) return null
  const user = account(normalized)
  const actual = await passwordHash(
    password,
    user ? Buffer.from(user.salt, "hex") : Buffer.alloc(16, 0x45),
  )
  if (!user || user.disabled || !user.verified_at) return null
  const a = Buffer.from(actual, "hex"),
    b = Buffer.from(user.hash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
    ? { id: user.id, email: user.email, verified: true }
    : null
}

export async function resetPassword(
  email: string,
  code: string,
  password: string,
): Promise<boolean> {
  validateNewPassword(password)
  const user = consumeCode(email, "reset", code)
  if (!user) return false
  const salt = randomBytes(16)
  const hash = await passwordHash(password, salt)
  const db = getAccountDb()
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare("UPDATE accounts SET salt=?, hash=? WHERE id=?").run(
      salt.toString("hex"),
      hash,
      user.id,
    )
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id)
    db.exec("COMMIT")
    return true
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
}

export function createAccountSession(id: string, expiresAt: number): string {
  const sid = randomUUID()
  getAccountDb()
    .prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)")
    .run(sid, id, expiresAt * 1000)
  return sid
}
export function isAccountSessionValid(userId: string, sid?: string): boolean {
  if (!sid) return false
  const row = getAccountDb()
    .prepare(
      `SELECT 1 AS present FROM sessions s JOIN accounts a ON a.id=s.user_id
    WHERE s.id=? AND s.user_id=? AND s.expires_at>? AND a.disabled=0 AND a.verified_at IS NOT NULL`,
    )
    .get(sid, userId, Date.now())
  return Boolean(row)
}
export function revokeAccountSession(sid: string): void {
  getAccountDb().prepare("DELETE FROM sessions WHERE id=?").run(sid)
}

/** Confirmation requires the password chosen by this registrant, not just an email code. */
export async function verifyRegistrationPassword(
  email: string,
  password: string,
): Promise<boolean> {
  const user = account(email)
  if (
    !user ||
    user.disabled ||
    typeof password !== "string" ||
    password.length > 128
  )
    return false
  const hash = await passwordHash(password, Buffer.from(user.salt, "hex"))
  const actual = Buffer.from(hash, "hex")
  const expected = Buffer.from(user.hash, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
