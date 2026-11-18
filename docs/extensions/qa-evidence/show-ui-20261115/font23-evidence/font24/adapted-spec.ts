import playwright from "/work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import type * as Playwright from "/work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import { writeFile } from "node:fs/promises"
import { localizedFixtureText } from "/work/docs/extensions/qa-evidence/show-ui-20261115/qa-localized-content.ts"
import { rubikResourceEntries } from "/work/docs/extensions/qa-evidence/show-ui-20261115/qa-rubik-resources.ts"
const { test, expect } = playwright as unknown as typeof Playwright

test("decoded exact Rubik bytes paint the native eight-locale view", async ({ page, browserName }, info) => {
  const errors: string[] = [], external: string[] = [], csp: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
  page.on("request", request => { if (new URL(request.url()).origin !== new URL(process.env.TADAZZ_QA_BASE!).origin) external.push(request.url()) })
  await page.addInitScript(() => {
    ;(window as any).__fontCsp = []
    window.addEventListener("securitypolicyviolation", event => (window as any).__fontCsp.push(event.effectiveDirective))
  })
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  const decoded = await page.evaluate(async (entries) => {
    const digest = async (buffer: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(value => value.toString(16).padStart(2, "0")).join("")
    const faces = [...document.fonts].map(face => ({ family: face.family, status: face.status, weight: face.weight, unicodeRange: face.unicodeRange }))
    const resources = []
    const bodies = new Map<string, ArrayBuffer>()
    for (const [url, [, mime, sha256, bytes]] of Object.entries(entries)) {
      const response = await fetch(url)
      const body = await response.arrayBuffer()
      const observed = { url, status: response.status, mime: response.headers.get("content-type"), bytes: body.byteLength, sha256: await digest(body) }
      if (observed.status !== 200 || observed.mime !== mime || observed.bytes !== bytes || observed.sha256 !== sha256) throw new Error(`font:resource-mismatch:${url}`)
      resources.push(observed)
      bodies.set(url, body)
    }
    // A uniquely named, in-memory face from the exact response bytes avoids
    // mistaking an OS-installed family or document.fonts.check for webfont use.
    const sheet = (document.querySelector('link[href="/fonts/rubik-wght.css"]') as HTMLLinkElement).sheet!
    const aliases = []
    for (const rule of [...sheet.cssRules]) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const name = rule.style.getPropertyValue("src").match(/rubik-[a-z-]+\.woff2/u)?.[0]
      const body = bodies.get(`/fonts/files/${name}`)
      if (!body) throw new Error("font:missing-alias-bytes")
      const alias = new FontFace("E Byte Rubik", body, { style: rule.style.getPropertyValue("font-style"), weight: rule.style.getPropertyValue("font-weight"), unicodeRange: rule.style.getPropertyValue("unicode-range") })
      document.fonts.add(await alias.load())
      aliases.push({ status: alias.status, unicodeRange: alias.unicodeRange })
    }
    return { faces, aliases, resources }
  }, rubikResourceEntries)
  expect(decoded.faces).toHaveLength(6)
  expect(decoded.faces.every(face => face.status === "loaded" && face.family.includes("Rubik Variable"))).toBe(true)
  expect(decoded.aliases).toHaveLength(6)
  const observations: unknown[] = []
  const session = browserName === "chromium" ? await page.context().newCDPSession(page) : null
  if (session) { await session.send("DOM.enable"); await session.send("CSS.enable") }
  for (const [locale, text] of Object.entries(localizedFixtureText)) {
    await page.evaluate(locale => (window as any).__v2Qa.show({ theme: "razzia-original", locale, phase: "answerCards" }), locale)
    await expect(page.getByTestId("native-razzia-question")).toHaveText(`${text.question} 1`)
    await expect(page.getByTestId("native-razzia-preview-v2")).toBeVisible()
    const paint = await page.evaluate(async () => {
      const root = document.querySelector("#host")!.shadowRoot!
      const heading = root.querySelector('[data-testid="native-razzia-question"]') as HTMLElement
      const style = getComputedStyle(heading)
      const word = heading.textContent!.split(/\s/u)[0]
      const range = document.createRange()
      range.setStart(heading.firstChild!, 0); range.setEnd(heading.firstChild!, word.length)
      const actualWidth = range.getBoundingClientRect().width
      const span = document.createElement("span")
      span.textContent = word
      span.style.cssText = "position:fixed;visibility:hidden;white-space:pre"
      for (const property of ["font-size", "font-weight", "font-style", "font-stretch", "font-feature-settings", "font-variation-settings", "font-kerning", "letter-spacing", "text-transform"]) span.style.setProperty(property, style.getPropertyValue(property))
      span.style.fontFamily = '"E Byte Rubik", sans-serif'
      document.body.append(span)
      const aliasWidth = span.getBoundingClientRect().width
      span.remove()
      const raster = async (family: string, text: string) => {
        const canvas = document.createElement("canvas")
        canvas.width = 1800; canvas.height = 100
        const context = canvas.getContext("2d")!
        context.font = `${style.fontWeight} ${style.fontSize} ${family}`
        context.fillText(text, 4, 60)
        const pixels = context.getImageData(0, 0, 1800, 100).data
        return [...new Uint8Array(await crypto.subtle.digest("SHA-256", pixels))].map(value => value.toString(16).padStart(2, "0")).join("")
      }
      const text = heading.textContent!
      const nonAscii = text.replaceAll(/[\x00-\x7F]/gu, "")
      return {
        text, family: style.fontFamily, fontSize: style.fontSize, weight: style.fontWeight, actualWidth, aliasWidth,
        raster: await raster(style.fontFamily, text), aliasRaster: await raster('"E Byte Rubik", sans-serif', text),
        monoRaster: await raster("monospace", text), sansRaster: await raster("sans-serif", text),
        fallbackRaster: await raster(style.fontFamily, nonAscii), sansFallbackRaster: await raster("sans-serif", nonAscii),
        digitRaster: await raster(style.fontFamily, "1234567890"), aliasDigitRaster: await raster('"E Byte Rubik", sans-serif', "1234567890"),
      }
    })
    expect(paint.family).toContain("Rubik Variable")
    expect(Math.abs(paint.actualWidth - paint.aliasWidth)).toBeLessThan(0.15)
    expect(paint.raster).toBe(paint.aliasRaster)
    expect(paint.digitRaster).toBe(paint.aliasDigitRaster)
    if (locale === "ja") expect(paint.fallbackRaster).toBe(paint.sansFallbackRaster)
    else expect(paint.raster).not.toBe(paint.monoRaster)
    let platformFonts: unknown = null
    if (session) {
      const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true })
      const find = (node: any): number | null => {
        const attributes = node.attributes ?? []
        if (attributes.some((value: string, index: number) => value === "data-testid" && attributes[index + 1] === "native-razzia-question")) return node.nodeId
        for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) { const found = find(child); if (found) return found }
        return null
      }
      const nodeId = find(root)
      expect(nodeId).toBeTruthy()
      const result = await session.send("CSS.getPlatformFontsForNode", { nodeId: nodeId! })
      platformFonts = result.fonts
      expect(result.fonts.some(font => font.glyphCount > 0 && font.isCustomFont)).toBe(true)
      if (locale === "ja") expect(result.fonts.some(font => font.glyphCount > 0 && !font.isCustomFont)).toBe(true)
    }
    observations.push({ locale, paint, platformFonts })
  }
  await session?.detach()
  expect((await page.request.get("/fonts/files/unregistered.woff2")).status()).toBe(404)
  expect((await page.request.get("/fonts/files/rubik-latin-wght-normal.woff2?other=1")).status()).toBe(404)
  csp.push(...await page.evaluate(() => (window as any).__fontCsp))
  const requests = await (await page.request.get("/qa/requests")).json()
  const path = info.outputPath("decoded-font-use.json")
  await writeFile(path, JSON.stringify({ browserName, userAgent: await page.evaluate(() => navigator.userAgent), decoded, observations, requests, errors, external, csp, exactWebKitPlatformFamilyObserved: false }, null, 2))
  await info.attach("decoded-font-use.json", { path, contentType: "application/json" })
  expect(errors).toEqual([]); expect(external).toEqual([]); expect(csp).toEqual([])
})

for (const kind of ["css-integrity", "decode"] as const) test(`font ${kind} failure closes before renderer admission`, async ({ page }, info) => {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  if (kind === "css-integrity") await page.route("**/fonts/rubik-wght.css", route => route.fulfill({ status: 200, contentType: "text/css", body: ".untrusted{color:red}" }))
  else await page.route("**/fonts/files/*.woff2", route => route.fulfill({ status: 200, contentType: "font/woff2", body: "invalid-font-body" }))
  await page.goto("/")
  await expect.poll(() => errors.some(value => value.includes(`qa:font-${kind === "decode" ? "decode" : "css-integrity"}`))).toBe(true)
  expect(await page.evaluate(() => ({ ready: document.documentElement.dataset.qaReady ?? null, renderer: typeof (window as any).__v2Qa, scripts: [...document.scripts].map(script => script.src) }))).toMatchObject({ ready: null, renderer: "undefined" })
  const path = info.outputPath("closed-font-failure.json")
  await writeFile(path, JSON.stringify({ kind, errors, rendererAdmitted: false }, null, 2))
  await info.attach("closed-font-failure.json", { path, contentType: "application/json" })
})
