import assert from "node:assert/strict"
import { test } from "node:test"
import { createHash } from "node:crypto"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  lstatSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { authoredFixture } from "../../src/core/show-library/preview-fixtures.ts"
import {
  tadaShowV1Schema,
  type TadaShowV1,
} from "../../src/core/show-authoring-schema.ts"
import { authoredShowToNativeBundleDraft } from "../../src/core/show-authoring-convert.ts"
import { normalizeApplicationPreviewDraft } from "../../src/core/show-library/application-preview-input.ts"
import {
  readAccountPreviewSource,
  readAccountPreviewAssets,
} from "../../src/server/api/account-preview-source.ts"
import { installAccountPreviewBuiltinAssets } from "../../src/server/api/account-preview-builtins.ts"
import {
  createBuiltinAssetResolver,
  type BuiltinPublicAssetPin,
} from "../../src/mcp-app/native-host/builtin-asset-policy.ts"
import { REVIEWED_BUILTIN_ASSETS } from "../../src/mcp-app/native-host/reviewed-builtin-assets.ts"

const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
const publicOrigin = "https://tadazz.com"
const picked = REVIEWED_BUILTIN_ASSETS.filter(
  (asset) =>
    asset.label === "purple" ||
    asset.purpose === "answer-image" ||
    asset.assetId === "classic-voting" ||
    asset.assetId === "classic-backdrop",
)
const find = (id: string) => {
  const value = picked.find((entry) => entry.assetId === id)
  assert(value)

  return value
}
const purple = find("tadazz-reference-purple-background")
const pictures = picked.filter((entry) => entry.purpose === "answer-image")
assert.equal(pictures.length, 5)
const url = (entry: { readonly url: string }) => publicOrigin + entry.url
const context = { role: "spectator", locale: "en", reducedMotion: true }

function authored(): TadaShowV1 {
  const base = tadaShowV1Schema.parse(authoredFixture(5, 2))

  return tadaShowV1Schema.parse({
    ...base,
    defaults: {
      ...base.defaults,
      tadazzBackground: {
        mode: "static",
        staticUrl: url(purple),
        fit: "cover",
      },
      showTheme: {
        id: "tadazz-classic",
        version: "1.0.0",
        overrides: {
          audio: {
            answersMusic: {
              volume: 0.2,
              mediaUrl: url(find("classic-voting")),
            },
          },
        },
      },
    },
    cards: base.cards.map((card) =>
      card.kind === "quiz" || card.kind === "survey"
        ? {
            ...card,
            answers: card.answers.map((answer, index) => ({
              ...answer,
              display: "both",
              imageUrl: url(pictures[index]),
              alt: `Approved picture ${index + 1}`,
            })),
          }
        : card,
    ),
  })
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "tadazz-account-public-preview-"))
  const owner = join(root, "owner")
  const publicRoot = join(root, "public")
  mkdirSync(join(owner, "quizz"), { recursive: true })
  mkdirSync(join(owner, "extensions/quizzes"), { recursive: true })
  const pins = new Map<string, BuiltinPublicAssetPin>()
  const original = new Map<string, Buffer>()
  for (const entry of picked) {
    const source = resolve(
      import.meta.dirname,
      "../../../packages/web/public",
      entry.url.slice(1),
    )
    const bytes = readFileSync(source)
    assert.equal(bytes.length, entry.bytes)
    assert.equal(digest(bytes), entry.sha256)
    const pin = {
      path: `packages/web/public${entry.url}`,
      sha256: entry.sha256,
      bytes: entry.bytes,
    }
    pins.set(pin.path, pin)
    original.set(pin.path, bytes)
    const target = join(publicRoot, entry.url.slice(1))
    mkdirSync(resolve(target, ".."), { recursive: true })
    writeFileSync(target, bytes)
  }
  let enabled = true
  const authority = createBuiltinAssetResolver({
    origin: publicOrigin,
    publicAssets: [...pins.values()],
    verifyCurrentAsset(pin) {
      if (!enabled || !pins.has(pin.path)) {
        return false
      }

      const file = join(
        publicRoot,
        pin.path.slice("packages/web/public/".length),
      )

      try {
        const info = lstatSync(file)

        if (!info.isFile() || info.isSymbolicLink()) {
          return false
        }

        const bytes = readFileSync(file)

        return bytes.length === pin.bytes && digest(bytes) === pin.sha256
      } catch {
        return false
      }
    },
  })
  const getPath = (part = "") => join(owner, part)
  const baseFile = getPath("quizz/source.json")
  const sideFile = getPath("extensions/quizzes/owned-game.json")
  const write = (show: TadaShowV1) => {
    const compiled = authoredShowToNativeBundleDraft(show, "owned-game")
    assert(compiled.bundleDraft)
    writeFileSync(
      baseFile,
      JSON.stringify({ id: "owned-game", ...compiled.bundleDraft.quizz }),
    )
    writeFileSync(sideFile, JSON.stringify(compiled.bundleDraft.extras))
  }
  write(authored())

  return {
    root,
    publicRoot,
    authority,
    getPath,
    write,
    setEnabled: (value: boolean) => {
      enabled = value
    },
    snapshot: () =>
      Buffer.concat([readFileSync(baseFile), readFileSync(sideFile)]),
    close: () => rmSync(root, { recursive: true, force: true }),
  }
}

test("account preview admits exact reviewed native public bytes without rewriting saved source", () => {
  const f = fixture()

  try {
    const before = f.snapshot()
    const result = readAccountPreviewSource(f, "owned-game", f.authority)
    assert.equal(result.source.immutableRevision, digest(before))
    assert.equal(result.assets.length, 7)
    const parsed = normalizeApplicationPreviewDraft(
      { source: result.source, show: result.show, assets: result.assets },
      context,
    )
    assert.equal(parsed.show.defaults?.tadazzBackground?.staticUrl, url(purple))
    assert.equal(
      parsed.show.defaults.showTheme?.overrides.audio?.answersMusic?.mediaUrl,
      url(find("classic-voting")),
    )
    const [card] = parsed.show.cards
    assert(card.kind === "quiz" || card.kind === "survey")
    assert.deepEqual(
      card.answers.map((answer) => answer.imageUrl),
      pictures.map(url),
    )
    assert.deepEqual(f.snapshot(), before)
    assert.deepEqual(
      readAccountPreviewSource(f, "owned-game", f.authority),
      result,
    )
  } finally {
    f.close()
  }
})

test("account public preview fails closed without authority, after revocation, or after asset-byte change", () => {
  const f = fixture()

  try {
    assert.throws(() => readAccountPreviewSource(f, "owned-game"))
    const before = f.snapshot()
    f.setEnabled(false)
    assert.throws(() => readAccountPreviewSource(f, "owned-game", f.authority))
    f.setEnabled(true)
    const file = join(f.publicRoot, purple.url.slice(1))
    const bytes = readFileSync(file)
    const changed = Buffer.from(bytes)
    changed[0] ^= 1
    writeFileSync(file, changed)
    assert.throws(() => readAccountPreviewSource(f, "owned-game", f.authority))
    writeFileSync(file, bytes)
    assert.equal(
      readAccountPreviewSource(f, "owned-game", f.authority).source
        .immutableRevision,
      digest(before),
    )
    assert.deepEqual(f.snapshot(), before)
  } finally {
    f.close()
  }
})

test("account preview rejects foreign origin, path lookalikes, wrong field purpose and wrong native family", () => {
  const f = fixture()

  try {
    const variants = [
      url(purple).replace(publicOrigin, "https://other.invalid"),
      `${url(purple)}?copy=1`,
      `${url(purple)}#fragment`,
      `${publicOrigin}/unreviewed.webp`,
    ]
    for (const value of variants) {
      const show = authored()
      assert(show.defaults?.tadazzBackground)
      show.defaults.tadazzBackground.staticUrl = value
      f.write(show)
      assert.throws(() =>
        readAccountPreviewSource(f, "owned-game", f.authority),
      )
    }
    const wrongPurpose = authored()
    const [question] = wrongPurpose.cards
    assert(question.kind === "quiz" || question.kind === "survey")
    question.answers[0].imageUrl = url(purple)
    f.write(wrongPurpose)
    assert.throws(() => readAccountPreviewSource(f, "owned-game", f.authority))
    const wrongFamily = authored()
    assert(
      wrongFamily.defaults?.showTheme && wrongFamily.defaults.tadazzBackground,
    )
    wrongFamily.defaults.showTheme.id = "razzia-original"
    wrongFamily.defaults.tadazzBackground.staticUrl = url(
      find("classic-backdrop"),
    )
    f.write(wrongFamily)
    assert.throws(() => readAccountPreviewSource(f, "owned-game", f.authority))
    const wrongField = authored()
    wrongField.cards[0].background = { url: url(purple), fit: "cover" }
    f.write(wrongField)
    assert.throws(() => readAccountPreviewSource(f, "owned-game", f.authority))
  } finally {
    f.close()
  }
})

test("pure application parser requires exact public binding bytes and a referenced approved field", () => {
  const f = fixture()

  try {
    const result = readAccountPreviewSource(f, "owned-game", f.authority)
    const source = {
      source: result.source,
      show: result.show,
      assets: result.assets,
    }
    assert.throws(() =>
      normalizeApplicationPreviewDraft({ ...source, assets: [] }, context),
    )
    assert.throws(() =>
      normalizeApplicationPreviewDraft(
        {
          ...source,
          assets: source.assets.map((asset, index) =>
            index ? asset : { ...asset, sha256: "0".repeat(64) },
          ),
        },
        context,
      ),
    )
    assert.throws(() =>
      normalizeApplicationPreviewDraft(
        {
          ...source,
          assets: source.assets.map((asset, index) =>
            index ? asset : { ...asset, bytes: asset.bytes + 1 },
          ),
        },
        context,
      ),
    )
    const extra = find("classic-backdrop")
    assert.throws(() =>
      normalizeApplicationPreviewDraft(
        {
          ...source,
          assets: [
            ...source.assets,
            { url: url(extra), sha256: extra.sha256, bytes: extra.bytes },
          ],
        },
        context,
      ),
    )
  } finally {
    f.close()
  }
})

test("existing account-owned source and tenant media boundaries are unchanged", () => {
  const f = fixture()

  try {
    assert.throws(() =>
      readAccountPreviewSource(
        { getPath: (part = "") => join(f.root, "other", part) },
        "owned-game",
        f.authority,
      ),
    )
    mkdirSync(f.getPath("media"))
    writeFileSync(f.getPath("media/local.png"), "synthetic tenant bytes")
    assert.equal(readAccountPreviewAssets(f, ["/media/local.png"]).length, 1)
    for (const value of [
      url(purple),
      "/media/../quizz/source.json",
      "/media/%2e%2e.png",
    ]) {
      assert.throws(() => readAccountPreviewAssets(f, [value]))
    }
    assert.throws(() =>
      readAccountPreviewAssets(
        { getPath: (part = "") => join(f.root, "other", part) },
        ["/media/local.png"],
      ),
    )
  } finally {
    f.close()
  }
})

test("trusted account preview authority installation is one-time and has no reset", () => {
  const f = fixture()

  try {
    installAccountPreviewBuiltinAssets(f.authority)
    assert.equal(readAccountPreviewSource(f, "owned-game").assets.length, 7)
    assert.throws(() => installAccountPreviewBuiltinAssets(f.authority))
    f.setEnabled(false)
    assert.throws(() => readAccountPreviewSource(f, "owned-game"))
  } finally {
    f.close()
  }
})
