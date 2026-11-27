import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { tadaShowV1Schema } from "../show-authoring-schema"
import {
  showThemeRegistry,
  createShowThemeRegistry,
} from "../show-themes/registry"
import { resolveShowTheme } from "../show-themes/resolve"
import { bundledGalleryThemes } from "../show-themes/bundled-gallery-themes"
import { ORIGINAL_THEME_IDS } from "../show-themes/original-theme-families"
import { normalizeApplicationPreviewDraft } from "./application-preview-input"
import { getPublicDemo, publicDemoCatalogue } from "./public-demo-catalogue"

const originalDemoIds = ORIGINAL_THEME_IDS.filter((id) => id !== "family-mixup")

describe("published gallery games", () => {
  it("binds every gallery slot and every required audience to a real authored game", () => {
    expect(publicDemoCatalogue.map((game) => game.id)).toEqual([
      "great-guessoff",
      "crowd",
      "quiz",
      "story",
      "picture",
      "truth",
      "finale",
      "family",
      "classroom",
      "team",
      "family-mixup",
      ...originalDemoIds,
    ])
    const audiences = new Set(
      publicDemoCatalogue.flatMap((game) => game.audience),
    )
    for (const audience of [
      "Adults",
      "Children",
      "Families",
      "Organisations",
      "Schools",
    ]) {
      expect(audiences.has(audience), audience).toBe(true)
    }
    expect(getPublicDemo("private-customer-game")).toBeUndefined()
  })

  it.each(publicDemoCatalogue)(
    "admits $id as a complete public native preview with no customer data",
    (metadata) => {
      const demo = getPublicDemo(metadata.id)
      expect(demo).toBeDefined()

      if (!demo) {
        throw new Error("Missing public sample")
      }

      const show = tadaShowV1Schema.parse(demo.show)
      expect(show.posterUrl).toBe(demo.metadata.coverUrl)
      const questions = show.cards.filter(
        (card) => card.kind === "quiz" || card.kind === "survey",
      )
      expect(questions).toHaveLength(metadata.questionCount)
      expect(questions.length).toBeGreaterThanOrEqual(5)
      expect(show.cards[0].kind).toBe("opening")
      expect(show.cards.at(-1)?.kind).toBe("closing")
      expect(show.settings).toEqual([])
      expect(show.note).toBeUndefined()
      expect(
        show.cards.some((card) => "note" in card && Boolean(card.note)),
      ).toBe(false)
      const draft = normalizeApplicationPreviewDraft(
        {
          source: {
            kind: "published-demo",
            catalogueId: metadata.id,
            immutableRevision: "a".repeat(64),
          },
          show,
          assets: [],
        },
        { locale: "en", role: "spectator", reducedMotion: true },
      )
      expect(draft.show.defaults?.showTheme?.id).toBe(metadata.themeId)
    },
  )

  it("preserves the legacy catalogue and adds the family flagship plus eight original six-round shows", () => {
    expect(
      publicDemoCatalogue
        .slice(0, 10)
        .reduce((total, item) => total + item.questionCount, 0),
    ).toBe(77)
    expect(publicDemoCatalogue[10]).toMatchObject({
      id: "family-mixup",
      themeId: "family-mixup",
      questionCount: 48,
      coverUrl: "/tadazz-show/family-mixup/poster.webp",
    })
    expect(publicDemoCatalogue.slice(11).map((item) => item.id)).toEqual(
      originalDemoIds,
    )
    expect(
      publicDemoCatalogue.slice(11).every((item) => item.questionCount === 6),
    ).toBe(true)
  })

  it.each(originalDemoIds)(
    "%s has real checkpoints after each third and preserves the public master",
    (id) => {
      const demo = getPublicDemo(id)!
      const show = tadaShowV1Schema.parse(demo.show)
      let answered = 0
      const checkpoints: number[] = []
      const transitions: number[] = []
      for (const card of show.cards) {
        if (card.kind === "quiz" || card.kind === "survey") {
          answered += 1
        }

        if (card.kind === "leaderboard" || card.kind === "answerRecap") {
          checkpoints.push(answered)
        }

        if (card.kind === "transition") {
          transitions.push(answered)
        }
      }
      expect(checkpoints).toEqual([2, 4, 6])
      expect(transitions).toEqual([2, 4])
      expect(new Set(show.cards.map((card) => card.key)).size).toBe(
        show.cards.length,
      )
      expect(demo.metadata.coverUrl).toBe(
        `/tadazz-show/originals/${id}/poster.png`,
      )
      expect(show.defaults?.showTheme?.id).toBe(id)
      expect(show.defaults?.showTheme?.version).toBe("1.0.0")
      demo.show.cards.splice(1, 3)
      demo.show.title = "Private edits"
      expect(getPublicDemo(id)?.show.cards).toHaveLength(13)
      expect(getPublicDemo(id)?.show.title).not.toBe("Private edits")
    },
  )

  it("gives each editor/import caller an independent copy of the public master", () => {
    const first = getPublicDemo("family")

    if (!first) {
      throw new Error("Missing family sample")
    }

    first.show.title = "Private customisation"
    first.show.cards.splice(0, 3)
    const second = getPublicDemo("family")
    expect(second?.show.title).toBe("Family Fiesta")
    expect(second?.show.cards).toHaveLength(12)
  })

  it("uses labelled, real picture assets and preserves the existing Guess-off illustrations", () => {
    for (const id of ["picture", "great-guessoff"]) {
      const demo = getPublicDemo(id)

      if (!demo) {
        throw new Error("Missing illustrated sample")
      }

      const images = demo.show.cards.flatMap((card) =>
        card.kind === "quiz" || card.kind === "survey"
          ? card.answers.filter((answer) => answer.imageUrl)
          : [],
      )
      expect(images.length).toBe(id === "picture" ? 32 : 8)
      for (const answer of images) {
        expect(answer.display).toBe("both")
        expect(answer.alt).toBe(answer.text)
        expect(answer.imageUrl).toMatch(
          /^\/tadazz-show\/(gallery|great-guessoff)\//u,
        )
      }
    }
  })
})

describe("site-wide gallery themes", () => {
  it("makes all nine distinct themes available in every account registry and every game role", () => {
    expect(bundledGalleryThemes).toHaveLength(9)
    expect(
      new Set(bundledGalleryThemes.map((theme) => theme.posterAssetId)).size,
    ).toBe(9)
    expect(
      new Set(bundledGalleryThemes.map((theme) => theme.tokens.background))
        .size,
    ).toBe(9)
    const registry = createShowThemeRegistry()
    expect(registry.list()).toHaveLength(20)
    for (const definition of bundledGalleryThemes) {
      for (const role of ["manager", "player", "spectator"] as const) {
        const theme = resolveShowTheme({
          selection: { id: definition.id, version: "1.0.0", overrides: {} },
          role,
          registry,
        })
        expect(theme.definition.id).toBe(definition.id)
        expect(theme.diagnostics).toEqual([])
      }
      for (const locale of [
        "en",
        "fr",
        "de",
        "es",
        "it",
        "ja",
        "tr",
        "vi",
        "he",
      ] as const) {
        expect(
          definition.localizations?.[locale]?.[definition.nameKey],
        ).toBeTruthy()
        expect(
          definition.localizations?.[locale]?.[definition.descriptionKey],
        ).toBeTruthy()
      }
    }
  })

  it("binds the original artwork to exact deployable bytes", () => {
    const assets = new Map(
      showThemeRegistry
        .list()
        .flatMap((theme) => theme.assets)
        .filter(
          (asset) =>
            asset.url.startsWith("/tadazz-show/gallery/") ||
            asset.url.startsWith("/tadazz-show/great-guessoff/"),
        )
        .map((asset) => [asset.url, asset]),
    )
    expect(assets.size).toBe(30)
    for (const asset of assets.values()) {
      const bytes = readFileSync(
        join(import.meta.dirname, "../../../../packages/web/public", asset.url),
      )
      expect(bytes.byteLength, asset.url).toBe(asset.bytes)
      expect(createHash("sha256").update(bytes).digest("hex"), asset.url).toBe(
        asset.sha256,
      )
    }
  })
})
