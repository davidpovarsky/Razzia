// Immutable old producer DDL fixture; source schema.ts SHA256 19c73e2a850515bb5bbef078aafbad4185306f7741f78a194a365716de929986
export const legacyTableSql = [
  "CREATE TABLE metadata (owner TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version=1))",
  "CREATE TABLE drafts (\n      id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),\n      authored TEXT NOT NULL, summary TEXT NOT NULL, locale TEXT\n    )",
  "CREATE TABLE operations (\n      authority TEXT NOT NULL CHECK(authority='first-party-session'),\n      owner TEXT NOT NULL, sid TEXT NOT NULL, kind TEXT NOT NULL,\n      request_key TEXT NOT NULL, digest TEXT NOT NULL,\n      state TEXT NOT NULL CHECK(state IN ('COMPLETED','PENDING_C1')),\n      outcome TEXT NOT NULL, native_id TEXT CHECK(native_id IS NULL),\n      PRIMARY KEY(authority,owner,sid,kind,request_key)\n    )",
  "CREATE TABLE audit (\n      seq INTEGER PRIMARY KEY, owner TEXT NOT NULL, sid TEXT NOT NULL,\n      kind TEXT NOT NULL, request_key TEXT NOT NULL, digest TEXT NOT NULL,\n      disposition TEXT NOT NULL, created_ms INTEGER NOT NULL\n    )"
] as const
