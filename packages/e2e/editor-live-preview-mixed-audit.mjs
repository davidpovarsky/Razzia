import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-preview/mixed",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const checks = [],
  failures = [],
  errors = []
let page
async function shot(name) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    )
  })
  await page.screenshot({ path: path.join(out, name + ".png"), fullPage: true })
}
async function exact(theme) {
  const preview = page.getByTestId("question-live-preview")
  await expect(
    preview.locator(
      "[data-native-application-preview][data-preview-ready=true]",
    ),
  ).toBeVisible()
  await expect(preview.locator("[data-editor-preview-fallback]")).toHaveCount(0)
  await expect(preview.locator("[data-preview-theme]")).toHaveAttribute(
    "data-preview-theme",
    theme,
  )
  return preview.evaluate((e) => ({
    text: e.innerText,
    theme: e
      .querySelector("[data-preview-theme]")
      ?.getAttribute("data-preview-theme"),
    number: e
      .querySelector("[data-preview-question-number]")
      ?.getAttribute("data-preview-question-number"),
    total: e
      .querySelector("[data-preview-question-total]")
      ?.getAttribute("data-preview-question-total"),
    images: [...e.querySelectorAll("img")].map((n) => ({
      src: n.getAttribute("src"),
      alt: n.alt,
      naturalWidth: n.naturalWidth,
    })),
  }))
}
try {
  for (const theme of ["tadazz-classic", "razzia-original"]) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "en-US",
    })
    page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.on("pageerror", (e) => errors.push(e.message))
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
    await page.goto("http://127.0.0.1:3180/manager?lng=en")
    await page.locator("input[type=password]").fill("e2e-password")
    await page.getByRole("button", { name: "Submit", exact: true }).click()
    await page.waitForURL("**/manager/config")
    await page.goto(
      "http://127.0.0.1:3180/manager/quizz/VgCunRFT_E04gIAMbv8CU?lng=en",
    )
    await page.getByTestId("editor-save-btn").waitFor()
    await page.getByTestId("studio-tab-settings").click()
    const choose = page.getByTestId("show-theme-" + theme).getByRole("button")
    if (await choose.isEnabled()) await choose.click()
    if (await page.getByRole("alertdialog").isVisible())
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Use this theme", exact: true })
        .click()
    await page.getByTestId("studio-tab-questions").click()
    await page.getByTestId("editor-question-card-0").click()
    for (const mode of ["both", "image", "text"]) {
      await page.getByTestId("answer-mode-0-" + mode).click()
      const state = await exact(theme)
      expect(state.number).toBe("1")
      expect(state.total).toBe("3")
      const mediaImages = state.images.filter((n) =>
        (n.src ?? "").includes("/media/"),
      )
      if (mode === "text") expect(mediaImages).toHaveLength(0)
      else expect(mediaImages.some((n) => n.naturalWidth > 0)).toBe(true)
      if (mode === "image") {
        const caption = page
          .getByTestId("question-preview-native-stage")
          .getByText("Blue", { exact: true })
        if (await caption.count()) {
          const className = await caption.getAttribute("class")
          if (!className?.includes("sr-only"))
            await expect(caption).toBeHidden()
        }
      }
      if (mode !== "image")
        await expect(
          page.getByTestId("question-preview-native-stage"),
        ).toContainText("Blue")
      checks.push({
        name: theme + " current valid question beside estimation; " + mode,
        state,
      })
      await shot(theme + "-" + mode)
    }
    await page.getByTestId("editor-question-card-1").click()
    const multi = await exact(theme)
    expect(multi.number).toBe("2")
    expect(multi.total).toBe("3")
    checks.push({ name: theme + " multi exact", state: multi })
    await page.getByTestId("editor-question-card-2").click()
    for (const phase of ["question", "answers", "results"]) {
      await page.getByTestId("question-preview-phase-" + phase).click()
      await expect(
        page.getByTestId("question-preview-native-stage"),
      ).toBeVisible()
      await expect(
        page
          .getByTestId("question-live-preview")
          .locator("[data-editor-preview-fallback]"),
      ).toHaveCount(1)
      const text = await page.getByTestId("question-live-preview").innerText()
      expect(text).not.toContain("fields are incomplete")
      checks.push({
        name: theme + " estimation native primitive " + phase,
        renderer: "native-estimation-fallback",
        text,
      })
      await shot(theme + "-estimation-" + phase)
    }
    await page.getByTestId("studio-card-kind-select").click()
    await page
      .getByRole("option", { name: "Answer Recap", exact: true })
      .click()
    await page.getByTestId("studio-add-card-btn").click()
    await expect(
      page
        .getByTestId("studio-scene-preview-stage")
        .locator("[data-native-application-preview][data-preview-ready=true]"),
    ).toBeVisible()
    const recap = await page
      .getByTestId("studio-scene-preview-stage")
      .innerText()
    for (const title of [
      "Which colour is the sky?",
      "Choose the primary colours",
      "Estimate the number",
    ])
      expect(recap).toContain(title)
    await expect(
      page
        .getByTestId("studio-scene-preview-stage")
        .getByRole("button", { name: "Next", exact: true }),
    ).toHaveCount(0)
    checks.push({
      name: theme + " exact recap preserves all3 prior native questions",
      recap,
    })
    await shot(theme + "-recap-all-native-questions")
    await context.close()
  }
} catch (e) {
  failures.push(String(e))
  if (page) {
    console.log(
      (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(0, 5000),
    )
    await shot("failure").catch(() => {})
  }
} finally {
  const result = { checks, failures, errors }
  fs.writeFileSync(
    path.join(out, "audit.json"),
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result))
  await browser.close()
  if (failures.length || errors.length) process.exitCode = 1
}
