# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-native-v2.spec.ts >> distinct native family switch, exact built admission and disposal
- Location: ../docs/extensions/qa-evidence/show-ui-20261115/qa-native-v2.spec.ts:42:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  getByTestId('native-preview-surface')
Expected: "true"
Received: "false"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" getByTestId('native-preview-surface') with timeout 5000ms
  - waiting for getByTestId('native-preview-surface')

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - generic:
    - img "Creating Worlds"
    - generic:
      - generic:
        - img "TADAZZ!"
      - generic: ROUND 01 · QUESTION 01 / 5
      - generic:
        - generic: AUDIENCE RESULTS
        - generic: Which colour do you prefer? 1
      - generic:
        - button "01" [disabled]:
          - article:
            - figure "Blue":
              - generic:
                - generic "Blue": "1"
            - generic: 0%
            - generic: CORRECT ANSWER
        - button "02" [disabled]:
          - article:
            - figure "Green":
              - generic:
                - generic "Green": "2"
            - generic: 0%
            - generic: AUDIENCE FAVOURITE
        - button "03" [disabled]:
          - article:
            - figure "Orange":
              - generic:
                - generic "Orange": "3"
            - generic: 0%
            - generic: AUDIENCE FAVOURITE
        - button "04" [disabled]:
          - article:
            - figure "Purple":
              - generic:
                - generic "Purple": "4"
            - generic: 0%
            - generic: AUDIENCE FAVOURITE
        - button "05" [disabled]:
          - article:
            - figure "Pink":
              - generic:
                - generic "Pink": "5"
            - generic: 0%
            - generic: AUDIENCE FAVOURITE
      - generic: AUDIENCE RESULTS
```

# Test source

```ts
  1   | import playwright from "../../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
  2   | import type * as Playwright from "../../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
  3   | import { writeFile } from "node:fs/promises"
  4   | import { localizedFixtureText } from "./qa-localized-content"
  5   | const { test, expect } = playwright as unknown as typeof Playwright
  6   | const events = new WeakMap<object, unknown[]>()
  7   | test.beforeEach(async ({ page }) => {
  8   |   const errors: unknown[] = []
  9   |   events.set(page, errors)
  10  |   page.on("pageerror", (error) => errors.push(error.message))
  11  |   page.on("console", (message) => {
  12  |     if (message.type() === "error") errors.push(message.text())
  13  |   })
  14  |   await page.addInitScript(() => {
  15  |     ;(window as any).__zod_globalConfig = { jitless: false }
  16  |     ;(window as any).__v2Csp = []
  17  |     window.addEventListener("securitypolicyviolation", (event) =>
  18  |       (window as any).__v2Csp.push({
  19  |         directive: event.effectiveDirective,
  20  |         blocked: event.blockedURI,
  21  |       }),
  22  |     )
  23  |   })
  24  |   await page.goto("/")
  25  |   await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  26  | })
  27  | test.afterEach(async ({ page }, info) => {
  28  |   const evidence = await page
  29  |     .evaluate(() => ({
  30  |       diagnostics: (window as any).__v2Qa.diagnostics(),
  31  |       csp: (window as any).__v2Csp,
  32  |       userAgent: navigator.userAgent,
  33  |     }))
  34  |     .catch(() => null)
  35  |   const path = info.outputPath("v2-events.json")
  36  |   await writeFile(
  37  |     path,
  38  |     JSON.stringify({ evidence, events: events.get(page) }, null, 2),
  39  |   )
  40  |   await info.attach("v2-events.json", { path, contentType: "application/json" })
  41  | })
  42  | test("distinct native family switch, exact built admission and disposal", async ({
  43  |   page,
  44  | }, info) => {
  45  |   await page.evaluate(() =>
  46  |     (window as any).__v2Qa.show({ theme: "tadazz-classic" }),
  47  |   )
  48  |   await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
> 49  |   await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
      |                                                            ^ Error: expect(locator).toHaveAttribute(expected) failed
  50  |     "data-preview-ready",
  51  |     "true",
  52  |   )
  53  |   await expect(page.getByTestId("native-preview-surface")).toHaveCSS(
  54  |     "opacity",
  55  |     "1",
  56  |   )
  57  |   await expect(page.getByTestId("native-razzia-preview-v2")).toHaveCount(0)
  58  |   const classic = await page.evaluate(
  59  |     () => (window as any).__v2Qa.diagnostics().handleId,
  60  |   )
  61  |   await page.evaluate(() =>
  62  |     (window as any).__v2Qa.show({ theme: "razzia-original", effect: "fade" }),
  63  |   )
  64  |   await expect(page.getByTestId("native-razzia-answer-0")).toBeVisible()
  65  |   expect(
  66  |     await page.evaluate(async () => {
  67  |       try {
  68  |         await (window as any).__v2Qa.show({
  69  |           theme: "tadazz-classic",
  70  |           effect: "fade",
  71  |         })
  72  |         return null
  73  |       } catch (error) {
  74  |         return (error as Error).message
  75  |       }
  76  |     }),
  77  |   ).toContain("classic-visual-settings-unavailable")
  78  |   await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
  79  |   await expect(page.getByTestId("native-razzia-preview-v2")).toHaveAttribute(
  80  |     "data-native-renderer",
  81  |     "razzia-native-stage",
  82  |   )
  83  |   await expect(page.locator('[data-tada-entrance="fade"]')).toBeVisible()
  84  |   await expect(page.locator('[data-tada-underline="pulse-bar"]')).toBeVisible()
  85  |   for (const kind of ["digest", "variant", "version"])
  86  |     expect(
  87  |       await page.evaluate(
  88  |         (kind) => (window as any).__v2Qa.rejectMutation(kind),
  89  |         kind,
  90  |       ),
  91  |     ).toBeTruthy()
  92  |   await expect(page.getByTestId("native-razzia-answer-0")).toBeVisible()
  93  |   const native = await page.evaluate(
  94  |     () => (window as any).__v2Qa.diagnostics().handleId,
  95  |   )
  96  |   expect(native).not.toBe(classic)
  97  |   const screenshot = info.outputPath("distinct-native-razzia.png")
  98  |   await page.screenshot({ path: screenshot })
  99  |   await info.attach("distinct-native-razzia.png", {
  100 |     path: screenshot,
  101 |     contentType: "image/png",
  102 |   })
  103 |   await page.evaluate(() =>
  104 |     (window as any).__v2Qa.show({ theme: "tadazz-classic" }),
  105 |   )
  106 |   await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
  107 |   await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
  108 |     "data-preview-ready",
  109 |     "true",
  110 |   )
  111 |   await expect(page.getByTestId("native-preview-surface")).toHaveCSS(
  112 |     "opacity",
  113 |     "1",
  114 |   )
  115 |   await page.evaluate(() => {
  116 |     ;(window as any).__v2Qa.dispose()
  117 |     ;(window as any).__v2Qa.dispose()
  118 |   })
  119 |   await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
  120 |   await expect(page.getByTestId("native-razzia-preview-v2")).toHaveCount(0)
  121 |   expect(
  122 |     await page.evaluate(() => (window as any).__v2Qa.diagnostics()),
  123 |   ).toMatchObject({
  124 |     disposed: true,
  125 |     handleId: null,
  126 |     jitlessBefore: false,
  127 |     jitlessAfter: false,
  128 |     failures: 0,
  129 |   })
  130 |   expect(events.get(page)).toEqual([])
  131 |   expect(await page.evaluate(() => (window as any).__v2Csp)).toEqual([])
  132 | })
  133 | test("native current-card locale/count/mode/phase and host clock projections", async ({
  134 |   page,
  135 | }) => {
  136 |   for (const [locale, count, mode] of [
  137 |     ["ja", "2", "quiz"],
  138 |     ["vi", "5", "survey"],
  139 |   ] as const) {
  140 |     await page.evaluate((values) => (window as any).__v2Qa.show(values), {
  141 |       theme: "razzia-original",
  142 |       locale,
  143 |       count,
  144 |       mode,
  145 |       phase: "results",
  146 |     })
  147 |     await expect(page.getByTestId("native-razzia-question")).toHaveText(
  148 |       `${localizedFixtureText[locale].question} 1`,
  149 |     )
```