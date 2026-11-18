import { chromium, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
const out = path.resolve(
  "../../docs/extensions/plans/editor-hebrew-20261118/font-proof",
)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "he-IL",
})
const fontNetwork = [],
  fontBodies = [],
  errors = []
page.on("response", (r) => {
  if (/\.(woff2?|ttf|otf)(?:\?|$)/i.test(r.url())) {
    const item = {
      url: r.url(),
      status: r.status(),
      contentType: r.headers()["content-type"],
    }
    fontNetwork.push(item)
    fontBodies.push(
      r
        .body()
        .then((body) => {
          item.bodyBytes = body.length
        })
        .catch(() => {
          item.bodyBytes = null
        }),
    )
  }
})
page.on("pageerror", (e) => errors.push(e.message))
try {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "he"))
  await page.goto("http://127.0.0.1:3180/manager?lng=he")
  await page.locator('input[type="password"]').waitFor({ timeout: 45000 })
  await page.locator('input[type="password"]').fill("e2e-password")
  await page.getByRole("button", { name: "שליחה", exact: true }).click()
  await page.waitForURL("**/manager/config")
  await page.goto("http://127.0.0.1:3180/manager/quizz?lng=he")
  await page.getByTestId("editor-save-btn").waitFor({ timeout: 45000 })
  await page
    .getByPlaceholder("כותרת החידון…")
    .fill("בדיקת גופן עברי — Rubik 123")
  await page
    .getByPlaceholder("הקלידו את השאלה…")
    .fill("באיזה גופן מוצגות האותיות העבריות?")
  await page.getByTestId("answer-text-0").fill("עברית תקינה")
  await page.getByTestId("answer-text-1").fill("Hebrew + עברית 123")
  const computed = await page.evaluate(async () => {
    await document.fonts.ready
    const target = document.querySelector(
      '[data-testid="studio-tab-questions"]',
    )
    const style = getComputedStyle(target)
    const loaded = await document.fonts.load(style.font, "שאלות")
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    )
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      target: {
        text: target.textContent,
        family: style.fontFamily,
        font: style.font,
        size: style.fontSize,
        weight: style.fontWeight,
      },
      fontCheck: document.fonts.check(style.font, "שאלות"),
      matchingLoadedFaces: loaded.map((f) => ({
        family: f.family,
        status: f.status,
        weight: f.weight,
        unicodeRange: f.unicodeRange,
      })),
      allFaces: [...document.fonts].map((f) => ({
        family: f.family,
        status: f.status,
        weight: f.weight,
        style: f.style,
        unicodeRange: f.unicodeRange,
      })),
      resources: performance
        .getEntriesByType("resource")
        .filter((r) => /\.(woff2?|ttf|otf)(?:\?|$)/i.test(r.name))
        .map((r) => ({
          url: r.name,
          decodedBodySize: r.decodedBodySize,
          encodedBodySize: r.encodedBodySize,
          transferSize: r.transferSize,
          duration: r.duration,
        })),
    }
  })
  await page.screenshot({
    path: path.join(out, "hebrew-editor-font-1440.png"),
    fullPage: true,
    animations: "disabled",
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("DOM.enable")
  await cdp.send("CSS.enable")
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 })
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: '[data-testid="studio-tab-questions"]',
  })
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
    nodeId,
    selector: "span",
  })
  const findNode = (n, id) =>
    n.nodeId === id
      ? n
      : (n.children ?? []).map((c) => findNode(c, id)).find(Boolean)
  const actualNode = findNode(root, nodeId)
  const textIds = (actualNode?.children ?? [])
    .filter((n) => n.nodeType === 3)
    .map((n) => n.nodeId)
  const actualGlyphFonts = { fonts: [], nodes: [] }
  for (const id of [nodeId, ...nodeIds, ...textIds]) {
    const result = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: id })
    actualGlyphFonts.nodes.push({ nodeId: id, ...result })
    actualGlyphFonts.fonts.push(...result.fonts)
  }
  await Promise.allSettled(fontBodies)
  fs.writeFileSync(
    path.join(out, "receipt.json"),
    JSON.stringify(
      { ok: false, computed, actualGlyphFonts, fontNetwork, errors },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify(
      {
        target: computed.target,
        fontCheck: computed.fontCheck,
        actualGlyphFonts,
        fontNetwork,
        matchingLoadedFaces: computed.matchingLoadedFaces,
        resources: computed.resources,
      },
      null,
      2,
    ),
  )
  await page.screenshot({
    path: path.join(out, "hebrew-editor-font-1440.png"),
    fullPage: true,
    animations: "disabled",
  })
  expect(computed.lang).toBe("he")
  expect(computed.dir).toBe("rtl")
  expect(computed.fontCheck).toBe(true)
  expect(computed.matchingLoadedFaces.length).toBeGreaterThan(0)
  expect(
    computed.matchingLoadedFaces.some(
      (f) =>
        f.status === "loaded" &&
        /Rubik/i.test(f.family) &&
        /590-5FF/i.test(f.unicodeRange),
    ),
  ).toBe(true)
  expect(
    fontNetwork.some((r) => r.status === 200 && /hebrew/i.test(r.url)),
  ).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({
    path: path.join(out, "hebrew-editor-font-1440.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 320, height: 1000 })
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
  const headerTabs = await page
    .locator('[data-testid^="studio-tab-"]')
    .evaluateAll((tabs) =>
      tabs.map((el) => ({
        id: el.getAttribute("data-testid"),
        text: el.textContent,
        rect: el.getBoundingClientRect().toJSON(),
      })),
    )
  for (const tab of headerTabs) {
    expect(tab.rect.left).toBeGreaterThanOrEqual(0)
    expect(tab.rect.right).toBeLessThanOrEqual(320)
    expect(tab.rect.width).toBeGreaterThan(0)
  }
  expect(headerTabs).toHaveLength(4)
  await page.screenshot({
    path: path.join(out, "hebrew-editor-font-320.png"),
    fullPage: true,
    animations: "disabled",
  })
  fs.writeFileSync(
    path.join(out, "receipt.json"),
    JSON.stringify(
      { ok: true, computed, actualGlyphFonts, fontNetwork, headerTabs, errors },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify(
      {
        ok: true,
        target: computed.target,
        actualGlyphFonts,
        decodedFontResponses: fontNetwork,
        loadedMatchingFaces: computed.matchingLoadedFaces,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.log(String(error))
  process.exitCode = 1
} finally {
  await browser.close()
}
