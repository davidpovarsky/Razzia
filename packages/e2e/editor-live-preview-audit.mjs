import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-preview",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: "msedge" })
const checks = [],
  failures = [],
  errors = [],
  responses = [],
  screenshots = []
let current = undefined

const scenes = [
  ["transition", "Transition"],
  ["animation", "Animation"],
  ["media", "Media"],
  ["opening", "Opening"],
  ["closing", "Closing"],
  ["countdown", "Countdown"],
  ["leaderboard", "Leaderboard"],
  ["interimResults", "Interim Results"],
  ["answerRecap", "Answer Recap"],
]
async function check(name, fn) {
  try {
    const detail = await fn()
    checks.push({ name, ...detail })
    console.log(`PASS ${name}`)
  } catch (e) {
    failures.push({ name, error: String(e) })
    console.log(`FAIL ${name} ${String(e)}`)

    if (current) {
      await current
        .screenshot({
          path: path.join(out, `failure-${failures.length}.png`),
          fullPage: true,
        })
        .catch(() => {
          /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
        })
    }
  }
}
async function nativeState(page, container) {
  const stage = container.locator(
    "[data-native-application-preview][data-preview-ready=true]",
  )
  await expect(stage).toBeVisible({ timeout: 15000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r))
    })
  })

  return container.evaluate((el) => ({
    renderer: el
      .querySelector("[data-editor-preview-renderer]")
      ?.getAttribute("data-editor-preview-renderer"),
    fallback: Boolean(el.querySelector("[data-editor-preview-fallback]")),
    engine: el
      .querySelector("[data-preview-engine]")
      ?.getAttribute("data-preview-engine"),
    theme: el
      .querySelector("[data-preview-theme]")
      ?.getAttribute("data-preview-theme"),
    slot: el
      .querySelector("[data-preview-theme-slot]")
      ?.getAttribute("data-preview-theme-slot"),
    original: Boolean(el.querySelector("[data-original-razzia-preview]")),
    text: el.innerText,
    rect: (() => {
      const r = el
        .querySelector("[data-testid=editor-preview-viewport]")
        ?.getBoundingClientRect()

      return r ? { width: r.width, height: r.height } : null
    })(),
    innerRect: (() => {
      const r = el
        .querySelector("[data-original-razzia-preview]>div, .tzv4-stage")
        ?.getBoundingClientRect()

      return r ? { width: r.width, height: r.height } : null
    })(),
    media: [...el.querySelectorAll("audio,video")].map((m) => ({
      kind: m.tagName,
      muted: m.muted,
      paused: m.paused,
      volume: m.volume,
    })),
  }))
}
async function capture(page, name, container) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r))
    })
  })
  await container.scrollIntoViewIfNeeded()
  await container.screenshot({ path: path.join(out, `${name}.png`) })
  screenshots.push(`${name}.png`)
}

try {
  for (const theme of ["razzia-original", "tadazz-classic"]) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "en-US",
      reducedMotion: "no-preference",
    })
    const page = await context.newPage()
    current = page
    page.setDefaultTimeout(15000)
    console.log(`START ${theme}`)
    page.on("pageerror", (e) => errors.push({ theme, error: e.message }))
    page.on("response", (r) => {
      if (r.status() >= 400) {
        responses.push({ theme, status: r.status(), url: r.url() })
      }
    })
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
    await page.goto("http://127.0.0.1:3180/manager?lng=en")
    await page.locator("input[type=password]").fill("e2e-password")
    await page.getByRole("button", { name: "Submit", exact: true }).click()
    await page.waitForURL("**/manager/config")
    await page.goto("http://127.0.0.1:3180/manager/quizz?lng=en")
    await page.getByTestId("editor-save-btn").waitFor()
    await page
      .getByPlaceholder("Quizz title...")
      .fill(`Live preview proof ${theme}`)
    await page
      .getByPlaceholder("Start typing your question...")
      .fill("Which color is the sky?")
    await page.getByTestId("answer-text-0").fill("Blue")
    await page.getByTestId("answer-text-1").fill("Green")
    await page.getByTestId("studio-tab-settings").click()
    const themeCard = page.getByTestId(`show-theme-${theme}`)
    const choose = themeCard.getByRole("button")

    if (await choose.isEnabled()) {
      await choose.click()
    }

    if (await page.getByRole("alertdialog").isVisible()) {
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Use this theme", exact: true })
        .click()
    }

    await page.getByTestId("studio-tab-questions").click()
    const preview = page.getByTestId("question-live-preview")
    for (const phase of ["question", "answers", "results"]) {
      await page.getByTestId(`question-preview-phase-${phase}`).click()
      await check(`${theme} question ${phase} exact native`, async () => {
        const state = await nativeState(page, preview)
        expect(state.fallback).toBe(false)
        expect(state.theme).toBe(theme)
        expect(state.engine).toBe(
          theme === "razzia-original"
            ? "razzia-native-stage"
            : "tadazz-classic-stage",
        )
        await capture(page, `${theme}-question-${phase}`, preview)

        return state
      })
    }
    await page.getByTestId("question-preview-phase-answers").click()
    await check(
      `${theme} unsaved question and answer text update`,
      async () => {
        await page
          .getByPlaceholder("Start typing your question...")
          .fill("Live edited without saving")
        await page.getByTestId("answer-text-0").fill("Azure — edited")
        await expect(preview).toContainText("Live edited without saving")
        await expect(preview).toContainText("Azure — edited")
        const state = await nativeState(page, preview)
        expect(state.fallback).toBe(false)
        expect(
          await page
            .getByTestId("answer-text-0")
            .evaluate((e) => e === document.activeElement),
        ).toBe(true)

        return state
      },
    )
    for (const aspect of ["4-3", "16-9"]) {
      await page.getByTestId(`question-preview-aspect-${aspect}`).click()
      await check(`${theme} question aspect ${aspect}`, async () => {
        const state = await nativeState(page, preview)
        const ratio = aspect === "4-3" ? 4 / 3 : 16 / 9
        expect(
          Math.abs(state.rect.width / state.rect.height - ratio),
        ).toBeLessThan(0.02)
        await capture(page, `${theme}-question-aspect-${aspect}`, preview)

        return { rect: state.rect }
      })
    }
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await check(
        `${theme} actual inner stage fills mobile ${width}`,
        async () => {
          const state = await nativeState(page, preview)
          expect(state.innerRect).not.toBeNull()
          expect(
            Math.abs(state.innerRect.width - state.rect.width),
          ).toBeLessThan(2)
          expect(
            Math.abs(state.innerRect.height - state.rect.height),
          ).toBeLessThan(2)
          await capture(page, `${theme}-mobile-${width}`, preview)

          return { rect: state.rect, innerRect: state.innerRect }
        },
      )
    }
    await page.setViewportSize({ width: 1600, height: 1000 })
    await check(`${theme} question hide show replay`, async () => {
      await preview
        .getByRole("button", { name: "Hide preview", exact: true })
        .click()
      await expect(preview.getByTestId("editor-preview-viewport")).toHaveCount(
        0,
      )
      await preview
        .getByRole("button", { name: "Show preview", exact: true })
        .click()
      await page.getByTestId("question-preview-replay").click()
      const state = await nativeState(page, preview)

      return state
    })
    for (const [kind, label] of scenes) {
      await page.getByTestId("studio-card-kind-select").click()
      await page.getByRole("option", { name: label, exact: true }).click()
      await page.getByTestId("studio-add-card-btn").click()
      const scenePreview = page.getByTestId("studio-scene-preview-stage")
      await scenePreview.waitFor()
      await page
        .getByPlaceholder("Card title...")
        .fill(`${label} live ${theme}`)
      await check(`${theme} ${kind} exact native`, async () => {
        const state = await nativeState(page, scenePreview)
        expect(state.fallback).toBe(false)
        expect(state.theme).toBe(theme)
        const expectedSlot =
          {
            opening: "opening",
            closing: "closing",
            leaderboard: "leaderboard",
            interimResults: "resultsReveal",
            answerRecap: "resultsReveal",
          }[kind] ?? "interlude"
        expect(state.slot).toBe(expectedSlot)
        await capture(page, `${theme}-${kind}`, scenePreview)

        return state
      })

      if (["opening", "closing"].includes(kind)) {
        await check(
          `${theme} ${kind} truthful native preset title controls`,
          async () => {
            if (theme === "tadazz-classic") {
              await expect(
                page.getByTestId("scene-preset-title-hint"),
              ).toBeVisible()
              await expect(
                page.getByPlaceholder("Card description or subtitle..."),
              ).toHaveCount(0)
            } else {
              await expect(
                page.getByTestId("scene-preset-title-hint"),
              ).toHaveCount(0)
              await expect(
                page.getByPlaceholder("Card description or subtitle..."),
              ).toBeVisible()
            }

            return {}
          },
        )
      }

      if (kind === "transition" && theme === "tadazz-classic") {
        await check(
          "Classic maximum120character transition remains inside native stage",
          async () => {
            await page.getByTestId("scene-title-input").fill("W".repeat(120))
            await nativeState(page, scenePreview)
            const bounds = await scenePreview.evaluate((el) => {
              const title = el.querySelector(".interlude-title"),
                stage = el.querySelector(".tzv4-stage")
              const t = title.getBoundingClientRect(),
                s = stage.getBoundingClientRect()

              return {
                title: {
                  x: t.x,
                  y: t.y,
                  right: t.right,
                  bottom: t.bottom,
                  width: t.width,
                  height: t.height,
                },
                stage: {
                  x: s.x,
                  y: s.y,
                  right: s.right,
                  bottom: s.bottom,
                  width: s.width,
                  height: s.height,
                },
                scrollWidth: title.scrollWidth,
                clientWidth: title.clientWidth,
                fontSize: getComputedStyle(title).fontSize,
              }
            })
            expect(bounds.title.x).toBeGreaterThanOrEqual(bounds.stage.x - 1)
            expect(bounds.title.right).toBeLessThanOrEqual(
              bounds.stage.right + 1,
            )
            expect(bounds.title.y).toBeGreaterThanOrEqual(bounds.stage.y - 1)
            expect(bounds.title.bottom).toBeLessThanOrEqual(
              bounds.stage.bottom + 1,
            )
            expect(bounds.scrollWidth).toBeLessThanOrEqual(
              bounds.clientWidth + 1,
            )
            await capture(page, `${theme}-transition-max120`, scenePreview)
            await page
              .getByTestId("scene-title-input")
              .fill(`${label} live ${theme}`)

            return bounds
          },
        )
      }

      await page.getByTestId("studio-preview-aspect-4-3").click()
      await check(`${theme} ${kind} aspect 4:3`, async () => {
        const rect = await scenePreview.boundingBox()
        expect(Math.abs(rect.width / rect.height - 4 / 3)).toBeLessThan(0.03)

        return { rect }
      })
      await page.getByTestId("studio-preview-aspect-16-9").click()

      if (!["leaderboard", "interimResults", "answerRecap"].includes(kind)) {
        await check(`${theme} ${kind} play scrub reset`, async () => {
          const slider = page.getByTestId("studio-preview-scrub-slider")

          if (kind === "countdown") {
            await slider.fill("7000")
            await expect(
              scenePreview.getByText("3", { exact: true }),
            ).toBeVisible()
            await capture(
              page,
              `${theme}-countdown-scrub-seven-seconds`,
              scenePreview,
            )
          }

          await slider.fill("1000")
          await expect(slider).toHaveValue("1000")
          await page.getByTestId("studio-preview-play-pause").click()
          await expect
            .poll(async () => Number(await slider.inputValue()))
            .toBeGreaterThan(1100)
          await page.getByTestId("studio-preview-play-pause").click()
          const elapsed = await slider.inputValue()
          await page.getByTestId("studio-preview-replay").click()
          await expect
            .poll(async () => Number(await slider.inputValue()))
            .toBeLessThan(Number(elapsed) + 500)
          await page.getByTestId("studio-preview-play-pause").click()

          return {
            playedTo: elapsed,
            readout: await page
              .getByTestId("studio-preview-time-readout")
              .innerText(),
          }
        })
      } else {
        await check(
          `${theme} ${kind} hides inapplicable transport`,
          async () => {
            await expect(
              page.getByTestId("studio-preview-play-pause"),
            ).toHaveCount(0)
            await expect(
              page.getByTestId("studio-preview-scrub-slider"),
            ).toHaveCount(0)

            return {}
          },
        )
      }

      if (["opening", "closing"].includes(kind)) {
        await check(
          `${theme} ${kind} layer edit and native stage`,
          async () => {
            await page.getByTestId("scene-preview-mode-layers").click()
            await expect(
              scenePreview.locator("[data-native-application-preview]"),
            ).toHaveCount(0)

            if (kind === "opening") {
              await page.getByTestId("studio-overlay-add-btn").click()

              if (
                (await page
                  .locator('[data-testid^="studio-overlay-asset-"]')
                  .count()) === 0
              ) {
                await expect(
                  page.getByTestId("studio-lottie-catalog-panel"),
                ).toBeVisible()
                await page
                  .getByTestId("studio-overlay-file-input")
                  .setInputFiles(
                    path.resolve(
                      "../web/public/tadazz-show/opening/TADAZZ-Opening-4-5s.json",
                    ),
                  )
              }

              const asset = page
                .locator('[data-testid^="studio-overlay-asset-"]')
                .last()
              const id = (await asset.getAttribute("data-testid")).replace(
                "studio-overlay-asset-",
                "",
              )
              await asset.fill("/tadazz-show/opening/TADAZZ-Opening-4-5s.json")
              const overlay = page.getByTestId(`cinematic-overlay-${id}`)
              await expect(overlay).toBeVisible()
              const player = page.getByTestId(`cinematic-overlay-player-${id}`)
              await expect(player).toHaveAttribute(
                "data-lottie-ready",
                "true",
                { timeout: 25000 },
              )
              await page.getByTestId("studio-preview-scrub-slider").fill("1200")
              await expect
                .poll(async () =>
                  Number(await player.getAttribute("data-lottie-frame")),
                )
                .toBeGreaterThan(0)
              const x = page.getByTestId(`studio-overlay-x-${id}`)
              const before = Number(await x.inputValue())
              await overlay.focus()
              await overlay.press("ArrowRight")
              await expect
                .poll(async () => Number(await x.inputValue()))
                .toBeGreaterThan(before)
              const box = await overlay.boundingBox()
              await page.mouse.move(
                box.x + box.width / 2,
                box.y + box.height / 2,
              )
              await page.mouse.down()
              await page.mouse.move(
                box.x + box.width / 2 + 25,
                box.y + box.height / 2 + 15,
                { steps: 3 },
              )
              await page.mouse.up()
              await expect(
                page.getByTestId("scene-preset-title-hint"),
              ).toHaveCount(0)
              await expect(
                page.getByPlaceholder("Card description or subtitle..."),
              ).toBeVisible()
              checks.push({
                name: `${
                  theme
                } opening real Lottie layer keyboard+drag updates unsaved position`,
                id,
                before,
                after: await x.inputValue(),
              })
            }

            await capture(page, `${theme}-${kind}-layers`, scenePreview)
            await page.getByTestId("scene-preview-mode-stage").click()
            const state = await nativeState(page, scenePreview)
            expect(state.fallback).toBe(false)

            return state
          },
        )
      }
    }
    await context.close()
  }
} catch (e) {
  failures.push({ name: "unhandled", error: String(e) })
  console.log(String(e))
  console.log(
    await current
      .locator("body")
      .innerText()
      .catch(() => "NO BODY"),
  )

  if (current) {
    await current
      .screenshot({ path: path.join(out, "unhandled.png"), fullPage: true })
      .catch(() => {
        /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
      })
  }
} finally {
  fs.writeFileSync(
    path.join(out, "audit.json"),
    JSON.stringify(
      { checks, failures, errors, responses, screenshots },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      checks: checks.length,
      failures,
      errors,
      responses,
      screenshots,
    }),
  )
  await browser.close()

  if (failures.length || errors.length) {
    process.exitCode = 1
  }
}
