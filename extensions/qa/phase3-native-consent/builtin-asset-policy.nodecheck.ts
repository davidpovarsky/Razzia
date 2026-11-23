import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
  createBuiltinAssetResolver,
  type BuiltinPublicAssetPin,
} from "../../src/mcp-app/native-host/builtin-asset-policy.ts"
import { REVIEWED_BUILTIN_ASSETS } from "../../src/mcp-app/native-host/reviewed-builtin-assets.ts"
import {
  semanticAssetChoiceSchema,
  type SemanticAssetContext,
  type SemanticLocale,
} from "../../src/mcp-app/contracts/semantic-edit.ts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const publicPins = [
  ...new Map(
    REVIEWED_BUILTIN_ASSETS.map((asset) => [
      asset.url,
      {
        path: `packages/web/public${asset.url}`,
        sha256: asset.sha256,
        bytes: asset.bytes,
      },
    ]),
  ).values(),
]
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
function verifySource(pin: BuiltinPublicAssetPin) {
  const bytes = readFileSync(join(root, pin.path))

  return bytes.byteLength === pin.bytes && hash(bytes) === pin.sha256
}
const context = (
  purpose: SemanticAssetContext["purpose"],
  family = "tadazz-classic",
): SemanticAssetContext => ({
  theme: { id: family, version: "1.0.0" },
  purpose,
  operation: "preview",
})
const factory = (verify = verifySource) =>
  createBuiltinAssetResolver({
    origin: "https://tadazz.com",
    publicAssets: publicPins,
    verifyCurrentAsset: verify,
  })

const originalFamilies = [
  "royal-quiz",
  "neon-arcade",
  "retro-tv",
  "magic-storybook",
  "crystal-future",
  "carnival-pop",
  "sports-arena",
  "mystery-noir",
] as const

test("original families admit only their own exact generated PNG backgrounds and WAV audio", () => {
  const assets = factory()
  for (const family of originalFamilies) {
    for (const purpose of ["background", "audio"] as const) {
      const selected = context(purpose, family)
      const choices = assets.listAssets(selected, "en")
      assert.equal(choices.length, purpose === "background" ? 2 : 12)
      assert.equal(
        new Set(choices.map((choice) => choice.ref.assetId)).size,
        choices.length,
      )
      for (const choice of choices) {
        semanticAssetChoiceSchema.parse(choice)
        assert.equal(
          choice.mime,
          purpose === "background" ? "image/png" : "audio/wav",
        )
        assert(
          choice.publicUrl.startsWith(
            `https://tadazz.com/tadazz-show/originals/${family}/`,
          ),
        )
        assert.equal(choice.ref.theme.id, family)
        assert.deepEqual(assets.resolveAsset(choice.ref, selected), {
          ref: choice.ref,
          publicUrl: choice.publicUrl,
        })
        assert.deepEqual(assets.resolveStoredUrl(choice.publicUrl, selected), {
          ref: choice.ref,
          publicUrl: choice.publicUrl,
        })

        // Rebinding the ref to a different theme must not bypass the row's
        // family grant, even when the requested bytes and URL are genuine.
        for (const foreign of [
          "tadazz-classic",
          "razzia-original",
          ...originalFamilies,
        ]) {
          if (foreign === family) {
            continue
          }

          const other = context(purpose, foreign)
          assert.equal(
            assets.resolveStoredUrl(choice.publicUrl, other),
            undefined,
          )
          assert.equal(
            assets.resolveAsset({ ...choice.ref, theme: other.theme }, other),
            undefined,
          )
        }
        for (const wrongPurpose of [
          "background",
          "answer-image",
          "audio",
        ] as const) {
          if (wrongPurpose === purpose) {
            continue
          }

          assert.equal(
            assets.resolveStoredUrl(
              choice.publicUrl,
              context(wrongPurpose, family),
            ),
            undefined,
          )
        }
      }
    }
    assert.deepEqual(
      assets.listAssets(context("answer-image", family), "en"),
      [],
    )
    // Shared intro playback is intrinsic to the platform. It does not extend
    // the semantic port's separate existing-family media grants.
    assert.equal(
      assets.resolveStoredUrl(
        "https://tadazz.com/sounds/answersMusic.mp3",
        context("audio", family),
      ),
      undefined,
    )
    assert.equal(
      assets.resolveStoredUrl(
        "https://tadazz.com/tadazz-show/v4/question-bg.webp",
        context("background", family),
      ),
      undefined,
    )
  }
})

test("original public references preserve version, operation, URL and deployment-byte restrictions", () => {
  const assets = factory()
  for (const family of originalFamilies) {
    for (const purpose of ["background", "audio"] as const) {
      const selected = context(purpose, family)
      const [choice] = assets.listAssets(selected, "he")
      assert(choice)
      for (const operation of [
        "store",
        "preview",
        "json-reference-export",
      ] as const) {
        assert(assets.resolveAsset(choice.ref, { ...selected, operation }))
      }
      assert.equal(
        assets.resolveAsset(choice.ref, { ...selected, operation: "export" }),
        undefined,
      )
      assert.deepEqual(
        assets.listAssets({ ...selected, operation: "export" }, "en"),
        [],
      )
      for (const theme of [
        { id: family, version: "2.0.0" },
        { id: `${family}-foreign`, version: "1.0.0" },
      ]) {
        assert.equal(
          assets.resolveAsset({ ...choice.ref, theme }, { ...selected, theme }),
          undefined,
        )
      }
      assert.equal(
        assets.resolveAsset(
          { ...choice.ref, sha256: "0".repeat(64) },
          selected,
        ),
        undefined,
      )
      for (const url of [
        `${choice.publicUrl}?download=1`,
        `${choice.publicUrl}#fragment`,
        choice.publicUrl.replace("https://", "http://"),
        choice.publicUrl.replace("tadazz.com", "example.invalid"),
        choice.publicUrl.replace(
          `/originals/${family}/`,
          `/originals/${family}/../${family}/`,
        ),
      ]) {
        assert.equal(assets.resolveStoredUrl(url, selected), undefined)
      }
      const pin = publicPins.find(
        (entry) =>
          entry.path ===
          choice.publicUrl.replace("https://tadazz.com", "packages/web/public"),
      )
      assert(pin)
      const verification = { reads: 0 }
      for (const forgedPin of [
        { ...pin, bytes: pin.bytes + 1 },
        { ...pin, sha256: "0".repeat(64) },
      ]) {
        const forged = createBuiltinAssetResolver({
          origin: "https://tadazz.com",
          publicAssets: [forgedPin],
          verifyCurrentAsset: () => {
            verification.reads += 1

            return true
          },
        })
        assert.equal(forged.resolveAsset(choice.ref, selected), undefined)
      }
      assert.equal(verification.reads, 0)
      const changed = factory(() => false)
      assert.equal(changed.resolveAsset(choice.ref, selected), undefined)
      assert.equal(
        changed.resolveStoredUrl(choice.publicUrl, selected),
        undefined,
      )
    }
  }
})

test("reviewed built-ins resolve actual source bytes under both existing native families", () => {
  const assets = factory()
  for (const family of ["tadazz-classic", "razzia-original"]) {
    for (const purpose of ["background", "answer-image", "audio"] as const) {
      const selected = context(purpose, family)
      const list = assets.listAssets(selected, "en")
      assert(list.length > 0 && list.length <= 64)
      assert(Object.isFrozen(list))
      for (const choice of list) {
        semanticAssetChoiceSchema.parse(choice)
        assert.deepEqual(assets.resolveAsset(choice.ref, selected), {
          ref: choice.ref,
          publicUrl: choice.publicUrl,
        })
        assert.deepEqual(assets.resolveStoredUrl(choice.publicUrl, selected), {
          ref: choice.ref,
          publicUrl: choice.publicUrl,
        })
        assert(Object.isFrozen(choice.ref.theme))
        assert(choice.publicUrl.startsWith("https://tadazz.com/"))
      }
    }

    assert.equal(
      assets.listAssets(context("answer-image", family), "en").length,
      5,
    )
    assert(
      assets
        .listAssets(context("background", family), "en")
        .some((choice) => choice.label === "Purple background"),
    )
  }
})

test("family, purpose, exact hash and exact URL bindings reject cross-context input", () => {
  const assets = factory()
  const selected = context("answer-image")
  const [choice] = assets.listAssets(selected, "en")
  assert(choice)
  assert.equal(assets.resolveAsset(choice.ref, context("audio")), undefined)
  assert.equal(
    assets.resolveAsset(choice.ref, context("answer-image", "razzia-original")),
    undefined,
  )
  assert.equal(
    assets.resolveAsset({ ...choice.ref, sha256: "a".repeat(64) }, selected),
    undefined,
  )
  for (const url of [
    `${choice.publicUrl}?download=1`,
    `${choice.publicUrl}#fragment`,
    choice.publicUrl.replace("https://", "http://"),
    choice.publicUrl.replace("tadazz.com", "example.invalid"),
    "/tadazz-show/v4/cards/dog.svg",
    "https://tadazz.com/tadazz-show/v4/cards/../cards/dog.svg",
  ]) {
    assert.equal(assets.resolveStoredUrl(url, selected), undefined)
  }
  assert.equal(
    assets.resolveAsset(choice.ref, {
      ...selected,
      theme: { ...selected.theme, version: "2.0.0" },
    }),
    undefined,
  )
})

test("current public-reference permissions never confer asset-byte export rights", () => {
  let allowed = true,
    reads = 0
  const assets = factory((pin) => {
    reads += 1

    return allowed && verifySource(pin)
  })
  const selected = context("answer-image")
  const [choice] = assets.listAssets(selected, "en")
  assert(choice)
  assert(assets.resolveAsset(choice.ref, { ...selected, operation: "store" }))
  const before = reads
  assert.equal(
    assets.resolveAsset(choice.ref, { ...selected, operation: "export" }),
    undefined,
  )
  assert.deepEqual(
    assets.listAssets({ ...selected, operation: "export" }, "en"),
    [],
  )
  assert.equal(reads, before)
  assert(
    assets.resolveAsset(choice.ref, {
      ...selected,
      operation: "json-reference-export",
    }),
  )
  allowed = false
  assert.equal(assets.resolveAsset(choice.ref, selected), undefined)
  assert.equal(assets.resolveStoredUrl(choice.publicUrl, selected), undefined)
  assert.deepEqual(assets.listAssets(selected, "en"), [])
  assert.equal(
    assets.resolveStoredUrl(choice.publicUrl, {
      ...selected,
      operation: "json-reference-export",
    }),
    undefined,
  )
})

test("JSON reference export revalidates exact reviewed public assets, purpose and family", () => {
  const assets = factory()
  for (const family of ["tadazz-classic", "razzia-original"]) {
    for (const purpose of ["background", "answer-image", "audio"] as const) {
      const selected: SemanticAssetContext = {
        ...context(purpose, family),
        operation: "json-reference-export",
      }
      const list = assets.listAssets(selected, "en")
      assert.deepEqual(list, assets.listAssets(context(purpose, family), "en"))
      for (const choice of list) {
        assert.deepEqual(assets.resolveStoredUrl(choice.publicUrl, selected), {
          ref: choice.ref,
          publicUrl: choice.publicUrl,
        })
        assert.equal(
          assets.resolveStoredUrl(`${choice.publicUrl}?download=1`, selected),
          undefined,
        )
        assert.equal(
          assets.resolveAsset(
            { ...choice.ref, sha256: "0".repeat(64) },
            selected,
          ),
          undefined,
        )
      }
    }
  }
  assert.equal(
    assets.resolveStoredUrl("https://tadazz.com/media/customer.svg", {
      ...context("answer-image"),
      operation: "json-reference-export",
    }),
    undefined,
  )
})

test("changed deployed bytes and a forged manifest cannot reuse an earlier admission", () => {
  const selected = context("answer-image")
  const [source] = factory().listAssets(selected, "en")
  assert(source)
  const pin = publicPins.find((entry) => entry.sha256 === source.ref.sha256)
  assert(pin)
  const temporary = mkdtempSync(join(tmpdir(), "tadazz-built-in-policy-"))

  try {
    const file = join(temporary, "owned.svg")
    copyFileSync(join(root, pin.path), file)
    const assets = factory((entry) => {
      const bytes = readFileSync(file)

      return (
        entry.path === pin.path &&
        bytes.byteLength === entry.bytes &&
        hash(bytes) === entry.sha256
      )
    })
    assert(assets.resolveAsset(source.ref, selected))
    const tampered = readFileSync(file)
    tampered[0] ^= 1
    writeFileSync(file, tampered)
    assert.equal(assets.resolveAsset(source.ref, selected), undefined)
    assert.equal(
      assets.resolveAsset(source.ref, {
        ...selected,
        operation: "json-reference-export",
      }),
      undefined,
    )
    let reads = 0
    const forged = createBuiltinAssetResolver({
      origin: "https://tadazz.com",
      publicAssets: [{ ...pin, sha256: hash(tampered) }],
      verifyCurrentAsset: () => {
        reads += 1

        return true
      },
    })
    assert.equal(forged.resolveAsset(source.ref, selected), undefined)
    assert.equal(reads, 0)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test("bounded discovery localizes the reviewed five pictures and never admits generic SVG", () => {
  const assets = factory()
  const selected = context("answer-image")
  const localeList: SemanticLocale[] = [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "ja",
    "tr",
    "vi",
  ]
  const labels = new Set<string>()
  for (const locale of localeList) {
    const list = assets.listAssets(selected, locale)
    assert.equal(list.length, 5)
    for (const choice of list) {
      semanticAssetChoiceSchema.parse(choice)
      assert.equal(choice.mime, "image/svg+xml")
      assert.equal(choice.label, choice.alt)
      assert(!/[<>]/u.test(choice.label))
    }
    labels.add(list[0].label)
  }
  assert.equal(labels.size, 8)
  assert.deepEqual(
    assets.listAssets(selected, "ja").map((choice) => choice.label),
    ["犬", "点灯夫", "海賊", "仲人", "セラピスト"],
  )
  assert(
    assets
      .listAssets(context("background"), "ja")
      .some((choice) => choice.label === "紫の背景"),
  )
  assert.equal(
    assets.resolveStoredUrl("https://tadazz.com/media/uploaded.svg", selected),
    undefined,
  )
  const [choice] = assets.listAssets(selected, "en")
  assert(choice)
  assert.equal(
    assets.resolveAsset({ ...choice.ref, assetId: "uploaded-svg" }, selected),
    undefined,
  )
})
