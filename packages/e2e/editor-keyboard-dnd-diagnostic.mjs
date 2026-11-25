import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/keyboard-dnd",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const receipts = [],
  errors = []

try {
  for (let iteration = 1; iteration <= 3; iteration += 1) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      locale: "en-US",
    })
    page.on("pageerror", (e) => errors.push(e.message))
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
    await page.goto("http://127.0.0.1:3180/manager?lng=en")
    await page.locator('input[type="password"]').waitFor({ timeout: 45000 })
    await page.locator('input[type="password"]').fill("e2e-password")
    await page.getByRole("button", { name: "Submit", exact: true }).click()
    await page.waitForURL("**/manager/config")
    await page.goto("http://127.0.0.1:3180/manager/quizz?lng=en")
    await page.getByTestId("editor-save-btn").waitFor({ timeout: 45000 })
    const title = page.locator('input[name$=".question"]')
    await title.fill(`Original DnD diagnostic ${iteration}`)
    await page.getByTestId("answer-text-0").fill("Yes")
    await page.getByTestId("answer-text-1").fill("No")
    await page
      .getByTestId("editor-question-card-0")
      .getByRole("button", { name: "Duplicate question", exact: true })
      .click()
    await title.fill("Disposable duplicate diagnostic")
    await page.getByTestId("toggle-kind-transition").click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Convert to Scene", exact: true })
      .click()
    const scene = page.locator('[data-scene-kind="transition"]'),
      wrapper = scene.locator("..")
    await page.evaluate(() => {
      window.__dndEvents = []
      const collect = () =>
        [...document.querySelectorAll('[role="status"],[aria-live]')]
          .map((e) => ({
            id: e.id,
            role: e.getAttribute("role"),
            text: e.textContent,
          }))
          .filter((e) => e.text)
      window.__dndObserver = new MutationObserver(() => {
        const live = collect()
        const serialized = JSON.stringify(live)

        if (serialized !== window.__dndLast) {
          window.__dndEvents.push({ type: "live", at: performance.now(), live })
          window.__dndLast = serialized
        }
      })
      window.__dndObserver.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      })
      document.addEventListener(
        "keydown",
        (e) =>
          window.__dndEvents.push({
            type: "key",
            key: e.key,
            code: e.code,
            at: performance.now(),
            target: e.target.tagName,
            pressed: e.target.getAttribute("aria-pressed"),
          }),
        true,
      )
    })
    const states = []
    const receipt = { iteration, states, events: [] }
    receipts.push(receipt)
    const inspect = async (step) => {
      states.push(
        await wrapper.evaluate(
          (e, receivedStep) => ({
            step: receivedStep,
            wrapper: {
              role: e.getAttribute("role"),
              tabindex: e.getAttribute("tabindex"),
              pressed: e.getAttribute("aria-pressed"),
              rect: JSON.stringify(e.getBoundingClientRect()),
              describedBy: e.getAttribute("aria-describedby"),
              style: e.getAttribute("style"),
              class: e.className,
            },
            activeElement: {
              tag: document.activeElement.tagName,
              role: document.activeElement.getAttribute("role"),
              pressed: document.activeElement.getAttribute("aria-pressed"),
              isWrapper: document.activeElement === e,
            },
            order: [
              ...document.querySelectorAll(
                '[data-testid="editor-timeline"] [data-testid^="editor-question-card-"],[data-testid="editor-timeline"] [data-testid="editor-scene-card"]',
              ),
            ].map((el) => ({
              kind: el.getAttribute("data-scene-kind") ?? "question",
              text: el.textContent.trim(),
              rect: JSON.stringify(el.getBoundingClientRect()),
            })),
            live: [...document.querySelectorAll('[role="status"],[aria-live]')]
              .map((el) => ({ id: el.id, text: el.textContent }))
              .filter((el) => el.text),
          }),
          step,
        ),
      )
    }
    await wrapper.focus()
    await inspect("before")
    await wrapper.press("Space")
    await expect(wrapper).toHaveAttribute("aria-pressed", "true")
    await inspect("after-space")
    await page.evaluate(
      () =>
        new Promise((r) => {
          requestAnimationFrame(() => requestAnimationFrame(r))
        }),
    )
    await inspect("after-space-settled")
    await wrapper.press("ArrowUp")
    await inspect("after-arrow-up-immediate")
    await page.evaluate(
      () =>
        new Promise((r) => {
          requestAnimationFrame(() => requestAnimationFrame(r))
        }),
    )
    await inspect("after-arrow-up-settled")
    await wrapper.press("Enter")
    await expect(wrapper).not.toHaveAttribute("aria-pressed", "true")
    await inspect("after-enter")
    const events = await page.evaluate(() => window.__dndEvents)
    receipt.events = events
    await page
      .getByTestId("editor-timeline")
      .screenshot({ path: path.join(out, `reordered-${iteration}.png`) })
    await page.close()
  }
  expect(errors).toEqual([])
  console.log(
    JSON.stringify(
      {
        ok: true,
        iterations: receipts.length,
        errors,
        states: receipts.map((x) => ({
          iteration: x.iteration,
          states: x.states.map((s) => ({
            step: s.step,
            pressed: s.wrapper.pressed,
            order: s.order.map((orderedItem) => orderedItem.kind),
            live: s.live,
          })),
        })),
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.log(String(error))
  process.exitCode = 1
} finally {
  fs.writeFileSync(
    path.join(out, "receipt.json"),
    JSON.stringify({ receipts, errors }, null, 2),
  )
  await browser.close()
}
