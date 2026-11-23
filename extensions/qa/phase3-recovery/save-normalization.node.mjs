// Scoped unit tests of the real save method. Schema/journal doubles deliberately
// do not claim Zod, filesystem, crash replay or Linux durability acceptance.
import assert from "node:assert/strict"
import fs from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"
import { SourceTextModule, SyntheticModule } from "node:vm"
import { computeCanonicalBaseDigest as digest } from "../../src/core/digest.ts"
import { createStorageError } from "./save-normalization.fixture.mjs"

const source = stripTypeScriptTypes(
  fs.readFileSync(
    new URL("../../src/server/storage/service.ts", import.meta.url),
    "utf8",
  ),
)

async function fixture(schemaVersion = 2) {
  const calls = []
  const quizz = { subject: "Synthetic", questions: [{}] }
  const raw = { schemaVersion, questionIds: ["q"], baseDigest: digest(quizz) }
  const normalized = {
    ...raw,
    scenes: { opening: { title: "Opening", normalizedDefault: true } },
  }
  const state = {
    result: { success: true, data: normalized },
    existing: null,
    writeError: null,
  }
  const schema = { safeParse: () => state.result }

  const StorageError = createStorageError()

  class RevisionError extends Error {}

  const modules = {
    "http-status-codes": {
      StatusCodes: {
        BAD_REQUEST: 400,
        CONFLICT: 409,
        NOT_FOUND: 404,
        INTERNAL_SERVER_ERROR: 500,
      },
    },
    "@razzia/common/validators/quizz": {
      normalizeLegacyQuizz: undefined,
      quizzValidator: undefined,
    },
    "../../core/index": {
      authoredShowToNativeBundleDraft: undefined,
      computeCanonicalBaseDigest: digest,
      ensureQuestionIds: undefined,
      isEnhancedBundle: undefined,
      isSafeMediaUrl: undefined,
      nextRevision: (value) => value + 1,
      quizExtrasV1Schema: schema,
      quizExtrasV2Schema: schema,
      remapQuestionIds: undefined,
      RevisionConflictError: RevisionError,
      upgradeLegacyExtrasToV2: undefined,
      validateBundleMedia: undefined,
      validateRevision: (current, expected) => ({
        valid: current === expected,
      }),
    },
    "./error": { CompositeStorageError: StorageError },
    "./journal": {
      createStagedJournal: (_path, data) => calls.push(["journal", data]),
      removeJournal: () => calls.push(["remove"]),
    },
    "./recovery-state": { readRecoveryBase: undefined },
    "./sidecar": {
      deleteSidecar: undefined,
      sidecarExists: undefined,
      readSidecar: () => state.existing,
      writeSidecar: (_path, _id, data) => {
        if (state.writeError) {
          throw state.writeError
        }

        calls.push(["sidecar", data])
      },
    },
  }
  const module = new SourceTextModule(source)
  await module.link((specifier) => {
    const values = modules[specifier]
    assert.ok(values, `Unexpected dependency ${specifier}`)

    return new SyntheticModule(
      Object.keys(values),
      function exposeFixtureExports() {
        for (const [key, value] of Object.entries(values)) {
          this.setExport(key, value)
        }
      },
    )
  })
  await module.evaluate()
  const service = new module.namespace.CompositeStorageService({
    getPath: () => "synthetic-only",
    getQuizzById: () => ({ id: "quiz", ...quizz }),
    updateQuizz: (_id, data) => calls.push(["base", data]),
  })
  const save = () =>
    service.saveCompositeQuiz({
      quizId: "quiz",
      expectedRevision: 1,
      quizz,
      extras: raw,
    })

  return { calls, state, raw, normalized, save, RevisionError }
}

for (const version of [1, 2]) {
  test(`V${version} journals and persists normalized schema output without mutating caller`, async () => {
    const { calls, raw, normalized, save } = await fixture(version)
    const before = structuredClone(raw)
    const result = save()
    const persisted = { ...normalized, quizId: "quiz", revision: 1 }
    assert.equal(result.revision, 1)
    assert.deepEqual(
      calls.map(([kind]) => kind),
      ["journal", "base", "sidecar", "remove"],
    )
    assert.deepEqual(calls[0][1].targetExtras, persisted)
    assert.deepEqual(calls[2][1], persisted)
    assert.deepEqual(raw, before)
  })
}

test("question count and digest checks use validated output before writes", async () => {
  const f = await fixture()
  f.normalized.questionIds = []
  assert.throws(f.save, (error) => error.status === 400)
  assert.deepEqual(f.calls, [])
  f.normalized.questionIds = ["q"]
  f.normalized.baseDigest = "a".repeat(64)
  assert.throws(f.save, (error) => error.status === 409)
  assert.deepEqual(f.calls, [])
})

test("schema rejection and revision conflict retain no-write barriers", async () => {
  const f = await fixture()
  const valid = f.state.result
  f.state.result = { success: false, error: { issues: ["invalid"] } }
  assert.throws(f.save, (error) => error.status === 400)
  assert.deepEqual(f.calls, [])
  f.state.result = valid
  f.state.existing = { revision: 9 }
  assert.throws(f.save, f.RevisionError)
  assert.deepEqual(f.calls, [])
})

test("failed sidecar write leaves normalized recovery intent in place", async () => {
  const f = await fixture()
  f.state.writeError = new Error("injected write failure")
  assert.throws(f.save, (error) => error.status === 500)
  assert.deepEqual(
    f.calls.map(([kind]) => kind),
    ["journal", "base"],
  )
  assert.deepEqual(f.calls[0][1].targetExtras.scenes, f.normalized.scenes)
})
