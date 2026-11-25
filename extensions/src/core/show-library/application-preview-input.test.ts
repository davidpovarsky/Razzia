import { describe, expect, it } from "vitest"
import { normalizeApplicationPreviewDraft } from "./application-preview-input"
import {
  assertApplicationPreviewPlan,
  getApplicationPreviewManifest,
  resolveApplicationPreviewPlan,
} from "./application-preview-resolve"
import { getCompiledPreviewManifest } from "./manifest"
import { authoredFixture, previewInputFixture } from "./preview-fixtures"
import { normalizePreviewDraft } from "./identity"
import { resolvePreviewPlan } from "./preview-resolve"
import publicExample from "./approved-public-example.json" with { type: "json" }
import { publicDemoCatalogue, getPublicDemo } from "./public-demo-catalogue"
import { authoredShowToNativeBundleDraft } from "../show-authoring-convert"

const context = { locale: "en", reducedMotion: false, role: "spectator" }
function source() {
  return {
    source: {
      kind: "account-owned",
      quizId: "owned-source",
      immutableRevision: "a".repeat(64),
    },
    show: {
      ...authoredFixture(4, 2),
      cards: authoredFixture(4, 2).cards.map((card) => ({
        ...card,
        background: {
          url: "/media/owned.png",
          fit: "cover",
          position: "center",
          overlayOpacity: 0.3,
        },
      })),
    },
    assets: [{ url: "/media/owned.png", sha256: "b".repeat(64), bytes: 7347 }],
  }
}
describe("account application preview source binding", () => {
  it.each(["authored-recap-marker", "t=1.5,3", "section%3Arecap"])(
    "preserves the exact owner audio fragment %s through preview normalization and native conversion",
    (fragment) => {
      const base = source()
      const url = `/media/recap.mp3#${fragment}`
      const audio = { mode: "custom" as const, url, volume: 1, loop: false }
      const input = {
        ...base,
        show: {
          ...base.show,
          cards: [
            {
              key: "recap",
              kind: "animation",
              preset: "round-recap",
              durationMs: 3000,
              advance: "manual",
              audio,
            },
            ...base.show.cards,
          ],
        },
        assets: [...base.assets, { url, bytes: 73844, sha256: "c".repeat(64) }],
      }
      const draft = normalizeApplicationPreviewDraft(input, context)
      expect(draft.assets.at(-1)?.url).toBe(url)
      expect(draft.show.cards[0]).toMatchObject({ audio })
      const native = authoredShowToNativeBundleDraft(
        draft.show,
        "fragment-preview",
      ).bundleDraft!
      const [scene] = native.extras.timeline

      if (scene.kind === "question") {
        throw new Error("Expected an authored scene")
      }

      expect(native.extras.scenes[scene.sceneId].audio).toEqual(audio)
      const pathnameOnly = {
        ...input,
        assets: input.assets.map((asset) =>
          asset.url === url ? { ...asset, url: "/media/recap.mp3" } : asset,
        ),
      }
      expect(() =>
        normalizeApplicationPreviewDraft(pathnameOnly, context),
      ).toThrow("Unbound account preview asset")
    },
  )
  it.each([
    "/media/../recap.mp3#marker",
    "/media/%2e%2e.mp3#marker",
    "/media/recap.mp3?download=1#marker",
    "/media/recap.exe#marker",
    "/media/recap.mp3#bad%escape",
    "/media/recap.mp3#bad%1",
    "/media/recap.mp3#two#markers",
    "/media/recap.mp3#bad marker",
    "/media/recap.mp3#bad\nmarker",
    "/media/recap.mp3#marker\n",
    "/media/recap.mp3\n",
    "/media/recap.mp3#<script>",
    '/media/recap.mp3#"quoted"',
    "/media/recap.mp3#'quoted'",
    "/media/recap.mp3#back\\slash",
    "https://foreign.invalid/recap.mp3#marker",
    `/media/recap.mp3#${"x".repeat(2048)}`,
  ])("rejects an unsafe or unowned fragment reference %s", (url) => {
    const input = source()
    input.assets[0].url = url
    input.show.cards[0].background.url = url
    expect(() => normalizeApplicationPreviewDraft(input, context)).toThrow()
  })
  it("resolves every public catalogue game through its exact bundled theme and shared production renderer", () => {
    const { pins } = getApplicationPreviewManifest()

    if (pins.length) {
      expect(pins.map((pin) => pin.renderer.id).sort()).toEqual([
        "razzia-native-stage",
        "tadazz-classic-stage",
        "tadazz-original-stage",
      ])
    }

    for (const metadata of publicDemoCatalogue) {
      const example = getPublicDemo(metadata.id)!
      const draft = normalizeApplicationPreviewDraft(
        {
          source: {
            kind: "published-demo",
            catalogueId: metadata.id,
            immutableRevision: "a".repeat(64),
          },
          show: example.show,
          assets: [],
        },
        context,
      )
      const plan = resolveApplicationPreviewPlan(draft)
      expect(plan.resolution.requested.id).toBe(metadata.themeId)

      if (pins.length) {
        expect(plan.resolution.kind).toBe("exact")
        expect(plan.resolution.effective?.id).toBe(metadata.themeId)
        expect(plan.diagnostics).toEqual([])
      }
    }
  })
  it("admits only a spectator public projection without notes, settings or tenant assets", () => {
    const input = {
      source: {
        kind: "published-demo",
        catalogueId: publicExample.catalogueId,
        immutableRevision: "a".repeat(64),
      },
      show: publicExample.show,
      assets: [],
    }
    const draft = normalizeApplicationPreviewDraft(input, context)
    expect(draft.show.cards).toHaveLength(4)
    expect(() =>
      normalizeApplicationPreviewDraft(input, { ...context, role: "manager" }),
    ).toThrow("Private fields")
    expect(() =>
      normalizeApplicationPreviewDraft(
        { ...input, show: { ...input.show, note: "manager secret" } },
        context,
      ),
    ).toThrow("Private fields")
    expect(() =>
      normalizeApplicationPreviewDraft(
        { ...input, assets: source().assets },
        context,
      ),
    ).toThrow("Private fields")
  })
  it("binds exact account URLs and immutable revision without admitting portable/MCP code", () => {
    const draft = normalizeApplicationPreviewDraft(source(), context)
    expect(draft.show.cards).toHaveLength(2)
    expect(Object.isFrozen(draft)).toBe(true)
    expect(getCompiledPreviewManifest().pins).toEqual([])
    expect(
      resolvePreviewPlan(normalizePreviewDraft(previewInputFixture()))
        .resolution.kind,
    ).toBe("unavailable")
    const plan = resolveApplicationPreviewPlan(draft)

    if (getApplicationPreviewManifest().pins.length) {
      expect(plan.resolution.kind).toBe("exact")
      expect(() => assertApplicationPreviewPlan(draft.show, plan)).not.toThrow()
      expect(() =>
        assertApplicationPreviewPlan(structuredClone(draft.show), plan),
      ).toThrow("Unbound application preview plan")
    } else {
      expect(plan.resolution.kind).toBe("unavailable")
    }
  })
  it("refuses missing media, duplicate URL grants, traversal and made-up revisions", () => {
    expect(() =>
      normalizeApplicationPreviewDraft({ ...source(), assets: [] }, context),
    ).toThrow("Unbound account preview asset")
    const duplicate = source()
    duplicate.assets.push(duplicate.assets[0])
    expect(() => normalizeApplicationPreviewDraft(duplicate, context)).toThrow(
      "Invalid account preview assets",
    )
    const traversal = source()
    traversal.assets[0].url = "/media/../foreign.png"
    expect(() => normalizeApplicationPreviewDraft(traversal, context)).toThrow()
    const revision = source()
    revision.source.immutableRevision = "caller revision"
    expect(() => normalizeApplicationPreviewDraft(revision, context)).toThrow()
  })
  it("rejects copied brands and preserves stable identity across reorder", () => {
    const draft = normalizeApplicationPreviewDraft(source(), context)
    expect(() => resolveApplicationPreviewPlan(structuredClone(draft))).toThrow(
      "Unvalidated application preview draft",
    )
    const moved = source()
    moved.show.cards.reverse()
    expect(
      normalizeApplicationPreviewDraft(moved, context).identityMap,
    ).toEqual(draft.identityMap)
  })
  it("does not silently replace an unknown or unsupported requested theme", () => {
    const input = {
      ...source(),
      show: {
        ...source().show,
        defaults: {
          showTheme: { id: "unknown-family", version: "9.0.0", overrides: {} },
        },
      },
    }
    const plan = resolveApplicationPreviewPlan(
      normalizeApplicationPreviewDraft(input, context),
    )
    expect(plan.resolution.kind).toBe("unavailable")
    expect(plan.resolution.requested.id).toBe("unknown-family")
  })
})
