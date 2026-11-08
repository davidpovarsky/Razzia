/* oxlint-disable no-script-url -- Malicious URL fixtures must be rejected. */
import { describe, expect, it } from "vitest"
import fs from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"
import {
  createDefaultShowTheme,
  isSafeThemeAssetUrl,
  showThemeSelectionSchema,
  themeOverridesSchema,
  type ThemeOverrides,
} from "./selection"
import { showThemeDefinitionSchema } from "./definition"
import { ShowThemeRegistry, showThemeRegistry } from "./registry"
import { resolveShowTheme } from "./resolve"
import { collectThemeMediaUrls, detachThemeMedia } from "./media"

const classic = () => structuredClone(showThemeRegistry.classic())
const selection = createDefaultShowTheme()

describe("show theme manifest and immutable registry", () => {
  it("registers one real complete Classic with verified bundled asset hashes", () => {
    expect(showThemeRegistry.list()).toHaveLength(1)
    const definition = showThemeRegistry.classic()
    expect(Object.keys(definition.slots)).toHaveLength(15)
    expect(Object.keys(definition.audioEvents)).toHaveLength(16)
    expect(Object.isFrozen(definition.slots.question.variants[0])).toBe(true)
    for (const asset of definition.assets) {
      const bytes = fs.readFileSync(
        join(import.meta.dirname, "../../../../packages/web/public", asset.url),
      )
      expect(bytes.byteLength, asset.url).toBe(asset.bytes)
      expect(createHash("sha256").update(bytes).digest("hex"), asset.url).toBe(
        asset.sha256,
      )
    }
  })

  it.each([
    "missing slot",
    "missing asset",
    "duplicate variant",
    "foreign variant",
    "untrusted renderer",
    "unsupported API",
  ])("rejects %s", (kind) => {
    const value = classic()

    if (kind === "missing slot") {
      delete (value.slots as Partial<typeof value.slots>).question
    }

    if (kind === "missing asset") {
      value.assets = value.assets.filter(
        (a) => a.id !== "classic-opening-video",
      )
    }

    if (kind === "duplicate variant") {
      value.slots.question.variants.push(value.slots.question.variants[0])
    }

    if (kind === "foreign variant") {
      value.slots.question.variants[0].id = "another-theme.question.default"
    }

    if (kind === "untrusted renderer") {
      Object.assign(value, { rendererId: "https://untrusted.example/code.js" })
    }

    if (kind === "unsupported API") {
      Object.assign(value, { rendererApiVersion: 2 })
    }

    expect(showThemeDefinitionSchema.safeParse(value).success).toBe(false)
  })

  it("rejects duplicate versions and supports an independent declarative theme in tests", () => {
    const registry = new ShowThemeRegistry()
    registry.register(classic())
    expect(() => registry.register(classic())).toThrow("Duplicate")
    const synthetic = classic()
    synthetic.id = "test-client"
    synthetic.kind = "declarative"
    for (const entry of [
      ...Object.values(synthetic.slots),
      ...Object.values(synthetic.audioEvents),
    ]) {
      entry.defaultVariantId = entry.defaultVariantId.replace(
        "tadazz-classic.",
        "test-client.",
      )
      for (const variant of entry.variants) {
        variant.id = variant.id.replace("tadazz-classic.", "test-client.")
      }
    }
    for (const cue of Object.values(synthetic.choreographyCues)) {
      cue.variantId = cue.variantId.replace("tadazz-classic.", "test-client.")
    }
    registry.register(synthetic)
    const resolved = resolveShowTheme({
      registry,
      selection: { id: "test-client", version: "1.0.0", overrides: {} },
      role: "manager",
    })
    expect(resolved.definition.id).toBe("test-client")
    expect(resolved.slots.question.id).toBe("test-client.question.default")
    expect(showThemeRegistry.list()).toHaveLength(1)
  })
})

describe("safe deterministic theme resolution", () => {
  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,AA",
    "file:///secret",
    "/media/../secret",
    "/media/%2e%2e/secret",
    "//evil.example/image.png",
    "/tadazz-show/a\\b.png",
    "https://user:password@example.com/image.png",
  ])("rejects unsafe URL %s", (url) => {
    expect(isSafeThemeAssetUrl(url)).toBe(false)
  })

  it("preserves unknown IDs/versions and uses only Classic display fallback", () => {
    const unknown = {
      id: "missing-client-theme",
      version: "3.2.1",
      overrides: {
        slots: {
          question: { variantId: "missing-client-theme.question.custom" },
        },
      },
    }
    const resolved = resolveShowTheme({ selection: unknown, role: "spectator" })
    expect(resolved.requested).toEqual(unknown)
    expect(resolved.definition.id).toBe("tadazz-classic")
    expect(resolved.slots.question.id).toBe("tadazz-classic.question.default")
    expect(resolved.diagnostics).toContainEqual({ code: "unknown-theme" })
  })

  it("applies question/scene then role overrides without mutating the stored show", () => {
    const overrides: ThemeOverrides = {
      slots: { question: { mediaUrl: "/media/show.png" } },
      roles: {
        spectator: { slots: { question: { mediaUrl: "/media/display.png" } } },
      },
    }
    const source = { ...selection, overrides }
    const before = structuredClone(source)
    const scope = {
      themeId: source.id,
      themeVersion: source.version,
      overrides: {
        slots: {
          question: { mediaUrl: "/media/question.png", fit: "contain" },
        },
      },
    }
    const first = resolveShowTheme({
      selection: source,
      scope,
      role: "spectator",
    })
    expect(first.slots.question.mediaUrl).toBe("/media/question.png")
    expect(first.slots.question.fit).toBe("contain")
    expect(
      resolveShowTheme({ selection: source, scope, role: "spectator" }),
    ).toEqual(first)
    expect(source).toEqual(before)
  })

  it("rejects cross-theme scopes, foreign variants and unapproved legacy asset selections", () => {
    const scope = {
      themeId: "another-theme",
      themeVersion: "1.0.0",
      overrides: { slots: { question: { mediaUrl: "/media/foreign.png" } } },
    }
    const value = {
      ...selection,
      overrides: {
        slots: {
          question: {
            variantId: "legacy.curtain",
            mediaUrl: "/sounds/boump.mp3",
          },
        },
      },
    }
    const result = resolveShowTheme({
      selection: value,
      scope,
      role: "manager",
    })
    expect(result.slots.question.id).toBe("tadazz-classic.question.default")
    expect(result.slots.question.mediaUrl).toBeUndefined()
    expect(result.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "incompatible-scope",
        "invalid-variant",
        "disallowed-media",
      ]),
    )
  })

  it("keeps explicit silence, mute and presenter/player audio ownership distinct", () => {
    const selected = {
      ...selection,
      overrides: {
        audio: {
          answersMusic: { muted: true },
          answerSubmitted: { volume: 0 },
        },
      },
    }
    const player = resolveShowTheme({ selection: selected, role: "player" })
    expect(player.audio.answersMusic.silent).toBe(true)
    expect(player.audio.answerSubmitted.volume).toBe(0)
    expect(
      resolveShowTheme({ selection, role: "manager" }).audio.answerSubmitted
        .silent,
    ).toBe(true)
  })

  it("does not accept arbitrary CSS, executable payloads or unknown override keys", () => {
    expect(
      themeOverridesSchema.safeParse({
        slots: { body: { css: "url(javascript:bad)" } },
      }).success,
    ).toBe(false)
    expect(
      showThemeSelectionSchema.safeParse({ ...selection, script: "alert(1)" })
        .success,
    ).toBe(false)
  })

  it("tracks and detaches media for all scopes without losing variants or mute", () => {
    const value: ThemeOverrides = {
      slots: {
        question: {
          mediaUrl: "/media/q.png",
          variantId: "tadazz-classic.question.default",
        },
      },
      roles: {
        spectator: {
          audio: { answersMusic: { mediaUrl: "/media/q.png", muted: true } },
        },
      },
    }
    expect(collectThemeMediaUrls(value)).toEqual(["/media/q.png"])
    const detached = detachThemeMedia(value, "/media/q.png")
    expect(collectThemeMediaUrls(detached)).toEqual([])
    expect(detached.slots?.question?.variantId).toBe(
      "tadazz-classic.question.default",
    )
    expect(detached.roles?.spectator?.audio?.answersMusic?.muted).toBe(true)
    expect(collectThemeMediaUrls(value)).toEqual(["/media/q.png"])
  })
})
