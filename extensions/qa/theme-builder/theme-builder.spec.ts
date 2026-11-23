import playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import { writeFile } from "node:fs/promises"
import { builderText } from "../../src/components/theme-builder/strings"
const { test, expect } =
  playwright as unknown as typeof import("../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js")
function isObservedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireObservedRecord(value: unknown): Record<string, unknown> {
  if (!isObservedRecord(value)) {
    throw new Error("Expected an object in the observed JSON value")
  }

  return value
}

const logs = new WeakMap<object, unknown[]>()
test.beforeEach(({ page }) => {
  const log: unknown[] = []
  logs.set(page, log)
  page.on("pageerror", (error) =>
    log.push({ type: "pageerror", message: error.message }),
  )
  page.on("console", (message) => {
    if (message.type() === "error") {
      log.push({ type: "console", text: message.text() })
    }
  })
  page.on("requestfailed", (request) =>
    log.push({
      type: "requestfailed",
      url: request.url(),
      error: request.failure()?.errorText,
    }),
  )
})
test.afterEach(async ({ page }, info) => {
  const path = info.outputPath("browser-events.json")
  await writeFile(path, JSON.stringify(logs.get(page) ?? [], null, 2))
  await info.attach("browser-events.json", {
    path,
    contentType: "application/json",
  })
})

for (const locale of [
  "en",
  "fr",
  "de",
  "es",
  "it",
  "ja",
  "tr",
  "vi",
] as const) {
  test(`authored UI and 15 slots/16 events: ${locale}`, async ({ page }) => {
    const t = builderText(locale)
    await page.goto(`/?locale=${locale}&draft=locale-${locale}`)
    await expect(
      page.getByRole("heading", { name: `Tadazz · ${t("title")}` }),
    ).toBeVisible()
    await expect(
      page.getByTestId("native-theme-library").locator("select"),
    ).toHaveCount(31)
    await expect(
      page.getByRole("button", { name: t("publish"), exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: t("save"), exact: true }),
    ).toBeEnabled()
    expect(await page.getByTestId("theme-builder").innerText()).not.toMatch(
      /themes\.|tadazzThemeBuilder|translation:/u,
    )
    expect(logs.get(page)).toEqual([])
  })
}

test("keyboard tree edits, undo/redo and real persisted draft roundtrip", async ({
  page,
}, info) => {
  const id = `roundtrip-${info.project.name}`
  await page.goto(`/?draft=${id}`)
  const second = page.locator('[data-node-id="second"]')
  await second.focus()
  await second.press("Alt+ArrowUp")
  await expect
    .poll(() =>
      page
        .locator('[role="treeitem"]')
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-node-id")),
        ),
    )
    .toEqual(["root", "second", "first"])
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect
    .poll(() =>
      page
        .locator('[role="treeitem"]')
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-node-id")),
        ),
    )
    .toEqual(["root", "first", "second"])
  await page.getByRole("button", { name: "Redo", exact: true }).click()
  await page
    .getByLabel("Theme name", { exact: true })
    .fill("Saved visual theme")
  const response = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().endsWith(`/${id}`),
  )
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  expect((await response).status()).toBe(200)
  await expect(page.getByRole("status").first()).toHaveText("Draft saved")
  await page.goto(`/?draft=${id}&load=true`)
  await expect(page.getByLabel("Theme name", { exact: true })).toHaveValue(
    "Saved visual theme",
  )
  await expect
    .poll(() =>
      page
        .locator('[role="treeitem"]')
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-node-id")),
        ),
    )
    .toEqual(["root", "second", "first"])
})

test("draft conflict preserves local edits", async ({ page }, info) => {
  const id = `conflict-${info.project.name}`
  await page.goto(`/?draft=${id}`)
  let conflict = false
  await page.route(
    `**/api/themes/builder/tenant-a/documents/${id}`,
    async (route) => {
      if (route.request().method() === "PUT" && conflict) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: '{"error":"Draft revision conflict"}',
        })
      } else {
        await route.continue()
      }
    },
  )
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  await expect(page.getByRole("status").first()).toHaveText("Draft saved")
  conflict = true
  await page.getByLabel("Theme name", { exact: true }).fill("Preserve my edits")
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  await expect(page.getByRole("status").first()).toContainText("newer draft")
  await expect(page.getByLabel("Theme name", { exact: true })).toHaveValue(
    "Preserve my edits",
  )
})

test("read-only UI and authenticated cross-tenant API denial", async ({
  page,
  request,
}) => {
  await page.goto("/?readonly=true&draft=readonly")
  await expect(page.getByLabel("Theme name", { exact: true })).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled()
  expect(
    (await request.get("/api/themes/builder/tenant-a/documents")).status(),
  ).toBe(401)
  const session = requireObservedRecord(
    await (await request.get("/qa/session")).json(),
  )

  if (typeof session.token !== "string") {
    throw new Error(
      "Expected the synthetic builder session token to be a string",
    )
  }

  expect(
    (
      await request.get("/api/themes/builder/tenant-b/documents", {
        headers: { Authorization: `Bearer ${session.token}` },
      })
    ).status(),
  ).toBe(404)
})

test("edits made during a real save remain dirty after acknowledgment", async ({
  page,
}, info) => {
  const id = `save-race-${info.project.name}`
  await page.goto(`/?draft=${id}`)
  let release: () => void = () => {},
    acknowledge: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const persisted = new Promise<void>((resolve) => {
    acknowledge = resolve
  })
  await page.route(
    `**/api/themes/builder/tenant-a/documents/${id}`,
    async (route) => {
      const response = await route.fetch()
      acknowledge()
      await gate
      await route.fulfill({ response })
    },
  )
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  await persisted
  await page.getByLabel("Theme name", { exact: true }).fill("Edit during save")
  release()
  await expect(page.getByRole("status").first()).toHaveText("Unsaved changes")
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeEnabled()
  const response = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().endsWith(`/${id}`),
  )
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  expect(requireObservedRecord(await (await response).json()).revision).toBe(2)
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`responsive keyboard RTL reduced motion: ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/?dir=rtl&appearance=dark&draft=responsive")
    await expect(
      page.getByRole("heading", { name: "Tadazz · Theme Builder" }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const colours = await page
      .getByTestId("theme-builder")
      .evaluate((element) => {
        const style = getComputedStyle(element)

        return { text: style.color, background: style.backgroundColor }
      })
    expect(colours.background).not.toBe("rgba(0, 0, 0, 0)")
    await page.locator('[data-node-id="root"]').focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.locator('[data-node-id="first"]')).toBeFocused()
    await page
      .getByLabel("Layout plan", { exact: true })
      .first()
      .selectOption("safe-4-3")
    const screenshot = info.outputPath(`builder-${viewport.width}.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    await info.attach("builder.png", {
      path: screenshot,
      contentType: "image/png",
    })
    expect(logs.get(page)).toEqual([])
  })
}
