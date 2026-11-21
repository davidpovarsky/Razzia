import fs from "node:fs"
import { afterEach, expect, it } from "vitest"
import { CompositeStorageService } from "./service"
import { createRecoveryFixture, removeSyntheticFixture } from "./recovery-fixture"
import { getSidecarFilePath, writeSidecar } from "./sidecar"
import { authoredShowToNativeBundleDraft, nativeBundleToAuthoredShow } from "../../core/show-authoring-convert"
import { authoredFixture } from "../../core/show-library/preview-fixtures"
import { isQuizExtrasV2, quizExtrasV2Schema, type AnyQuizExtras } from "../../core"
import { resolveStageLook } from "../../core/stage-look"
import { ExtensionGameSession } from "../game/session"
import { projectAccountPreviewContent } from "../api/account-preview-source"

const legacyId = "6369bf77-c3d4-40ee-8a67-0476434b562f"
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) removeSyntheticFixture(root)
})
function v2(extras: AnyQuizExtras | null) {
  if (!extras || !isQuizExtrasV2(extras)) throw new Error("Expected authored extras")
  return extras
}

it("reads the original appearance without rewriting files, then persists it through save and both clone formats", () => {
  const fixture = createRecoveryFixture()
  roots.push(fixture.root)
  const original = authoredShowToNativeBundleDraft(authoredFixture(3, 2), legacyId).bundleDraft!
  fixture.injections.updateQuizz(legacyId, { id: legacyId, ...original.quizz })
  writeSidecar(fixture.getPath, legacyId, original.extras)
  const sidecarPath = getSidecarFilePath(fixture.getPath, legacyId)
  const beforeBase = fs.readFileSync(fixture.basePath(legacyId))
  const beforeExtras = fs.readFileSync(sidecarPath)
  const service = new CompositeStorageService(fixture.injections)
  const loaded = service.getCompositeQuiz(legacyId)
  const extras = v2(loaded.extras)
  const preview = projectAccountPreviewContent(fixture.injections, legacyId)
  expect(extras.defaults.stageLook).toBe("guess-off")
  expect(resolveStageLook(preview.show.defaults)).toBe("guess-off")
  expect(new ExtensionGameSession("native-original", original.extras).getStateSnapshot("manager", []).extras.stageLook).toBe("guess-off")
  expect(fs.readFileSync(fixture.basePath(legacyId))).toEqual(beforeBase)
  expect(fs.readFileSync(sidecarPath)).toEqual(beforeExtras)

  for (const payload of [
    { bundleVersion: 1, ...original },
    nativeBundleToAuthoredShow({ quizz: loaded.quizz, extras }),
  ]) {
    const imported = service.importEnhancedBundle(payload)
    expect(imported.quizId).not.toBe(legacyId)
    const reopened = service.exportEnhancedBundle(imported.quizId)
    const copied = v2(reopened.extras)
    expect(copied.defaults.stageLook).toBe("guess-off")
    expect(resolveStageLook(nativeBundleToAuthoredShow(reopened).defaults)).toBe("guess-off")
    expect(new ExtensionGameSession("native-copy", copied).getStateSnapshot("manager", []).extras.stageLook).toBe("guess-off")
    expect(copied.questionIds).toHaveLength(original.extras.questionIds.length)
    expect(copied.questionIds.every(id => !original.extras.questionIds.includes(id))).toBe(true)
    expect(reopened.quizz).toEqual(original.quizz)
  }
  service.saveCompositeQuiz({ quizId: legacyId, expectedRevision: extras.revision, quizz: original.quizz, extras })
  expect(quizExtrasV2Schema.parse(JSON.parse(fs.readFileSync(sidecarPath, "utf8"))).defaults.stageLook).toBe("guess-off")
  expect(v2(service.getCompositeQuiz(legacyId).extras).defaults.stageLook).toBe("guess-off")
  expect(original.extras.defaults.stageLook).toBeUndefined()
})

it("retains an explicit theme appearance opt-out when cloning the legacy show", () => {
  const fixture = createRecoveryFixture()
  roots.push(fixture.root)
  const original = authoredShowToNativeBundleDraft(authoredFixture(3, 1), legacyId).bundleDraft!
  original.extras.defaults.stageLook = "theme"
  const service = new CompositeStorageService(fixture.injections)
  const imported = service.importEnhancedBundle({ bundleVersion: 1, ...original })
  const copy = v2(service.exportEnhancedBundle(imported.quizId).extras)
  expect(copy.defaults.stageLook).toBe("theme")
  expect(new ExtensionGameSession("native-copy", copy).getStateSnapshot("manager", []).extras.stageLook).toBeUndefined()
  expect(nativeBundleToAuthoredShow({ quizz: original.quizz, extras: copy }).defaults?.stageLook).toBe("theme")
})
