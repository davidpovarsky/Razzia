import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { ThemeInstallationStore } from "./installation"
import { createThemeBuilderRoutes } from "./builder-routes"
import { builderDocumentFixture } from "../../components/theme-builder/document.fixture"
import type { ThemePrincipal } from "./review"

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const finish of cleanup.splice(0).reverse()) {
    finish()
  }
})
const principal = (tenantId = "tenant-a"): ThemePrincipal => ({
  tenantId,
  userId: "author",
  grants: ["author"],
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "builder-store-")),
    file = join(root, "themes.sqlite"),
    key = randomBytes(32)
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const store = new ThemeInstallationStore(file, key)
  cleanup.push(() => store.close())

  return { store, file, key }
}
describe("existing installer Theme Builder persistence", () => {
  it("publishes only with the existing publish grant and keeps immutable pins through rollback/archive/reopen", async () => {
    const { store, file, key } = fixture(),
      author = principal(),
      p: ThemePrincipal = { ...author, grants: ["author", "publish"] },
      document = builderDocumentFixture()
    const admit = () => ({
      kind: "first-party-composition" as const,
      rendererBuildSha256: "1".repeat(64),
      assets: [],
      // Trusted admission seam mocked only for this storage test.
    })
    await store.saveBuilderDocument(author, 0, document)
    await expect(
      store.publishBuilderVersion(author, document.id, 1, 0, "1.0.0", admit),
    ).rejects.toThrow("Forbidden")
    expect(store.listBuilderVersions(author, document.id)).toEqual([])
    expect(
      await store.publishBuilderVersion(p, document.id, 1, 0, "1.0.0", admit),
    ).toMatchObject({ revision: 1, activeVersion: "1.0.0", archived: false })
    const firstPin = store.readPublishedBuilderVersion(p, document.id, "1.0.0")
    await store.saveBuilderDocument(p, 1, {
      ...document,
      name: "Second publication",
    })
    await store.publishBuilderVersion(p, document.id, 2, 1, "2.0.0", admit)
    await expect(
      store.publishBuilderVersion(p, document.id, 2, 1, "1.0.0", admit, true),
    ).rejects.toThrow("conflict")
    await expect(
      store.publishBuilderVersion(
        p,
        document.id,
        2,
        2,
        "1.0.0",
        () => ({ ...admit(), rendererBuildSha256: "2".repeat(64) }),
        true,
      ),
    ).rejects.toThrow("integrity")
    expect(store.builderPublicationState(p, document.id)).toMatchObject({
      revision: 2,
      activeVersion: "2.0.0",
    })
    await store.publishBuilderVersion(
      p,
      document.id,
      2,
      2,
      "1.0.0",
      admit,
      true,
    )
    expect(store.readPublishedBuilderVersion(p, document.id, "1.0.0")).toEqual(
      firstPin,
    )
    expect(store.listPublishedBuilderDocuments(p)[0].name).toBe(document.name)
    const archived = await store.archiveBuilderDocument(
      p,
      document.id,
      2,
      3,
      true,
    )
    expect(archived).toMatchObject({
      archived: true,
      revision: 4,
      activeVersion: "1.0.0",
    })
    expect(store.listPublishedBuilderDocuments(p)).toEqual([])
    expect(store.readPublishedBuilderVersion(p, document.id, "1.0.0")).toEqual(
      firstPin,
    )
    await expect(
      store.publishBuilderVersion(p, document.id, 2, 4, "3.0.0", admit),
    ).rejects.toThrow("conflict")
    const reopened = new ThemeInstallationStore(file, key)
    cleanup.push(() => reopened.close())
    expect(reopened.builderPublicationState(p, document.id)).toEqual(archived)
    await reopened.archiveBuilderDocument(p, document.id, 2, 4, false)
    expect(reopened.listPublishedBuilderDocuments(p)).toHaveLength(1)
    expect(() =>
      reopened.readPublishedBuilderVersion(
        { ...p, tenantId: "tenant-b" },
        document.id,
        "1.0.0",
      ),
    ).toThrow("Not found")
    // No code/package installation or public grant.
    expect(reopened.catalog(p.tenantId)).toEqual([])
  })
  it("failed trusted admission preserves the active pointer and stores no new publication/version", async () => {
    const { store } = fixture(),
      p: ThemePrincipal = { ...principal(), grants: ["author", "publish"] },
      document = builderDocumentFixture()
    await store.saveBuilderDocument(p, 0, document)
    const before = store.builderPublicationState(p, document.id)
    await expect(
      store.publishBuilderVersion(p, document.id, 1, 0, "1.0.0", () => {
        throw new Error("media rights unavailable")
      }),
    ).rejects.toThrow("media rights unavailable")
    expect(store.builderPublicationState(p, document.id)).toEqual(before)
    expect(store.listBuilderVersions(p, document.id)).toEqual([])
  })
  it("retains complete immutable authoring versions across reopen and CAS restore", async () => {
    const { store, file, key } = fixture(),
      p = principal(),
      document = builderDocumentFixture()
    await store.saveBuilderDocument(p, 0, document)
    expect(
      await store.createBuilderVersion(p, document.id, 1, "1.0.0"),
    ).toMatchObject({ runtimeAcceptance: "not-evaluated", revision: 1 })
    await store.saveBuilderDocument(p, 1, {
      ...document,
      name: "Changed",
      registry: {
        ...document.registry,
        templates: document.registry.templates.map((t) => ({
          ...t,
          nodes: t.nodes.map((n) => ({ ...n, props: { showNumber: false } })),
        })),
      },
    })
    await expect(
      store.createBuilderVersion(p, document.id, 1, "1.0.1"),
    ).rejects.toThrow("conflict")
    await expect(
      store.createBuilderVersion(p, document.id, 2, "1.0.0"),
    ).rejects.toThrow("conflict")
    const reopened = new ThemeInstallationStore(file, key)
    cleanup.push(() => reopened.close())
    expect(reopened.listBuilderVersions(p, document.id)).toEqual([
      {
        version: "1.0.0",
        revision: 1,
        restorable: true,
        runtimeAcceptance: "not-evaluated",
      },
    ])
    await expect(
      reopened.restoreBuilderVersion(p, document.id, 1, "1.0.0"),
    ).rejects.toThrow("conflict")
    const restored = await reopened.restoreBuilderVersion(
      p,
      document.id,
      2,
      "1.0.0",
    )
    expect(restored.revision).toBe(3)
    expect(restored.document).toEqual(document)
    expect(reopened.catalog(p.tenantId)).toEqual([])
    expect(() =>
      reopened.listBuilderVersions(principal("tenant-b"), document.id),
    ).toThrow("Not found")
    await expect(
      reopened.restoreBuilderVersion(
        principal("tenant-b"),
        document.id,
        3,
        "1.0.0",
      ),
    ).rejects.toThrow("Not found")
    await expect(
      reopened.createBuilderVersion(
        { ...p, grants: [] },
        document.id,
        3,
        "1.0.1",
      ),
    ).rejects.toThrow("Forbidden")
    expect((await reopened.readBuilderDocument(p, document.id)).revision).toBe(
      3,
    )
  })
  it("persists exact documents across reopen without publishing or executable pins", async () => {
    const { store, file, key } = fixture(),
      p = principal(),
      document = builderDocumentFixture()
    const saved = await store.saveBuilderDocument(p, 0, document)
    const reopened = new ThemeInstallationStore(file, key)
    cleanup.push(() => reopened.close())
    expect(await reopened.readBuilderDocument(p, document.id)).toEqual(saved)
    expect(reopened.listBuilderDocuments(p)).toEqual([
      { id: document.id, revision: 1, name: document.name },
    ])
    expect(reopened.list(p)).toEqual([])
    expect(reopened.catalog(p.tenantId)).toEqual([])
  })
  it("rejects stale saves and preserves previous data on invalid edits", async () => {
    const { store } = fixture(),
      p = principal(),
      document = builderDocumentFixture()
    await store.saveBuilderDocument(p, 0, document)
    await expect(
      store.saveBuilderDocument(p, 0, { ...document, name: "Stale" }),
    ).rejects.toThrow("conflict")
    await expect(
      store.saveBuilderDocument(p, 1, { ...document, registry: {} }),
    ).rejects.toThrow()
    expect(await store.readBuilderDocument(p, document.id)).toMatchObject({
      revision: 1,
      document,
    })
  })
  it("isolates tenants, denies guests and supports independent tenant IDs", async () => {
    const { store } = fixture(),
      document = builderDocumentFixture()
    await store.saveBuilderDocument(principal(), 0, document)
    await expect(
      store.readBuilderDocument(principal("tenant-b"), document.id),
    ).rejects.toThrow("Not found")
    await expect(
      store.saveBuilderDocument({ ...principal(), grants: [] }, 0, document),
    ).rejects.toThrow("Forbidden")
    await store.saveBuilderDocument(principal("tenant-b"), 0, {
      ...document,
      name: "Other tenant",
    })
    expect(
      (await store.readBuilderDocument(principal(), document.id)).document.name,
    ).toBe(document.name)
  })
  it("keeps HTTP disabled before resolving identity or opening storage", async () => {
    const app = createThemeBuilderRoutes({
      enabled: () => false,
      principal: () => {
        throw new Error("must not authenticate")
      },
      store: () => {
        throw new Error("must not open")
      },
    })
    expect((await app.request("/tenant-a/documents")).status).toBe(404)
  })
  it("validates authenticated tenant assignment, body identity and CAS over HTTP", async () => {
    const { store } = fixture(),
      document = builderDocumentFixture()
    const app = createThemeBuilderRoutes({
      enabled: () => true,
      principal: () => principal(),
      store: () => store,
    })
    const put = (path: string, expectedRevision: number, body = document) =>
      app.request(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision, document: body }),
      })
    expect((await put("/tenant-b/documents/test-draft", 0)).status).toBe(404)
    expect((await put("/tenant-a/documents/wrong-id", 0)).status).toBe(400)
    const saved = await put("/tenant-a/documents/test-draft", 0)
    expect(saved.status).toBe(200)
    expect(saved.headers.get("cache-control")).toBe("private, no-store")
    expect((await put("/tenant-a/documents/test-draft", 0)).status).toBe(409)
    expect(
      await (await app.request("/tenant-a/documents/test-draft")).json(),
    ).toMatchObject({ revision: 1, document })
  })
})
