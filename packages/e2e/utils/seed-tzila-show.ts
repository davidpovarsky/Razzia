import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { request, type FullConfig } from "@playwright/test"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { computeCanonicalBaseDigest } from "@razzia/extensions/core"
import { preflightShowImport } from "../../../extensions/src/core/show-import-preflight"
import { quizExtrasV2Schema } from "../../../extensions/src/core/studio-timeline-schema"
import { CONFIG_PATH, MANAGER_PASSWORD } from "./constants"

const fixtureRoot = path.resolve(
  import.meta.dirname,
  "../../../extensions/fixtures/tzila-show",
)
const fixturePins = {
  "TZILA_STORY_SHOW.tada.json":
    "bf7398a3e62a7ceedca4794f6a90e9075c49b8a265e969c9a297e22fbf191892",
  "MEDIA_MANIFEST.json":
    "df30d3ccef1f84e994e41ab645ff4e491306a57cb538b6246ec821ec8e902b67",
  "MEDIA_URL_MAP.json":
    "b105426b553d6e8b1a60a6de302624f98a665888985285d1cdc12684c4b0d32d",
} as const
const fixtureTitle = "Build Our Story — Tzila · Two-Round Audience Vote"
const sha256 = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex")
const digestPattern = /^[a-f0-9]{64}$/u
const mediaFilePattern = /^media\/tzila-[A-Za-z0-9_-]+\.png$/u
const mediaUrlPattern = /^\/media\/tzila-[A-Za-z0-9_-]+\.png$/u

const asRecord = (value: unknown): Record<string, unknown> => {
  assert(value !== null && typeof value === "object" && !Array.isArray(value))

  return value as Record<string, unknown>
}

const asArray = (value: unknown): unknown[] => {
  assert(Array.isArray(value))
  const values: unknown[] = value

  return values
}

const asString = (value: unknown): string => {
  assert(typeof value === "string")

  return value
}

const matchingString = (value: unknown, pattern: RegExp): string => {
  const result = asString(value)
  assert.match(result, pattern)

  return result
}

const positiveInteger = (value: unknown): number => {
  assert(typeof value === "number" && Number.isInteger(value) && value > 0)

  return value
}

const parseInventory = (value: unknown) => {
  const manifest = asRecord(value)
  assert.equal(manifest.schema, "tada-media-manifest-v1")
  assert.equal(manifest.uniqueImages, 40)
  assert.equal(manifest.questions, 10)
  assert.equal(manifest.choicesPerQuestion, 5)
  const images = asArray(manifest.images).map((item) => {
    const image = asRecord(item)

    return {
      file: matchingString(image.file, mediaFilePattern),
      localUrl: matchingString(image.localUrl, mediaUrlPattern),
      sha256: matchingString(image.sha256, digestPattern),
      width: positiveInteger(image.width),
      height: positiveInteger(image.height),
    }
  })
  assert.equal(images.length, 40)

  return { images }
}

const parseMediaMap = (value: unknown) => {
  const images = asArray(value).map((item) => {
    const image = asRecord(item)

    return {
      file: matchingString(image.file, mediaFilePattern),
      originalUrl: matchingString(image.originalUrl, mediaUrlPattern),
      newUrl: matchingString(image.newUrl, mediaUrlPattern),
      sha256: matchingString(image.sha256, digestPattern),
    }
  })
  assert.equal(images.length, 40)

  return images
}

const parseQuizList = (value: unknown) =>
  asArray(asRecord(value).quizz).map((item) => {
    const quiz = asRecord(item)

    return { id: asString(quiz.id), subject: asString(quiz.subject) }
  })

const readFixture = (name: keyof typeof fixturePins) => {
  const file = path.join(fixtureRoot, name)
  const stat = fs.lstatSync(file)
  assert(
    stat.isFile() && !stat.isSymbolicLink(),
    `Regular fixture required: ${name}`,
  )
  const raw = fs.readFileSync(file)
  assert.equal(sha256(raw), fixturePins[name], `Tracked fixture drift: ${name}`)

  return raw
}

/** Both legacy browser configs import the same tracked show through the real API. */
export default async function seedTzilaShow(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL
  assert.equal(baseURL, "http://127.0.0.1:3010")
  const ownedRoot = path.resolve(import.meta.dirname, "../.config")
  assert.equal(CONFIG_PATH, ownedRoot)
  for (const directory of [
    ownedRoot,
    path.join(ownedRoot, "quizz"),
    path.join(ownedRoot, "media"),
  ]) {
    const stat = fs.lstatSync(directory)
    assert(
      stat.isDirectory() && !stat.isSymbolicLink(),
      "The isolated E2E directories must be real directories",
    )
  }

  const receipt: Record<string, unknown> = {
    passed: false,
    fixturePins,
    importedThrough: "POST /api/extensions/import",
    questionCount: 10,
    timelineCardCount: 23,
    answerImageReferences: 50,
    distinctImages: 40,
  }
  const evidence = path.join(import.meta.dirname, "../test-results/tzila-seed")
  fs.mkdirSync(evidence, { recursive: true })
  const receiptPath = path.join(
    evidence,
    `${path.basename(config.configFile ?? "tzila")}.json`,
  )
  const api = await request.newContext({ baseURL, timeout: 20_000 })

  try {
    const source = readFixture("TZILA_STORY_SHOW.tada.json")
    const inventory = parseInventory(
      JSON.parse(readFixture("MEDIA_MANIFEST.json").toString("utf8")),
    )
    const mediaMap = parseMediaMap(
      JSON.parse(readFixture("MEDIA_URL_MAP.json").toString("utf8")),
    )
    const preflight = preflightShowImport(source, "TZILA_STORY_SHOW.tada.json")
    assert.equal(preflight.ok, true)
    assert.deepEqual(preflight.issues, [])
    assert(
      preflight.normalizedBundleDraft,
      "Canonical ShowImport must provide the native bundle",
    )
    const bundle = preflight.normalizedBundleDraft
    const expectedQuizz = quizzValidator.parse(bundle.quizz)
    const expectedExtras = quizExtrasV2Schema.parse(bundle.extras)
    assert(preflight.summary, "Canonical ShowImport summary is required")
    assert.equal(preflight.summary.title, fixtureTitle)
    assert.equal(preflight.summary.questionCount, 10)
    assert.equal(preflight.summary.totalCards, 23)
    assert.equal(preflight.summary.surveyCount, 10)
    assert.equal(preflight.summary.answerImageCount, 50)
    assert.equal(expectedQuizz.questions.length, 10)
    assert(
      expectedQuizz.questions.every(
        (question) => question.answers.length === 5,
      ),
    )
    assert.equal(expectedExtras.timeline.length, 23)
    assert.equal(
      expectedExtras.timeline.filter((card) => card.kind === "interimResults")
        .length,
      10,
    )

    const imagesByFile = new Map(
      inventory.images.map((image) => [image.file, image]),
    )
    assert.equal(imagesByFile.size, 40)
    assert.equal(new Set(mediaMap.map((image) => image.file)).size, 40)
    assert.equal(new Set(mediaMap.map((image) => image.newUrl)).size, 40)
    const references = expectedExtras.questionIds.flatMap((id) =>
      (expectedExtras.perQuestion[id]?.answerVisuals ?? []).map((visual) =>
        matchingString(visual.url, mediaUrlPattern),
      ),
    )
    assert.equal(references.length, 50)
    assert.deepEqual(
      [...new Set(references)].sort((left, right) => left.localeCompare(right)),
      mediaMap
        .map((image) => image.newUrl)
        .sort((left, right) => left.localeCompare(right)),
    )

    const mode = await api.get("/api/auth/mode")
    assert.equal(mode.status(), 200)
    assert.deepEqual(await mode.json(), { accountsEnabled: false })
    const login = await api.post("/api/auth/manager", {
      data: { password: MANAGER_PASSWORD },
    })
    assert.equal(login.status(), 200)
    const loginResult = asRecord(await login.json())
    assert.equal(loginResult.role, "manager")
    const token = asString(loginResult.token)
    assert(token.length > 0)
    const headers = { Authorization: `Bearer ${token}` }
    const before = await api.get("/api/quizz", { headers })
    assert.equal(before.status(), 200)
    assert.equal(
      parseQuizList(await before.json()).filter(
        (quiz) => quiz.subject === fixtureTitle,
      ).length,
      0,
    )

    const media = mediaMap.map((mapping) => {
      const image = imagesByFile.get(mapping.file)
      assert(image, "Every URL mapping must name an actual manifest image")
      assert.equal(mapping.originalUrl, image.localUrl)
      assert.equal(mapping.sha256, image.sha256)
      const input = path.join(fixtureRoot, mapping.file)
      const stat = fs.lstatSync(input)
      assert(stat.isFile() && !stat.isSymbolicLink())
      const bytes = fs.readFileSync(input)
      assert.equal(sha256(bytes), image.sha256)
      assert(bytes.length >= 24)
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
      assert.equal(bytes.readUInt32BE(16), image.width)
      assert.equal(bytes.readUInt32BE(20), image.height)
      const target = path.join(ownedRoot, mapping.newUrl.slice(1))
      fs.copyFileSync(input, target, fs.constants.COPYFILE_EXCL)
      assert.equal(sha256(fs.readFileSync(target)), image.sha256)

      return { url: mapping.newUrl, sha256: image.sha256, bytes: bytes.length }
    })
    const importedResponse = await api.post("/api/extensions/import", {
      headers,
      data: bundle,
    })
    assert.equal(importedResponse.status(), 201)
    const importedRecord = asRecord(await importedResponse.json())
    assert.equal(importedRecord.revision, 1)
    const imported = {
      quizId: matchingString(importedRecord.quizId, /^[A-Za-z0-9_-]+$/u),
      baseDigest: matchingString(importedRecord.baseDigest, digestPattern),
    }
    receipt.importedQuizId = imported.quizId

    const compositeResponse = await api.get(
      `/api/extensions/quizzes/${imported.quizId}`,
      { headers },
    )
    assert.equal(compositeResponse.status(), 200)
    const compositeRecord = asRecord(await compositeResponse.json())
    assert.equal(compositeRecord.exists, true)
    const composite = {
      quizId: asString(compositeRecord.quizId),
      extras: quizExtrasV2Schema.parse(compositeRecord.extras),
      baseDigest: matchingString(compositeRecord.baseDigest, digestPattern),
    }
    assert.equal(composite.quizId, imported.quizId)
    assert.equal(composite.baseDigest, imported.baseDigest)
    assert.equal(composite.extras.quizId, imported.quizId)
    assert.equal(composite.extras.revision, 1)
    const baseResponse = await api.get(`/api/quizz/${imported.quizId}`, {
      headers,
    })
    assert.equal(baseResponse.status(), 200)
    const quizz = quizzValidator.parse(await baseResponse.json())
    assert.deepEqual(
      JSON.parse(JSON.stringify(quizz)),
      JSON.parse(JSON.stringify(expectedQuizz)),
    )
    assert.equal(computeCanonicalBaseDigest(quizz), composite.baseDigest)
    assert.equal(composite.extras.baseDigest, composite.baseDigest)
    assert.equal(composite.extras.questionIds.length, 10)
    assert.equal(new Set(composite.extras.questionIds).size, 10)
    const originalQuestionId = new Map(
      composite.extras.questionIds.map((id, index) => [
        id,
        expectedExtras.questionIds[index],
      ]),
    )
    const restoredIdentities = {
      ...composite.extras,
      quizId: expectedExtras.quizId,
      revision: expectedExtras.revision,
      baseDigest: expectedExtras.baseDigest,
      questionIds: expectedExtras.questionIds,
      perQuestion: Object.fromEntries(
        Object.entries(composite.extras.perQuestion).map(([id, data]) => {
          const sourceId = originalQuestionId.get(id)
          assert(
            sourceId,
            "Imported per-question data must retain a known identity",
          )

          return [sourceId, data] as const
        }),
      ),
      timeline: composite.extras.timeline.map((card, index) => ({
        ...card,
        id: expectedExtras.timeline[index]?.id,
        ...(card.kind === "question"
          ? { questionId: originalQuestionId.get(card.questionId) }
          : {}),
      })),
    }
    // Native import allocates fresh quiz/question/timeline IDs; every authored field stays exact.
    assert.deepEqual(
      JSON.parse(JSON.stringify(restoredIdentities)),
      JSON.parse(JSON.stringify(expectedExtras)),
    )
    const after = await api.get("/api/quizz", { headers })
    assert.equal(after.status(), 200)
    assert.deepEqual(
      parseQuizList(await after.json()).filter(
        (quiz) => quiz.subject === fixtureTitle,
      ),
      [{ id: imported.quizId, subject: fixtureTitle }],
    )
    const mediaChecks = await Promise.all(
      media.map(async (image) => {
        const response = await api.get(image.url)
        assert.equal(response.status(), 200)
        assert.match(
          response.headers()["content-type"] ?? "",
          /^image\/png(?:;|$)/u,
        )
        const bytes = await response.body()
        assert.equal(bytes.length, image.bytes)
        assert.equal(sha256(bytes), image.sha256)

        return {
          url: image.url,
          sha256: image.sha256,
          bytes: image.bytes,
          status: response.status(),
        }
      }),
    )
    for (const name of Object.keys(fixturePins) as Array<
      keyof typeof fixturePins
    >) {
      readFixture(name)
    }
    for (const image of mediaMap) {
      assert.equal(
        sha256(fs.readFileSync(path.join(fixtureRoot, image.file))),
        image.sha256,
      )
    }
    receipt.passed = true
    receipt.mediaChecks = mediaChecks
    receipt.importedSemanticsPreserved = true
    receipt.apiCountsVerified = true
    receipt.trackedFixtureBytesUnchanged = true
  } catch (error) {
    receipt.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    await api.dispose()
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  }
}
