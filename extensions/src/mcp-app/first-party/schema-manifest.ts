// Exact producer-ad895 schema1. No input DDL is normalized into trust.
export const SCHEMA_OBJECT_SHA256 =
  "b23f8155290acc986cfbec7f4129f39342c11a6d8f793b18973d76ab3296ae6b"

export const TABLE_SQL = {
  metadata:
    "CREATE TABLE metadata (owner TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version=1))",
  drafts:
    "CREATE TABLE drafts (\n      id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),\n      authored TEXT NOT NULL, summary TEXT NOT NULL, locale TEXT\n    )",
  operations:
    "CREATE TABLE operations (\n      authority TEXT NOT NULL CHECK(authority='first-party-session'),\n      owner TEXT NOT NULL, sid TEXT NOT NULL, kind TEXT NOT NULL,\n      request_key TEXT NOT NULL, digest TEXT NOT NULL,\n      state TEXT NOT NULL CHECK(state IN ('COMPLETED','PENDING_C1')),\n      outcome TEXT NOT NULL, native_id TEXT CHECK(native_id IS NULL),\n      PRIMARY KEY(authority,owner,sid,kind,request_key)\n    )",
  audit:
    "CREATE TABLE audit (\n      seq INTEGER PRIMARY KEY, owner TEXT NOT NULL, sid TEXT NOT NULL,\n      kind TEXT NOT NULL, request_key TEXT NOT NULL, digest TEXT NOT NULL,\n      disposition TEXT NOT NULL, created_ms INTEGER NOT NULL\n    )",
} as const

export const COLUMNS = {
  metadata: [
    ["owner", "TEXT", 0, null, 1, 0],
    ["version", "INTEGER", 1, null, 0, 0],
  ],
  drafts: [
    ["id", "TEXT", 0, null, 1, 0],
    ["owner", "TEXT", 1, null, 0, 0],
    ["revision", "INTEGER", 1, null, 0, 0],
    ["authored", "TEXT", 1, null, 0, 0],
    ["summary", "TEXT", 1, null, 0, 0],
    ["locale", "TEXT", 0, null, 0, 0],
  ],
  operations: [
    ["authority", "TEXT", 1, null, 1, 0],
    ["owner", "TEXT", 1, null, 2, 0],
    ["sid", "TEXT", 1, null, 3, 0],
    ["kind", "TEXT", 1, null, 4, 0],
    ["request_key", "TEXT", 1, null, 5, 0],
    ["digest", "TEXT", 1, null, 0, 0],
    ["state", "TEXT", 1, null, 0, 0],
    ["outcome", "TEXT", 1, null, 0, 0],
    ["native_id", "TEXT", 0, null, 0, 0],
  ],
  audit: [
    ["seq", "INTEGER", 0, null, 1, 0],
    ["owner", "TEXT", 1, null, 0, 0],
    ["sid", "TEXT", 1, null, 0, 0],
    ["kind", "TEXT", 1, null, 0, 0],
    ["request_key", "TEXT", 1, null, 0, 0],
    ["digest", "TEXT", 1, null, 0, 0],
    ["disposition", "TEXT", 1, null, 0, 0],
    ["created_ms", "INTEGER", 1, null, 0, 0],
  ],
} as const

export const PRIMARY_INDEX = {
  metadata: "sqlite_autoindex_metadata_1",
  drafts: "sqlite_autoindex_drafts_1",
  operations: "sqlite_autoindex_operations_1",
  audit: null,
} as const
