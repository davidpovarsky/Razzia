import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { stagePackageGame } from "../packages/game-stage"
import { computeCanonicalBaseDigest } from "../../core/index"
import {
  makeNativeFixture,
  nativeInput,
  richNativeExtras,
  removeNativeFixture,
} from "./native-binding-fixture"

describe("R2 production package-stage opaque adapter contract", () => {
  let previousConfig: string | undefined
  let previousAccounts: string | undefined
  beforeEach(() => {
    previousConfig = process.env.CONFIG_PATH
    previousAccounts = process.env.TADAZZ_ACCOUNTS_ENABLED
  })
  afterEach(() => {
    if (previousConfig === undefined) delete process.env.CONFIG_PATH
    else process.env.CONFIG_PATH = previousConfig
    if (previousAccounts === undefined)
      delete process.env.TADAZZ_ACCOUNTS_ENABLED
    else process.env.TADAZZ_ACCOUNTS_ENABLED = previousAccounts
  })
  it("stages a real enhanced game with the supported Map-only base adapter", () => {
    const { root, descriptor } = makeNativeFixture("media")
    try {
      const stagingRoot = path.join(root, "package-stage-r2")
      const quizz = nativeInput("R2 actual production stager")
      const extras = richNativeExtras("temporary", quizz)
      const input = { bundleVersion: 1, quizz, extras }
      const unchangedInput = structuredClone(input)
      const result = stagePackageGame(input, stagingRoot)
      expect(input).toStrictEqual(unchangedInput)
      expect(result.files).toHaveLength(2)
      expect(fs.existsSync(path.join(stagingRoot, "quizz"))).toBe(false)
      const baseFile = result.files.find(
        (file) => file.relative === `quizz/${result.quizId}.json`,
      )!
      const extrasFile = result.files.find(
        (file) => file.relative === `extensions/quizzes/${result.quizId}.json`,
      )!
      const { id, ...storedPayload } = JSON.parse(
        baseFile.bytes.toString("utf8"),
      )
      const storedExtras = JSON.parse(extrasFile.bytes.toString("utf8"))
      expect(id).toBe(result.quizId)
      expect(storedPayload).toStrictEqual(quizz)
      expect(storedExtras.quizId).toBe(result.quizId)
      expect(storedExtras.schemaVersion).toBe(2)
      expect(storedExtras.revision).toBe(1)
      expect(result.baseDigest).toBe(computeCanonicalBaseDigest(storedPayload))
      expect(storedExtras.baseDigest).toBe(result.baseDigest)
      expect(storedExtras.authoring).toStrictEqual(extras.authoring)
      expect(storedExtras.scenes).toStrictEqual(extras.scenes)
      expect(storedExtras.audio).toStrictEqual(extras.audio)
      expect(storedExtras.mediaCatalog).toStrictEqual(extras.mediaCatalog)
      for (const key of ["defaults", "teams", "roster"])
        expect(storedExtras[key]).toStrictEqual(
          extras[key as keyof typeof extras],
        )
      expect(Object.values(storedExtras.perQuestion)).toStrictEqual(
        Object.values(extras.perQuestion),
      )
      expect(Object.keys(storedExtras).sort()).toStrictEqual(
        Object.keys(extras).sort(),
      )
      expect(
        fs
          .readdirSync(path.join(stagingRoot, "extensions/quizzes/.journal"))
          .filter((file) => file.endsWith(".journal.json")),
      ).toHaveLength(0)
    } finally {
      removeNativeFixture(root, descriptor.token)
    }
  })
})
