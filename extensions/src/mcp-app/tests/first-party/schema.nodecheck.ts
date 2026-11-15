import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { canonicalJson } from "../../contracts/canonical.ts"
import { normalizeDraft } from "../../server/authoring.ts"
import { fixture, createInput, key, policy, snapshot } from "./fixtures.ts"
import type { Session } from "./fixtures.ts"
import { legacyTableSql } from "./schema-ad895.fixture.ts"
import { preserveWitness } from "./review-evidence.fixture.ts"

let f: Awaited<ReturnType<typeof fixture>>
before(async () => { f = await fixture() })
after(() => f?.close())

async function account(): Promise<Session> {
  const owner = randomUUID()
  f.db.prepare("INSERT INTO accounts(id,email,salt,hash,verified_at,created_at) VALUES(?,?,?,?,?,?)")
    .run(owner, owner + "@example.invalid", "synthetic-unused", "synthetic-unused", Date.now(), Date.now())
  const result = await f.tokens.mintToken(owner, "manager")
  const claims = await f.tokens.verifyToken(result.token)
  assert.ok(claims.sid)
  return { owner, token: result.token, sid: claims.sid }
}

function assertSameVisibleShape(db: DatabaseSync, owner: string) {
  assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 1)
  assert.equal(db.prepare("PRAGMA quick_check(1)").get()?.quick_check, "ok")
  assert.deepEqual(db.prepare("SELECT owner,version FROM metadata").all().map(row => [row.owner, row.version]), [[owner, 1]])
  assert.deepEqual(db.prepare("PRAGMA table_info(operations)").all().map(row => row.name),
    ["authority", "owner", "sid", "kind", "request_key", "digest", "state", "outcome", "native_id"])
}

async function rejected(name: string, alter: (db: DatabaseSync) => void) {
  const session = await account()
  const draft = await f.as(session, p => f.store().create(p, createInput()))
  const file = f.file(session.owner)
  const db = new DatabaseSync(file)
  try { alter(db); assertSameVisibleShape(db, session.owner) } finally { db.close() }
  const beforeState = snapshot(f.root)
  preserveWitness(name + "-rejected-before", { visibleVersion: 1, ownerMatches: true, beforeState }, file)
  const get = await f.request(session, "/drafts/" + draft.draftId)
  assert.equal(get.status, 503)
  assert.equal((await get.json()).error.code, "DEPENDENCY_UNAVAILABLE")
  assert.deepEqual(snapshot(f.root), beforeState)
  const mutation = await f.request(session, "/drafts", "POST", createInput())
  assert.equal(mutation.status, 503)
  assert.equal((await mutation.json()).error.code, "DEPENDENCY_UNAVAILABLE")
  const afterState = snapshot(f.root)
  assert.deepEqual(afterState, beforeState)
  preserveWitness(name + "-rejected-after", { getStatus: get.status, mutationStatus: mutation.status, afterState }, file)
}

function replaceOperations(db: DatabaseSync, ddl: string) {
  db.exec("BEGIN IMMEDIATE; ALTER TABLE operations RENAME TO original_operations")
  try {
    db.exec(ddl)
    db.exec("INSERT INTO operations SELECT * FROM original_operations; DROP TABLE original_operations; COMMIT")
  } catch (error) { db.exec("ROLLBACK"); throw error }
}

test("exact old producer schema1 remains readable and mutable without a migration", async () => {
  const session = await account()
  const file = f.file(session.owner)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, Buffer.alloc(0), { flag: "wx", mode: 0o600 })
  const normalized = normalizeDraft(createInput().authoredShowJson, policy)
  const id = key()
  const db = new DatabaseSync(file)
  try {
    db.exec("PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE")
    db.exec(legacyTableSql.join(";\n") + ";")
    db.prepare("INSERT INTO metadata(owner,version) VALUES(?,1)").run(session.owner)
    db.prepare("INSERT INTO drafts(id,owner,revision,authored,summary,locale) VALUES(?,?,1,?,?,?)")
      .run(id, session.owner, normalized.authoredShowJson, canonicalJson(normalized.summary), "en")
    db.exec("PRAGMA user_version=1; COMMIT")
    assertSameVisibleShape(db, session.owner)
  } finally { db.close() }
  const beforeState = snapshot(f.root)
  const get = await f.request(session, "/drafts/" + id)
  assert.equal(get.status, 200)
  assert.equal((await get.json()).data.authoredShowJson, normalized.authoredShowJson)
  assert.deepEqual(snapshot(f.root), beforeState)
  assert.equal((await f.request(session, "/drafts", "POST", createInput())).status, 201)
})

test("same columns/version/owner without the operations PK are preserved and denied", async () => {
  const original = legacyTableSql.find(sql => sql.startsWith("CREATE TABLE operations"))
  assert.ok(original)
  const weaker = original.replace(/,\n\s+PRIMARY KEY\([^)]+\)/u, "")
  assert.notEqual(weaker, original)
  await rejected("missing-operations-pk", db => replaceOperations(db, weaker))
})

test("same columns/version/owner without native_id IS NULL are preserved and denied", async () => {
  const original = legacyTableSql.find(sql => sql.startsWith("CREATE TABLE operations"))
  assert.ok(original)
  const weaker = original.replace(" CHECK(native_id IS NULL)", "")
  assert.notEqual(weaker, original)
  await rejected("missing-native-null-check", db => replaceOperations(db, weaker))
})

test("unexpected mutating trigger is rejected before it can delete a private draft", async () => {
  await rejected("unexpected-mutating-trigger", db => {
    db.exec("CREATE TRIGGER unexpected_delete AFTER INSERT ON operations BEGIN DELETE FROM drafts; END")
  })
})

test("unexpected view or index is preserved and rejected as an unknown object", async () => {
  await rejected("unexpected-view", db => db.exec("CREATE VIEW unexpected_view AS SELECT id FROM drafts"))
  await rejected("unexpected-index", db => db.exec("CREATE INDEX unexpected_index ON drafts(owner)"))
})
