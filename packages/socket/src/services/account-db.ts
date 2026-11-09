import { DatabaseSync } from "node:sqlite"
import { chmodSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { accountsEnabled } from "./account-scope"

let db: DatabaseSync | undefined = undefined

export function getAccountDb(): DatabaseSync {
  if (!accountsEnabled()) {
    throw new Error("Accounts are disabled")
  }

  if (db) {
    return db
  }

  const base = process.env.CONFIG_PATH ?? resolve(process.cwd(), "config")
  const path = resolve(base, "tadazz-accounts.sqlite")
  mkdirSync(dirname(path), { recursive: true })
  // Restrict SQLite sidecar creation without changing uploaded media permissions.
  const priorUmask = process.platform === "win32" ? null : process.umask(0o077)

  try {
    db = new DatabaseSync(path, { timeout: 3000 })
    db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")

    if (process.platform !== "win32") {
      for (const filename of [path, `${path}-wal`, `${path}-shm`]) {
        try {
          chmodSync(filename, 0o600)
        } catch {
          /* Sidecar may not yet exist */
        }
      }
    }

    db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      verified_at INTEGER,
      created_at INTEGER NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS codes (
      user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      digest TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at INTEGER NOT NULL,
      PRIMARY KEY(user_id,purpose)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS limits (
      key TEXT PRIMARY KEY,
      period_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL
    );
  `)
  } finally {
    if (priorUmask !== null) {
      process.umask(priorUmask)
    }
  }

  if (process.platform !== "win32") {
    try {
      chmodSync(path, 0o600)
    } catch {
      /* Restricted volume */
    }
  }

  return db
}

export function checkAccountConfiguration(): void {
  if (!accountsEnabled()) {
    return
  }

  if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error("A persistent JWT_SECRET is required for account mode")
  }

  if (!process.env.RESEND_API_KEY || !process.env.TADAZZ_AUTH_EMAIL_FROM) {
    throw new Error("Resend email sending must be configured for account mode")
  }

  getAccountDb()
}

/** Release the local DB handle for tests and controlled maintenance. */
export function closeAccountDb(): void {
  db?.close()
  db = undefined
}
