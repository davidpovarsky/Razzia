import { describe, expect, it } from "vitest"
import classic from "../show-themes/classic.manifest.json" with { type: "json" }
import { RUNTIME_PHASES } from "../packages/protocol"
import { applicationPackagePreviewSchema } from "./application-package-preview"
import { normalizeApplicationPreviewDraft } from "./application-preview-input"
import {
  resolveApplicationPreviewPlan,
  getApplicationPreviewManifest,
} from "./application-preview-resolve"
import { showThemeRegistry } from "../show-themes/registry"
import { authoredFixture } from "./preview-fixtures"

function packageReceipt() {
  const independentTheme = JSON.parse(
    JSON.stringify(classic).replaceAll(
      `${classic.id}.`,
      "private-package-theme.",
    ),
  ) as typeof classic
  const theme = {
    ...independentTheme,
    id: "private-package-theme",
    kind: "sandboxed-react",
    rendererId: "tadazz-sandbox-stage",
    sandbox: {
      runtimeApi: 1,
      entry: "theme/entry.tsx",
      roles: ["manager", "player", "spectator"],
      slots: Object.fromEntries(
        RUNTIME_PHASES.map((phase) => [
          phase,
          phase === "opening" || phase === "closing"
            ? "classic"
            : "implemented",
        ]),
      ),
    },
    runtime: {
      packageId: "private-package",
      version: "1.0.0",
      sourceDigest: "a".repeat(64),
      buildDigest: "b".repeat(64),
    },
    assets: classic.assets.map((asset, index) => ({
      ...asset,
      url: `/media/private_${index}.${asset.url.split(".").at(-1)}`,
      bytes: 64,
      sha256: "c".repeat(64),
    })),
  }

  return {
    uploadId: "private-upload",
    revision: 4,
    sourceDigest: "a".repeat(64),
    buildDigest: "b".repeat(64),
    definitions: [theme],
    runtimeUrls: {
      "private-package-theme":
        "https://isolated.example/render?ticket=synthetic.receipt&theme=private-package-theme",
    },
    assets: theme.assets.map(({ url, bytes, sha256 }) => ({
      url,
      bytes,
      sha256,
    })),
  }
}

describe("private package application preview receipt", () => {
  it("accepts a game-only package receipt and resolves the same bundled native plan", () => {
    const receipt = {
      ...packageReceipt(),
      definitions: [],
      runtimeUrls: {},
      assets: [],
    }
    const context = applicationPackagePreviewSchema.parse(receipt)
    const source = {
      source: {
        kind: "account-owned",
        quizId: "native-package-game",
        immutableRevision: "d".repeat(64),
      },
      show: {
        ...authoredFixture(3, 2),
        defaults: {
          showTheme: { id: classic.id, version: classic.version },
        },
      },
      assets: [],
    }
    const preferences = {
      role: "spectator",
      locale: "en",
      reducedMotion: false,
    }
    const nativePlan = resolveApplicationPreviewPlan(
      normalizeApplicationPreviewDraft(source, preferences),
    )
    const packagePlan = resolveApplicationPreviewPlan(
      normalizeApplicationPreviewDraft(
        { ...source, packageContext: context },
        preferences,
      ),
    )

    expect(context.definitions).toEqual([])
    expect(context.runtimeUrls).toEqual({})
    expect(packagePlan).toEqual(nativePlan)
    const nativePin = getApplicationPreviewManifest().pins.find(
      (pin) => pin.renderer.id === classic.rendererId,
    )

    if (nativePin) {
      expect(packagePlan.resolution.kind).toBe("exact")
      expect(packagePlan.resolution.pin).toEqual(nativePin)
      expect(packagePlan.resolution.pin?.rendererBuildSha256).not.toBe(
        context.buildDigest,
      )
    }
  })

  it("does not admit a custom theme plan when a game-only receipt has no matching definition", () => {
    const context = applicationPackagePreviewSchema.parse({
      ...packageReceipt(),
      definitions: [],
      runtimeUrls: {},
      assets: [],
    })
    const draft = normalizeApplicationPreviewDraft(
      {
        source: {
          kind: "account-owned",
          quizId: "missing-custom-theme",
          immutableRevision: "d".repeat(64),
        },
        show: {
          ...authoredFixture(3, 1),
          defaults: {
            showTheme: { id: "private-package-theme", version: "1.0.0" },
          },
        },
        assets: [],
        packageContext: context,
      },
      { role: "spectator", locale: "en", reducedMotion: false },
    )
    const plan = resolveApplicationPreviewPlan(draft)

    expect(plan.resolution.kind).toBe("unavailable")
    expect(plan.resolution.effective).toBeNull()
    expect(plan.resolution.pin).toBeNull()
    expect(plan.capabilities.reveal).toBe(false)
    expect(plan.capabilities.seek).toBe("unavailable")
    expect(
      showThemeRegistry.get("private-package-theme", "1.0.0"),
    ).toBeUndefined()
  })

  it("keeps digest, unknown-field and runtime binding guards for game-only receipts", () => {
    const receipt = {
      ...packageReceipt(),
      definitions: [],
      runtimeUrls: {},
      assets: [],
    }

    for (const invalid of [
      { ...receipt, sourceDigest: "invalid" },
      { ...receipt, buildDigest: "invalid" },
      { ...receipt, unexpected: true },
      { ...receipt, runtimeUrls: packageReceipt().runtimeUrls },
    ]) {
      expect(applicationPackagePreviewSchema.safeParse(invalid).success).toBe(
        false,
      )
    }
  })

  it("binds exact code and media without registering the theme globally", () => {
    const context = applicationPackagePreviewSchema.parse(packageReceipt())
    const draft = normalizeApplicationPreviewDraft(
      {
        source: {
          kind: "account-owned",
          quizId: "unsaved-package",
          immutableRevision: "d".repeat(64),
        },
        show: {
          ...authoredFixture(3, 23),
          defaults: {
            showTheme: { id: "private-package-theme", version: "1.0.0" },
          },
        },
        assets: context.assets,
        packageContext: context,
      },
      { role: "spectator", locale: "en", reducedMotion: false },
    )
    const plan = resolveApplicationPreviewPlan(draft)

    if (getApplicationPreviewManifest().pins.length) {
      expect(plan.resolution.kind).toBe("exact")
      expect(plan.resolution.pin?.rendererBuildSha256).toBe(context.buildDigest)
    }

    expect(draft.show.cards).toHaveLength(23)
    expect(
      showThemeRegistry.get("private-package-theme", "1.0.0"),
    ).toBeUndefined()
  })

  it("rejects changed build pins, missing media and a theme ticket for another definition", () => {
    const build = packageReceipt()
    build.definitions[0].runtime.buildDigest = "f".repeat(64)
    expect(applicationPackagePreviewSchema.safeParse(build).success).toBe(false)
    const media = packageReceipt()
    media.assets.pop()
    expect(applicationPackagePreviewSchema.safeParse(media).success).toBe(false)
    const ticket = packageReceipt()
    ticket.runtimeUrls["private-package-theme"] =
      "https://isolated.example/render?ticket=synthetic.receipt&theme=foreign-theme"
    expect(applicationPackagePreviewSchema.safeParse(ticket).success).toBe(
      false,
    )
  })

  it("fails closed on malformed and duplicate runtime query parameters without throwing from a refinement", () => {
    for (const url of [
      "not-a-url",
      "javascript:alert(1)",
      "https://isolated.example/render?ticket=one.two&theme=private-package-theme&ticket=three.four",
    ]) {
      const value = packageReceipt()
      value.runtimeUrls["private-package-theme"] = url
      expect(() =>
        applicationPackagePreviewSchema.safeParse(value),
      ).not.toThrow()
      expect(applicationPackagePreviewSchema.safeParse(value).success).toBe(
        false,
      )
    }
  })

  it("keeps a package preview private and rejects a mismatched media receipt", () => {
    const context = applicationPackagePreviewSchema.parse(packageReceipt())
    const source = {
      source: {
        kind: "account-owned",
        quizId: "unsaved-package",
        immutableRevision: "d".repeat(64),
      },
      show: authoredFixture(3, 1),
      assets: context.assets,
      packageContext: context,
    }
    const preferences = {
      role: "spectator",
      locale: "en",
      reducedMotion: false,
    }
    expect(() =>
      normalizeApplicationPreviewDraft({ ...source, assets: [] }, preferences),
    ).toThrow("Package preview media receipt changed")
    expect(() =>
      normalizeApplicationPreviewDraft(
        {
          ...source,
          source: {
            kind: "published-demo",
            catalogueId: "private-package",
            immutableRevision: "d".repeat(64),
          },
        },
        preferences,
      ),
    ).toThrow("Private fields")
  })
})
