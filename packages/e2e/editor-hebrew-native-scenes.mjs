import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/visual-he-fullshow",
)
const receipt = JSON.parse(
  fs.readFileSync(path.join(out, "source-receipt.json"), "utf8"),
)
const html = fs.readFileSync(path.join(out, "native-he-scenes.html"), "utf8")
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  locale: "he-IL",
})
const snapshots = [],
  errors = []
page.on("pageerror", (e) => errors.push(e.message))

try {
  await page.route("**/__hebrew-native-scenes__", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: html,
    }),
  )
  await page.goto("http://127.0.0.1:3180/__hebrew-native-scenes__")
  for (const scene of receipt.scenes) {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.evaluate(
      (receivedScene) => window.showScene(receivedScene),
      scene,
    )
    await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise((r) => {
        requestAnimationFrame(() => requestAnimationFrame(r))
      })
    })
    const visible = page.locator(".scene-container.active")
    expect(await visible.innerText()).not.toMatch(
      /AWAITING THE VOTE|PHONE VOTING|KEYPAD VOTING|LIVE CONNECTIONS|EQUAL VOTES|ROUND 0[12]|Choice [12]|fullShow\./u,
    )
    const images = await visible.locator("img").evaluateAll(async (imgs) => {
      await Promise.all(
        imgs.map((img) =>
          img.decode().catch(() => {
            /* The following naturalWidth assertion reports images that could not decode. */
          }),
        ),
      )

      return imgs
        .filter((img) => img.src && !img.naturalWidth)
        .map((img) => img.src)
    })
    expect(images).toEqual([])
    const name = `${scene}-1920`
    await page.screenshot({
      path: path.join(out, `${name}.png`),
      animations: "disabled",
    })
    snapshots.push({
      name,
      scene,
      width: 1920,
      text: await visible.innerText(),
    })
  }
  for (const scene of [
    "representative-directory",
    "phone-instructions",
    "story-progress",
    "grand-opening",
  ]) {
    await page.setViewportSize({ width: 320, height: 180 })
    await page.evaluate(
      (receivedScene2) => window.showScene(receivedScene2),
      scene,
    )
    await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise((r) => {
        requestAnimationFrame(() => requestAnimationFrame(r))
      })
    })
    const name = `${scene}-320`

    await page.screenshot({
      path: path.join(out, `${name}.png`),
      animations: "disabled",
    })
    snapshots.push({ name, scene, width: 320 })
  }
  expect(errors).toEqual([])
  console.log(
    JSON.stringify(
      {
        ok: true,
        screenshots: snapshots.length,
        errors,
        method: receipt.method,
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
    path.join(out, "audit.json"),
    JSON.stringify({ snapshots, errors }, null, 2),
  )
  await browser.close()
}
