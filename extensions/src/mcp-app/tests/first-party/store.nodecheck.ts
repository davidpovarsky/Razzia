import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import {
  fixture,
  createInput,
  key,
  snapshot,
  type Session,
} from "./fixtures.ts"

type InitializedFValue = Awaited<ReturnType<typeof fixture>>
let f: InitializedFValue | undefined = undefined
function requireInitializedF(): InitializedFValue {
  if (f === undefined) {
    throw new Error("Fixture state f was read before initialization")
  }

  return f
}
before(async () => {
  f = await fixture()
})
after(() => f?.close())
function rows(owner: string) {
  const db = new DatabaseSync(requireInitializedF().file(owner), {
    readOnly: true,
  })

  try {
    return {
      drafts: db.prepare("SELECT * FROM drafts ORDER BY id").all(),
      operations: db
        .prepare("SELECT * FROM operations ORDER BY kind,request_key")
        .all(),
      audit: db.prepare("SELECT * FROM audit ORDER BY seq").all(),
    }
  } finally {
    db.close()
  }
}
async function freshSession(owner: string): Promise<Session> {
  const minted = await requireInitializedF().tokens.mintToken(owner, "manager")
  const claims = await requireInitializedF().tokens.verifyToken(minted.token)

  if (!claims.sid) {
    throw new Error("Expected real sid")
  }

  return { token: minted.token, owner, sid: claims.sid }
}
test("absent GET does not create a private family", async () => {
  const priorSnapshot = snapshot(requireInitializedF().root)
  await assert.rejects(
    requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF().store().get(p, key()),
    ),
    /NOT_FOUND/,
  )
  assert.equal(
    existsSync(
      requireInitializedF().file(requireInitializedF().sessions[0].owner),
    ),
    false,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot)
})
test("real create persists canonical content, outcome and audit; another owner cannot read it", async () => {
  const input = createInput()
  const first = await requireInitializedF().as(
    requireInitializedF().sessions[0],
    (p) => requireInitializedF().store().create(p, input),
  )
  assert.equal(first.revision, 1)
  assert.equal(first.locale, "en")
  assert.deepEqual(
    await requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF().store().get(p, first.draftId),
    ),
    first,
  )
  const priorSnapshot2 = snapshot(requireInitializedF().root)
  await assert.rejects(
    requireInitializedF().as(requireInitializedF().sessions[1], (p) =>
      requireInitializedF().store().get(p, first.draftId),
    ),
    /NOT_FOUND/,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot2)
  const second = await requireInitializedF().as(
    requireInitializedF().sessions[1],
    (p) => requireInitializedF().store().create(p, input),
  )
  assert.notEqual(first.draftId, second.draftId)
  await assert.rejects(
    requireInitializedF().as(requireInitializedF().sessions[1], (p) =>
      requireInitializedF().store().get(p, first.draftId),
    ),
    /NOT_FOUND/,
  )
  for (const session of requireInitializedF().sessions) {
    const data = rows(session.owner)
    assert.equal(data.drafts.length, 1)
    assert.equal(data.operations.length, 1)
    assert.equal(data.audit.length, 1)
    assert.equal(data.operations[0]?.authority, "first-party-session")
    assert.equal(data.operations[0]?.sid, session.sid)
    assert.equal(data.operations[0]?.native_id, null)
  }
})
test("durable create replay survives a fresh repository instance and rejects a reused key/digest", async () => {
  const input = createInput("durable replay")
  const first = await requireInitializedF().as(
    requireInitializedF().sessions[0],
    (p) => requireInitializedF().store().create(p, input),
  )
  const priorRows = rows(requireInitializedF().sessions[0].owner)
  const replay = await requireInitializedF().as(
    requireInitializedF().sessions[0],
    (p) => requireInitializedF().store().create(p, input),
  )
  assert.deepEqual(replay, first)
  assert.deepEqual(rows(requireInitializedF().sessions[0].owner), priorRows)
  await assert.rejects(
    requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF()
        .store()
        .create(p, {
          ...createInput("changed"),
          idempotencyKey: input.idempotencyKey,
        }),
    ),
    /REQUEST_KEY_REUSED/,
  )
  assert.deepEqual(rows(requireInitializedF().sessions[0].owner), priorRows)
})
test("two competing expected revisions have exactly one CAS winner and one durable mutation", async () => {
  const created = await requireInitializedF().as(
    requireInitializedF().sessions[0],
    (p) => requireInitializedF().store().create(p, createInput()),
  )
  const priorRows2 = rows(requireInitializedF().sessions[0].owner)
  const outcomes = await Promise.allSettled(
    ["one", "two"].map((title) =>
      requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
        requireInitializedF()
          .store()
          .replace(p, {
            contractVersion: "0.1.0",
            draftId: created.draftId,
            expectedRevision: 1,
            authoredShowJson: createInput(title).authoredShowJson,
            idempotencyKey: key(),
          }),
      ),
    ),
  )
  assert.equal(
    outcomes.filter((outcome) => outcome.status === "fulfilled").length,
    1,
  )
  const rejected = outcomes.find((outcome) => outcome.status === "rejected")
  assert.ok(rejected?.status === "rejected")
  assert.match(String(rejected.reason), /REVISION_CONFLICT/)
  const data = rows(requireInitializedF().sessions[0].owner)
  assert.equal(data.operations.length, priorRows2.operations.length + 1)
  assert.equal(data.audit.length, priorRows2.audit.length + 1)
  assert.equal(
    (
      await requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
        requireInitializedF().store().get(p, created.draftId),
      )
    ).revision,
    2,
  )
})
test("replace and pending save replay precede current revision; pending never contains a native target", async () => {
  const created = await requireInitializedF().as(
    requireInitializedF().sessions[0],
    (p) => requireInitializedF().store().create(p, createInput()),
  )
  const replace = {
    contractVersion: "0.1.0" as const,
    draftId: created.draftId,
    expectedRevision: 1,
    authoredShowJson: createInput("revision two").authoredShowJson,
    idempotencyKey: key(),
  }
  const second = await requireInitializedF().as(
    requireInitializedF().sessions[0],
    (p) => requireInitializedF().store().replace(p, replace),
  )
  const intent = {
    contractVersion: "0.1.0" as const,
    draftId: created.draftId,
    expectedRevision: 2,
    intent: "createNew" as const,
    idempotencyKey: key(),
  }
  const pending = await requireInitializedF().as(
    requireInitializedF().sessions[0],
    (p) => requireInitializedF().store().prepareSave(p, intent),
  )
  assert.deepEqual(Object.keys(pending).sort(), [
    "authoredDigest",
    "draftId",
    "revision",
    "state",
  ])
  assert.equal(pending.state, "PENDING_C1")
  await requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
    requireInitializedF()
      .store()
      .replace(p, { ...replace, expectedRevision: 2, idempotencyKey: key() }),
  )
  assert.deepEqual(
    await requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF().store().replace(p, replace),
    ),
    second,
  )
  assert.deepEqual(
    await requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF().store().prepareSave(p, intent),
    ),
    pending,
  )
  const operation = rows(
    requireInitializedF().sessions[0].owner,
  ).operations.find((row) => row.request_key === intent.idempotencyKey)
  assert.equal(operation?.state, "PENDING_C1")
  assert.equal(operation?.native_id, null)
  assert.equal(
    (
      await requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
        requireInitializedF().store().get(p, created.draftId),
      )
    ).revision,
    3,
  )
})
test("SQLite audit failure rolls draft and operation back together", async () => {
  const priorRows3 = rows(requireInitializedF().sessions[0].owner)
  const original = DatabaseSync.prototype.prepare
  let attemptedAfterDraftAndOperation = false
  DatabaseSync.prototype.prepare = function prepare(
    this: DatabaseSync,
    sql: string,
  ) {
    if (sql.startsWith("INSERT INTO audit(")) {
      const drafts = original
        .call(this, "SELECT count(*) AS n FROM drafts")
        .get()?.n
      const operations = original
        .call(this, "SELECT count(*) AS n FROM operations")
        .get()?.n
      assert.equal(drafts, priorRows3.drafts.length + 1)
      assert.equal(operations, priorRows3.operations.length + 1)
      attemptedAfterDraftAndOperation = true
      throw new Error("Synthetic in-transaction audit preparation failure")
    }

    return original.call(this, sql)
  }

  try {
    await assert.rejects(
      requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
        requireInitializedF().store().create(p, createInput()),
      ),
      /DEPENDENCY_UNAVAILABLE/,
    )
    assert.equal(attemptedAfterDraftAndOperation, true)
    assert.deepEqual(rows(requireInitializedF().sessions[0].owner), priorRows3)
  } finally {
    DatabaseSync.prototype.prepare = original
  }
})
test("revoke between precommit check and COMMIT hides outcome but honestly preserves committed rows", async () => {
  const session = await freshSession(requireInitializedF().sessions[0].owner)
  const priorRows4 = rows(session.owner)
  const original = DatabaseSync.prototype.exec
  let committed = false
  DatabaseSync.prototype.exec = function exec(this: DatabaseSync, sql: string) {
    if (sql === "COMMIT" && !committed) {
      committed = true
      requireInitializedF().accounts.revokeAccountSession(session.sid)
    }

    return original.call(this, sql)
  }

  try {
    await assert.rejects(
      requireInitializedF().as(session, (p) =>
        requireInitializedF().store().create(p, createInput()),
      ),
      /SCOPE_REQUIRED/,
    )
  } finally {
    DatabaseSync.prototype.exec = original
  }

  assert.equal(committed, true)
  const data = rows(session.owner)
  assert.equal(data.drafts.length, priorRows4.drafts.length + 1)
  assert.equal(data.operations.length, priorRows4.operations.length + 1)
  assert.equal(data.audit.length, priorRows4.audit.length + 1)
  assert.equal(
    (await requireInitializedF().request(session, `/drafts/${key()}`)).status,
    401,
  )
})
test("ordinary GET changes no private-family or native sentinel bytes/mtime/directory membership", async () => {
  const created = await requireInitializedF().as(
    requireInitializedF().sessions[0],
    (p) => requireInitializedF().store().create(p, createInput()),
  )
  const priorSnapshot3 = snapshot(requireInitializedF().root)
  assert.deepEqual(
    await requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF().store().get(p, created.draftId),
    ),
    created,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot3)
})
test("real crashed hot journal is rejected without recovery or any private-family write", async () => {
  const file = requireInitializedF().file(
    requireInitializedF().sessions[1].owner,
  )
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("./hot-journal-worker.mjs", import.meta.url)), file],
    {
      env: { TMPDIR: tmpdir(), TMP: tmpdir(), TEMP: tmpdir() },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  let workerError = ""
  child.stderr.on("data", (data: Buffer) => {
    workerError = (workerError + data.toString()).slice(0, 4096)
  })
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (_code, signal) =>
      signal === "SIGKILL"
        ? resolve()
        : reject(new Error(`Synthetic crash worker failed: ${workerError}`)),
    )
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Synthetic journal worker timeout")),
        10_000,
      )
      child.stdout.once("data", (data) => {
        clearTimeout(timer)
        String(data).includes("READY")
          ? resolve()
          : reject(new Error("Synthetic worker did not reach journal state"))
      })
      child.once("error", (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once("exit", () => {
        clearTimeout(timer)
        reject(new Error("Synthetic worker exited before ready"))
      })
    })
  } finally {
    child.kill("SIGKILL")
    await closed
  }

  const journal = readFileSync(`${file}-journal`)
  assert.equal(journal.subarray(0, 8).toString("hex"), "d9d505f920a163d7")
  const priorSnapshot4 = snapshot(requireInitializedF().root)
  await assert.rejects(
    requireInitializedF().as(requireInitializedF().sessions[1], (p) =>
      requireInitializedF().store().get(p, key()),
    ),
    /DEPENDENCY_UNAVAILABLE/,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot4)
  // No cleanup/repair of this damaged DB. Fixture root is removed only at teardown.
})
test("WAL-mode header, orphan SHM and corrupt private DB are preserved and denied", async () => {
  const file = requireInitializedF().file(
    requireInitializedF().sessions[0].owner,
  )
  writeFileSync(`${file}-shm`, "synthetic-orphan-shm")
  let priorSnapshot5 = snapshot(requireInitializedF().root)
  await assert.rejects(
    requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF().store().get(p, key()),
    ),
    /DEPENDENCY_UNAVAILABLE/,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot5)
  unlinkSync(`${file}-shm`)
  const db = new DatabaseSync(file)
  db.exec(
    "PRAGMA journal_mode=WAL; BEGIN IMMEDIATE; UPDATE drafts SET locale='fr'",
  )

  try {
    assert.equal(existsSync(`${file}-wal`), true)
    assert.equal(existsSync(`${file}-shm`), true)
    priorSnapshot5 = snapshot(requireInitializedF().root)
    await assert.rejects(
      requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
        requireInitializedF().store().get(p, key()),
      ),
      /DEPENDENCY_UNAVAILABLE/,
    )
    assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot5)
  } finally {
    db.exec("ROLLBACK")
    db.close()
  }

  // Main header still advertises WAL even when sidecars have been checkpointed away.
  priorSnapshot5 = snapshot(requireInitializedF().root)
  await assert.rejects(
    requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF().store().get(p, key()),
    ),
    /DEPENDENCY_UNAVAILABLE/,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot5)
  writeFileSync(file, "synthetic corrupt DB preserved")
  priorSnapshot5 = snapshot(requireInitializedF().root)
  await assert.rejects(
    requireInitializedF().as(requireInitializedF().sessions[0], (p) =>
      requireInitializedF().store().get(p, key()),
    ),
    /DEPENDENCY_UNAVAILABLE/,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot5)
})
