/** Run on the isolated Linux candidate with node --import tsx --test this file. */
import assert from "node:assert/strict"
import test from "node:test"
import { computeCanonicalBaseDigest as digest } from "../../src/core/digest.ts"
import { planQuestionImageRepair } from "./external-media-repair.mjs"

const sourceUrl = "https://example.invalid/approved.png"
const targetUrl = "/media/uploaded-owner-image.png"
function input() {
  const quizz = {
    subject: "Synthetic image repair",
    gameMode: "quiz",
    questions: [0, 1].map((index) => ({
      type: "single",
      question: `Question ${index}`,
      answers: ["A", "B"],
      solutions: [index],
      cooldown: 2,
      time: 17,
      media: { type: "image", url: sourceUrl },
      note: sourceUrl,
    })),
  }

  return {
    base: { id: "same-quiz", ...quizz },
    extras: {
      quizId: "same-quiz",
      revision: 7,
      baseDigest: digest(quizz),
      questionIds: ["first", "second"],
      timeline: [
        { id: "opening", kind: "opening", sceneId: "intro" },
        { id: "first-card", kind: "question", questionId: "first" },
      ],
      scenes: { intro: { kind: "opening", durationMs: 5000 } },
      audio: { enabled: true, volume: 0.6 },
      defaults: { leaderboardPolicy: "cardOnly" },
    },
    replacements: [{ sourceUrl, targetUrl }],
  }
}

test("repairs both typed references and preserves all other authored data and inputs", () => {
  const original = input()
  const copy = structuredClone(original)
  const plan = planQuestionImageRepair(original)
  assert.deepEqual(original, copy)
  assert.deepEqual(plan.paths, [
    "questions[0].media.url",
    "questions[1].media.url",
  ])
  assert.equal(plan.mappings[0].references, 2)
  const expected = structuredClone(original.base)
  for (const question of expected.questions) {
    question.media.url = targetUrl
  }
  assert.deepEqual(plan.base, expected)
  assert.equal(plan.payload.expectedRevision, 7)
  assert.equal(plan.payload.extras.revision, 7)
  assert.equal(plan.payload.extras.baseDigest, digest(plan.payload.quizz))
  assert.deepEqual(plan.payload.extras, {
    ...original.extras,
    baseDigest: digest(plan.payload.quizz),
  })
})

test("requires a real current revision and matching quiz/base identity", () => {
  const original = input()
  assert.throws(() => planQuestionImageRepair({ ...original, extras: null }))
  assert.throws(() =>
    planQuestionImageRepair({
      ...original,
      extras: { ...original.extras, revision: 0 },
    }),
  )
  assert.throws(() =>
    planQuestionImageRepair({
      ...original,
      extras: { ...original.extras, quizId: "other" },
    }),
  )
  assert.throws(() =>
    planQuestionImageRepair({
      ...original,
      extras: { ...original.extras, baseDigest: "f".repeat(64) },
    }),
  )
})

test("does not infer image type or alter an audio reference to the same URL", () => {
  for (const type of [undefined, "audio", "video"]) {
    const original = input()
    original.base.questions[0].media.type = type
    const { id: _id, ...logical } = original.base
    original.extras.baseDigest = digest(logical)
    assert.throws(
      () => planQuestionImageRepair(original),
      /explicitly typed question images/u,
    )
  }
})

test("rejects unused, duplicated or non-owned replacement targets", () => {
  const original = input()
  assert.throws(() =>
    planQuestionImageRepair({
      ...original,
      replacements: [{ sourceUrl: `${sourceUrl}?different`, targetUrl }],
    }),
  )
  assert.throws(() =>
    planQuestionImageRepair({
      ...original,
      replacements: [...original.replacements, ...original.replacements],
    }),
  )
  assert.throws(() =>
    planQuestionImageRepair({
      ...original,
      replacements: [
        { sourceUrl, targetUrl: "https://elsewhere.invalid/image.png" },
      ],
    }),
  )
  assert.throws(() =>
    planQuestionImageRepair({
      ...original,
      replacements: [{ sourceUrl, targetUrl: "/media/../other.png" }],
    }),
  )
})
