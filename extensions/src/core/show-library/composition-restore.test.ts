import { describe, expect, it } from "vitest"
import {
  CompositionRepository,
  CompositionRepositoryV2,
} from "./composition-repository"
import type {
  CompositionRepositoryBase,
  CompositionDraftKey,
  CompositionDraftRecord,
  CompositionPublication,
  CompositionStorage,
} from "./composition-repository-base"
import type { CompositionDocument } from "./composition-document"
import { withNativePresentationV2 } from "./composition-document-v2"
import { getCompiledPreviewManifest } from "./manifest"

const key = { tenantId: "tenant-a", draftId: "draft-a" }
const storageKey = (value: CompositionDraftKey) =>
  JSON.stringify([value.tenantId, value.draftId])
function document(): CompositionDocument {
  return {
    format: "tadazz-show-composition",
    schemaVersion: 1,
    selection: { id: "razzia-original", version: "1.0.0", overrides: {} },
    composition: {
      schemaVersion: 1,
      id: "composition-a",
      version: "1.0.0",
      baseTheme: { id: "razzia-original", version: "1.0.0" },
      registry: { id: "registry-a", version: "1.0.0" },
      sections: { audio: { opening: { mode: "mute" } } },
      roles: {},
      scopes: [],
    },
    scopes: [],
  }
}

function harness<Document>(
  factory: (
    storage: CompositionStorage<Document>,
  ) => CompositionRepositoryBase<Document>,
  content: Document,
) {
  const drafts = new Map<string, CompositionDraftRecord<Document>>()
  const versions = new Map<string, CompositionPublication<Document>>()
  const counts = { cas: 0, publications: 0 }
  let raceNextWrite = false
  const storage: CompositionStorage<Document> = {
    readDraft(recordKey) {
      return Promise.resolve(drafts.get(storageKey(recordKey)) ?? null)
    },
    compareAndSwapDraft(recordKey, expectedRevision, next) {
      counts.cas += 1
      const id = storageKey(recordKey)
      const current = drafts.get(id)

      if (raceNextWrite && current) {
        raceNextWrite = false
        drafts.set(id, { ...current, revision: current.revision + 1 })
      }

      if ((drafts.get(id)?.revision ?? null) !== expectedRevision) {
        return Promise.resolve(false)
      }

      drafts.set(id, structuredClone(next))

      return Promise.resolve(true)
    },
    readVersion(recordKey, version) {
      return Promise.resolve(
        versions.get(`${storageKey(recordKey)}:${version}`) ?? null,
      )
    },
    publishIfRevision(recordKey, expectedRevision, publication) {
      const id = `${storageKey(recordKey)}:${publication.version}`

      if (drafts.get(storageKey(recordKey))?.revision !== expectedRevision) {
        return Promise.resolve("revision-conflict")
      }

      if (versions.has(id)) {
        return Promise.resolve("version-exists")
      }

      versions.set(id, structuredClone(publication))
      counts.publications += 1

      return Promise.resolve("stored")
    },
  }

  return {
    repository: factory(storage),
    document: content,
    counts,
    raceNextWrite() {
      raceNextWrite = true
    },
    tamperPublication(kind: "digest" | "tenant") {
      const id = `${storageKey(key)}:1.0.0`
      const publication = versions.get(id)

      if (!publication) {
        throw new Error("fixture")
      }

      versions.set(id, {
        ...publication,
        ...(kind === "digest"
          ? { documentSha256: "0".repeat(64) }
          : { key: { ...key, tenantId: "tenant-b" } }),
      })
    },
  }
}

function fixture(version: "V1" | "V2") {
  if (version === "V1") {
    return harness((storage) => new CompositionRepository(storage), document())
  }

  return harness(
    (storage) => new CompositionRepositoryV2(storage),
    withNativePresentationV2(document(), {
      format: "tadazz-native-presentation-settings",
      schemaVersion: 1,
      defaults: { questionDecoration: { enabled: true, preset: "pulse-bar" } },
      roles: {},
      cards: [],
    }),
  )
}

describe.each(["V1", "V2"] as const)(
  "%s published composition draft restore",
  (version) => {
    it("restores full published content into a new revision without altering the publication", async () => {
      const f = fixture(version)
      const original = await f.repository.save(key, null, f.document)
      const published = await f.repository.publish(key, 1, "1.0.0")
      const changed = structuredClone(f.document)
      changed.composition.id = "later-edit"
      await f.repository.save(key, 1, changed)
      const restored = await f.repository.restoreDraft(key, 2, "1.0.0")

      expect(restored.revision).toBe(3)
      expect(restored.document).toEqual(f.document)
      expect(restored.documentSha256).toBe(original.documentSha256)
      expect(Object.isFrozen(restored.document.composition)).toBe(true)
      expect(await f.repository.version(key, "1.0.0")).toEqual(published)
      expect(f.counts.publications).toBe(1)
      expect(changed.composition.id).toBe("later-edit")
      expect(getCompiledPreviewManifest().pins).toEqual([])
    })
    it("rejects a stale revision without replacing newer draft content", async () => {
      const f = fixture(version)
      await f.repository.save(key, null, f.document)
      await f.repository.publish(key, 1, "1.0.0")
      const changed = structuredClone(f.document)
      changed.composition.id = "newer-edit"
      const newer = await f.repository.save(key, 1, changed)

      await expect(f.repository.restoreDraft(key, 1, "1.0.0")).rejects.toThrow(
        "draft-revision-conflict",
      )
      expect(await f.repository.read(key)).toEqual(newer)
      expect(f.counts.publications).toBe(1)
    })
    it("does not create a draft or write when the version is missing or tenant differs", async () => {
      const f = fixture(version)
      await f.repository.save(key, null, f.document)
      await f.repository.publish(key, 1, "1.0.0")
      const writes = f.counts.cas

      await expect(f.repository.restoreDraft(key, 1, "9.0.0")).rejects.toThrow(
        "composition-version-not-found",
      )
      await expect(
        f.repository.restoreDraft({ ...key, tenantId: "tenant-b" }, 1, "1.0.0"),
      ).rejects.toThrow("composition-version-not-found")
      expect(
        await f.repository.read({ ...key, tenantId: "tenant-b" }),
      ).toBeNull()
      expect(f.counts.cas).toBe(writes)
    })
    it.each(["digest", "tenant"] as const)(
      "rejects a tampered stored publication %s before any draft write",
      async (kind) => {
        const f = fixture(version)
        await f.repository.save(key, null, f.document)
        await f.repository.publish(key, 1, "1.0.0")
        const original = await f.repository.read(key)
        const writes = f.counts.cas
        f.tamperPublication(kind)

        await expect(
          f.repository.restoreDraft(key, 1, "1.0.0"),
        ).rejects.toThrow(
          kind === "digest" ? "draft-digest-mismatch" : "foreign-draft-record",
        )
        expect(await f.repository.read(key)).toEqual(original)
        expect(f.counts.cas).toBe(writes)
      },
    )
    it("loses safely to a write racing between publication read and restore CAS", async () => {
      const f = fixture(version)
      await f.repository.save(key, null, f.document)
      await f.repository.publish(key, 1, "1.0.0")
      const changed = structuredClone(f.document)
      changed.composition.id = "racing-edit"
      await f.repository.save(key, 1, changed)
      f.raceNextWrite()

      await expect(f.repository.restoreDraft(key, 2, "1.0.0")).rejects.toThrow(
        "draft-revision-conflict",
      )
      expect((await f.repository.read(key))?.revision).toBe(3)
      expect((await f.repository.read(key))?.document.composition.id).toBe(
        "racing-edit",
      )
      expect(f.counts.publications).toBe(1)
    })
    it("rejects invalid revisions and overflow without writes", async () => {
      const f = fixture(version)
      await f.repository.save(key, null, f.document)
      await f.repository.publish(key, 1, "1.0.0")
      const writes = f.counts.cas

      for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
        await expect(
          f.repository.restoreDraft(key, revision, "1.0.0"),
        ).rejects.toThrow()
      }

      expect(f.counts.cas).toBe(writes)
      expect((await f.repository.read(key))?.revision).toBe(1)
    })
  },
)
