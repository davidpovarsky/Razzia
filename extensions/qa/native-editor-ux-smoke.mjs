// Real native editor with an isolated local backend and fixture configuration.
// No fake renderer, account, player, message or production data mutation.
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
const require = createRequire(
  new URL("../../packages/e2e/package.json", import.meta.url),
)
const { chromium, expect } = require("@playwright/test")
const baseURL = process.env.TADAZZ_UX_BASE_URL ?? "http://127.0.0.1:4371"
const evidence = resolve(
  process.env.TADAZZ_UX_NATIVE_EVIDENCE ??
    "extensions/qa/.ux-native-editor-evidence",
)
mkdirSync(evidence, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  channel:
    process.env.TADAZZ_BROWSER_CHANNEL ??
    (process.platform === "win32" ? "msedge" : undefined),
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
})
const errors = [],
  httpErrors = [],
  checks = [],
  metrics = []
page.on("pageerror", (error) => errors.push(error.message))
page.on("response", (response) => {
  if (response.status() >= 400) {
    httpErrors.push({
      status: response.status(),
      path: new URL(response.url()).pathname,
    })
  }
})
await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
const settle = () =>
  page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolveObservation) => {
      requestAnimationFrame(() => requestAnimationFrame(resolveObservation))
    })
  })
const shot = async (name) => {
  await settle()
  await page.screenshot({
    path: resolve(evidence, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  })
}
async function check(name, run) {
  await run()
  checks.push(name)
  console.log(`PASS ${name}`)
}
const panel = (id) => page.getByTestId(`editor-panel-${id}`)
const toggle = (id) => page.getByTestId(`editor-panel-toggle-${id}`)
async function openPanel(id) {
  if (!(await panel(id).isVisible())) {
    await toggle(id).click()
  }

  await expect(panel(id)).toBeVisible()
}
async function closePanel(id, escape = false) {
  // Timeline selection can remount its workspace and close the drawer itself.
  if (!(await panel(id).isVisible())) {
    return
  }

  if ((await panel(id).getAttribute("data-docked")) === "true") {
    return
  }

  if (escape) {
    await page.keyboard.press("Escape")
  } else {
    await page.getByTestId(`editor-panel-close-${id}`).click()
  }

  await expect(panel(id)).toBeHidden()
  await expect(toggle(id)).toBeFocused()
}
async function measure({ label, width, height, aspect }) {
  await settle()
  const value = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector)

      if (!node) {
        return null
      }

      const r = node.getBoundingClientRect()

      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      }
    }

    return {
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
      },
      shell: rect(".native-editor-shell"),
      workspace: rect('[data-testid="editor-workspace"]'),
      frame: rect(".editor-canvas-frame"),
      stage: rect(".editor-canvas-frame-stage"),
      viewport: rect('[data-testid="editor-preview-viewport"]'),
      layout: document
        .querySelector('[data-testid="editor-workspace"]')
        ?.getAttribute("data-layout"),
      direction: document.documentElement.dir,
    }
  })
  expect(
    value.document.width,
    `${label} horizontal document overflow`,
  ).toBeLessThanOrEqual(width + 1)
  expect(
    value.document.height,
    `${label} vertical document overflow`,
  ).toBeLessThanOrEqual(height + 1)
  expect(value.document.bodyWidth, `${label} body width`).toBeLessThanOrEqual(
    width + 1,
  )
  expect(value.document.bodyHeight, `${label} body height`).toBeLessThanOrEqual(
    height + 1,
  )
  expect(value.stage.width, `${label} stage visible`).toBeGreaterThan(80)
  expect(value.stage.height, `${label} stage visible`).toBeGreaterThan(40)
  expect(value.stage.left).toBeGreaterThanOrEqual(value.frame.left - 1)
  expect(value.stage.top).toBeGreaterThanOrEqual(value.frame.top - 1)
  expect(value.stage.right).toBeLessThanOrEqual(value.frame.right + 1)
  expect(value.stage.bottom).toBeLessThanOrEqual(value.frame.bottom + 1)
  expect(
    Math.abs(
      value.stage.width / value.stage.height -
        (aspect === "4:3" ? 4 / 3 : 16 / 9),
    ),
  ).toBeLessThan(0.02)
  metrics.push({ label, width, height, aspect, ...value })
}

try {
  await page.goto(`${baseURL}/manager?lng=en`, {
    waitUntil: "domcontentloaded",
  })
  await page.locator('input[type="password"]').fill("e2e-password")
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  // The site composition replaces the legacy login landing with My Games.
  // Wait for that final document, not the intermediate /manager/config URL.
  await page.waitForURL("**/studio/games")
  await page.waitForLoadState("domcontentloaded")
  await page.goto(`${baseURL}/manager/quizz?lng=en`, {
    waitUntil: "domcontentloaded",
  })
  await expect(page.getByTestId("editor-workspace")).toBeVisible({
    timeout: 30000,
  })
  await expect(page.getByTestId("question-live-preview")).toBeVisible()
  await check(
    "Actual question and answer edits update the native stage",
    async () => {
      await page
        .locator('input[name="subject"]')
        .fill("Native editor UX QA — unsaved fixture")
      await openPanel("edit")
      await panel("edit")
        .locator('input[name$=".question"]')
        .fill("Which colour is the sky?")
      await page.getByTestId("answer-text-0").fill("Blue")
      await page.getByTestId("answer-text-1").fill("Green")
      await expect(page.getByTestId("question-preview-title")).toContainText(
        "Which colour is the sky?",
      )
      await page.getByTestId("question-preview-phase-answers").click()
      await expect(
        page.getByTestId("question-preview-native-stage"),
      ).toContainText("Blue")
      await expect(
        page.getByTestId("question-preview-native-stage"),
      ).toContainText("Green")
    },
  )
  for (const [width, height] of process.env.TADAZZ_NATIVE_SKIP_LAYOUT === "true"
    ? []
    : [
        [1440, 900],
        [1024, 768],
        [768, 768],
        [390, 844],
        [320, 640],
        [844, 390],
      ]) {
    await check(`Bounded canvas and controls ${width}x${height}`, async () => {
      await page.setViewportSize({ width, height })
      await expect(page.getByTestId("editor-workspace")).toHaveAttribute(
        "data-layout",
        width >= 1100 ? "wide" : "compact",
      )
      for (const aspect of ["16:9", "4:3"]) {
        await page
          .getByTestId(`question-preview-aspect-${aspect.replace(":", "-")}`)
          .click()
        await expect(
          page.getByTestId("editor-preview-viewport"),
        ).toHaveAttribute("data-preview-aspect", aspect)
        await measure({
          label: "question",
          width,
          height,
          aspect,
        })

        if (width === 320 || width === 390) {
          const toolbar = await page
            .locator(".native-question-preview-tools")
            .evaluate((node) => {
              const bounds = node.getBoundingClientRect()

              return {
                width: node.clientWidth,
                scrollWidth: node.scrollWidth,
                bounds: {
                  left: bounds.left,
                  right: bounds.right,
                  top: bounds.top,
                  bottom: bounds.bottom,
                },
                buttons: Array.from(
                  node.querySelectorAll(
                    'button[data-testid^="question-preview-phase-"],button[data-testid^="question-preview-aspect-"]',
                  ),
                ).map((button) => {
                  const b = button.getBoundingClientRect()

                  return {
                    id: button.getAttribute("data-testid"),
                    left: b.left,
                    right: b.right,
                    top: b.top,
                    bottom: b.bottom,
                  }
                }),
              }
            })
          expect(toolbar.buttons).toHaveLength(5)
          expect(toolbar.scrollWidth).toBeLessThanOrEqual(toolbar.width + 1)
          for (const button of toolbar.buttons) {
            expect(
              button.left,
              `${button.id} left visible`,
            ).toBeGreaterThanOrEqual(toolbar.bounds.left - 1)
            expect(
              button.right,
              `${button.id} right visible`,
            ).toBeLessThanOrEqual(toolbar.bounds.right + 1)
            expect(
              button.top,
              `${button.id} top visible`,
            ).toBeGreaterThanOrEqual(toolbar.bounds.top - 1)
            expect(
              button.bottom,
              `${button.id} bottom visible`,
            ).toBeLessThanOrEqual(toolbar.bounds.bottom + 1)
          }
          metrics.push({
            label: "all-preview-controls-visible",
            width,
            height,
            aspect,
            ...toolbar,
          })
        }

        await shot(`question-${width}x${height}-${aspect.replace(":", "-")}`)
      }

      if (width < 1100) {
        for (const id of ["timeline", "edit", "media", "settings"]) {
          await openPanel(id)
          await expect(panel(id)).toHaveAttribute("role", "dialog")
          await expect(
            page.getByTestId(`editor-panel-close-${id}`),
          ).toBeFocused()
          const r = await panel(id).boundingBox()
          expect(r.x).toBeGreaterThanOrEqual(0)
          expect(r.y).toBeGreaterThanOrEqual(0)
          expect(r.x + r.width).toBeLessThanOrEqual(width + 1)
          expect(r.y + r.height).toBeLessThanOrEqual(height + 1)
          const documentSize = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
          }))
          expect(documentSize.width).toBeLessThanOrEqual(width + 1)
          expect(documentSize.height).toBeLessThanOrEqual(height + 1)

          if (width === 320) {
            await shot(`drawer-${id}-320x640`)
          }

          await closePanel(id, id === "settings" || id === "edit")
        }
      }

      for (const tab of ["participants", "settings", "launch"]) {
        await page.getByTestId(`studio-tab-${tab}`).click()
        await settle()
        const size = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }))
        expect(size.width, `${tab} page width`).toBeLessThanOrEqual(width + 1)
        expect(size.height, `${tab} page height`).toBeLessThanOrEqual(
          height + 1,
        )
        metrics.push({ label: `${tab}-tab`, width, height, document: size })
      }
      await page.getByTestId("studio-tab-questions").click()
      await expect(page.getByTestId("question-live-preview")).toBeVisible()
    })
  }
  await check(
    "Compact editor preserves edits across drawers and focus wraps inside drawer",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 })
      await openPanel("edit")
      await expect(
        panel("edit").locator('input[name$=".question"]'),
      ).toHaveValue("Which colour is the sky?")
      await expect(page.getByTestId("answer-text-0")).toHaveValue("Blue")
      await page.getByTestId("editor-panel-close-edit").focus()
      await page.keyboard.press("Shift+Tab")
      expect(
        await panel("edit").evaluate((node) =>
          node.contains(document.activeElement),
        ),
      ).toBe(true)
      await page.keyboard.press("Tab")
      await expect(page.getByTestId("editor-panel-close-edit")).toBeFocused()
      await closePanel("edit", true)
    },
  )
  await check(
    "Media library opens above its drawer and closes back to editing",
    async () => {
      await openPanel("media")
      await panel("media")
        .getByRole("button", { name: "Media library", exact: true })
        .click()
      await expect(
        page.getByRole("dialog").filter({
          has: page.getByRole("heading", {
            name: "Media library",
            exact: true,
          }),
        }),
      ).toBeVisible()
      await shot("media-library-390x844")
      await page.keyboard.press("Escape")
      await expect(
        page.getByRole("dialog").filter({
          has: page.getByRole("heading", {
            name: "Media library",
            exact: true,
          }),
        }),
      ).toBeHidden()
      metrics.push({
        label: "media-dialog-return-focus",
        focus: await page.evaluate(() => ({
          tag: document.activeElement?.tagName,
          testId: document.activeElement?.getAttribute("data-testid"),
          text: document.activeElement?.textContent?.slice(0, 100),
          withinDrawer: Boolean(
            document.activeElement?.closest(
              '[data-testid="editor-panel-media"]',
            ),
          ),
        })),
      })
      await expect(panel("media")).toBeVisible()
      await closePanel("media", true)
    },
  )
  await check(
    "Timeline adds a real second question and a scene without losing the first",
    async () => {
      await openPanel("timeline")
      const before = await page
        .getByTestId("question-live-preview")
        .getAttribute("data-question-id")
      await page.getByTestId("studio-add-card-btn").click()
      await expect(
        page.getByTestId("question-live-preview"),
      ).not.toHaveAttribute("data-question-id", before)
      await closePanel("timeline")
      await openPanel("edit")
      await panel("edit")
        .locator('input[name$=".question"]')
        .fill("Second synthetic question")
      await page.getByTestId("answer-text-0").fill("Mercury")
      await page.getByTestId("answer-text-1").fill("Venus")
      await closePanel("edit")
      await openPanel("timeline")
      await expect(panel("timeline")).toContainText("Which colour is the sky?")
      await expect(panel("timeline")).toContainText("Second synthetic question")
      await page.getByTestId("studio-card-kind-select").click()
      await page.getByRole("option", { name: "Opening", exact: true }).click()
      await page.getByTestId("studio-add-card-btn").click()
      await expect(
        page.getByTestId("studio-scene-preview-stage"),
      ).toBeAttached()

      // Switching question -> scene replaces the workspace; the new drawer may be closed.
      if (await panel("timeline").isVisible()) {
        await closePanel("timeline")
      }

      await expect(page.getByTestId("studio-scene-preview-stage")).toBeVisible()
      await measure({
        label: "opening-scene",
        width: 390,
        height: 844,
        aspect: "16:9",
      })
      await shot("opening-scene-390x844")
    },
  )
  await check(
    "Changing the actual theme updates the editor backdrop",
    async () => {
      await page.getByTestId("studio-tab-settings").click()
      const backdrop = page.getByTestId("editor-game-backdrop")
      const beforeTheme = await backdrop.getAttribute("data-editor-theme")
      const beforeImage = await backdrop.evaluate(
        (node) => getComputedStyle(node).backgroundImage,
      )
      const cards = page
        .getByTestId("show-theme-settings")
        .locator('[data-testid^="show-theme-"]:has(> img)')
      const count = await cards.count()
      expect(count).toBeGreaterThan(1)
      let changed = false
      for (let i = 0; i < count; i += 1) {
        const card = cards.nth(i),
          id = await card.getAttribute("data-testid")

        if (id === `show-theme-${beforeTheme}`) {
          continue
        }

        const button = card.getByRole("button")
        const name = (await button.innerText()).trim()
        await button.click()
        const confirm = page.getByRole("alertdialog")

        if (await confirm.isVisible()) {
          await confirm.getByRole("button", { name, exact: true }).click()
        }

        await expect(backdrop).toHaveAttribute(
          "data-editor-theme",
          id.replace("show-theme-", ""),
        )
        await expect
          .poll(() =>
            backdrop.evaluate((node) => getComputedStyle(node).backgroundImage),
          )
          .not.toBe(beforeImage)
        metrics.push({
          label: "theme-backdrop-change",
          from: beforeTheme,
          to: await backdrop.getAttribute("data-editor-theme"),
          beforeImage,
          afterImage: await backdrop.evaluate(
            (node) => getComputedStyle(node).backgroundImage,
          ),
        })
        changed = true

        break
      }
      expect(changed).toBe(true)
      await page.getByTestId("studio-tab-questions").click()
      await shot("changed-theme-390x844")
    },
  )
  await check(
    "Actual Save and fresh reload preserve questions, answers, scene and theme",
    async () => {
      const backdrop = page.getByTestId("editor-game-backdrop")
      const expectedTheme = await backdrop.getAttribute("data-editor-theme")
      const expectedBackground = await backdrop.evaluate(
        (node) => getComputedStyle(node).backgroundImage,
      )
      const [createResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/extensions/quizzes" &&
            response.request().method() === "POST",
        ),
        page.getByTestId("editor-save-btn").click(),
      ])
      expect(createResponse.status()).toBe(201)
      const saved = await createResponse.json()
      expect(saved.quizId).toBeTruthy()
      await page.waitForURL("**/studio/games")
      const savedURL = `${baseURL}/manager/quizz/${encodeURIComponent(saved.quizId)}?lng=en`
      await page.goto(savedURL, { waitUntil: "domcontentloaded" })
      await expect(page.getByTestId("editor-workspace")).toBeVisible({
        timeout: 30000,
      })
      await expect(backdrop).toHaveAttribute("data-editor-theme", expectedTheme)
      await expect
        .poll(() =>
          backdrop.evaluate((node) => getComputedStyle(node).backgroundImage),
        )
        .toBe(expectedBackground)
      await openPanel("timeline")
      await expect(page.getByTestId("editor-question-card-0")).toContainText(
        "Which colour is the sky?",
      )
      await expect(page.getByTestId("editor-question-card-1")).toContainText(
        "Second synthetic question",
      )
      await expect(page.getByTestId("editor-scene-card")).toHaveCount(1)
      await expect(page.getByTestId("editor-scene-card")).toContainText(
        "Opening",
      )
      await page.getByTestId("editor-question-card-0").click()
      await closePanel("timeline")
      await openPanel("edit")
      await expect(
        panel("edit").locator('input[name$=".question"]'),
      ).toHaveValue("Which colour is the sky?")
      await expect(page.getByTestId("answer-text-0")).toHaveValue("Blue")
      await expect(page.getByTestId("answer-text-1")).toHaveValue("Green")
      await closePanel("edit")
      await openPanel("timeline")
      await page.getByTestId("editor-question-card-1").click()
      await closePanel("timeline")
      await openPanel("edit")
      await expect(
        panel("edit").locator('input[name$=".question"]'),
      ).toHaveValue("Second synthetic question")
      await expect(page.getByTestId("answer-text-0")).toHaveValue("Mercury")
      await expect(page.getByTestId("answer-text-1")).toHaveValue("Venus")
      await page.getByTestId("answer-text-1").fill("Earth")
      await closePanel("edit")
      const [updateResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
              `/api/extensions/quizzes/${saved.quizId}` &&
            response.request().method() === "PUT",
        ),
        page.getByTestId("editor-save-btn").click(),
      ])
      expect(updateResponse.status()).toBe(200)
      await page.waitForURL("**/studio/games")
      await page.goto(savedURL, { waitUntil: "domcontentloaded" })
      await expect(page.getByTestId("editor-workspace")).toBeVisible({
        timeout: 30000,
      })
      await expect(backdrop).toHaveAttribute("data-editor-theme", expectedTheme)
      await expect
        .poll(() =>
          backdrop.evaluate((node) => getComputedStyle(node).backgroundImage),
        )
        .toBe(expectedBackground)
      await openPanel("timeline")
      await expect(page.getByTestId("editor-scene-card")).toHaveCount(1)
      await page.getByTestId("editor-question-card-1").click()
      await closePanel("timeline")
      await openPanel("edit")
      await expect(page.getByTestId("answer-text-1")).toHaveValue("Earth")
      await closePanel("edit")
      metrics.push({
        label: "actual-composite-save-reload",
        quizId: saved.quizId,
        createStatus: createResponse.status(),
        updateStatus: updateResponse.status(),
        questions: 2,
        scenes: 1,
        theme: expectedTheme,
        background: expectedBackground,
      })
      await shot("saved-reloaded-390x844")
    },
  )
  await check(
    "RTL native editor remains bounded and drawers are reachable",
    async () => {
      page.once("dialog", (dialog) => dialog.accept())
      await page.goto(`${baseURL}/manager/quizz?lng=he`, {
        waitUntil: "domcontentloaded",
      })
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
      await expect(page.getByTestId("editor-workspace")).toBeVisible({
        timeout: 30000,
      })
      await page.setViewportSize({ width: 320, height: 640 })
      await measure({
        label: "rtl-question",
        width: 320,
        height: 640,
        aspect: "16:9",
      })
      await shot("rtl-question-320x640")
      await openPanel("edit")
      await closePanel("edit", true)
      await openPanel("timeline")
      await closePanel("timeline", true)
    },
  )
  expect(errors).toEqual([])
  writeFileSync(
    resolve(evidence, "receipt.json"),
    JSON.stringify(
      { passed: true, checks, errors, httpErrors, metrics },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ passed: true, checks, errors, httpErrors }))
} catch (error) {
  await shot("failure").catch(() => {
    /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
  })
  const body = await page
    .locator("body")
    .innerText()
    .catch(() => "")
  writeFileSync(
    resolve(evidence, "receipt.json"),
    JSON.stringify(
      {
        passed: false,
        checks,
        errors,
        httpErrors,
        metrics,
        error: String(error),
        url: page.url(),
        body: body.slice(0, 12000),
      },
      null,
      2,
    ),
  )
  console.error(String(error))
  process.exitCode = 1
} finally {
  await browser.close()
}
