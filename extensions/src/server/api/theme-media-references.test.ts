import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it, vi } from "vitest"
import { builderDocumentFixture } from "../../components/theme-builder/document.fixture"

it("turning the installer OFF cannot release retained account media", async () => {
  const root = mkdtempSync(join(tmpdir(), "theme-media-policy-"))
  let close: (() => void) | undefined = undefined

  try {
    vi.stubEnv("CONFIG_PATH", root)
    vi.stubEnv("JWT_SECRET", "isolated-theme-media-policy-secret-2026")
    vi.stubEnv("TADAZZ_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("TADAZZ_THEME_INSTALLER_ENABLED", "true")
    vi.stubEnv("TADAZZ_THEME_WORKSPACE_GRANTS", "")
    const api =
      await import("../../../../packages/socket/src/services/theme-installation")
    const owner = crypto.randomUUID()
    const store = api.themeInstallationStore()
    close = () => store.close()
    const document = structuredClone(builderDocumentFixture())
    document.registry.templates[0].nodes[0].props.imageUrl =
      "/media/retained.png"
    await store.saveBuilderDocument(
      { userId: owner, tenantId: owner, grants: ["author"] },
      0,
      document,
    )
    vi.stubEnv("TADAZZ_THEME_INSTALLER_ENABLED", "false")
    expect(() => api.themeInstallationStore()).toThrow("Not found")
    expect(api.isSavedThemeMediaReferenced(owner, "retained.png")).toBe(true)
    expect(api.isSavedThemeMediaReferenced(owner, "unused.png")).toBe(false)
    expect(
      api.isSavedThemeMediaReferenced(crypto.randomUUID(), "retained.png"),
    ).toBe(false)
  } finally {
    close?.()
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  }
})
