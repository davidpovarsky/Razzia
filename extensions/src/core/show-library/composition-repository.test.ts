import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import {
  CompositionRepository,
  type CompositionDraftKey,
  type CompositionDraftRecord,
  type CompositionPublication,
  type CompositionStorage,
} from "./composition-repository"
import {
  compositionDocumentDigest,
  parseCompositionDocument,
} from "./composition-document"
import {
  getNativeShowLibrary,
  findNativeShowLibraryFamily,
} from "./native-library"
import { canonicalJson } from "./digest"
import { getCompiledPreviewManifest } from "./manifest"
import { resolveShowTheme } from "../show-themes/resolve"
import { resolveCompositionSections } from "./assets"

const key = { tenantId: "tenant-a", draftId: "draft-a" }
function document() {
  return {
    format: "tadazz-show-composition",
    schemaVersion: 1,
    selection: { id: "tadazz-classic", version: "1.0.0", overrides: {} },
    composition: {
      schemaVersion: 1,
      id: "composition-a",
      version: "1.0.0",
      baseTheme: { id: "tadazz-classic", version: "1.0.0" },
      registry: { id: "candidate-registry", version: "1.0.0" },
      sections: {},
      roles: {},
      scopes: [],
    },
    scopes: [],
  }
}

function storageKey(recordKey: CompositionDraftKey) {
  return JSON.stringify([recordKey.tenantId, recordKey.draftId])
}

/** Synthetic storage implements the required atomic operations; no durability claim. */
class MemoryStorage implements CompositionStorage {
  drafts = new Map<string, CompositionDraftRecord>()
  versions = new Map<string, CompositionPublication>()
  beforePublish: (() => void) | undefined
  readDraft(recordKey: CompositionDraftKey) {
    return Promise.resolve(this.drafts.get(storageKey(recordKey)) ?? null)
  }
  compareAndSwapDraft(
    recordKey: CompositionDraftKey,
    expected: number | null,
    next: CompositionDraftRecord,
  ) {
    const id = storageKey(recordKey),
      current = this.drafts.get(id)

    if ((current?.revision ?? null) !== expected) {
      return Promise.resolve(false)
    }

    this.drafts.set(id, structuredClone(next))

    return Promise.resolve(true)
  }
  readVersion(recordKey: CompositionDraftKey, version: string) {
    return Promise.resolve(
      this.versions.get(`${storageKey(recordKey)}:${version}`) ?? null,
    )
  }
  publishIfRevision(
    recordKey: CompositionDraftKey,
    expected: number,
    next: CompositionPublication,
  ) {
    this.beforePublish?.()

    if (this.drafts.get(storageKey(recordKey))?.revision !== expected) {
      return Promise.resolve("revision-conflict" as const)
    }

    const id = `${storageKey(recordKey)}:${next.version}`

    if (this.versions.has(id)) {
      return Promise.resolve("version-exists" as const)
    }

    this.versions.set(id, structuredClone(next))

    return Promise.resolve("stored" as const)
  }
}

describe("real bundled native library discovery", () => {
  it("preserves exact two family IDs and all15 slots/16 audio events and sources", () => {
    const library = getNativeShowLibrary()
    expect(library.families.map((family) => family.ref.id)).toEqual([
      "tadazz-classic",
      "razzia-original",
    ])
    for (const family of library.families) {
      expect(family.visualSlots).toHaveLength(15)
      expect(family.audioEvents).toHaveLength(16)
      expect(family.definitionSha256).toBe(
        createHash("sha256")
          .update(canonicalJson(family.definition))
          .digest("hex"),
      )
      for (const slot of family.visualSlots) {
        expect(slot.variants).toEqual(
          family.definition.slots[slot.slot].variants,
        )
      }
      expect(family.audioOwner).toBe("existing-audio-cue-player")
      expect(family.previewAcceptance).toBe(
        "unavailable-until-reviewed-renderer-pin",
      )
      expect(Object.isFrozen(family.definition.assets)).toBe(true)
      expect(findNativeShowLibraryFamily(family.ref)).toBe(family)
    }
    expect(
      findNativeShowLibraryFamily({ id: "customer-code", version: "1.0.0" }),
    ).toBeUndefined()
    expect(getCompiledPreviewManifest().pins).toEqual([])
  })
  it("uses actual native override fallback and preserves unknown saved IDs", () => {
    const [family] = getNativeShowLibrary().families
    const selection = {
      ...family.ref,
      overrides: { slots: { question: { variantId: "future.unknown" } } },
    }
    const resolved = resolveShowTheme({ selection, role: "spectator" })
    expect(resolved.requested.overrides.slots?.question?.variantId).toBe(
      "future.unknown",
    )
    expect(resolved.slots.question.id).toBe(
      family.definition.slots.question.defaultVariantId,
    )
    expect(resolved.diagnostics).toContainEqual({
      code: "invalid-variant",
      slot: "question",
    })
  })
})

describe("separate composition document and atomic storage contract", () => {
  it("roundtrips unknown valid IDs and independently verifies canonical digest", () => {
    const input = document()
    input.selection.id = "future-native-theme"
    input.composition.baseTheme.id = input.selection.id
    const parsed = parseCompositionDocument(input)
    expect(
      parseCompositionDocument(JSON.parse(JSON.stringify(parsed))),
    ).toEqual(parsed)
    expect(compositionDocumentDigest(parsed)).toBe(
      createHash("sha256").update(canonicalJson(parsed)).digest("hex"),
    )
    expect(Object.isFrozen(parsed.composition.sections)).toBe(true)
  })
  it("rejects unknown code fields, mismatched base theme and duplicate scope IDs", () => {
    expect(() =>
      parseCompositionDocument({ ...document(), source: "alert(1)" }),
    ).toThrow()
    const mismatch = document()
    mismatch.composition.baseTheme.version = "2.0.0"
    expect(() => parseCompositionDocument(mismatch)).toThrow(
      "base-theme-mismatch",
    )
    const scoped = {
      scopeId: "card-a",
      selection: {
        themeId: "tadazz-classic",
        themeVersion: "1.0.0",
        overrides: {},
      },
    }
    expect(() =>
      parseCompositionDocument({ ...document(), scopes: [scoped, scoped] }),
    ).toThrow("duplicate-document-scope")
    const getter = Object.defineProperty({}, "selection", {
      get() {
        throw new Error("getter-ran")
      },
    })
    expect(() => parseCompositionDocument(getter)).toThrow("accessor")
  })
  it("preserves exact role/scope audio mute and inheritance through storage", async () => {
    const storage = new MemoryStorage(),
      repository = new CompositionRepository(storage)
    const input = document()
    Object.assign(input.composition.sections, {
      audio: { opening: { mode: "mute" } },
    })
    Object.assign(input.composition.roles, {
      manager: { audio: { opening: { mode: "inherit" } } },
    })
    await repository.save(key, null, input)
    const saved = await repository.read(key)
    expect(
      resolveCompositionSections(saved!.document.composition, "spectator").audio
        ?.opening,
    ).toEqual({ mode: "mute" })
    expect(
      resolveCompositionSections(saved!.document.composition, "manager").audio
        ?.opening,
    ).toEqual({ mode: "inherit" })
  })
  it("allows exactly one concurrent update and preserves losing content", async () => {
    const storage = new MemoryStorage(),
      repository = new CompositionRepository(storage)
    await repository.save(key, null, document())
    const a = document(),
      b = document()
    a.composition.id = "edit-a"
    b.composition.id = "edit-b"
    const results = await Promise.allSettled([
      repository.save(key, 1, a),
      repository.save(key, 1, b),
    ])
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1)
    expect((await repository.read(key))?.revision).toBe(2)
    expect(b.composition.id).toBe("edit-b")
    await expect(repository.save(key, null, document())).rejects.toThrow(
      "draft-revision-conflict",
    )
  })
  it("separates tenant keys and rejects a storage adapter returning foreign bytes", async () => {
    const storage = new MemoryStorage(),
      repository = new CompositionRepository(storage)
    await repository.save(key, null, document())
    const foreign = { ...key, tenantId: "tenant-b" }
    expect(await repository.read(foreign)).toBeNull()
    storage.drafts.set(
      storageKey(foreign),
      storage.drafts.get(storageKey(key))!,
    )
    await expect(repository.read(foreign)).rejects.toThrow(
      "foreign-draft-record",
    )
    await expect(repository.duplicate(key, foreign, 1)).rejects.toThrow(
      "invalid-draft-copy",
    )
  })
  it("duplicates without overwriting an existing draft or its internal stable IDs", async () => {
    const storage = new MemoryStorage(),
      repository = new CompositionRepository(storage)
    const original = await repository.save(key, null, document())
    const target = { ...key, draftId: "copy-a" }
    const copy = await repository.duplicate(key, target, 1)
    expect(copy.revision).toBe(1)
    expect(copy.documentSha256).toBe(original.documentSha256)
    expect(copy.document).toEqual(original.document)
    await expect(repository.duplicate(key, target, 1)).rejects.toThrow(
      "draft-revision-conflict",
    )
  })
  it("stores immutable content versions while later draft edits leave the version intact", async () => {
    const storage = new MemoryStorage(),
      repository = new CompositionRepository(storage)
    await repository.save(key, null, document())
    const published = await repository.publish(key, 1, "1.0.0")
    const changed = document()
    changed.composition.id = "changed"
    await repository.save(key, 1, changed)
    expect(await repository.version(key, "1.0.0")).toEqual(published)
    await expect(repository.publish(key, 2, "1.0.0")).rejects.toThrow(
      "version-exists",
    )
    expect(getCompiledPreviewManifest().pins).toEqual([])
  })
  it("fails a publish racing a new revision at the atomic storage boundary", async () => {
    const storage = new MemoryStorage(),
      repository = new CompositionRepository(storage)
    await repository.save(key, null, document())
    storage.beforePublish = () => {
      const id = storageKey(key)
      storage.drafts.set(id, { ...storage.drafts.get(id)!, revision: 2 })
    }
    await expect(repository.publish(key, 1, "1.0.0")).rejects.toThrow(
      "revision-conflict",
    )
    expect(storage.versions.size).toBe(0)
  })
  it("rejects tampered stored digests, publication identity and revision overflow", async () => {
    const storage = new MemoryStorage(),
      repository = new CompositionRepository(storage)
    await repository.save(key, null, document())
    const published = await repository.publish(key, 1, "1.0.0")
    storage.versions.set(`${storageKey(key)}:1.0.0`, {
      ...published,
      version: "2.0.0",
    })
    await expect(repository.version(key, "1.0.0")).rejects.toThrow(
      "invalid-publication",
    )
    const id = storageKey(key)
    storage.drafts.set(id, {
      ...storage.drafts.get(id)!,
      documentSha256: "0".repeat(64),
    })
    await expect(repository.read(key)).rejects.toThrow("draft-digest-mismatch")
    await expect(
      repository.save(key, Number.MAX_SAFE_INTEGER, document()),
    ).rejects.toThrow()
  })
})
