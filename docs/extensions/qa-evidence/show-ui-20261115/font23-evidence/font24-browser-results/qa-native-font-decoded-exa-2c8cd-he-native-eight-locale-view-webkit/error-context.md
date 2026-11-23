# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-native-font.spec.ts >> decoded exact Rubik bytes paint the native eight-locale view
- Location: ../tmp/font24/qa-native-font.spec.ts:8:1

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 0.15
Received:   0.453125
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - heading "Which colour do you prefer? 1" [level=2] [ref=e6]
  - generic [ref=e7]:
    - button "1 Blue" [disabled] [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]: "1"
        - paragraph [ref=e12]: Blue
    - button "2 Green" [disabled] [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: "2"
        - paragraph [ref=e17]: Green
    - button "3 Orange" [disabled] [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]: "3"
        - paragraph [ref=e22]: Orange
    - button "4 Purple" [disabled] [ref=e23]:
      - generic [ref=e24]:
        - generic [ref=e25]: "4"
        - paragraph [ref=e27]: Purple
    - button "5 Pink" [disabled] [ref=e28]:
      - generic [ref=e29]:
        - generic [ref=e30]: "5"
        - paragraph [ref=e32]: Pink
```

# Test source

```ts
  1   | import playwright from "/work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
  2   | import type * as Playwright from "/work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
  3   | import { writeFile } from "node:fs/promises"
  4   | import { localizedFixtureText } from "/work/docs/extensions/qa-evidence/show-ui-20261115/qa-localized-content.ts"
  5   | import { rubikResourceEntries } from "/work/docs/extensions/qa-evidence/show-ui-20261115/qa-rubik-resources.ts"
  6   | const { test, expect } = playwright as unknown as typeof Playwright
  7   | 
  8   | test("decoded exact Rubik bytes paint the native eight-locale view", async ({ page, browserName }, info) => {
  9   |   const errors: string[] = [], external: string[] = [], csp: string[] = []
  10  |   page.on("pageerror", error => errors.push(error.message))
  11  |   page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
  12  |   page.on("request", request => { if (new URL(request.url()).origin !== new URL(process.env.TADAZZ_QA_BASE!).origin) external.push(request.url()) })
  13  |   await page.addInitScript(() => {
  14  |     ;(window as any).__fontCsp = []
  15  |     window.addEventListener("securitypolicyviolation", event => (window as any).__fontCsp.push(event.effectiveDirective))
  16  |   })
  17  |   await page.goto("/")
  18  |   await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  19  |   const decoded = await page.evaluate(async (entries) => {
  20  |     const digest = async (buffer: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(value => value.toString(16).padStart(2, "0")).join("")
  21  |     const faces = [...document.fonts].map(face => ({ family: face.family, status: face.status, weight: face.weight, unicodeRange: face.unicodeRange }))
  22  |     const resources = []
  23  |     const bodies = new Map<string, ArrayBuffer>()
  24  |     for (const [url, [, mime, sha256, bytes]] of Object.entries(entries)) {
  25  |       const response = await fetch(url)
  26  |       const body = await response.arrayBuffer()
  27  |       const observed = { url, status: response.status, mime: response.headers.get("content-type"), bytes: body.byteLength, sha256: await digest(body) }
  28  |       if (observed.status !== 200 || observed.mime !== mime || observed.bytes !== bytes || observed.sha256 !== sha256) throw new Error(`font:resource-mismatch:${url}`)
  29  |       resources.push(observed)
  30  |       bodies.set(url, body)
  31  |     }
  32  |     // A uniquely named, in-memory face from the exact response bytes avoids
  33  |     // mistaking an OS-installed family or document.fonts.check for webfont use.
  34  |     const sheet = (document.querySelector('link[href="/fonts/rubik-wght.css"]') as HTMLLinkElement).sheet!
  35  |     const aliases = []
  36  |     for (const rule of [...sheet.cssRules]) {
  37  |       if (!(rule instanceof CSSFontFaceRule)) continue
  38  |       const name = rule.style.getPropertyValue("src").match(/rubik-[a-z-]+\.woff2/u)?.[0]
  39  |       const body = bodies.get(`/fonts/files/${name}`)
  40  |       if (!body) throw new Error("font:missing-alias-bytes")
  41  |       const alias = new FontFace("E Byte Rubik", body, { style: rule.style.getPropertyValue("font-style"), weight: rule.style.getPropertyValue("font-weight"), unicodeRange: rule.style.getPropertyValue("unicode-range") })
  42  |       document.fonts.add(await alias.load())
  43  |       aliases.push({ status: alias.status, unicodeRange: alias.unicodeRange })
  44  |     }
  45  |     return { faces, aliases, resources }
  46  |   }, rubikResourceEntries)
  47  |   expect(decoded.faces).toHaveLength(6)
  48  |   expect(decoded.faces.every(face => face.status === "loaded" && face.family.includes("Rubik Variable"))).toBe(true)
  49  |   expect(decoded.aliases).toHaveLength(6)
  50  |   const observations: unknown[] = []
  51  |   const session = browserName === "chromium" ? await page.context().newCDPSession(page) : null
  52  |   if (session) { await session.send("DOM.enable"); await session.send("CSS.enable") }
  53  |   for (const [locale, text] of Object.entries(localizedFixtureText)) {
  54  |     await page.evaluate(locale => (window as any).__v2Qa.show({ theme: "razzia-original", locale, phase: "answerCards" }), locale)
  55  |     await expect(page.getByTestId("native-razzia-question")).toHaveText(`${text.question} 1`)
  56  |     await expect(page.getByTestId("native-razzia-preview-v2")).toBeVisible()
  57  |     const paint = await page.evaluate(async () => {
  58  |       const root = document.querySelector("#host")!.shadowRoot!
  59  |       const heading = root.querySelector('[data-testid="native-razzia-question"]') as HTMLElement
  60  |       const style = getComputedStyle(heading)
  61  |       const word = heading.textContent!.split(/\s/u)[0]
  62  |       const range = document.createRange()
  63  |       range.setStart(heading.firstChild!, 0); range.setEnd(heading.firstChild!, word.length)
  64  |       const actualWidth = range.getBoundingClientRect().width
  65  |       const span = document.createElement("span")
  66  |       span.textContent = word
  67  |       span.style.cssText = "position:fixed;visibility:hidden;white-space:pre"
  68  |       for (const property of ["font-size", "font-weight", "font-style", "font-stretch", "font-feature-settings", "font-variation-settings", "font-kerning", "letter-spacing", "text-transform"]) span.style.setProperty(property, style.getPropertyValue(property))
  69  |       span.style.fontFamily = '"E Byte Rubik", sans-serif'
  70  |       document.body.append(span)
  71  |       const aliasWidth = span.getBoundingClientRect().width
  72  |       span.remove()
  73  |       const raster = async (family: string, text: string) => {
  74  |         const canvas = document.createElement("canvas")
  75  |         canvas.width = 1800; canvas.height = 100
  76  |         const context = canvas.getContext("2d")!
  77  |         context.font = `${style.fontWeight} ${style.fontSize} ${family}`
  78  |         context.fillText(text, 4, 60)
  79  |         const pixels = context.getImageData(0, 0, 1800, 100).data
  80  |         return [...new Uint8Array(await crypto.subtle.digest("SHA-256", pixels))].map(value => value.toString(16).padStart(2, "0")).join("")
  81  |       }
  82  |       const text = heading.textContent!
  83  |       const nonAscii = text.replaceAll(/[\x00-\x7F]/gu, "")
  84  |       return {
  85  |         text, family: style.fontFamily, fontSize: style.fontSize, weight: style.fontWeight, actualWidth, aliasWidth,
  86  |         raster: await raster(style.fontFamily, text), aliasRaster: await raster('"E Byte Rubik", sans-serif', text),
  87  |         monoRaster: await raster("monospace", text), sansRaster: await raster("sans-serif", text),
  88  |         fallbackRaster: await raster(style.fontFamily, nonAscii), sansFallbackRaster: await raster("sans-serif", nonAscii),
  89  |         digitRaster: await raster(style.fontFamily, "1234567890"), aliasDigitRaster: await raster('"E Byte Rubik", sans-serif', "1234567890"),
  90  |       }
  91  |     })
  92  |     expect(paint.family).toContain("Rubik Variable")
> 93  |     expect(Math.abs(paint.actualWidth - paint.aliasWidth)).toBeLessThan(0.15)
      |                                                            ^ Error: expect(received).toBeLessThan(expected)
  94  |     expect(paint.raster).toBe(paint.aliasRaster)
  95  |     expect(paint.digitRaster).toBe(paint.aliasDigitRaster)
  96  |     if (locale === "ja") expect(paint.fallbackRaster).toBe(paint.sansFallbackRaster)
  97  |     else expect(paint.raster).not.toBe(paint.monoRaster)
  98  |     let platformFonts: unknown = null
  99  |     if (session) {
  100 |       const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true })
  101 |       const find = (node: any): number | null => {
  102 |         const attributes = node.attributes ?? []
  103 |         if (attributes.some((value: string, index: number) => value === "data-testid" && attributes[index + 1] === "native-razzia-question")) return node.nodeId
  104 |         for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) { const found = find(child); if (found) return found }
  105 |         return null
  106 |       }
  107 |       const nodeId = find(root)
  108 |       expect(nodeId).toBeTruthy()
  109 |       const result = await session.send("CSS.getPlatformFontsForNode", { nodeId: nodeId! })
  110 |       platformFonts = result.fonts
  111 |       expect(result.fonts.some(font => font.glyphCount > 0 && font.isCustomFont)).toBe(true)
  112 |       if (locale === "ja") expect(result.fonts.some(font => font.glyphCount > 0 && !font.isCustomFont)).toBe(true)
  113 |     }
  114 |     observations.push({ locale, paint, platformFonts })
  115 |   }
  116 |   await session?.detach()
  117 |   expect((await page.request.get("/fonts/files/unregistered.woff2")).status()).toBe(404)
  118 |   expect((await page.request.get("/fonts/files/rubik-latin-wght-normal.woff2?other=1")).status()).toBe(404)
  119 |   csp.push(...await page.evaluate(() => (window as any).__fontCsp))
  120 |   const requests = await (await page.request.get("/qa/requests")).json()
  121 |   const path = info.outputPath("decoded-font-use.json")
  122 |   await writeFile(path, JSON.stringify({ browserName, userAgent: await page.evaluate(() => navigator.userAgent), decoded, observations, requests, errors, external, csp, exactWebKitPlatformFamilyObserved: false }, null, 2))
  123 |   await info.attach("decoded-font-use.json", { path, contentType: "application/json" })
  124 |   expect(errors).toEqual([]); expect(external).toEqual([]); expect(csp).toEqual([])
  125 | })
  126 | 
  127 | for (const kind of ["css-integrity", "decode"] as const) test(`font ${kind} failure closes before renderer admission`, async ({ page }, info) => {
  128 |   const errors: string[] = []
  129 |   page.on("pageerror", error => errors.push(error.message))
  130 |   if (kind === "css-integrity") await page.route("**/fonts/rubik-wght.css", route => route.fulfill({ status: 200, contentType: "text/css", body: ".untrusted{color:red}" }))
  131 |   else await page.route("**/fonts/files/*.woff2", route => route.fulfill({ status: 200, contentType: "font/woff2", body: "invalid-font-body" }))
  132 |   await page.goto("/")
  133 |   await expect.poll(() => errors.some(value => value.includes(`qa:font-${kind === "decode" ? "decode" : "css-integrity"}`))).toBe(true)
  134 |   expect(await page.evaluate(() => ({ ready: document.documentElement.dataset.qaReady ?? null, renderer: typeof (window as any).__v2Qa, scripts: [...document.scripts].map(script => script.src) }))).toMatchObject({ ready: null, renderer: "undefined" })
  135 |   const path = info.outputPath("closed-font-failure.json")
  136 |   await writeFile(path, JSON.stringify({ kind, errors, rendererAdmitted: false }, null, 2))
  137 |   await info.attach("closed-font-failure.json", { path, contentType: "application/json" })
  138 | })
  139 | 
```