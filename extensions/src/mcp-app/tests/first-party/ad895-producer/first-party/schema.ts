import type { DatabaseSync } from "node:sqlite"
import { ToolError } from "../server/errors.ts"

export function initialize(db: DatabaseSync, accountId: string) {
  db.exec(
    "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE",
  )
  try {
    db.exec(`
    CREATE TABLE metadata (owner TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version=1));
    CREATE TABLE drafts (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
      authored TEXT NOT NULL, summary TEXT NOT NULL, locale TEXT
    );
    CREATE TABLE operations (
      authority TEXT NOT NULL CHECK(authority='first-party-session'),
      owner TEXT NOT NULL, sid TEXT NOT NULL, kind TEXT NOT NULL,
      request_key TEXT NOT NULL, digest TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('COMPLETED','PENDING_C1')),
      outcome TEXT NOT NULL, native_id TEXT CHECK(native_id IS NULL),
      PRIMARY KEY(authority,owner,sid,kind,request_key)
    );
    CREATE TABLE audit (
      seq INTEGER PRIMARY KEY, owner TEXT NOT NULL, sid TEXT NOT NULL,
      kind TEXT NOT NULL, request_key TEXT NOT NULL, digest TEXT NOT NULL,
      disposition TEXT NOT NULL, created_ms INTEGER NOT NULL
    );`)
    db.prepare("INSERT INTO metadata(owner,version) VALUES(?,1)").run(accountId)
    db.exec("PRAGMA user_version=1; COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function inspect(db: DatabaseSync, accountId: string) {
  const version = db.prepare("PRAGMA user_version").get()
  const journal = db.prepare("PRAGMA journal_mode").get()
  const owners = db.prepare("SELECT owner,version FROM metadata").all()
  const integrity = db.prepare("PRAGMA quick_check(1)").get()
  if (
    version?.user_version !== 1 ||
    journal?.journal_mode !== "delete" ||
    owners.length !== 1 ||
    owners[0]?.owner !== accountId ||
    owners[0]?.version !== 1 ||
    integrity?.quick_check !== "ok"
  )
    throw new ToolError("DEPENDENCY_UNAVAILABLE")
  // Missing tables/columns fail, never CREATE/repair an existing DB.
  db.prepare(
    "SELECT id,owner,revision,authored,summary,locale FROM drafts LIMIT 0",
  ).all()
  db.prepare(
    "SELECT authority,owner,sid,kind,request_key,digest,state,outcome,native_id FROM operations LIMIT 0",
  ).all()
  db.prepare(
    "SELECT owner,sid,kind,request_key,digest,disposition,created_ms FROM audit LIMIT 0",
  ).all()
}
