import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const out = path.resolve(
  `../../docs/extensions/plans/editor-hebrew-20261118/${
    process.env.HEBREW_AUDIT_INCOMPLETE ? "visual-he-draft" : "visual-he"
  }`,
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "he-IL",
})
const errors = [],
  consoleErrors = [],
  failures = [],
  snapshots = [],
  checks = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("console", (m) => {
  if (m.type() === "error") {
    consoleErrors.push(m.text())
  }
})
page.on("response", (r) => {
  if (r.status() >= 400) {
    failures.push({ status: r.status(), url: r.url() })
  }
})
const result = () => ({
  date: new Date().toISOString(),
  url: page.url(),
  checks,
  errors,
  consoleErrors,
  failures,
  snapshots,
})
const persist = () =>
  fs.writeFileSync(
    path.join(out, "audit.json"),
    JSON.stringify(result(), null, 2),
  )
async function snapshot(name, focus) {
  if (focus) {
    await focus.scrollIntoViewIfNeeded()
  }

  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r))
    })
  })
  await page.screenshot({
    path: path.join(out, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  })
  const state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    text: document.body.innerText,
    portals: Array.from(
      document.querySelectorAll(
        '[role="dialog"],[role="alertdialog"],[role="listbox"]',
      ),
    )
      .filter((x) => x.getClientRects().length)
      .map((x) => ({
        role: x.getAttribute("role"),
        dir: getComputedStyle(x).direction,
        text: x.textContent?.slice(0, 400),
      })),
    controls: Array.from(document.querySelectorAll("[data-testid]"))
      .filter((x) => x.getClientRects().length)
      .map((x) => ({
        id: x.getAttribute("data-testid"),
        tag: x.tagName,
        text: x.textContent?.slice(0, 120),
        pressed: x.getAttribute("aria-pressed"),
        state: x.getAttribute("data-state"),
        dir: getComputedStyle(x).direction,
      })),
    inputs: Array.from(document.querySelectorAll("input,textarea"))
      .filter((x) => x.getClientRects().length)
      .map((x) => ({
        tag: x.tagName,
        type: x.getAttribute("type"),
        placeholder: x.getAttribute("placeholder"),
        value: x.value,
        dir: getComputedStyle(x).direction,
      })),
  }))
  snapshots.push({ name, ...state })
  persist()
  expect(state.lang, `${name} html language`).toBe("he")
  expect(state.dir, `${name} html direction`).toBe("rtl")
  expect(
    state.scrollWidth,
    `${name} document horizontal overflow`,
  ).toBeLessThanOrEqual(state.width + 1)
  for (const portal of state.portals) {
    expect(portal.dir, `${name} portal direction`).toBe("rtl")
  }
  expect(state.text, `${name} raw translation keys`).not.toMatch(
    /\b(?:extensions|quizz|common|manager):[a-z]/u,
  )

  return state
}
async function widthShots(name, target, widths = [1440, 390, 320]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 })
    await snapshot(name + "-" + width, target)
  }
}
async function confirmType() {
  const dialog = page.getByRole("alertdialog")

  if (await dialog.count()) {
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((x) => getComputedStyle(x).direction)).toBe(
      "rtl",
    )
    await dialog.getByRole("button", { name: "שינוי מצב", exact: true }).click()
  }
}
async function addScene(kind, label) {
  await page.getByTestId("studio-card-kind-select").click()
  const options = page.getByRole("listbox")
  await expect(options).toBeVisible()
  expect(await options.evaluate((x) => getComputedStyle(x).direction)).toBe(
    "rtl",
  )
  await page.getByRole("option", { name: label, exact: true }).click()
  await page.getByTestId("studio-add-card-btn").click()
  await expect(page.getByTestId("studio-scene-preview-stage")).toBeVisible()
  await snapshot(
    `scene-${kind}-default`,
    page.getByTestId("studio-scene-preview-stage"),
  )
  const input = page.getByPlaceholder("כותרת הכרטיס…")

  if (await input.count()) {
    await input.fill(`בדיקת ${label} QA 2026`)
  }

  await expect(page.getByTestId(`toggle-kind-${kind}`)).toHaveAttribute(
    "data-state",
    "on",
  )
}

try {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "he"))
  await page.goto("http://127.0.0.1:3180/manager?lng=he")
  const password = page.locator('input[type="password"]')
  await password.waitFor({ state: "visible", timeout: 45000 })
  await password.fill("e2e-password")
  await page.getByRole("button", { name: "שליחה", exact: true }).click()
  await page.waitForURL("**/manager/config", { timeout: 30000 })
  await page.goto("http://127.0.0.1:3180/manager/quizz?lng=he")
  await page.getByTestId("editor-save-btn").waitFor({ timeout: 45000 })
  await page
    .getByPlaceholder("כותרת החידון…")
    .fill("בדיקת עברית QA — 18.11.2026")

  if (!process.env.HEBREW_AUDIT_INCOMPLETE) {
    await page
      .getByPlaceholder("הקלידו את השאלה…")
      .fill("מה התשובה הנכונה לשאלה QA מספר 12?")
  }

  await page.getByTestId("answer-text-0").fill("עברית English 123")
  await page.getByTestId("answer-text-1").fill("English עברית 456")
  expect(
    await page
      .getByTestId("answer-text-0")
      .evaluate((x) => getComputedStyle(x).direction),
  ).toBe("rtl")
  expect(
    await page
      .getByTestId("answer-text-1")
      .evaluate((x) => getComputedStyle(x).direction),
  ).toBe("ltr")
  checks.push(
    "Hebrew/Latin mixed answer values retain correct first-strong direction and numbers",
  )
  await expect(page.getByTestId("answer-pick-image-0")).toHaveCount(0)
  await expect(page.getByTestId("question-live-preview")).toBeVisible()
  await widthShots("question-text", page.getByTestId("answer-text-0"))
  await widthShots(
    "question-preview",
    page.getByTestId("question-live-preview"),
  )
  await expect(
    page.getByTestId("question-preview-native-stage"),
  ).not.toContainText(/\b(?:ROUND|QUESTION)\b/u)
  await widthShots("question-config", page.getByTestId("question-config"))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByTestId("answer-mode-0-text").focus()
  await page.keyboard.press("ArrowLeft")
  await expect(page.getByTestId("answer-mode-0-image")).toBeFocused()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByTestId("answer-mode-0-text")).toBeFocused()
  checks.push(
    "RTL answer display mode ArrowLeft moves to next physical left option; ArrowRight returns",
  )
  await page.getByTestId("answer-mode-0-image").click()
  await expect(page.getByTestId("answer-pick-image-0")).toBeVisible()
  await widthShots(
    "question-image",
    page.getByTestId("answer-visual-controls-0"),
  )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByTestId("answer-pick-image-0").click()
  const media = page.getByRole("dialog")
  await expect(media).toBeVisible()
  await widthShots("media-dialog", media)
  await page.keyboard.press("Escape")
  await expect(media).toHaveCount(0)
  await page.getByTestId("answer-mode-0-both").click()
  await expect(page.getByTestId("answer-pick-image-0")).toBeVisible()
  await widthShots(
    "question-text-image",
    page.getByTestId("answer-visual-controls-0"),
  )
  await page.getByTestId("answer-mode-0-text").click()
  await expect(page.getByTestId("answer-pick-image-0")).toHaveCount(0)
  checks.push(
    "Image pickers only appear in image/both modes at desktop390320; text-only hides them",
  )
  for (const phase of ["question", "answers", "results"]) {
    await page.getByTestId(`question-preview-phase-${phase}`).click()
    await snapshot(
      `preview-phase-${phase}-320`,
      page.getByTestId("question-live-preview"),
    )
  }
  await page.getByTestId("question-preview-aspect-4-3").click()
  await snapshot(
    "preview-aspect-4-3-320",
    page.getByTestId("question-live-preview"),
  )
  await page.getByTestId("question-preview-aspect-16-9").click()
  await page.getByTestId("answer-type-multi").click()
  await widthShots("question-multiple", page.getByTestId("question-config"))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByTestId("answer-type-estimation").click()
  await expect(page.getByRole("alertdialog")).toBeVisible()
  await widthShots("answer-mode-confirmation", page.getByRole("alertdialog"))
  await confirmType()
  await widthShots("question-estimation", page.getByTestId("question-config"))
  await page.getByTestId("toggle-kind-survey").click()
  await expect(page.getByTestId("answer-type-estimation")).toHaveAttribute(
    "data-state",
    "on",
  )
  await expect(
    page
      .getByTestId("question-config")
      .getByText("טווח סטייה", { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText("התשובה הנכונה", { exact: true })).toHaveCount(0)
  await widthShots("survey-estimation", page.getByTestId("question-config"))
  await page
    .getByTestId("question-config")
    .getByText("הקלדת מספר", { exact: true })
    .click()
  await snapshot(
    "survey-estimation-input-320",
    page.getByTestId("question-config"),
  )
  checks.push(
    "Survey estimation hides correct-answer and margin; numeric input mode selector works",
  )
  await page.getByTestId("answer-type-single").click()
  await confirmType()
  await page.getByTestId("answer-text-0").fill("עברית English 123")
  await page.getByTestId("answer-text-1").fill("English עברית 456")
  await widthShots(
    "survey-single",
    page.getByTestId("answer-visual-controls-0"),
  )
  await page.getByTestId("toggle-kind-quiz").click()
  for (const tab of ["participants", "settings", "launch"]) {
    await page.getByTestId(`studio-tab-${tab}`).click()
    await expect(page.getByTestId("studio-card-type-bar")).toHaveCount(0)
    await widthShots(`tab-${tab}`)
  }
  await page.getByTestId("studio-tab-questions").click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByTestId("studio-card-kind-select").click()
    await expect(page.getByRole("listbox")).toBeVisible()
    await snapshot(`card-type-menu-${width}`, page.getByRole("listbox"))
    await page.keyboard.press("Escape")
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const [kind, label] of [
    ["media", "מדיה"],
    ["animation", "הנפשה"],
    ["transition", "מעבר"],
    ["opening", "פתיחה"],
    ["closing", "סיום"],
    ["countdown", "ספירה לאחור"],
    ["leaderboard", "טבלת המובילים"],
    ["interimResults", "תוצאות ביניים"],
    ["answerRecap", "סיכום תשובות"],
  ]) {
    await addScene(kind, label)
    await widthShots(
      `scene-${kind}`,
      page.getByTestId("studio-scene-preview-stage"),
      ["media", "opening", "countdown", "answerRecap"].includes(kind)
        ? [1440, 390, 320]
        : [1440],
    )
    await page.setViewportSize({ width: 1440, height: 1000 })

    if (await page.getByTestId("scene-preview-mode-layers").count()) {
      await page.getByTestId("scene-preview-mode-layers").click()
      await snapshot(
        `scene-${kind}-layers`,
        page.getByTestId("studio-scene-preview-stage"),
      )
      await page.getByTestId("scene-preview-mode-stage").click()
    }
  }
  checks.push(
    "Nine scene kinds render translated preview and editor; four representative kinds inspected at1440/390/320",
  )
  await expect(page.getByTestId("studio-scene-preview-stage")).toBeVisible()
  await page.setViewportSize({ width: 320, height: 1000 })
  const recapCards = page.locator('[data-scene-kind="answerRecap"]')
  await expect(recapCards).toHaveCount(1)
  await recapCards
    .last()
    .getByRole("button", { name: "שכפול כרטיס", exact: true })
    .click()
  await expect(recapCards).toHaveCount(2)
  await recapCards
    .last()
    .getByRole("button", { name: "מחיקת כרטיס מסך", exact: true })
    .click()
  await expect(page.getByRole("alertdialog")).toBeVisible()
  await snapshot("scene-delete-confirmation-320", page.getByRole("alertdialog"))
  const common = JSON.parse(
    fs.readFileSync("../../packages/web/src/locales/he/common.json", "utf8"),
  )
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: common.cancel, exact: true })
    .click()
  await expect(recapCards).toHaveCount(2)
  await recapCards
    .last()
    .getByRole("button", { name: "מחיקת כרטיס מסך", exact: true })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: common.delete, exact: true })
    .click()
  await expect(recapCards).toHaveCount(1)
  checks.push(
    "Translated scene duplicate/delete actions are visible and usable on320px; cancel preserves card",
  )
  expect(errors, "uncaught JavaScript errors").toEqual([])
  console.log(
    JSON.stringify(
      { ok: true, checks, screenshotCount: snapshots.length, errors, failures },
      null,
      2,
    ),
  )
} catch (error) {
  await snapshot("failure").catch(() => {
    /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
  })
  console.log(
    JSON.stringify(
      {
        ok: false,
        error: String(error),
        url: page.url(),
        checks,
        errors,
        failures,
        body: (await page.locator("body").innerText()).slice(0, 6000),
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
} finally {
  persist()
  await browser.close()
}
