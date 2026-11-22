import assert from "node:assert/strict"
import test from "node:test"
import { computeCanonicalBaseDigest as digest } from "../../src/core/digest.ts"
import { detachMediaFromShowData as detach } from "../../src/core/card-media-references.ts"

const quizId = "synthetic-quiz"
const logical = {
  subject: "Synthetic media fixture",
  questions: [
    {
      question: "Choose",
      answers: ["A", "B"],
      media: { type: "image", url: "/media/hero.png" },
    },
  ],
}
const withoutMedia = structuredClone(logical)
delete withoutMedia.questions[0].media

for (const schemaVersion of [1, 2]) {
  for (const representation of [
    "logical",
    "stored-logical-digest",
    "stored-full-digest",
  ]) {
    test(`V${schemaVersion} detach preserves binding: ${representation}`, () => {
      const base =
        representation === "logical" ? logical : { id: quizId, ...logical }
      const includeId = representation === "stored-full-digest"
      const extras = {
        schemaVersion,
        quizId,
        baseDigest: digest(includeId ? base : logical),
        perQuestion: {},
      }
      const before = structuredClone({ base, extras })
      const result = detach("hero.png", base, extras)
      assert.equal(result.modified, true)
      assert.equal(result.quizz.questions[0].media, undefined)
      assert.equal(
        result.extras.baseDigest,
        digest(includeId ? { id: quizId, ...withoutMedia } : withoutMedia),
      )
      assert.deepEqual({ base, extras }, before)
    })
  }
}

for (const [label, base, extras] of [
  [
    "stale digest",
    { id: quizId, ...logical },
    { schemaVersion: 2, quizId, baseDigest: "a".repeat(64) },
  ],
  [
    "foreign identity",
    { id: "foreign", ...logical },
    { schemaVersion: 2, quizId, baseDigest: digest(logical) },
  ],
  [
    "foreign identity with full digest",
    { id: "foreign", ...logical },
    {
      schemaVersion: 2,
      quizId,
      baseDigest: digest({ id: "foreign", ...logical }),
    },
  ],
  ["missing digest", logical, { schemaVersion: 2, quizId }],
  [
    "unsupported schema",
    logical,
    { schemaVersion: 3, quizId, baseDigest: digest(logical) },
  ],
]) {
  test(`does not rebind ${label}`, () => {
    const result = detach("hero.png", base, extras)
    assert.equal(result.modified, true)
    assert.equal(result.extras.baseDigest, extras.baseDigest)
  })
}

test("sidecar-only detach and unrelated media preserve original digest", () => {
  const extras = {
    schemaVersion: 2,
    quizId,
    baseDigest: "b".repeat(64),
    perQuestion: { q: { answerVisuals: [{ url: "/media/side.png" }] } },
  }
  const result = detach("side.png", withoutMedia, extras)
  assert.equal(result.modified, true)
  assert.equal(result.extras.baseDigest, extras.baseDigest)
  assert.deepEqual(result.extras.perQuestion.q.answerVisuals, [])
  assert.equal(detach("absent.png", logical, extras).modified, false)
})

test("legacy quiz with no sidecar can still detach media", () => {
  const result = detach("hero.png", logical, null)
  assert.equal(result.modified, true)
  assert.equal(result.extras, null)
  assert.equal(result.quizz.questions[0].media, undefined)
})
