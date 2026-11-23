import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-preview/backdrop",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.setDefaultTimeout(15000)
const checks = [],
  errors = [],
  responses = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("response", (r) => {
  if (r.status() >= 400) {
    responses.push({ url: r.url(), status: r.status() })
  }
})
let appearance = undefined,
  legacy = false,
  sourceReceipt = undefined

await page.route("**/media/background-position-proof.png", (route) =>
  route.fulfill({
    status: 200,
    contentType: "image/png",
    body: fs.readFileSync(
      path.resolve("../web/public/tadazz-favicon-z-20261108.png"),
    ),
  }),
)
await page.route(
  "**/api/extensions/quizzes/VgCunRFT_E04gIAMbv8CU",
  async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    const { extras } = data

    if (!extras) {
      throw new Error("Expected actual fixture sidecar")
    }

    for (const id of extras.questionIds) {
      const per = extras.perQuestion[id] ?? {}
      delete per.themeOverrides

      if (appearance) {
        per.background = {
          url: "/media/background-position-proof.png",
          fit: "cover",
          ...appearance,
        }
      } else {
        delete per.background
      }

      extras.perQuestion[id] = per
    }

    if (legacy) {
      extras.defaults.motionKit = "legacy"
      delete extras.defaults.showTheme
    }

    delete extras.defaults.tadazzBackground
    sourceReceipt = {
      method:
        "Read-only staged response of existing saved native fixture; only authored perQuestion.background and legacy control reachability are varied. No write/save requests.",
      appearance,
      legacy,
      questionIds: extras.questionIds,
      backgrounds: Object.fromEntries(
        extras.questionIds.map((id) => [
          id,
          extras.perQuestion[id]?.background ?? null,
        ]),
      ),
      fixtureImage: {
        source: "packages/web/public/tadazz-favicon-z-20261108.png",
        width: 1122,
        height: 1402,
      },
    }
    await route.fulfill({ response, json: data })
  },
)
async function selectTheme(id) {
  await page.getByTestId("studio-tab-settings").click()
  const button = page.getByTestId(`show-theme-${id}`).getByRole("button")

  if (await button.isEnabled()) {
    await button.click()
  }

  if (await page.getByRole("alertdialog").isVisible()) {
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Use this theme", exact: true })
      .click()
  }

  await page.getByTestId("studio-tab-questions").click()
}
async function native(theme) {
  const preview = page.getByTestId("question-live-preview")
  await expect(
    preview.locator(
      "[data-native-application-preview][data-preview-ready=true]",
    ),
  ).toBeVisible()
  await expect(preview.locator("[data-preview-theme]")).toHaveAttribute(
    "data-preview-theme",
    theme,
  )
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r))
    })
  })

  return preview
}
async function state(preview, theme) {
  const target =
    theme === "tadazz-classic"
      ? preview.getByTestId("tadazz-backdrop")
      : preview.locator("[data-original-razzia-preview]")

  return target.evaluate((el) => {
    const s = getComputedStyle(el)

    return {
      backgroundPosition: s.backgroundPosition,
      backgroundImage: s.backgroundImage,
      opacity: s.opacity,
    }
  })
}
let result = {}

try {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
  await page.goto("http://127.0.0.1:3180/manager?lng=en")
  await page.locator("input[type=password]").fill("e2e-password")
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await page.waitForURL("**/manager/config")
  for (const theme of ["tadazz-classic", "razzia-original"]) {
    for (const test of [
      { name: "inherited", value: undefined, pos: "50% 50%", alpha: 0 },
      {
        name: "top-zero",
        value: { position: "top", overlayOpacity: 0 },
        pos: "50% 0%",
        alpha: 0,
      },
      {
        name: "bottom-zero",
        value: { position: "bottom", overlayOpacity: 0 },
        pos: "50% 100%",
        alpha: 0,
      },
      {
        name: "bottom-dark",
        value: { position: "bottom", overlayOpacity: 0.65 },
        pos: "50% 100%",
        alpha: 0.65,
      },
    ]) {
      appearance = test.value
      await page.goto(
        `http://127.0.0.1:3180/manager/quizz/VgCunRFT_E04gIAMbv8CU?lng=en&background=${
          theme
        }${test.name}`,
      )
      await page.getByTestId("editor-save-btn").waitFor()
      await selectTheme(theme)
      const preview = await native(theme)
      const actual = await state(preview, theme)
      expect(actual.backgroundPosition.split(", ").at(-1)).toBe(test.pos)

      if (test.alpha === 0) {
        expect(actual.backgroundImage).not.toContain("linear-gradient")
      } else {
        expect(actual.backgroundImage).toContain("rgba(0, 0, 0, 0.65)")
      }

      expect(actual.opacity).toBe("1")
      const foreground = preview.getByText("Which colour is the sky?", {
        exact: true,
      })
      await expect(foreground).toBeVisible()
      await expect
        .poll(() => foreground.evaluate((e) => getComputedStyle(e).opacity))
        .toBe("1")
      const foregroundOpacity = await foreground.evaluate(
        (e) => getComputedStyle(e).opacity,
      )
      await preview.screenshot({
        path: path.join(out, `${theme}-${test.name}.png`),
      })
      checks.push({
        theme,
        name: test.name,
        actual,
        foregroundOpacity,
        sourceReceipt,
      })
    }
  }
  legacy = true
  appearance = { position: "top", overlayOpacity: 0.2 }
  await page.goto(
    "http://127.0.0.1:3180/manager/quizz/VgCunRFT_E04gIAMbv8CU?lng=en&background=legacy-slider",
  )
  await page.getByTestId("editor-save-btn").waitFor()
  const slider = page.getByTestId("card-bg-overlay-input")
  await expect(slider).toBeVisible()
  const preview = page.getByTestId("question-live-preview")
  await expect(
    preview.locator(
      "[data-native-application-preview][data-preview-ready=true]",
    ),
  ).toBeVisible()
  const theme = await preview
    .locator("[data-preview-theme]")
    .getAttribute("data-preview-theme")
  const before = await state(preview, theme)
  await slider.fill("0.7")
  await expect
    .poll(async () => (await state(preview, theme)).backgroundImage)
    .toContain("rgba(0, 0, 0, 0.7)")
  const after = await state(preview, theme)
  await preview.screenshot({
    path: path.join(out, "legacy-overlay-live-edit.png"),
  })
  checks.push({
    name: "actual legacy overlay slider updates native preview without saving",
    theme,
    before,
    after,
    sourceReceipt,
  })
  await page.getByTestId("editor-question-card-2").click()
  await expect(preview.locator("[data-editor-preview-fallback]")).toBeVisible()
  const fallbackPosition = await preview
    .locator(
      '[data-testid="question-preview-native-stage"] [style*="background-position"]',
    )
    .first()
    .evaluate((e) => getComputedStyle(e).backgroundPosition)
  expect(fallbackPosition).toBe("50% 0%")
  checks.push({
    name: "actual native estimation fallback honors authored position",
    fallbackPosition,
  })
  expect(errors).toEqual([])
  result = { ok: true, checks, errors, responses }
} catch (e) {
  result = { ok: false, error: String(e), checks, errors, responses }
  await page
    .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
    .catch(() => {
      /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
    })
  process.exitCode = 1
} finally {
  fs.writeFileSync(
    path.join(out, "audit.json"),
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result))
  await browser.close()
}
