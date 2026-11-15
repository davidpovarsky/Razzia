import { describe, expect, it } from "vitest"
import * as library from "./index"
import { OVERLAY_ANCHORS, OVERLAY_TIME_BASES } from "../cinematic-overlays"

describe("cumulative public library consumer contract", () => {
  it("serializes the actual native catalogs within the authoring JSON budget", () => {
    for (const catalog of [
      library.getNativeShowLibrary(),
      library.getNativeAssetLibrary(),
      library.getNativeAudioLibrary(),
      library.getNativeMotionLibrary(),
    ]) {
      const text = library.canonicalJson(catalog)
      expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(262144)
      expect(JSON.parse(text)).toEqual(catalog)
      expect(Object.isFrozen(catalog)).toBe(true)
    }
    expect(Object.isFrozen(OVERLAY_ANCHORS)).toBe(false)
    expect(Object.isFrozen(OVERLAY_TIME_BASES)).toBe(false)
  })
  it("exposes explicit V1/V2 data APIs while keeping fixtures/authority/renderers/clocks out", () => {
    for (const name of [
      "CompositionRepository",
      "CompositionRepositoryV2",
      "parseCompositionDocument",
      "parseCompositionDocumentV2",
      "prepareCompositionPreviewV2",
      "produceNativePreviewFrameV1",
      "produceCompositionNativePreviewInputV2",
      "getCompositionPreviewDigestContentV2",
    ]) {
      expect(typeof (library as Record<string, unknown>)[name]).toBe("function")
    }
    for (const name of [
      "authoredFixture",
      "sharedPreviewFixtures",
      "diagnoseHostReceiptAuthority",
      "mountPreviewCandidate",
      "createDemoClock",
    ]) {
      expect(Object.hasOwn(library, name)).toBe(false)
    }
    expect(library.getCompiledPreviewManifest().pins).toEqual([])
  })
  it("keeps V1 renderer input strict and V2 admission explicit", () => {
    expect(
      library.nativePreviewRendererInputV1Schema.safeParse({
        inputVersion: 2,
        frame: {},
        themeBinding: {},
        locale: "en",
        reducedMotion: false,
      }).success,
    ).toBe(false)
    expect(
      library.nativePreviewRendererInputV2Schema.safeParse({
        frame: {},
        locale: "en",
        reducedMotion: false,
      }).success,
    ).toBe(false)
    for (const entry of library.getNativeAssetLibrary().entries) {
      expect(entry.executionOrExportAuthorized).toBe(false)
    }
  })
})
