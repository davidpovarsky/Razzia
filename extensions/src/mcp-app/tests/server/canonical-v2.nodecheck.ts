import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { requireObservedRecord } from "./fixtures.ts"
import {
  previewIdentityDigest,
  serializePreviewIdentity,
  type CompositionPreviewIdentityEnvelopeV2,
  type PreviewIdentityEnvelope,
} from "../../contracts/canonical.ts"

test("V1 bytes stay frozen when the explicit V2 digest input is added", () => {
  const previewIdentity: PreviewIdentityEnvelope = {
    version: 1,
    draftId: "draft-v1",
    revision: 2,
    normalizedAuthoredContent: { cards: ["b", "a"] },
    identityMap: [],
    compiledPin: null,
    assetDigests: [
      { assetId: "z", sha256: "f".repeat(64) },
      { assetId: "a", sha256: "a".repeat(64) },
    ],
  }
  const expected = `{"assetDigests":[{"assetId":"a","sha256":"${"a".repeat(
    64,
  )}"},{"assetId":"z","sha256":"${"f".repeat(
    64,
  )}"}],"compiledPin":null,"draftId":"draft-v1","identityMap":[],"normalizedAuthoredContent":{"cards":["b","a"]},"revision":2,"version":1}`

  assert.equal(serializePreviewIdentity(previewIdentity), expected)
  assert.equal(
    previewIdentityDigest(previewIdentity),
    createHash("sha256").update(expected).digest("hex"),
  )
  assert.throws(
    () =>
      serializePreviewIdentity({
        ...previewIdentity,
        assetDigests: [
          { assetId: "classic-poster", sha256: "a".repeat(64) },
          { assetId: "classic-poster", sha256: "f".repeat(64) },
        ],
      }),
    /duplicate/,
  )
})

function identity(): CompositionPreviewIdentityEnvelopeV2 {
  return {
    version: 2,
    draftId: "draft-v2",
    revision: 4,
    compositionPreviewContent: {
      preview: { authored: ["question-1", "question-2"], compiledPin: null },
      compositionDocumentSha256: "d".repeat(64),
      scopeBindings: [
        { scopeId: "scope-current", authoredCardKey: "constructor" },
      ],
    },
    previewContext: { role: "spectator", locale: "en", reducedMotion: false },
    assetDigests: [
      { assetId: "classic-poster", sha256: "f".repeat(64) },
      { assetId: "classic-poster", sha256: "a".repeat(64) },
    ],
  }
}

test("V2 identity preserves same-ID/different-SHA pairs and rejects duplicate exact pairs", () => {
  const input = identity()
  const original = structuredClone(input)
  const encoded = serializePreviewIdentity(input)
  assert.equal(
    previewIdentityDigest(input),
    createHash("sha256").update(encoded).digest("hex"),
  )
  assert.equal(
    previewIdentityDigest(input),
    previewIdentityDigest({
      ...input,
      assetDigests: [...input.assetDigests].reverse(),
    }),
  )
  assert.notEqual(
    previewIdentityDigest(input),
    previewIdentityDigest({
      ...input,
      assetDigests: input.assetDigests.slice(1),
    }),
  )
  assert.throws(
    () =>
      serializePreviewIdentity({
        ...input,
        assetDigests: [input.assetDigests[0]!, input.assetDigests[0]!],
      }),
    /duplicate/,
  )
  assert.throws(() =>
    serializePreviewIdentity({
      ...input,
      assetDigests: [{ assetId: "bad", sha256: "BAD" }],
    }),
  )
  assert.deepEqual(input, original)
})

test("V2 binds the full returned content, context and revision through the existing digest", () => {
  const input = identity()
  const expected = previewIdentityDigest(input)
  for (const change of [
    { draftId: "other-draft" },
    { revision: 5 },
    { previewContext: { role: "manager", locale: "en", reducedMotion: false } },
    { compositionPreviewContent: "d".repeat(64) },
    {
      compositionPreviewContent: {
        extra: "changed",
        original: input.compositionPreviewContent,
      },
    },
  ]) {
    assert.notEqual(previewIdentityDigest({ ...input, ...change }), expected)
  }
  assert.deepEqual(
    requireObservedRecord(JSON.parse(serializePreviewIdentity(input)))
      .compositionPreviewContent,
    input.compositionPreviewContent,
  )
  assert.throws(() =>
    serializePreviewIdentity({
      ...input,
      compositionPreviewContent: { n: Infinity },
    }),
  )
  assert.throws(() =>
    serializePreviewIdentity({
      ...input,
      compositionPreviewContent: JSON.parse('{"__proto__":{}}'),
    }),
  )
})
