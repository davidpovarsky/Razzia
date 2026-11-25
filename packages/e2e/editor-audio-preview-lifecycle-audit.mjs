import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
const run = process.argv[2] ?? "after"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-preview/audio-lifecycle",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
const checks = [],
  errors = [],
  network = []
page.setDefaultTimeout(12000)
page.on("response", (r) => {
  if (r.status() >= 400) {
    network.push({ url: r.url(), status: r.status() })
  }
})
page.on("console", (m) => {
  if (m.type() === "error") {
    network.push({ console: m.text() })
  }
})
page.on("requestfailed", (q) =>
  network.push({ url: q.url(), error: q.failure()?.errorText }),
)
page.on("pageerror", (e) => errors.push(e.message))
let result = {}
const source = path.resolve(
  "../../extensions/src/editor/components/AudioCuesSection.tsx",
)
const sourceSha256 = createHash("sha256")
  .update(fs.readFileSync(source))
  .digest("hex")
const fixture = "/src/test/editor-audio-preview-lifecycle-fixture.mjs"

try {
  await page.route("**/__audio_preview_lifecycle__", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; await import("${
        fixture
      }");</script></body></html>`,
    }),
  )
  await page.goto("http://127.0.0.1:3180/__audio_preview_lifecycle__")
  await page.getByTestId("panel-audio").waitFor()
  expect(await page.evaluate(() => window.__audioHarness.audios.length)).toBe(0)
  checks.push("Mount does not create or autoplay audio")
  const start = page.getByTestId("test-audio-start"),
    show = page.getByTestId("test-audio-showQuestion")
  await start.click()
  await expect(start).toContainText("Stop")
  await page.evaluate(() => {
    const [a] = window.__audioHarness.audios
    window.__audioHarness.staleEnded = a.onended
    window.__audioHarness.staleError = a.onerror
  })
  await show.click()
  await expect(show).toContainText("Stop")
  const first = await page.evaluate(() => {
    const [a] = window.__audioHarness.audios

    return {
      paused: a.paused,
      time: a.currentTime,
      pauseCalls: a.pauseCalls,
      endedDetached: a.onended === null,
      errorDetached: a.onerror === null,
    }
  })
  expect(first.paused).toBe(true)
  expect(first.time).toBe(0)
  checks.push("Switch stops and rewinds the previous cue")
  await page.evaluate(async () => {
    const h = window.__audioHarness
    h.staleEnded()
    h.staleError()
    h.audios[0].rejectPlay(new Error("late canceled playback"))
    await Promise.resolve()
  })
  await expect(show).toContainText("Stop")
  checks.push(
    "Queued stale ended/error/rejected play cannot clear the new cue owner",
  )
  expect(first.endedDetached).toBe(true)
  expect(first.errorDetached).toBe(true)
  checks.push("Stopped cue callbacks are detached")
  await show.click()
  await expect(show).toContainText("Play")
  const second = await page.evaluate(() => {
    const [, a] = window.__audioHarness.audios

    return {
      paused: a.paused,
      time: a.currentTime,
      endedDetached: a.onended === null,
      errorDetached: a.onerror === null,
    }
  })
  expect(second).toEqual({
    paused: true,
    time: 0,
    endedDetached: true,
    errorDetached: true,
  })
  checks.push("Same cue click stops and detaches owned audio")
  await start.click()
  await expect(start).toContainText("Stop")
  await page.evaluate(() => {
    window.__audioHarness.audios.at(-1).onended()
  })
  await expect(start).toContainText("Play")
  checks.push("Current ended event clears only its own playback")
  await show.click()
  await expect(show).toContainText("Stop")
  await page.evaluate(() => window.__audioHarness.close())
  await expect(page.getByTestId("panel-audio")).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => window.__audioHarness.audios.at(-1).paused))
    .toBe(true)
  const last = await page.evaluate(async () => {
    const a = window.__audioHarness.audios.at(-1)
    a.rejectPlay(new Error("late unmounted playback"))
    await Promise.resolve()

    return {
      paused: a.paused,
      time: a.currentTime,
      endedDetached: a.onended === null,
      errorDetached: a.onerror === null,
    }
  })
  expect(last).toEqual({
    paused: true,
    time: 0,
    endedDetached: true,
    errorDetached: true,
  })
  checks.push("Closing/unmount stops audio and ignores a late rejected play")
  expect(errors).toEqual([])
  result = { ok: true, sourceSha256, checks, errors, network }
} catch (e) {
  result = {
    ok: false,
    sourceSha256,
    error: String(e),
    checks,
    errors,
    network,
  }
  await page
    .screenshot({ path: path.join(out, `${run}.png`), fullPage: true })
    .catch(() => {
      /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
    })
  process.exitCode = 1
} finally {
  fs.writeFileSync(
    path.join(out, `${run}.json`),
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result))
  await browser.close()
}
