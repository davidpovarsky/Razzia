import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { canonicalJson } from "../../contracts/canonical.ts"
import { normalizeDraft } from "../../server/authoring.ts"
import { createInput, fixture, key, policy, snapshot } from "./fixtures.ts"
import { preserveWitness } from "./review-evidence.fixture.ts"

function isObservedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireObservedRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isObservedRecord(value)) {
    throw new Error(`Expected raw object: ${label}`)
  }

  return value
}

interface ObservedFrozenProducer {
  producerCommit: string
  privateLockSha256: string
  modules: Array<{
    fixturePath: string
    bytes: number
    sha256: string
    gitBlobSha1: string
  }>
}

function isObservedFrozenProducer(
  value: unknown,
): value is ObservedFrozenProducer {
  if (
    !isObservedRecord(value) ||
    typeof value.producerCommit !== "string" ||
    typeof value.privateLockSha256 !== "string" ||
    !Array.isArray(value.modules)
  ) {
    return false
  }

  const modules: unknown[] = value.modules

  for (const row of modules) {
    if (
      !isObservedRecord(row) ||
      typeof row.fixturePath !== "string" ||
      typeof row.bytes !== "number" ||
      typeof row.sha256 !== "string" ||
      typeof row.gitBlobSha1 !== "string"
    ) {
      return false
    }
  }

  return true
}

function requireObservedFrozenProducer(value: unknown): ObservedFrozenProducer {
  if (!isObservedFrozenProducer(value)) {
    throw new Error("Expected raw frozen producer provenance")
  }

  return value
}

// Separate observation: this file is intentionally outside *.nodecheck.ts.
// It executes the complete frozen old implementation, never copied DDL alone.
const producerCommit = "ad8955327a56213b3a437379fcc7ccc6e05a261a"
const privateLockSha256 =
  "e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838"
const sha256 = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex")
const frozenRoot = new URL("./ad895-producer/", import.meta.url)
const provenance = requireObservedFrozenProducer(
  JSON.parse(readFileSync(new URL("provenance.json", frozenRoot), "utf8")),
)
assert.equal(provenance.producerCommit, producerCommit)
assert.equal(provenance.privateLockSha256, privateLockSha256)
assert.equal(provenance.modules.length, 3)
assert.deepEqual(
  provenance.modules.map((row: { fixturePath: string }) => row.fixturePath),
  ["first-party/schema.ts", "server/errors.ts", "contracts/schemas.ts"],
)
for (const row of provenance.modules) {
  const raw = readFileSync(new URL(row.fixturePath, frozenRoot))
  assert.equal(raw.length, row.bytes)
  assert.equal(sha256(raw), row.sha256)
  const blob = createHash("sha1")
    .update(`blob ${raw.length}\0`)
    .update(raw)
    .digest("hex")
  assert.equal(blob, row.gitBlobSha1)
}
assert.equal(process.versions.node, "24.22.2")
assert.equal(process.platform, "linux")
assert.equal(process.arch, "arm64")
assert.equal(
  sha256(readFileSync(new URL("../../pnpm-lock.yaml", import.meta.url))),
  privateLockSha256,
)
const require = createRequire(import.meta.url)
assert.equal(
  requireObservedRecord(
    JSON.parse(readFileSync(require.resolve("zod/package.json"), "utf8")),
    "installed zod metadata",
  ).version,
  "4.6.6",
)

// Import only after checking the complete original module bytes/closure.
const oldProducer = await import("./ad895-producer/first-party/schema.ts")
const f = await fixture()

try {
  const [session] = f.sessions
  const file = f.file(session.owner)
  const runtime = {
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  }
  const identity = {
    producerCommit,
    owner: session.owner,
    syntheticRoot: f.root,
    runtime,
    modules: provenance.modules,
    privateLockSha256,
  }
  const nativeOnly = (state: ReturnType<typeof snapshot>) =>
    Object.fromEntries(
      Object.entries(state).filter(([name]) =>
        name.includes("native-sentinels"),
      ),
    )
  const nativeBefore = nativeOnly(snapshot(f.root))
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, Buffer.alloc(0), { flag: "wx", mode: 0o600 })
  const initial = new DatabaseSync(file)

  try {
    // This is the exact ad895 export, with its original transaction/PRAGMAs/DDL.
    oldProducer.initialize(initial, session.owner)
  } finally {
    initial.close()
  }

  for (const suffix of ["-journal", "-wal", "-shm"]) {
    assert.equal(existsSync(file + suffix), false)
  }
  const initializedSha256 = sha256(readFileSync(file))
  preserveWitness(
    "actual-ad895-initialized",
    { ...identity, initializedSha256, cleanSidecarsAbsent: true },
    file,
  )

  // Canonical fixture row only; no DDL, user_version update or journal cleanup.
  // The unmodified old initialize above exclusively creates the entire schema.
  const normalized = normalizeDraft(createInput().authoredShowJson, policy)
  const id = key()
  const seed = new DatabaseSync(file)

  try {
    seed
      .prepare(
        "INSERT INTO drafts(id,owner,revision,authored,summary,locale) VALUES(?,?,1,?,?,?)",
      )
      .run(
        id,
        session.owner,
        normalized.authoredShowJson,
        canonicalJson(normalized.summary),
        "en",
      )
  } finally {
    seed.close()
  }

  const beforeGet = snapshot(f.root)
  preserveWitness("actual-ad895-before-get", { ...identity, beforeGet }, file)
  // Actual JWT HTTP GET passes through the c322 inspector, read-only/query-only.
  const get = await f.request(session, `/drafts/${id}`)
  assert.equal(get.status, 200)
  const first = requireObservedRecord(
    requireObservedRecord(await get.json(), "compatibility GET envelope").data,
    "compatibility GET draft",
  )

  assert.equal(first.draftId, id)
  assert.equal(first.revision, 1)
  assert.equal(first.authoredShowJson, normalized.authoredShowJson)
  const afterGet = snapshot(f.root)
  assert.deepEqual(afterGet, beforeGet)
  preserveWitness(
    "actual-ad895-after-get",
    { ...identity, getStatus: get.status, snapshotEqual: true, afterGet },
    file,
  )

  const update = {
    contractVersion: "0.1.0",
    draftId: id,
    expectedRevision: 1,
    authoredShowJson: createInput("Actual producer compatibility update")
      .authoredShowJson,
    idempotencyKey: key(),
  }
  const put = await f.request(session, `/drafts/${id}`, "PUT", update)
  assert.equal(put.status, 200)
  const changed = requireObservedRecord(
    requireObservedRecord(await put.json(), "compatibility PUT envelope").data,
    "compatibility PUT draft",
  )

  assert.equal(changed.draftId, id)
  assert.equal(changed.revision, 2)
  assert.equal(
    requireObservedRecord(changed.summary, "compatibility PUT summary").title,
    "Actual producer compatibility update",
  )
  const verify = new DatabaseSync(file, { readOnly: true })

  try {
    assert.equal(verify.prepare("PRAGMA user_version").get()?.user_version, 1)
    const counts = ["drafts", "operations", "audit"].map(
      (name) => verify.prepare(`SELECT count(*) AS n FROM ${name}`).get()?.n,
    )
    assert.deepEqual(counts, [1, 1, 1])
    assert.equal(
      verify.prepare("SELECT native_id FROM operations").get()?.native_id,
      null,
    )
  } finally {
    verify.close()
  }

  assert.deepEqual(nativeOnly(snapshot(f.root)), nativeBefore)
  const result = {
    kind: "ACTUAL_AD895_INITIALIZE_COMPATIBILITY_OBSERVATION",
    ...identity,
    initializedSha256,
    getStatus: get.status,
    getBytesMtimeDirectoriesUnchanged: true,
    mutationStatus: put.status,
    revision: changed.revision,
    counts: { drafts: 1, operations: 1, audit: 1 },
    nativeUnchanged: true,
    extraToFirstParty34: true,
    migrationOrRepair: false,
    retainedHotJournalAccessed: false,
  }
  preserveWitness("actual-ad895-result", result, file)
  console.log(JSON.stringify(result))
} finally {
  f.close()
}
