import playwright from "../../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import type * as Playwright from "../../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import { writeFile } from "node:fs/promises"
import { localizedFixtureText } from "./qa-localized-content"
const { test, expect } = playwright as unknown as typeof Playwright
const logs = new WeakMap<object, unknown[]>()
test.beforeEach(async ({ page }) => {
  const log: unknown[] = []
  logs.set(page, log)
  page.on("pageerror", (error) =>
    log.push({ type: "pageerror", message: error.message }),
  )
  page.on("console", (message) => {
    if (message.type() === "error")
      log.push({ type: "console", text: message.text() })
  })
  await page.addInitScript(() => {
    ;(window as any).__qaCsp = []
    ;(window as any).__zod_globalConfig = { jitless: false }
    window.addEventListener("securitypolicyviolation", (event) => {
      ;(window as any).__qaCsp.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      })
    })
  })
})
test.afterEach(async ({ page }, info) => {
  const evidence = await page
    .evaluate(() => ({
      csp: (window as any).__qaCsp,
      diagnostics: (window as any).__showPreviewQa?.diagnostics(),
      userAgent: navigator.userAgent,
    }))
    .catch(() => null)
  const path = info.outputPath("native-events.json")
  await writeFile(
    path,
    JSON.stringify({ events: logs.get(page), evidence }, null, 2),
  )
  await info.attach("native-events.json", {
    path,
    contentType: "application/json",
  })
})
const ready = async (page: Playwright.Page) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
}

for (const locale of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"] as const)
  test(`actual localized authored question/choices: ${locale}`, async ({
    page,
  }) => {
    await ready(page)
    await page.evaluate(
      (locale) =>
        (window as any).__showPreviewQa.show({
          locale,
          authoredLocale: locale,
          phase: "results",
          paused: true,
          elapsed: 20000,
        }),
      locale,
    )
    await expect(page.getByTestId("tadazz-question-panel")).toContainText(
      localizedFixtureText[locale].question,
    )
    await expect(page.getByTestId("tadazz-question-panel")).toBeVisible()
    await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
      "data-preview-ready",
      "true",
    )
    await expect(page.getByTestId("native-preview-surface")).toHaveCSS(
      "opacity",
      "1",
    )
    await expect(page.getByTestId("tadazz-card-0")).toContainText(
      localizedFixtureText[locale].choices[0],
    )
    await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
    const report = await page.evaluate(() =>
      (window as any).__showPreviewQa.diagnostics(),
    )
    expect(report.handleId).toBeGreaterThan(0)
    expect(report.jitlessBefore).toBe(false)
    expect(report.jitlessAfter).toBe(false)
    expect(await page.evaluate(() => (window as any).__qaCsp)).toEqual([])
    expect(logs.get(page)).toEqual([])
  })

test("actual ref identity survives q2/resize, pending transitions cannot resurrect after disposal", async ({
  page,
}) => {
  await ready(page)
  await page.evaluate(() =>
    (window as any).__showPreviewQa.show({ phase: "question", paused: true }),
  )
  await expect(page.getByTestId("tadazz-question-panel")).toContainText(
    "Synthetic question 1",
  )
  await expect(page.getByTestId("tadazz-question-panel")).toBeVisible()
  await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
    "data-preview-ready",
    "true",
  )
  await expect(page.getByTestId("native-preview-surface")).toHaveCSS(
    "opacity",
    "1",
  )
  const first = await page.evaluate(
    () => (window as any).__showPreviewQa.diagnostics().handleId,
  )
  await page.evaluate(() =>
    (window as any).__showPreviewQa.show({
      phase: "question",
      question: 1,
      paused: false,
    }),
  )
  await expect(page.getByTestId("tadazz-question-panel")).toContainText(
    "Synthetic question 2",
    { timeout: 15000 },
  )
  await page.evaluate(() => (window as any).__showPreviewQa.resize(800, 600))
  expect(
    await page.evaluate(
      () => (window as any).__showPreviewQa.diagnostics().handleId,
    ),
  ).toBe(first)
  await page.evaluate(async () => {
    await (window as any).__showPreviewQa.show({
      phase: "voteLocked",
      question: 1,
      elapsed: 20000,
    })
    ;(window as any).__showPreviewQa.dispose()
    ;(window as any).__showPreviewQa.dispose()
  })
  await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
  await page.waitForTimeout(1500)
  const report = await page.evaluate(() =>
    (window as any).__showPreviewQa.diagnostics(),
  )
  expect(report).toMatchObject({ disposed: true, handleId: null })
  expect(report.lifecycle).toEqual([
    { event: "mounted", handleId: first },
    { event: "disposed", handleId: first },
  ])
  await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
  expect(logs.get(page)).toEqual([])
})

for (const answerCount of [2, 3, 4, 5])
  for (const playMode of ["quiz", "survey"] as const)
    test(`bounded current-card subset ${playMode}/${answerCount}`, async ({
      page,
    }) => {
      await ready(page)
      await page.evaluate(
        ({ answerCount, playMode }) =>
          (window as any).__showPreviewQa.show({
            answerCount,
            playMode,
            questionType: answerCount === 3 ? "multi" : "single",
            phase: "results",
            paused: true,
            elapsed: 20000,
          }),
        { answerCount, playMode },
      )
      for (let index = 0; index < answerCount; index++)
        await expect(page.getByTestId(`tadazz-card-${index}`)).toBeVisible()
      for (let index = answerCount; index < 5; index++)
        await expect(page.getByTestId(`tadazz-card-${index}`)).not.toBeVisible()
      await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
        "data-preview-ready", "true",
      )
      await expect(page.getByTestId("native-preview-surface")).toHaveCSS("opacity", "1")
      expect(
        await page.evaluate(() => (window as any).__showPreviewQa.failures()),
      ).toBe(0)
      expect(logs.get(page)).toEqual([])
    })

for (const size of [
  { width: 358, height: 202 },
  { width: 992, height: 744 },
  { width: 1888, height: 1062 },
])
  test(`actual stage responsive ${size.width}x${size.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({
      width: size.width + 32,
      height: Math.max(768, size.height + 32),
    })
    await ready(page)
    await page.evaluate((size) => {
      ;(window as any).__showPreviewQa.resize(size.width, size.height)
      return (window as any).__showPreviewQa.show({
        phase: "results",
        paused: true,
        elapsed: 20000,
      })
    }, size)
    await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
    await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
      "data-preview-ready", "true",
    )
    await expect(page.getByTestId("native-preview-surface")).toHaveCSS("opacity", "1")
    const path = info.outputPath("native-stage.png")
    await page.screenshot({ path })
    await info.attach("native-stage.png", { path, contentType: "image/png" })
    expect(logs.get(page)).toEqual([])
  })
