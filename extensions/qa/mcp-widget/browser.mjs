import { chromium } from "../../node_modules/@playwright/test/index.mjs"
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
const [, , base] = process.argv

if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(base ?? "")) {
  throw new Error("qa:local-origin-required")
}

const evidence = new URL(
  "../../../docs/extensions/qa-evidence/mcp-widget-20261115/",
  import.meta.url,
)
const browser = await chromium.launch({ channel: "msedge", headless: true })
const cases = [],
  errors = [],
  requests = []
const page = await browser.newPage({
  viewport: { width: 1366, height: 1000 },
  reducedMotion: "reduce",
})
page.setDefaultTimeout(10_000)
page.on("pageerror", (error) => errors.push(error.message))
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text())
  }
})
page.on("request", (request) => requests.push(request.url()))
async function run(name, fn) {
  try {
    await fn()
    cases.push({ name, status: "PASS" })
  } catch (error) {
    cases.push({ name, status: "FAIL", message: String(error) })
    throw error
  }
}

try {
  await run("strict-CSP artifact fallback without host", async () => {
    await page.goto(`${base}/widget.html`)
    await page
      .getByTestId("widget-status")
      .filter({ hasText: "Preview unavailable" })
      .waitFor()
    assert.equal(await page.locator("iframe").count(), 0)
    await page.screenshot({
      path: new URL("fallback-desktop.png", evidence).pathname.replace(
        /^\/([A-Z]:)/u,
        "$1",
      ),
    })
  })
  await run(
    "genuine native Stage private fixture answer/results/navigation/replay",
    async () => {
      await page.goto(`${base}/fixture.html`)
      await page.getByTestId("candidate-stage").waitFor()
      await page.getByTestId("fixture-label").waitFor()
      await page.getByRole("button", { name: "Results", exact: true }).click()
      await page.getByTestId("candidate-stage").waitFor()
      await page.getByRole("button", { name: "Next card" }).click()
      await page
        .getByRole("button", { name: "Previous card" })
        .waitFor({ state: "visible" })
      assert.equal(
        await page.getByRole("button", { name: "Previous card" }).isEnabled(),
        true,
      )
      await page.getByTestId("candidate-stage").waitFor()
      await page.getByRole("button", { name: "Replay", exact: true }).click()
      await page.getByTestId("candidate-stage").waitFor()
      await page.screenshot({
        path: new URL("native-classic-desktop.png", evidence).pathname.replace(
          /^\/([A-Z]:)/u,
          "$1",
        ),
      })
    },
  )
  await run(
    "all eight locale bundles; native Razzia narrow and reduced motion",
    async () => {
      await page.setViewportSize({ width: 390, height: 900 })
      await page.locator("select").nth(1).selectOption("razzia-original")
      for (const locale of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"]) {
        await page.locator("select").first().selectOption(locale)
        await page.locator(`main[lang=${locale}]`).waitFor()
        await page.getByTestId("native-razzia-preview-v2").waitFor()
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        )
      }
      await page.screenshot({
        path: new URL("native-razzia-narrow-vi.png", evidence).pathname.replace(
          /^\/([A-Z]:)/u,
          "$1",
        ),
      })
    },
  )
  await run(
    "real SDK opaque iframe initialize and draft CAS acknowledgement",
    async () => {
      await page.goto(`${base}/host.html`)
      await page.locator("html[data-host-ready=true]").waitFor()
      const frame = page.frameLocator("iframe")
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      const editor = frame.getByLabel("Draft title", { exact: true })
      await editor.waitFor()
      await editor.fill("Edited in SDK widget")
      await frame.getByRole("button", { name: "Apply draft edit" }).click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "acknowledged" })
        .waitFor()
      assert.deepEqual(await page.evaluate(() => window.__host.calls()), [
        "get_game_draft",
        "update_game_draft",
      ])
      await page.screenshot({
        path: new URL("sdk-acknowledged-narrow.png", evidence).pathname.replace(
          /^\/([A-Z]:)/u,
          "$1",
        ),
      })
    },
  )
  await run(
    "SDK conflict keeps edit; host cancellation and locale/theme updates",
    async () => {
      const frame = page.frameLocator("iframe")
      await page.evaluate(() => window.__host.conflict(true))
      await frame
        .getByLabel("Draft title", { exact: true })
        .fill("Conflict edit preserved")
      await frame.getByRole("button", { name: "Apply draft edit" }).click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "changed elsewhere" })
        .waitFor()
      assert.equal(
        await frame.getByLabel("Draft title", { exact: true }).inputValue(),
        "Conflict edit preserved",
      )
      await page.evaluate(() => window.__host.cancel())
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Cancelled" })
        .waitFor()
      await page.evaluate(() => window.__host.context("de-DE", "dark"))
      await frame.locator("main[lang=de][data-theme=dark]").waitFor()
    },
  )
  await run(
    "undo restores acknowledged content through a new server revision",
    async () => {
      await page.goto(`${base}/host.html`)
      const frame = page.frameLocator("iframe")
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await frame.getByLabel("Draft title", { exact: true }).fill("Before undo")
      await frame.getByRole("button", { name: "Apply draft edit" }).click()
      await frame
        .getByRole("button", { name: "Undo acknowledged edit" })
        .click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Revision 3" })
        .waitFor()
      assert.equal(
        await frame.getByLabel("Draft title", { exact: true }).inputValue(),
        "Original",
      )
      assert.deepEqual(await page.evaluate(() => window.__host.calls()), [
        "get_game_draft",
        "update_game_draft",
        "update_game_draft",
      ])
    },
  )
  await run(
    "refresh does not rebase unsubmitted edits over a remote revision",
    async () => {
      await page.goto(`${base}/host.html`)
      const frame = page.frameLocator("iframe")
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await frame
        .getByLabel("Draft title", { exact: true })
        .fill("Unsubmitted old revision")
      await page.evaluate(() => window.__host.remoteEdit())
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Revision 2" })
        .waitFor()
      assert.equal(
        await frame
          .getByRole("button", { name: "Apply draft edit" })
          .isDisabled(),
        true,
      )
      assert.equal(
        await frame.getByLabel("Draft title", { exact: true }).inputValue(),
        "Unsubmitted old revision",
      )
      await frame.getByRole("button", { name: "Reset to latest draft" }).click()
      assert.equal(
        await frame.getByLabel("Draft title", { exact: true }).inputValue(),
        "Remote server edit",
      )
    },
  )
  await run(
    "retained real F HTTP tool-error result through actual widget SDK and E mount",
    async () => {
      await page.goto(`${base}/host.html?candidate=valid`)
      await page.locator("html[data-host-ready=true]").waitFor()
      const frame = page.frameLocator("iframe")
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Development candidate" })
        .waitFor()
      await frame.getByTestId("sdk-candidate-stage").waitFor()
      await frame
        .locator('[data-testid="tadazz-stage"]:not([data-v4-scene="idle"])')
        .waitFor()
      await frame.getByTestId("tadazz-stage").evaluate(async () => {
        await document.fonts.ready
        await new Promise(requestAnimationFrame)
        await new Promise(requestAnimationFrame)
      })
      assert.ok(
        await frame
          .getByTestId("sdk-candidate-stage")
          .locator(".widget-native-stage")
          .innerText(),
      )
      await page.screenshot({
        path: new URL(
          "sdk-actual-http-candidate-narrow.png",
          evidence,
        ).pathname.replace(/^\/([A-Z]:)/u, "$1"),
      })
      await page.evaluate(() => window.__host.cancel())
      await frame
        .getByTestId("sdk-candidate-stage")
        .waitFor({ state: "hidden" })
      assert.equal(
        await frame
          .getByTestId("sdk-candidate-stage")
          .locator(".widget-native-stage")
          .innerText(),
        "",
      )
    },
  )
  for (const mode of ["tampered", "repeated"]) {
    await run(`rejects ${mode} candidate association`, async () => {
      await page.goto(`${base}/host.html?candidate=${mode}`)
      await page.locator("html[data-host-ready=true]").waitFor()
      const frame = page.frameLocator("iframe")
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Preview unavailable" })
        .waitFor()
      await frame
        .getByTestId("sdk-candidate-stage")
        .waitFor({ state: "hidden" })
      assert.equal(
        await frame
          .getByTestId("sdk-candidate-stage")
          .locator(".widget-native-stage")
          .innerText(),
        "",
      )
    })
  }
  await run(
    "SDK teardown acknowledges and clears renderer and private draft",
    async () => {
      await page.goto(`${base}/host.html?candidate=valid`)
      await page
        .frameLocator("iframe")
        .getByTestId("widget-status")
        .filter({ hasText: "Development candidate" })
        .waitFor()
      await page.evaluate(() => window.__host.teardown())
      await page
        .frameLocator("iframe")
        .getByTestId("widget-status")
        .filter({ hasText: "Preview closed" })
        .waitFor()
      await page
        .frameLocator("iframe")
        .getByTestId("sdk-candidate-stage")
        .waitFor({ state: "hidden" })
    },
  )
  await run(
    "cancelled slow SDK write never reports success; refresh reconciles server revision",
    async () => {
      await page.goto(`${base}/host.html`)
      const frame = page.frameLocator("iframe")
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await frame
        .getByLabel("Draft title", { exact: true })
        .fill("Cancelled edit")
      await page.evaluate(() => window.__host.delay(400))
      await frame.getByRole("button", { name: "Apply draft edit" }).click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Loading" })
        .waitFor()
      await frame.getByRole("button", { name: "Cancel", exact: true }).click()
      await page.waitForFunction(() => window.__host.revision() === 2)
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Cancelled" })
        .waitFor()
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Revision 2" })
        .waitFor()
      assert.equal(
        await frame
          .getByRole("button", { name: "Apply draft edit" })
          .isDisabled(),
        true,
      )
    },
  )
  await run("unsupported host tool capability disables actions", async () => {
    await page.goto(`${base}/host.html?noTools=1`)
    await page.locator("html[data-host-ready=true]").waitFor()
    const frame = page.frameLocator("iframe")
    assert.equal(
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .isDisabled(),
      true,
    )
    assert.deepEqual(await page.evaluate(() => window.__host.calls()), [])
  })
  await run(
    "changed host invocation clears candidate and closes private state",
    async () => {
      await page.goto(`${base}/host.html?candidate=valid`)
      const frame = page.frameLocator("iframe")
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Development candidate" })
        .waitFor()
      await page.evaluate(() => window.__host.toolChange())
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Preview closed" })
        .waitFor()
      await frame
        .getByTestId("sdk-candidate-stage")
        .waitFor({ state: "hidden" })
    },
  )
  await run("no external connections or browser/CSP errors", () => {
    assert.deepEqual(
      requests.filter(
        (url) => !url.startsWith(base) && !url.startsWith("data:"),
      ),
      [],
    )
    assert.deepEqual(errors, [])
  })
} finally {
  await writeFile(
    new URL("browser-results.json", evidence),
    JSON.stringify(
      {
        surface:
          "local Edge Chromium; genuine SDK AppBridge synthetic host, not ChatGPT/Claude installation",
        cases,
        errors,
        requests,
      },
      null,
      2,
    ),
  )
  await browser.close()
}

if (cases.some((entry) => entry.status === "FAIL")) {
  process.exitCode = 1
}

console.log(JSON.stringify(cases))
