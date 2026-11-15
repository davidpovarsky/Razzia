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
  for (const finish of cleanup.splice(0).reverse()) finish()
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
