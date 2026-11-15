import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { timelineQuestionItemSchema } from "@razzia/extensions/core"
import {
  canonicalJson,
  previewIdentityDigest,
  serializePreviewIdentity,
} from "../../contracts/canonical.ts"

test("one browser-compatible serializer binds exact adopted envelope and preserves arrays/content", () => {
  const input = {
    version: 1 as const,
    draftId: "synthetic-draft-identity-01",
    revision: 2,
    normalizedAuthoredContent: { title: "é / ש", cards: ["q2", "q1"], n: -0 },
    identityMap: {
      questions: [
        { authoredKey: "__proto__", previewId: "preview-question-opaque" },
      ],
    },
    compiledPin: {
      portVersion: 2,
      registryVersion: "fixture-only",
      digest: "b".repeat(64),
    },
    assetDigests: [
      { assetId: "z", sha256: "f".repeat(64) },
      { assetId: "a", sha256: "a".repeat(64) },
    ],
  }
  const encoded = serializePreviewIdentity(input)
  assert.equal(
    previewIdentityDigest(input),
    createHash("sha256").update(encoded, "utf8").digest("hex"),
  )
  assert.equal(encoded.includes('"cards":["q2","q1"]'), true)
  assert.equal(encoded.includes('"n":0'), true)
  assert.equal(encoded.includes('"authoredKey":"__proto__"'), true)
  assert.equal(canonicalJson({ b: 1, a: "é" }), canonicalJson({ a: "é", b: 1 }))
  assert.notEqual(
    previewIdentityDigest(input),
    previewIdentityDigest({ ...input, revision: 3 }),
  )
  assert.throws(() =>
    serializePreviewIdentity({
      ...input,
      assetDigests: [input.assetDigests[0]!, input.assetDigests[0]!],
    }),
  )
  assert.throws(() => canonicalJson({ n: Infinity }))
  assert.throws(() => canonicalJson({ n: undefined }))
  assert.throws(() => canonicalJson(Array(2)))
})

test("concrete native-ID boundary: preview-prefixed identities are not persisted UUIDs", () => {
  const valid = timelineQuestionItemSchema.safeParse({
    id: "b5e59ad1-2e1a-4cfa-a699-2b4155e769c8",
    kind: "question",
    questionId: "83a80d37-b8b5-40e7-bd20-994a3a02404b",
  })
  assert.equal(valid.success, true)
  const incompatible = timelineQuestionItemSchema.safeParse({
    id: "preview-card-" + "a".repeat(64),
    kind: "question",
    questionId: "preview-question-" + "b".repeat(64),
  })
  assert.equal(incompatible.success, false)
  // No native schema was changed/cast to make preview-local identities persist.
})
