import { describe, expect, it } from "vitest"
import * as library from "./index"
import { OVERLAY_ANCHORS, OVERLAY_TIME_BASES } from "../cinematic-overlays"
import { createNativeLibraryPager } from "./native-library-page"

function reconstructCatalog(
  readPage: (input?: unknown) => library.NativeLibraryPage,
  names: readonly string[],
  limit: number,
) {
  const first = readPage({ limit })
  const collections: Record<string, unknown[]> = {}

  for (const name of names) {
    collections[name] = []
  }

  const cursors = new Set<string>()
  let page = first
  let consumed = 0

  for (;;) {
    const text = library.canonicalJson(page)

    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(262144)
    expect(JSON.parse(text)).toEqual(page)
    expect(Object.isFrozen(page)).toBe(true)
    expect(Object.isFrozen(page.catalog)).toBe(true)
    expect(Object.isFrozen(page.items)).toBe(true)
    expect(page.format).toBe("tadazz-native-library-page")
    expect(page.schemaVersion).toBe(1)
    expect(page.catalog).toEqual(first.catalog)
    expect(page.snapshotSha256).toBe(first.snapshotSha256)
    expect(page.offset).toBe(consumed)
    expect(page.total).toBe(first.total)
    expect(page.items.length).toBeLessThanOrEqual(limit)

    if (page.total > 0) {
      expect(page.items.length).toBeGreaterThan(0)
    }

    for (const record of page.items) {
      expect(Object.isFrozen(record)).toBe(true)
      expect(Object.hasOwn(collections, record.collection)).toBe(true)
      collections[record.collection].push(record.value)
    }

    consumed += page.items.length
    expect(consumed).toBeLessThanOrEqual(first.total)

    if (page.nextCursor === undefined) {
      expect(consumed).toBe(first.total)

      break
    }

    expect(consumed).toBeLessThan(first.total)
    expect(cursors.has(page.nextCursor)).toBe(false)
    cursors.add(page.nextCursor)
    page = readPage({ limit, cursor: page.nextCursor })
  }

  return { ...first.catalog, ...collections }
}

function requiredCursor(page: library.NativeLibraryPage): string {
  if (page.nextCursor === undefined) {
    throw new Error("The fixture must have another catalog page")
  }

  return page.nextCursor
}

describe("cumulative public library consumer contract", () => {
  it("reconstructs every actual native catalog from bounded JSON pages without omissions", () => {
    for (const { catalog, read, collections } of [
      {
        catalog: library.getNativeShowLibrary(),
        read: library.getNativeShowLibraryPage,
        collections: ["families"],
      },
      {
        catalog: library.getNativeAssetLibrary(),
        read: library.getNativeAssetLibraryPage,
        collections: ["entries", "contentAliases"],
      },
      {
        catalog: library.getNativeAudioLibrary(),
        read: library.getNativeAudioLibraryPage,
        collections: ["events"],
      },
      {
        catalog: library.getNativeMotionLibrary(),
        read: library.getNativeMotionLibraryPage,
        collections: [
          "stageEntrances",
          "questionDecorations",
          "nativeChoreography",
        ],
      },
    ]) {
      expect(Object.isFrozen(catalog)).toBe(true)

      for (const limit of [1, library.NATIVE_LIBRARY_PAGE_MAX_ITEMS]) {
        expect(reconstructCatalog(read, collections, limit)).toEqual(catalog)
      }
    }

    expect(Object.isFrozen(OVERLAY_ANCHORS)).toBe(false)
    expect(Object.isFrozen(OVERLAY_TIME_BASES)).toBe(false)
  })
  it("rejects tampered, foreign and stale cursors and validates bounded page requests", () => {
    const cursor = requiredCursor(
      library.getNativeShowLibraryPage({ limit: 1 }),
    )
    const moved = cursor.replace(/^nlp1\.[0-9]+/u, "nlp1.2")

    expect(() => library.getNativeShowLibraryPage({ cursor: moved })).toThrow()
    expect(() => library.getNativeAssetLibraryPage({ cursor })).toThrow()

    for (const input of [
      { limit: 0 },
      { limit: -1 },
      { limit: 1.5 },
      { limit: 129 },
      { limit: Number.POSITIVE_INFINITY },
      { cursor: "unknown" },
      { cursor: "" },
      { limit: 1, maxNodes: 100000 },
    ]) {
      expect(() => library.getNativeShowLibraryPage(input)).toThrow()
    }

    const original = createNativeLibraryPager(
      { format: "cursor-fixture", version: 1 },
      [
        { collection: "entries", value: "first" },
        { collection: "entries", value: "old second" },
      ],
    )
    const revised = createNativeLibraryPager(
      { format: "cursor-fixture", version: 1 },
      [
        { collection: "entries", value: "first" },
        { collection: "entries", value: "new second" },
      ],
    )
    const oldCursor = requiredCursor(original({ limit: 1 }))

    expect(() => revised({ cursor: oldCursor })).toThrow(
      "show-library:native-catalog-cursor",
    )

    let accessorRead = false
    const accessor = Object.defineProperty({}, "limit", {
      enumerable: true,
      get() {
        accessorRead = true

        return 1
      },
    })

    expect(() => library.getNativeShowLibraryPage(accessor)).toThrow(
      "show-library:accessor",
    )
    expect(accessorRead).toBe(false)
  })
  it("packs both byte-heavy and node-heavy pages with nonempty forward progress", () => {
    for (const value of [
      "x".repeat(100000),
      Array.from({ length: 4500 }, () => 0),
    ]) {
      const records = Array.from({ length: 3 }, (_, index) => ({
        collection: "entries",
        value: { index, value },
      }))
      const read = createNativeLibraryPager(
        { format: "budget-fixture" },
        records,
      )
      const first = read({ limit: 128 })
      const next = read({ limit: 128, cursor: requiredCursor(first) })

      expect(first.items).toHaveLength(2)
      expect(next.items).toHaveLength(1)
      expect(next.offset).toBe(2)
      expect(next.nextCursor).toBeUndefined()
      expect(reconstructCatalog(read, ["entries"], 128)).toEqual({
        format: "budget-fixture",
        entries: records.map((record) => record.value),
      })
    }
  })
  it("fails closed for an oversized single entry and keeps authoring limits unchanged", () => {
    const read = createNativeLibraryPager({ format: "oversized-fixture" }, [
      { collection: "entries", value: "x".repeat(262144) },
    ])

    expect(() => read()).toThrow("show-library:native-catalog-entry-budget")
    expect(() =>
      library.canonicalJson(Array.from({ length: 10000 }, () => null)),
    ).toThrow("show-library:json-budget")
    expect(() => library.canonicalJson("x".repeat(262145))).toThrow(
      "show-library:string-budget",
    )
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
      "getNativeShowLibraryPage",
      "getNativeAssetLibraryPage",
      "getNativeAudioLibraryPage",
      "getNativeMotionLibraryPage",
    ]) {
      expect(typeof (library as Record<string, unknown>)[name]).toBe("function")
    }
    for (const name of [
      "authoredFixture",
      "sharedPreviewFixtures",
      "diagnoseHostReceiptAuthority",
      "mountPreviewCandidate",
      "createDemoClock",
      "createNativeLibraryPager",
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
