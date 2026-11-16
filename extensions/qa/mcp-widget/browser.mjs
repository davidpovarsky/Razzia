import { chromium, webkit } from "../../node_modules/@playwright/test/index.mjs"
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
const [, , base] = process.argv

if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(base ?? "")) {
  throw new Error("qa:local-origin-required")
}

const rawEvidence = process.env.TADAZZ_WIDGET_EVIDENCE
const evidence = rawEvidence
  ? rawEvidence.startsWith("file://")
    ? new URL(rawEvidence.endsWith("/") ? rawEvidence : `${rawEvidence}/`)
    : new URL(
        pathToFileURL(resolve(rawEvidence)).href.replace(/\/?$/u, "/"),
      )
  : new URL(
      "../../../docs/extensions/qa-evidence/mcp-widget-20261115/",
      import.meta.url,
    )
await mkdir(evidence, { recursive: true })
const engine =
  process.env.TADAZZ_WIDGET_BROWSER === "webkit" ? webkit : chromium
const useMsedge =
  engine === chromium &&
  process.platform === "win32" &&
  process.env.TADAZZ_WIDGET_CHROMIUM !== "bundled"
const browser = await engine.launch({
  ...(useMsedge ? { channel: "msedge" } : {}),
  headless: true,
})
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
  await run(
    "real SDK Preview button roundtrip uses retained selection candidate-first without unavailable flash",
    async () => {
      await page.goto(`${base}/host.html?preview=retained`)
      await page.locator("html[data-host-ready=true]").waitFor()
      const frame = page.frameLocator("iframe")
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
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Revision 1" })
        .waitFor()
      await frame.getByTestId("widget-status").evaluate((el) => {
        const seen = [el.textContent ?? ""]
        const observer = new MutationObserver(() => {
          seen.push(el.textContent ?? "")
        })
        observer.observe(el, {
          childList: true,
          subtree: true,
          characterData: true,
        })
        Object.assign(window, {
          __statusHistory: seen,
          __stopStatusObserver: () => observer.disconnect(),
        })
      })
      await frame
        .getByRole("button", { name: "Tadazz preview", exact: true })
        .click()
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
      const statusHistory = await frame
        .getByTestId("widget-status")
        .evaluate(() => {
          const w = window
          w.__stopStatusObserver?.()
          return w.__statusHistory ?? []
        })
      assert.equal(
        statusHistory.some((text) => text.includes("Preview unavailable")),
        false,
        `Unexpected unavailable status flash: ${JSON.stringify(statusHistory)}`,
      )
      assert.ok(
        await frame
          .getByTestId("sdk-candidate-stage")
          .locator(".widget-native-stage")
          .innerText(),
      )
      assert.deepEqual(await page.evaluate(() => window.__host.calls()), [
        "get_game_draft",
        "preview_game",
      ])
      await page.screenshot({
        path: new URL("sdk-preview-roundtrip.png", evidence).pathname.replace(
          /^\/([A-Z]:)/u,
          "$1",
        ),
      })
    },
  )
  await run(
    "duplicate preview click while in-flight disables button and sends one preview_game call",
    async () => {
      await page.goto(`${base}/host.html?preview=retained`)
      await page.locator("html[data-host-ready=true]").waitFor()
      const frame = page.frameLocator("iframe")
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Revision 1" })
        .waitFor()
      await page.evaluate(() => window.__host.holdPreviews(true))
      const previewBtn = frame.getByRole("button", {
        name: "Tadazz preview",
        exact: true,
      })
      await previewBtn.click()
      await page.waitForFunction(() =>
        window.__host.calls().includes("preview_game"),
      )
      assert.equal(await previewBtn.isDisabled(), true)
      await previewBtn.evaluate((button) => {
        button.click()
      })
      assert.deepEqual(await page.evaluate(() => window.__host.calls()), [
        "get_game_draft",
        "preview_game",
      ])
      await page.evaluate(() => window.__host.holdPreviews(false))
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Development candidate" })
        .waitFor()
      await frame
        .locator('[data-testid="tadazz-stage"]:not([data-v4-scene="idle"])')
        .waitFor()
      assert.equal(await previewBtn.isEnabled(), true)
      assert.deepEqual(await page.evaluate(() => window.__host.calls()), [
        "get_game_draft",
        "preview_game",
      ])
    },
  )
  await run(
    "preview after edit clears old candidate on ACK and mounts revision + 1 candidate",
    async () => {
      await page.goto(`${base}/host.html?preview=retained`)
      await page.locator("html[data-host-ready=true]").waitFor()
      const frame = page.frameLocator("iframe")
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      const previewBtn = frame.getByRole("button", {
        name: "Tadazz preview",
        exact: true,
      })
      await previewBtn.click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Development candidate" })
        .waitFor()
      await frame
        .locator('[data-testid="tadazz-stage"]:not([data-v4-scene="idle"])')
        .waitFor()
      await frame
        .getByLabel("Draft title", { exact: true })
        .fill("Edited after preview")
      assert.equal(await previewBtn.isDisabled(), true)
      await frame.getByRole("button", { name: "Apply draft edit" }).click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Revision 2" })
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
      await previewBtn.click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Development candidate" })
        .filter({ hasText: "Revision 2" })
        .waitFor()
      await frame.getByTestId("sdk-candidate-stage").waitFor()
      await frame
        .locator('[data-testid="tadazz-stage"]:not([data-v4-scene="idle"])')
        .waitFor()
      assert.deepEqual(await page.evaluate(() => window.__host.calls()), [
        "get_game_draft",
        "preview_game",
        "update_game_draft",
        "preview_game",
      ])
    },
  )
  await run(
    "concurrent refresh and concurrent edit ignore delayed preview_game response",
    async () => {
      // Subcase A: concurrent refresh during held preview_game
      await page.goto(`${base}/host.html?preview=retained`)
      await page.locator("html[data-host-ready=true]").waitFor()
      let frame = page.frameLocator("iframe")
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await page.evaluate(() => window.__host.holdPreviews(true))
      await frame
        .getByRole("button", { name: "Tadazz preview", exact: true })
        .click()
      await page.waitForFunction(() =>
        window.__host.calls().includes("preview_game"),
      )
      await page.evaluate(() => window.__host.remoteEdit())
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Revision 2" })
        .waitFor()
      await page.evaluate(() => window.__host.holdPreviews(false))
      await frame
        .locator("main")
        .evaluate(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
                50,
              ),
            ),
        )
      const statusAfterRefresh = await frame
        .getByTestId("widget-status")
        .innerText()
      assert.match(statusAfterRefresh, /Revision 2/u)
      assert.doesNotMatch(
        statusAfterRefresh,
        /Preview unavailable|Development candidate/u,
      )
      assert.equal(
        await frame
          .getByTestId("sdk-candidate-stage")
          .isVisible(),
        false,
      )
      assert.equal(
        await frame.getByLabel("Draft title", { exact: true }).inputValue(),
        "Remote server edit",
      )

      // Subcase B: concurrent edit during held preview_game
      await page.goto(`${base}/host.html?preview=retained`)
      await page.locator("html[data-host-ready=true]").waitFor()
      frame = page.frameLocator("iframe")
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      await page.evaluate(() => window.__host.holdPreviews(true))
      await frame
        .getByRole("button", { name: "Tadazz preview", exact: true })
        .click()
      await page.waitForFunction(() =>
        window.__host.calls().includes("preview_game"),
      )
      await frame
        .getByLabel("Draft title", { exact: true })
        .fill("Concurrent edit title")
      await frame.getByRole("button", { name: "Apply draft edit" }).click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "acknowledged" })
        .filter({ hasText: "Revision 2" })
        .waitFor()
      await page.evaluate(() => window.__host.holdPreviews(false))
      await frame
        .locator("main")
        .evaluate(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
                50,
              ),
            ),
        )
      const statusAfterEdit = await frame
        .getByTestId("widget-status")
        .innerText()
      assert.match(statusAfterEdit, /acknowledged.*Revision 2/u)
      assert.equal(
        await frame.getByTestId("sdk-candidate-stage").isVisible(),
        false,
      )
    },
  )
  await run(
    "adversarial tamper, stale candidate, and host cancel during preview_game fail closed",
    async () => {
      await page.goto(`${base}/host.html?preview=retained`)
      await page.locator("html[data-host-ready=true]").waitFor()
      const frame = page.frameLocator("iframe")
      await frame
        .getByRole("button", { name: "Refresh draft", exact: true })
        .click()
      const previewBtn = frame.getByRole("button", {
        name: "Tadazz preview",
        exact: true,
      })

      await page.evaluate(() => window.__host.previewMode("tampered"))
      await previewBtn.click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Preview unavailable" })
        .waitFor()
      await frame
        .getByTestId("sdk-candidate-stage")
        .waitFor({ state: "hidden" })

      await page.evaluate(() => window.__host.previewMode("stale"))
      await previewBtn.click()
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Preview unavailable" })
        .waitFor()
      await frame
        .getByTestId("sdk-candidate-stage")
        .waitFor({ state: "hidden" })

      await page.evaluate(() => {
        window.__host.previewMode("retained")
        window.__host.holdPreviews(true)
      })
      await previewBtn.click()
      await page.waitForFunction(
        () =>
          window.__host.calls().filter((name) => name === "preview_game")
            .length === 3,
      )
      await page.evaluate(() => window.__host.cancel())
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Cancelled" })
        .waitFor()
      await page.evaluate(() => window.__host.holdPreviews(false))
      await frame
        .locator("main")
        .evaluate(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
                50,
              ),
            ),
        )
      await frame
        .getByTestId("widget-status")
        .filter({ hasText: "Cancelled" })
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
          process.env.TADAZZ_WIDGET_BROWSER === "webkit"
            ? "local WebKit; genuine SDK AppBridge synthetic host, not ChatGPT/Claude installation"
            : useMsedge
              ? "local Edge Chromium; genuine SDK AppBridge synthetic host, not ChatGPT/Claude installation"
              : "local Chromium; genuine SDK AppBridge synthetic host, not ChatGPT/Claude installation",
        browserVersion: browser.version(),
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
