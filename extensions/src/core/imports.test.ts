import { describe, expect, it } from "vitest"
import * as RootExports from "@razzia/extensions"
import * as CoreExports from "@razzia/extensions/core"
import * as EditorExports from "@razzia/extensions/editor"
import * as GameplayExports from "@razzia/extensions/gameplay"
import * as LocalesExports from "@razzia/extensions/locales"
import * as MediaExports from "@razzia/extensions/media"
import * as PresentationExports from "@razzia/extensions/presentation"
import * as ServerExports from "@razzia/extensions/server"
import * as TelephonyExports from "@razzia/extensions/telephony"
import * as TestkitExports from "@razzia/extensions/testkit"

describe("Package Subpath Imports & Type Exports", () => {
  it("exports core schemas and utilities from @razzia/extensions/core", () => {
    expect(CoreExports.quizExtrasV1Schema).toBeDefined()
    expect(CoreExports.createDefaultQuizExtras).toBeDefined()
    expect(CoreExports.computeCanonicalBaseDigest).toBeDefined()
    expect(CoreExports.reorderQuestionIds).toBeDefined()
    expect(CoreExports.duplicateQuestion).toBeDefined()
    expect(CoreExports.removeQuestion).toBeDefined()
    expect(CoreExports.remapQuestionIds).toBeDefined()
    expect(CoreExports.validateRevision).toBeDefined()
    expect(CoreExports.extensionStateEnvelopeSchema).toBeDefined()
    expect(CoreExports.extensionCommandSchema).toBeDefined()
  })

  it("re-exports core from root @razzia/extensions", () => {
    expect(RootExports.quizExtrasV1Schema).toBe(CoreExports.quizExtrasV1Schema)
    expect(RootExports.computeCanonicalBaseDigest).toBe(
      CoreExports.computeCanonicalBaseDigest,
    )
  })

  it("resolves all required subpath entrypoints without errors", () => {
    expect(EditorExports).toBeDefined()
    expect(GameplayExports).toBeDefined()
    expect(LocalesExports).toBeDefined()
    expect(MediaExports).toBeDefined()
    expect(PresentationExports).toBeDefined()
    expect(ServerExports).toBeDefined()
    expect(TelephonyExports).toBeDefined()
    expect(TestkitExports).toBeDefined()
  })
})
