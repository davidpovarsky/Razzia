import playwright from "../../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import type * as Playwright from "../../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import { writeFile } from "node:fs/promises"
import { localizedFixtureText } from "./qa-localized-content"
const { test, expect } = playwright as unknown as typeof Playwright
const events = new WeakMap<object, unknown[]>()
test.beforeEach(async ({ page }) => {
  const errors: unknown[] = []
  events.set(page, errors)
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.addInitScript(() => {
    ;(window as any).__zod_globalConfig = { jitless: false }
    ;(window as any).__v2Csp = []
    window.addEventListener("securitypolicyviolation", (event) =>
      (window as any).__v2Csp.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      }),
    )
  })
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
})
test.afterEach(async ({ page }, info) => {
  const evidence = await page
    .evaluate(() => ({
      diagnostics: (window as any).__v2Qa.diagnostics(),
      csp: (window as any).__v2Csp,
      userAgent: navigator.userAgent,
    }))
    .catch(() => null)
  const path = info.outputPath("v2-events.json")
  await writeFile(
    path,
    JSON.stringify({ evidence, events: events.get(page) }, null, 2),
  )
  await info.attach("v2-events.json", { path, contentType: "application/json" })
})
test("distinct native family switch, exact built admission and disposal", async ({
  page,
}, info) => {
  await page.evaluate(() =>
    (window as any).__v2Qa.show({ theme: "tadazz-classic" }),
  )
  await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
  await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
    "data-preview-ready",
    "true",
  )
  await expect(page.getByTestId("native-preview-surface")).toHaveCSS(
    "opacity",
    "1",
  )
  await expect(page.getByTestId("native-razzia-preview-v2")).toHaveCount(0)
  const classic = await page.evaluate(
    () => (window as any).__v2Qa.diagnostics().handleId,
  )
  await page.evaluate(() =>
    (window as any).__v2Qa.show({ theme: "razzia-original", effect: "fade" }),
  )
  await expect(page.getByTestId("native-razzia-answer-0")).toBeVisible()
  expect(
    await page.evaluate(async () => {
      try {
        await (window as any).__v2Qa.show({
          theme: "tadazz-classic",
          effect: "fade",
        })
        return null
      } catch (error) {
        return (error as Error).message
      }
    }),
  ).toContain("classic-visual-settings-unavailable")
  await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
  await expect(page.getByTestId("native-razzia-preview-v2")).toHaveAttribute(
    "data-native-renderer",
    "razzia-native-stage",
  )
  await expect(page.locator('[data-tada-entrance="fade"]')).toBeVisible()
  await expect(page.locator('[data-tada-underline="pulse-bar"]')).toBeVisible()
  for (const kind of ["digest", "variant", "version"])
    expect(
      await page.evaluate(
        (kind) => (window as any).__v2Qa.rejectMutation(kind),
        kind,
      ),
    ).toBeTruthy()
  await expect(page.getByTestId("native-razzia-answer-0")).toBeVisible()
  const native = await page.evaluate(
    () => (window as any).__v2Qa.diagnostics().handleId,
  )
  expect(native).not.toBe(classic)
  const screenshot = info.outputPath("distinct-native-razzia.png")
  await page.screenshot({ path: screenshot })
  await info.attach("distinct-native-razzia.png", {
    path: screenshot,
    contentType: "image/png",
  })
  await page.evaluate(() =>
    (window as any).__v2Qa.show({ theme: "tadazz-classic" }),
  )
  await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
  await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
    "data-preview-ready",
    "true",
  )
  await expect(page.getByTestId("native-preview-surface")).toHaveCSS(
    "opacity",
    "1",
  )
  await page.evaluate(() => {
    ;(window as any).__v2Qa.dispose()
    ;(window as any).__v2Qa.dispose()
  })
  await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
  await expect(page.getByTestId("native-razzia-preview-v2")).toHaveCount(0)
  expect(
    await page.evaluate(() => (window as any).__v2Qa.diagnostics()),
  ).toMatchObject({
    disposed: true,
    handleId: null,
    jitlessBefore: false,
    jitlessAfter: false,
    failures: 0,
  })
  expect(events.get(page)).toEqual([])
  expect(await page.evaluate(() => (window as any).__v2Csp)).toEqual([])
})
test("native current-card locale/count/mode/phase and host clock projections", async ({
  page,
}) => {
  for (const [locale, count, mode] of [
    ["ja", "2", "quiz"],
    ["vi", "5", "survey"],
  ] as const) {
    await page.evaluate((values) => (window as any).__v2Qa.show(values), {
      theme: "razzia-original",
      locale,
      count,
      mode,
      phase: "results",
    })
    await expect(page.getByTestId("native-razzia-question")).toHaveText(
      `${localizedFixtureText[locale].question} 1`,
    )
    await expect(
      page.getByTestId(`native-razzia-answer-${Number(count) - 1}`),
    ).toBeVisible()
    await expect(
      page.getByTestId(`native-razzia-answer-${Number(count)}`),
    ).toHaveCount(0)
  }
  await page.evaluate(() =>
    (window as any).__v2Qa.show({
      theme: "razzia-original",
      phase: "voting",
      paused: "true",
    }),
  )
  await expect(page.getByTestId("native-razzia-clock")).toHaveText("15")
  await page.waitForTimeout(350)
  await expect(page.getByTestId("native-razzia-clock")).toHaveText("15")
  await page.evaluate(() =>
    (window as any).__v2Qa.show({
      theme: "razzia-original",
      phase: "question",
      question: "1",
    }),
  )
  await expect(page.getByTestId("native-razzia-question")).toHaveText(
    `${localizedFixtureText.en.question} 2`,
  )
  await expect(page.getByTestId("native-razzia-answer-0")).toHaveCount(0)
  expect(events.get(page)).toEqual([])
})
