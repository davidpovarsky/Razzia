// Synthetic signed native session + exact F DTO component checks. This is not
// the actual B/F native-save consumer, root route/login or development replay.
import playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import type * as Playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
const { test, expect } = playwright as unknown as typeof Playwright
const id = (prefix = "P") =>
  (prefix + Date.now().toString(36) + Math.random().toString(36).slice(2))
    .padEnd(54, "x")
    .slice(0, 54)
const path = (requestId: string) => `/studio/native-save-consent/${requestId}`
const stats = async (
  request: Playwright.APIRequestContext,
  requestId: string,
) => (await request.get(`/qa/native-save/stats?id=${requestId}`)).json()
const open = async (
  page: Playwright.Page,
  requestId: string,
  locale = "en",
  suffix = "",
) => {
  await page.addInitScript(
    (value) => sessionStorage.setItem("qa.native-save.locale", value),
    locale,
  )
  await page.goto(path(requestId) + suffix)
}
const errors = new WeakMap<object, string[]>()
test.beforeEach(async ({ page }) => {
  const values: string[] = []
  errors.set(page, values)
  page.on("pageerror", (error) => values.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") values.push(message.text())
  })
  await page.addInitScript(() => {
    ;(window as any).__zod_globalConfig = { jitless: false }
    ;(window as any).__nativeSaveCsp = []
    window.addEventListener("securitypolicyviolation", (event) =>
      (window as any).__nativeSaveCsp.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      }),
    )
  })
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
  expect(
    await page.evaluate(() => ({
      csp: (window as any).__nativeSaveCsp,
      jitless: (window as any).__zod_globalConfig?.jitless,
    })),
  ).toEqual({ csp: [], jitless: false })
})

for (const [locale, title, approve, cancel] of [
  ["en", "Approve saving this revision", "Approve this revision", "Cancel"],
  [
    "fr",
    "Autoriser l’enregistrement de cette révision",
    "Autoriser cette révision",
    "Annuler",
  ],
  [
    "de",
    "Speichern dieser Revision genehmigen",
    "Diese Revision genehmigen",
    "Abbrechen",
  ],
  [
    "es",
    "Autorizar el guardado de esta revisión",
    "Autorizar esta revisión",
    "Cancelar",
  ],
  [
    "it",
    "Autorizza il salvataggio di questa revisione",
    "Autorizza questa revisione",
    "Annulla",
  ],
  ["ja", "このリビジョンの保存を承認", "このリビジョンを承認", "キャンセル"],
  [
    "tr",
    "Bu revizyonun kaydedilmesini onaylayın",
    "Bu revizyonu onayla",
    "İptal",
  ],
  ["vi", "Phê duyệt lưu bản sửa đổi này", "Phê duyệt bản sửa đổi này", "Hủy"],
] as const) {
  test(`exact escaped snapshot and separate approval labels: ${locale}`, async ({
    page,
    request,
  }, info) => {
    const requestId = id()
    await open(page, requestId, locale)
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: approve, exact: true }),
    ).toBeEnabled()
    await expect(
      page.getByRole("button", { name: cancel, exact: true }),
    ).toBeEnabled()
    const expected = await (
      await request.get("/qa/native-save/snapshot")
    ).json()
    expect(await page.getByTestId("native-save-snapshot").textContent()).toBe(
      expected.authoredShowJson,
    )
    await expect(page.getByTestId("native-save-digest")).toHaveText(
      expected.authoredDigest,
    )
    await expect(page.getByTestId("native-save-revision")).toHaveText("7")
    await expect(page.getByTestId("native-save-client")).toHaveText(
      "synthetic-native-save-client",
    )
    expect(
      await page
        .getByTestId("native-save-snapshot")
        .locator("img,script")
        .count(),
    ).toBe(0)
    expect(
      await page.evaluate(() => (window as any).__nativeSaveXss),
    ).toBeUndefined()
    expect(await stats(request, requestId)).toEqual({ inspect: 1, approve: 0 })
    if (locale === "ja") {
      await page.setViewportSize({ width: 390, height: 844 })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
      expect(overflow).toBe(false)
      await page.screenshot({
        path: info.outputPath("native-save-ja-390.png"),
        fullPage: true,
      })
    }
  })
}
test("only a trusted native click records one exact-revision approval and never navigates to a game", async ({
  page,
  request,
}) => {
  const requestId = id(),
    operations: string[] = []
  page.on("request", (request) => {
    if (request.method() === "POST")
      operations.push(new URL(request.url()).pathname)
  })
  await open(page, requestId)
  const button = page.getByRole("button", {
    name: "Approve this revision",
    exact: true,
  })
  await expect(button).toBeEnabled()
  await button.evaluate((element) => (element as HTMLButtonElement).click())
  expect(await stats(request, requestId)).toEqual({ inspect: 1, approve: 0 })
  await button.click()
  await expect(page.getByRole("status")).toHaveText(
    "Approval recorded. Return to the connected application to finish saving.",
  )
  await expect(button).toBeDisabled()
  expect(new URL(page.url()).pathname).toBe(path(requestId))
  expect(await stats(request, requestId)).toEqual({ inspect: 1, approve: 1 })
  expect(operations).toEqual([
    "/api/qa/oauth/native-save/inspect",
    "/api/qa/oauth/native-save/approve",
  ])
})
test("cancel discards the inspected proof without submitting approval", async ({
  page,
  request,
}) => {
  const requestId = id()
  await open(page, requestId)
  await expect(
    page.getByRole("button", { name: "Approve this revision", exact: true }),
  ).toBeEnabled()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("Review canceled.")
  await expect(page.getByTestId("native-save-snapshot")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Approve this revision", exact: true }),
  ).toBeDisabled()
  expect(await stats(request, requestId)).toEqual({ inspect: 1, approve: 0 })
})
test("cancel during inspection rejects its late result", async ({
  page,
  request,
}) => {
  const requestId = id()
  let release!: () => void, received!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const inspected = new Promise<void>((resolve) => {
    received = resolve
  })
  await page.route("**/native-save/inspect", async (route) => {
    const response = await route.fetch()
    received()
    await held
    await route.fulfill({ response }).catch(() => undefined)
  })
  await open(page, requestId)
  await inspected
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  release()
  await expect(page.getByRole("status")).toHaveText("Review canceled.")
  await expect(page.getByTestId("native-save-snapshot")).toHaveCount(0)
  expect(await stats(request, requestId)).toEqual({ inspect: 1, approve: 0 })
})
test("real cross-tab session replacement clears the private snapshot and approval", async ({
  page,
  context,
  request,
}) => {
  const requestId = id()
  await open(page, requestId)
  await expect(
    page.getByRole("button", { name: "Approve this revision", exact: true }),
  ).toBeEnabled()
  const other = await context.newPage()
  await other.goto("/qa/native-save/session?owner=b")
  const { token } = JSON.parse(await other.locator("body").innerText())
  await other.evaluate((value) => localStorage.setItem("token", value), token)
  await expect(page.getByRole("alert")).toHaveText(
    "This request or session has expired. Reopen the save request.",
  )
  await expect(page.getByTestId("native-save-snapshot")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Approve this revision", exact: true }),
  ).toBeDisabled()
  expect(await stats(request, requestId)).toEqual({ inspect: 1, approve: 0 })
  await other.close()
})
test("pending consent expires without an approval call", async ({
  page,
  request,
}) => {
  const requestId = id()
  await page.clock.install()
  await open(page, requestId)
  await expect(
    page.getByRole("button", { name: "Approve this revision", exact: true }),
  ).toBeEnabled()
  await page.clock.fastForward(301000)
  await expect(page.getByRole("alert")).toHaveText(
    "This request or session has expired. Reopen the save request.",
  )
  await expect(page.getByTestId("native-save-snapshot")).toHaveCount(0)
  expect(await stats(request, requestId)).toEqual({ inspect: 1, approve: 0 })
})
test("approved/publishing/saved/expired are read-only statuses, never a new approval", async ({
  page,
  request,
}) => {
  for (const prefix of ["A", "B", "S", "E"]) {
    const requestId = id(prefix)
    await open(page, requestId)
    await expect(page.getByTestId("native-save-client")).toHaveText(
      "synthetic-native-save-client",
    )
    await expect(
      page.getByRole("button", { name: "Approve this revision", exact: true }),
    ).toBeDisabled()
    expect(await stats(request, requestId)).toEqual({ inspect: 1, approve: 0 })
  }
})
test("query/hash input and missing real HEAD no-store policy fail closed", async ({
  page,
  request,
}) => {
  const requestId = id()
  await open(page, requestId, "en", "?anything=forbidden")
  await expect(page.getByRole("alert")).toHaveText(
    "Save approval is unavailable on this page.",
  )
  expect(await stats(request, requestId)).toEqual({ inspect: 0, approve: 0 })
  await page.route("**/studio/native-save-consent/*", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({
          status: 200,
          headers: {
            "Referrer-Policy": "no-referrer",
            "Content-Security-Policy": "frame-ancestors 'none'",
          },
        })
      : route.continue(),
  )
  await open(page, requestId)
  await expect(page.getByRole("alert")).toHaveText(
    "This revision could not be approved. Reopen the save request.",
  )
  expect(await stats(request, requestId)).toEqual({ inspect: 0, approve: 0 })
})
