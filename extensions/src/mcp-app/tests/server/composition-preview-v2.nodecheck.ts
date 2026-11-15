import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import {
  prepareCompositionPreviewV2,
  getCompositionPreviewDigestContentV2,
} from "../../../core/show-library/composition-preview-v2"
import { withNativePresentationV2 } from "../../../core/show-library/composition-document-v2"
import {
  authoredFixture,
  previewInputFixture,
} from "../../../core/show-library/preview-fixtures"
import {
  canonicalJson,
  previewIdentityDigest,
  serializePreviewIdentity,
  type PreviewIdentityEnvelope,
} from "../../contracts/canonical.ts"
import { createCompositionPreviewIdentityV2 } from "../../server/composition-preview-v2.ts"

function document(theme = "razzia-original", scoped = false) {
  return withNativePresentationV2(
    {
      format: "tadazz-show-composition",
      schemaVersion: 1,
      selection: { id: theme, version: "1.0.0", overrides: {} },
      composition: {
        schemaVersion: 1,
        id: "composition-a",
        version: "1.0.0",
        baseTheme: { id: theme, version: "1.0.0" },
        registry: { id: "candidate-registry", version: "1.0.0" },
        sections: {},
        roles: {},
        scopes: [],
      },
      scopes: scoped
        ? [
            {
              scopeId: "scope-current",
              selection: {
                themeId: theme,
                themeVersion: "1.0.0",
                overrides: {},
              },
            },
          ]
        : [],
    },
    {
      format: "tadazz-native-presentation-settings",
      schemaVersion: 1,
      defaults: {},
      roles: {},
      cards: [],
    },
  )
}
function prepare(revision = 4, theme = "razzia-original") {
  return prepareCompositionPreviewV2(previewInputFixture(), document(theme), {
    draftRevision: revision,
  })
}

test("V2 uses the full genuine prepared D content in the sole MCP digest", () => {
  const prepared = prepare()
  const identity = createCompositionPreviewIdentityV2(prepared, "draft-v2")
  const content = getCompositionPreviewDigestContentV2(prepared)
  assert.equal(identity.version, 2)
  assert.equal(identity.revision, 4)
  assert.deepEqual(identity.compositionPreviewContent, content)
  assert.equal(content.preview.compiledPin, null)
  const encoded = serializePreviewIdentity(identity)
  assert.equal(
    previewIdentityDigest(identity),
    createHash("sha256").update(encoded).digest("hex"),
  )
  assert.notEqual(
    previewIdentityDigest(identity),
    content.compositionDocumentSha256,
  )
  assert.deepEqual(JSON.parse(encoded).compositionPreviewContent, content)
  assert.throws(
    () => createCompositionPreviewIdentityV2({ ...prepared }, "draft-v2"),
    /unprepared/,
  )
  assert.throws(() => createCompositionPreviewIdentityV2(prepared, ""))
})

test("V2 binds revision, role, authored content, selected theme and native settings", () => {
  const input = previewInputFixture()
  const base = document()
  const digest = (prepared: ReturnType<typeof prepare>) =>
    previewIdentityDigest(
      createCompositionPreviewIdentityV2(prepared, "draft-v2"),
    )
  const expected = digest(prepare())
  const variants = [
    prepare(5),
    prepare(4, "tadazz-classic"),
    prepareCompositionPreviewV2(
      { ...input, context: { ...input.context, role: "manager" } },
      base,
      { draftRevision: 4 },
    ),
    prepareCompositionPreviewV2(
      previewInputFixture({ ...authoredFixture(), title: "Changed content" }),
      base,
      { draftRevision: 4 },
    ),
    prepareCompositionPreviewV2(
      input,
      {
        ...base,
        nativePresentation: {
          ...base.nativePresentation,
          cards: [
            {
              authoredCardKey: "question-1",
              theme: { id: "razzia-original", version: "1.0.0" },
              settings: {},
              roles: {},
            },
          ],
        },
      },
      { draftRevision: 4 },
    ),
  ]
  for (const variant of variants) assert.notEqual(digest(variant), expected)
  assert.equal(input.authoredShowJson, previewInputFixture().authoredShowJson)
})

test("V2 retains explicit scope/card associations and rejects guessed or cloned preparation", () => {
  const show = authoredFixture()
  show.cards[0]!.key = "constructor"
  const input = previewInputFixture(show)
  const doc = document("razzia-original", true)
  const prepared = prepareCompositionPreviewV2(input, doc, {
    draftRevision: 4,
    scopeBindings: [
      { scopeId: "scope-current", authoredCardKey: "constructor" },
    ],
  })
  const identity = createCompositionPreviewIdentityV2(prepared, "draft-v2")
  assert.match(
    serializePreviewIdentity(identity),
    /"authoredCardKey":"constructor"/,
  )
  assert.throws(
    () => prepareCompositionPreviewV2(input, doc, { draftRevision: 4 }),
    /scope-association/,
  )
  const other = prepareCompositionPreviewV2(input, doc, {
    draftRevision: 4,
    scopeBindings: [
      { scopeId: "scope-current", authoredCardKey: "question-2" },
    ],
  })
  assert.notEqual(
    previewIdentityDigest(identity),
    previewIdentityDigest(
      createCompositionPreviewIdentityV2(other, "draft-v2"),
    ),
  )
})

test("V2 preserves and orders same-ID native family assets by their exact SHA pair", () => {
  const assets = [
    { assetId: "classic-poster", sha256: "f".repeat(64) },
    { assetId: "classic-poster", sha256: "a".repeat(64) },
  ]
  const prepared = prepare()
  const identity = createCompositionPreviewIdentityV2(
    prepared,
    "draft-v2",
    assets,
  )
  assert.equal(identity.assetDigests.length, 2)
  assert.equal(
    previewIdentityDigest(identity),
    previewIdentityDigest(
      createCompositionPreviewIdentityV2(
        prepared,
        "draft-v2",
        [...assets].reverse(),
      ),
    ),
  )
  assert.notEqual(
    previewIdentityDigest(identity),
    previewIdentityDigest(
      createCompositionPreviewIdentityV2(prepared, "draft-v2", assets.slice(1)),
    ),
  )
  assert.throws(
    () =>
      serializePreviewIdentity({
        ...identity,
        assetDigests: [assets[0]!, assets[0]!],
      }),
    /duplicate/,
  )
  assert.throws(() =>
    createCompositionPreviewIdentityV2(prepared, "draft-v2", [
      { assetId: "invalid", sha256: "bad" },
    ]),
  )
})

test("V1 serialization stays exact and rejects same-ID pairs accepted only by V2", () => {
  const identity: PreviewIdentityEnvelope = {
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
  const expected = canonicalJson({
    ...identity,
    assetDigests: [...identity.assetDigests].reverse(),
  })
  assert.equal(serializePreviewIdentity(identity), expected)
  assert.throws(
    () =>
      serializePreviewIdentity({
        ...identity,
        assetDigests: [
          { assetId: "classic-poster", sha256: "a".repeat(64) },
          { assetId: "classic-poster", sha256: "f".repeat(64) },
        ],
      }),
    /duplicate/,
  )
})
