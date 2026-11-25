import { DatabaseSync } from "node:sqlite"
import { chmodSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

export class BillingDatabase {
  readonly sql: DatabaseSync
  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true })
    }

    const prior = process.platform === "win32" ? null : process.umask(0o077)

    try {
      this.sql = new DatabaseSync(path, { timeout: 3000 })
      this.sql.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS billing_intents (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, plan_json TEXT NOT NULL,
          price_id TEXT NOT NULL, currency TEXT NOT NULL, game_id TEXT,
          transaction_id TEXT UNIQUE, created_at INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS billing_customers (
          tenant_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS billing_subscriptions (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
          plan_json TEXT NOT NULL, status TEXT NOT NULL, scheduled_change TEXT,
          period_end INTEGER, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS billing_grants (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, plan_id TEXT NOT NULL,
          participants INTEGER NOT NULL, games INTEGER NOT NULL, phone_minutes INTEGER NOT NULL,
          starts_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0,
          subscription_id TEXT, transaction_id TEXT NOT NULL, target_game TEXT, paid_ends_at INTEGER);
        CREATE TABLE IF NOT EXISTS billing_games (
          game_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, grant_id TEXT NOT NULL REFERENCES billing_grants(id),
          participants INTEGER NOT NULL, started_at INTEGER, phone_minutes INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS billing_purchases (
          transaction_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES billing_grants(id),
          participants INTEGER NOT NULL, games INTEGER NOT NULL, phone_minutes INTEGER NOT NULL,
          revoked INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS billing_participants (
          game_id TEXT NOT NULL REFERENCES billing_games(game_id), identity TEXT NOT NULL,
          PRIMARY KEY(game_id, identity));
        CREATE TABLE IF NOT EXISTS billing_phone_usage (
          game_id TEXT NOT NULL REFERENCES billing_games(game_id), call_id TEXT NOT NULL,
          seconds INTEGER NOT NULL, PRIMARY KEY(game_id,call_id));
        CREATE TABLE IF NOT EXISTS billing_events (
          -- Whitelisted provider metadata only; no card/customer address payloads.
          id TEXT PRIMARY KEY, payload TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0, received_at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS billing_grants_tenant ON billing_grants(tenant_id);
        CREATE TABLE IF NOT EXISTS billing_phone_calls (
          game_id TEXT NOT NULL REFERENCES billing_games(game_id), call_id TEXT NOT NULL,
          started_at INTEGER NOT NULL, ended_at INTEGER, last_seen_at INTEGER NOT NULL, PRIMARY KEY(game_id,call_id));
        CREATE INDEX IF NOT EXISTS billing_games_tenant ON billing_games(tenant_id);
      `)

      if (path !== ":memory:" && process.platform !== "win32") {
        for (const file of [path, `${path}-wal`, `${path}-shm`]) {
          try {
            chmodSync(file, 0o600)
          } catch {
            /* WAL may not exist yet. */
          }
        }
      }
    } finally {
      if (prior !== null) {
        process.umask(prior)
      }
    }
  }
  transaction<T>(fn: () => T): T {
    this.sql.exec("BEGIN IMMEDIATE")

    try {
      const result = fn()
      this.sql.exec("COMMIT")

      return result
    } catch (error) {
      this.sql.exec("ROLLBACK")
      throw error
    }
  }
  close() {
    this.sql.close()
  }
}
