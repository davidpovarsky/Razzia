import { afterEach, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { themeRoutes } from "./theme-routes"
import { mintToken } from "../../services/auth"
import { installedThemeForSelection } from "../../services/theme-installation"
import { showThemeRegistry } from "@razzia/extensions/core"
import { SESSION_ROLES } from "@razzia/common/constants"
const app = new Hono().route("/api/themes", themeRoutes)
afterEach(() => vi.unstubAllEnvs())
it("demo catalog defaults off and never changes the bundled registry", async () => {
  vi.stubEnv("TADAZZ_DEMO_CATALOG_ENABLED", "false")
  vi.stubEnv("TADAZZ_THEME_INSTALLER_ENABLED", "false")
  expect((await app.request("/api/themes/catalog")).status).toBe(404)
  expect(
    installedThemeForSelection("platform", {
      id: "tadazz-demo-cosmic",
      version: "2.0.0",
    }),
  ).toBeNull()
  expect(showThemeRegistry.list().map((theme) => theme.id)).toEqual([
    "tadazz-classic",
    "razzia-original",
  ])
})
it("explicit demo mode authenticates reads, resolves exact versions and denies workspace writes", async () => {
  vi.stubEnv("TADAZZ_DEMO_CATALOG_ENABLED", "true")
  vi.stubEnv("TADAZZ_THEME_INSTALLER_ENABLED", "false")
  vi.stubEnv("TADAZZ_ACCOUNTS_ENABLED", "false")
  expect((await app.request("/api/themes/catalog")).status).toBe(401)
  const { token } = await mintToken(crypto.randomUUID(), SESSION_ROLES.MANAGER)
  const headers = { Authorization: `Bearer ${token}` }
  const response = await app.request("/api/themes/catalog", { headers })
  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  const body = (await response.json()) as { definitions: Array<{ id: string }> }
  expect(body.definitions.map((theme: { id: string }) => theme.id)).toEqual([
    "tadazz-demo-cosmic",
    "tadazz-demo-cosmic",
    "tadazz-demo-jade",
    "tadazz-demo-jade",
  ])
  expect(
    (await app.request("/api/themes/workspaces", { headers })).status,
  ).toBe(404)
  expect(
    (await app.request("/api/themes/catalog", { headers, method: "POST" }))
      .status,
  ).toBe(404)
  expect(
    (
      await app.request("/api/themes/workspaces/platform/drafts", {
        headers,
        method: "POST",
      })
    ).status,
  ).toBe(404)
  expect(
    installedThemeForSelection("platform", {
      id: "tadazz-demo-jade",
      version: "2.0.0",
    })?.id,
  ).toBe("tadazz-demo-jade")
  expect(
    installedThemeForSelection("platform", {
      id: "tadazz-demo-jade",
      version: "3.0.0",
    }),
  ).toBeNull()
  expect(
    Object.isFrozen(
      installedThemeForSelection("platform", {
        id: "tadazz-demo-jade",
        version: "2.0.0",
      }),
    ),
  ).toBe(true)
  expect(
    installedThemeForSelection("platform", {
      id: "tadazz-demo-cosmic",
      version: "1.0.0",
    })?.id,
  ).toBe("tadazz-demo-cosmic")
  expect(showThemeRegistry.list()).toHaveLength(2)
})
