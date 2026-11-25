import fs from "node:fs"
import assert from "node:assert/strict"
import * as native from "/work/packages/socket/src/services/config.ts"
import { CompositeStorageService } from "/work/extensions/src/server/storage/service.ts"
import { computeCanonicalBaseDigest } from "/work/extensions/src/core/index.ts"
import { makeNativeFixture, nativeInput, richNativeExtras, nativeFixtureState, removeNativeFixture } from "/work/extensions/src/server/storage/native-binding-fixture.ts"

const fixture = makeNativeFixture("media")
const receipt: Record<string, unknown> = { executedCommit: "9593f24f287f2e404f387f6359e89453cd8a971e", kind: "actual-native-roundtrip-before-source-fix", state: "STARTED", pid: process.pid }
try {
  const input = nativeInput("R2 actual native exported-bundle roundtrip")
  const service = new CompositeStorageService({ ...native })
  const created = service.createCompositeQuiz({ quizz: input, extras: richNativeExtras("temporary", input) })
  const exported = service.exportEnhancedBundle(created.quizId)
  const unchangedExport = structuredClone(exported)
  const imported = service.importEnhancedBundle(exported)
  const fetched = service.getCompositeQuiz(imported.quizId)
  const { id: storageId, ...payload } = fetched.quizz
  const expectedLogical = computeCanonicalBaseDigest(payload)
  Object.assign(receipt, { created, exported, imported, fetched, storageId, expectedLogical, allPhysicalState: nativeFixtureState(fixture.root) })
  assert.notEqual(imported.quizId, created.quizId)
  assert.equal(storageId, imported.quizId)
  assert.deepEqual(exported, unchangedExport)
  assert.equal(imported.baseDigest, expectedLogical)
  assert.equal(fetched.baseDigest, expectedLogical)
  assert.equal(fetched.digestMatches, true)
  receipt.state = "PASS"
} catch (error) {
  receipt.state = "FAIL"
  receipt.error = error instanceof Error ? error.stack : String(error)
  process.exitCode = 1
} finally {
  fs.writeFileSync("/qa/native-roundtrip-before.json", JSON.stringify(receipt, null, 2))
  removeNativeFixture(fixture.root, fixture.descriptor.token)
}
