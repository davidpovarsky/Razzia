import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { quizzValidator } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  createDefaultQuizExtrasV2,
  detachMediaFromShowData,
  type AnyQuizExtras,
} from "@razzia/extensions/core"
import {
  executeMediaDeleteTransaction,
  recoverStartupJournals,
} from "../../src/server/media-library"
import { createStagedJournal } from "../../src/server/storage/journal"
import { CompositeStorageService } from "../../src/server/storage/service"
import { readSidecar } from "../../src/server/storage/sidecar"

function makeTempStorageService(root: string): {
  service: CompositeStorageService
  getPath: (subPath?: string) => string
} {
  const getPath = (subPath = "") => path.join(root, subPath)

  fs.mkdirSync(getPath("quizz"), { recursive: true })
  fs.mkdirSync(getPath("extensions/quizzes"), { recursive: true })

  const findFileById = (quizId: string): string => {
    const files = fs
      .readdirSync(getPath("quizz"))
      .filter((name) => name.endsWith(".json"))
    const match = files.find((name) => {
      const parsed = JSON.parse(
        fs.readFileSync(getPath(`quizz/${name}`), "utf8"),
      ) as { id?: string }

      return parsed.id === quizId
    })

    if (!match) {
      throw new Error(`Quiz ${quizId} not found`)
    }

    return match
  }

  const service = new CompositeStorageService({
    getPath,
    getQuizzById: (quizId: string) => {
      const file = findFileById(quizId)

      return JSON.parse(
        fs.readFileSync(getPath(`quizz/${file}`), "utf8"),
      ) as unknown
    },
    saveQuizz: (data: unknown) => {
      const parsed = quizzValidator.parse(data)
      const id = "QuizTddInvariant_0001"
      const fileName = `tdd-invariant-${id.slice(0, 8)}.json`

      fs.writeFileSync(
        getPath(`quizz/${fileName}`),
        JSON.stringify({ id, ...parsed }, null, 2),
        "utf8",
      )

      return { id }
    },
    updateQuizz: (quizId: string, data: unknown) => {
      const file = findFileById(quizId)
      const parsed = quizzValidator.parse(data)

      fs.writeFileSync(
        getPath(`quizz/${file}`),
        JSON.stringify({ id: quizId, ...parsed }, null, 2),
        "utf8",
      )

      return { id: quizId }
    },
    deleteQuizz: (quizId: string) => {
      const file = findFileById(quizId)

      fs.unlinkSync(getPath(`quizz/${file}`))
    },
  })

  return { service, getPath }
}

function buildQuizInput(subject: string, mediaUrl?: string) {
  return quizzValidator.parse({
    gameMode: "quiz",
    subject,
    questions: [
      {
        type: "single",
        question: `${subject} question?`,
        answers: ["A", "B"],
        solutions: [0],
        cooldown: 5,
        time: 20,
        ...(mediaUrl ? { media: { type: "image", url: mediaUrl } } : {}),
      },
    ],
  })
}

test("saveCompositeQuiz persists schema defaults so raw V2 saves survive crash replay", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p3-tdd-save-"))

  try {
    const { service, getPath } = makeTempStorageService(tmpRoot)
    const rev1Input = buildQuizInput("Raw V2 Rev 1")
    const qId = randomUUID()
    const sceneId = randomUUID()
    const rev1Extras = createDefaultQuizExtrasV2(
      "temp-id",
      [qId],
      computeCanonicalBaseDigest(rev1Input),
    )
    const created = service.createCompositeQuiz({
      quizz: rev1Input,
      extras: rev1Extras,
    })

    // Construct valid raw V2 extras intentionally omitting optional opening scene defaults
    const rev2Input = buildQuizInput("Raw V2 Rev 2")
    const rev2Digest = computeCanonicalBaseDigest(rev2Input)
    const rawRev2Extras: AnyQuizExtras = {
      ...createDefaultQuizExtrasV2(created.quizId, [qId], rev2Digest),
      scenes: {
        [sceneId]: {
          id: sceneId,
          kind: "opening",
          title: "Minimal Omitted Defaults Scene",
          durationMs: 2500,
          advance: "manual",
        },
      },
      timeline: [
        { id: randomUUID(), kind: "question", questionId: qId },
        { id: randomUUID(), kind: "opening", sceneId },
      ],
    }

    const savedRev2 = service.saveCompositeQuiz({
      quizId: created.quizId,
      expectedRevision: 1,
      quizz: rev2Input,
      extras: rawRev2Extras,
    })

    assert.equal(savedRev2.revision, 2)

    const diskSidecarRaw = JSON.parse(
      fs.readFileSync(
        getPath(`extensions/quizzes/${created.quizId}.json`),
        "utf8",
      ),
    ) as unknown
    const parsedSidecar = readSidecar(getPath, created.quizId)

    assert(parsedSidecar !== null)
    assert.equal(
      computeCanonicalBaseDigest(diskSidecarRaw),
      computeCanonicalBaseDigest(parsedSidecar),
      "Saved sidecar on disk must already match schema-normalized readSidecar digest",
    )

    // Simulate rev 3 save crashing after updating base quiz before writing rev 3 sidecar
    const rev3Input = buildQuizInput("Raw V2 Rev 3 Crashed")
    const rev3Extras: AnyQuizExtras = {
      ...parsedSidecar,
      revision: 3,
      baseDigest: computeCanonicalBaseDigest(rev3Input),
    }
    const existingDiskBase = JSON.parse(
      fs.readFileSync(
        getPath(`quizz/${fs.readdirSync(getPath("quizz"))[0]}`),
        "utf8",
      ),
    ) as unknown

    createStagedJournal(getPath, {
      quizId: created.quizId,
      backupBase: existingDiskBase,
      backupExtras: parsedSidecar,
      targetBase: rev3Input,
      targetExtras: rev3Extras,
    })
    fs.writeFileSync(
      getPath(`quizz/${fs.readdirSync(getPath("quizz"))[0]}`),
      JSON.stringify({ id: created.quizId, ...rev3Input }, null, 2),
      "utf8",
    )

    const recovery = recoverStartupJournals({ getPath })

    assert.equal(recovery.status, "recovered")
    assert.equal(recovery.quizRecovery.recoveredCount, 1)

    const after = service.getCompositeQuiz(created.quizId)

    assert.equal(after.digestMatches, true)
    assert.equal(after.extras?.revision, 2)
    assert.equal(after.quizz.subject, "Raw V2 Rev 2")
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test("detachMediaFromShowData updates V1/V2 baseDigest on question media detach and guards invariants", () => {
  const qId = randomUUID()
  const quizId = "QuizDetachInvariant01"
  const logicalWithMedia = buildQuizInput(
    "Media Binding V1/V2",
    "/media/hero.png",
  )
  const storedBaseWithId = { id: quizId, ...logicalWithMedia }
  const initialDigest = computeCanonicalBaseDigest(logicalWithMedia)
  const expectedAfterLogical = buildQuizInput("Media Binding V1/V2")
  const expectedAfterDigest = computeCanonicalBaseDigest(expectedAfterLogical)

  // V1 sidecar (id-stripped logical base on disk)
  const v1Extras = createDefaultQuizExtras(quizId, [qId], initialDigest)
  const v1BeforeJson = JSON.stringify(v1Extras)
  const quizBeforeJson = JSON.stringify(storedBaseWithId)
  const detachedV1 = detachMediaFromShowData(
    "hero.png",
    storedBaseWithId,
    v1Extras,
  )

  assert.equal(detachedV1.modified, true)
  assert.equal(JSON.stringify(v1Extras), v1BeforeJson)
  assert.equal(JSON.stringify(storedBaseWithId), quizBeforeJson)
  assert.equal(detachedV1.extras?.baseDigest, expectedAfterDigest)

  // V2 sidecar (id-stripped logical base + perQuestion + mediaCatalog)
  const v2Extras = createDefaultQuizExtrasV2(quizId, [qId], initialDigest)

  v2Extras.mediaCatalog = [
    { name: "hero.png", url: "/media/hero.png", type: "image", addedAt: 1 },
  ]
  v2Extras.perQuestion[qId] = {
    answerVisuals: [
      { answerIndex: 0, display: "both", url: "/media/hero.png", alt: "Hero" },
    ],
  }
  const detachedV2 = detachMediaFromShowData(
    "hero.png",
    storedBaseWithId,
    v2Extras,
  )

  assert.equal(detachedV2.modified, true)
  assert(detachedV2.extras)
  assert.equal(detachedV2.extras.baseDigest, expectedAfterDigest)
  assert.equal(detachedV2.extras.mediaCatalog?.length, 0)
  assert.equal(detachedV2.extras.perQuestion[qId].answerVisuals?.length, 0)

  // Exact match (no id property on quizz object) also updates cleanly
  const exactQuizzBefore = structuredClone(logicalWithMedia)
  const exactV2 = createDefaultQuizExtrasV2(
    quizId,
    [qId],
    computeCanonicalBaseDigest(exactQuizzBefore),
  )
  const detachedExact = detachMediaFromShowData(
    "hero.png",
    exactQuizzBefore,
    exactV2,
  )

  assert.equal(detachedExact.modified, true)
  assert.equal(detachedExact.extras?.baseDigest, expectedAfterDigest)

  // No rebase when unrelated media requested
  const unrelatedResult = detachMediaFromShowData(
    "unrelated.png",
    storedBaseWithId,
    v2Extras,
  )

  assert.equal(unrelatedResult.modified, false)
  assert.equal(unrelatedResult.extras?.baseDigest, initialDigest)

  // No rebase on sidecar-only media detach
  const sidecarOnlyQuiz = {
    id: quizId,
    ...buildQuizInput("Sidecar Only"),
  }
  const sidecarSentinelDigest = "b".repeat(64)
  const sidecarOnlyExtras = createDefaultQuizExtrasV2(
    quizId,
    [qId],
    sidecarSentinelDigest,
  )

  sidecarOnlyExtras.perQuestion[qId] = {
    answerVisuals: [
      { answerIndex: 0, display: "image", url: "/media/side.png", alt: "S" },
    ],
  }
  const detachedSidecarOnly = detachMediaFromShowData(
    "side.png",
    sidecarOnlyQuiz,
    sidecarOnlyExtras,
  )

  assert.equal(detachedSidecarOnly.modified, true)
  assert.equal(detachedSidecarOnly.extras?.baseDigest, sidecarSentinelDigest)

  // Never launder a previously mismatched original digest
  const mismatchedDigest = "a".repeat(64)
  const mismatchedExtras = createDefaultQuizExtrasV2(
    quizId,
    [qId],
    mismatchedDigest,
  )
  const detachedMismatched = detachMediaFromShowData(
    "hero.png",
    storedBaseWithId,
    mismatchedExtras,
  )

  assert.equal(detachedMismatched.modified, true)
  assert.equal(
    (
      detachedMismatched.quizz.questions as Array<{
        media?: unknown
      }>
    )[0].media,
    undefined,
  )
  assert.equal(detachedMismatched.extras?.baseDigest, mismatchedDigest)

  // Never launder when base id conflicts with extras.quizId
  const foreignIdQuiz = { ...logicalWithMedia, id: "DifferentQuizId_999" }
  const foreignExtras = createDefaultQuizExtrasV2(
    quizId,
    [qId],
    computeCanonicalBaseDigest(logicalWithMedia),
  )
  const detachedForeign = detachMediaFromShowData(
    "hero.png",
    foreignIdQuiz,
    foreignExtras,
  )

  assert.equal(detachedForeign.modified, true)
  assert.equal(detachedForeign.extras?.baseDigest, initialDigest)

  // Never invent baseDigest on partial legacy extras missing baseDigest
  const partialLegacyExtras = {
    schemaVersion: 2 as const,
    perQuestion: {
      [qId]: {
        answerVisuals: [
          {
            answerIndex: 0,
            display: "both" as const,
            url: "/media/hero.png",
            alt: "P",
          },
        ],
      },
    },
  }
  const detachedPartial = detachMediaFromShowData(
    "hero.png",
    storedBaseWithId,
    partialLegacyExtras,
  )

  assert.equal(detachedPartial.modified, true)
  assert.equal(
    (detachedPartial.extras as { baseDigest?: unknown } | null | undefined)
      ?.baseDigest,
    undefined,
  )
})

test("executeMediaDeleteTransaction keeps V1 and V2 getCompositeQuiz().digestMatches === true after base detach", () => {
  for (const schemaVersion of [1, 2] as const) {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), `p3-tdd-media-v${schemaVersion}-`),
    )

    try {
      const { service, getPath } = makeTempStorageService(tmpRoot)
      const qId = randomUUID()
      const input = buildQuizInput(
        `Detach Media Integration V${schemaVersion}`,
        "/media/shared-hero.png",
      )
      const initialDigest = computeCanonicalBaseDigest(input)
      const extras =
        schemaVersion === 1
          ? createDefaultQuizExtras("temp-id", [qId], initialDigest)
          : createDefaultQuizExtrasV2("temp-id", [qId], initialDigest)

      fs.mkdirSync(getPath("media"), { recursive: true })
      fs.writeFileSync(
        getPath("media/shared-hero.png"),
        Buffer.from("PNG_BYTES"),
      )

      const created = service.createCompositeQuiz({ quizz: input, extras })
      const tx = executeMediaDeleteTransaction(getPath, "shared-hero.png", {
        detach: true,
        deleteMediaFn: () => {
          fs.unlinkSync(getPath("media/shared-hero.png"))
        },
      })

      assert.equal(tx.allowed, true, tx.error ?? "media delete refused")
      assert.equal(fs.existsSync(getPath("media/shared-hero.png")), false)

      const fetched = service.getCompositeQuiz(created.quizId)

      assert.equal(fetched.digestMatches, true)
      assert.equal(
        (fetched.quizz.questions as Array<{ media?: unknown }>)[0].media,
        undefined,
      )
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  }
})
