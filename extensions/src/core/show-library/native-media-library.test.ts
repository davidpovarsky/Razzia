import { describe, expect, it } from "vitest"
import { getNativeShowLibrary } from "./native-library"
import {
  getNativeAssetLibrary,
  getNativeAudioLibrary,
  findNativeAssetLibraryEntry,
} from "./native-media-library"

describe("independent native asset/audio metadata without new playback authority", () => {
  it("deduplicates every exact manifest reference while preserving IDs, hashes and declarations", () => {
    const assets = getNativeShowLibrary().families.flatMap(
      (family) => family.definition.assets,
    )
    const exactRefs = new Set(
      assets.map((asset) => `${asset.id}:${asset.sha256}`),
    )
    const library = getNativeAssetLibrary()
    const actualRefs = library.entries.map(
      (entry) => `${entry.ref.assetId}:${entry.ref.sha256}`,
    )

    expect(new Set(actualRefs)).toEqual(exactRefs)
    expect(actualRefs).toHaveLength(exactRefs.size)
    expect(new Set(library.entries.map((entry) => entry.ref.assetId))).toEqual(
      new Set(assets.map((asset) => asset.id)),
    )
    expect(
      library.entries.reduce(
        (sum, entry) => sum + entry.declarations.length,
        0,
      ),
    ).toBe(assets.length)
    expect(new Set(library.entries.map((entry) => entry.ref.sha256))).toEqual(
      new Set(assets.map((asset) => asset.sha256)),
    )
    const aliases = [...new Set(assets.map((asset) => asset.sha256))]
      .map((sha256) => ({
        sha256,
        assetIds: [
          ...new Set(
            assets
              .filter((asset) => asset.sha256 === sha256)
              .map((asset) => asset.id),
          ),
        ].sort(),
      }))
      .filter((alias) => alias.assetIds.length > 1)
      .sort((left, right) => left.sha256.localeCompare(right.sha256))

    expect(
      [...library.contentAliases].sort((left, right) =>
        left.sha256.localeCompare(right.sha256),
      ),
    ).toEqual(aliases)
    for (const alias of library.contentAliases) {
      expect(alias.assetIds.length).toBeGreaterThan(1)
      expect(new Set(alias.assetIds).size).toBe(alias.assetIds.length)
    }
    for (const entry of library.entries) {
      expect(entry.executionOrExportAuthorized).toBe(false)
      expect(Object.isFrozen(entry.declarations)).toBe(true)
    }
    expect(library.referenceMeaning).toBe(
      "manifest-references-not-live-storage-refcounts",
    )
  })
  it("never resolves the three reused asset IDs without their exact content hash", () => {
    for (const id of [
      "classic-poster",
      "classic-backdrop",
      "classic-adapter-a27be4883ee9",
    ]) {
      const entries = getNativeAssetLibrary().entries.filter(
        (entry) => entry.ref.assetId === id,
      )
      expect(entries).toHaveLength(2)
      expect(new Set(entries.map((entry) => entry.ref.sha256)).size).toBe(2)
      expect(() => findNativeAssetLibraryEntry({ assetId: id })).toThrow()
      for (const entry of entries) {
        expect(findNativeAssetLibraryEntry(entry.ref)).toBe(entry)
      }
    }
    expect(
      findNativeAssetLibraryEntry({
        assetId: "unknown",
        sha256: "0".repeat(64),
      }),
    ).toBeUndefined()
  })
  it("records exact source JSON pointers for every declared native media reference", () => {
    for (const entry of getNativeAssetLibrary().entries) {
      for (const declaration of entry.declarations) {
        const family = getNativeShowLibrary().families.find(
          (value) =>
            value.ref.id === declaration.theme.id &&
            value.ref.version === declaration.theme.version,
        )!
        expect(declaration.definitionSha256).toBe(family.definitionSha256)
        for (const pointer of declaration.manifestReferences) {
          const resolved = pointer
            .slice(1)
            .split("/")
            .reduce<unknown>(
              (value, key) => (value as Record<string, unknown>)[key],
              family.definition,
            )

          if (pointer.startsWith("/assets/")) {
            expect(resolved).toEqual(declaration.asset)
          } else {
            expect(resolved).toBe(entry.ref.assetId)
          }
        }
      }
    }
  })
  it("retains original per-family asset URL/provenance/rights metadata without treating it as a grant", () => {
    for (const family of getNativeShowLibrary().families) {
      for (const asset of family.definition.assets) {
        const entry = getNativeAssetLibrary().entries.find(
          (value) =>
            value.ref.assetId === asset.id && value.ref.sha256 === asset.sha256,
        )!
        const declaration = entry.declarations.find(
          (value) => value.theme.id === family.ref.id,
        )!
        expect(declaration.asset).toEqual(asset)
        expect(entry.executionOrExportAuthorized).toBe(false)
      }
    }
  })
  it("groups the exact16events with native defaults, roles, volume/loop/fades and choreography", () => {
    const library = getNativeAudioLibrary()
    expect(library.events).toHaveLength(16)
    expect(new Set(library.events.map((entry) => entry.event)).size).toBe(16)
    expect(library.playbackOwner).toBe("existing-audio-cue-player")
    for (const event of library.events) {
      expect(event.families).toHaveLength(10)
      for (const item of event.families) {
        const family = getNativeShowLibrary().families.find(
          (value) => value.ref.id === item.theme.id,
        )!
        expect(item.variants).toEqual(
          family.definition.audioEvents[event.event].variants,
        )
        expect(item.defaultVariantId).toBe(
          family.definition.audioEvents[event.event].defaultVariantId,
        )
        for (const milestone of item.choreography) {
          expect(
            family.definition.choreographyCues[milestone.milestone],
          ).toEqual({ event: event.event, variantId: milestone.variantId })
        }
      }
      expect(event.executionOrExportAuthorized).toBe(false)
    }
  })
  it("preserves actual legacy cue and soundtrack mapping rather than inventing another event clock", () => {
    const library = getNativeAudioLibrary()
    expect(
      library.events.find((event) => event.event === "answerSubmitted")?.cueIds,
    ).toEqual(["answerPressed"])
    expect(
      library.events.find((event) => event.event === "answersMusic")
        ?.soundtrackSlots,
    ).toEqual(["voting"])
    expect(
      library.events.find((event) => event.event === "revealResults")
        ?.soundtrackSlots,
    ).toEqual(["results", "recap"])
    expect(Object.isFrozen(library.events[0].families[0].variants)).toBe(true)
  })
})
