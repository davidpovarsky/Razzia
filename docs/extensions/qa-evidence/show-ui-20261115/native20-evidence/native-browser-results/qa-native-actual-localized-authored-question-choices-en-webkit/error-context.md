# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-native.spec.ts >> actual localized authored question/choices: en
- Location: ../docs/extensions/qa-evidence/show-ui-20261115/qa-native.spec.ts:52:3

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
  6   | const logs = new WeakMap<object, unknown[]>()
  7   | test.beforeEach(async ({ page }) => {
  8   |   const log: unknown[] = []
  9   |   logs.set(page, log)
  10  |   page.on("pageerror", (error) =>
  11  |     log.push({ type: "pageerror", message: error.message }),
  12  |   )
  13  |   page.on("console", (message) => {
  14  |     if (message.type() === "error")
  15  |       log.push({ type: "console", text: message.text() })
  16  |   })
  17  |   await page.addInitScript(() => {
  18  |     ;(window as any).__qaCsp = []
  19  |     ;(window as any).__zod_globalConfig = { jitless: false }
  20  |     window.addEventListener("securitypolicyviolation", (event) => {
  21  |       ;(window as any).__qaCsp.push({
  22  |         directive: event.effectiveDirective,
  23  |         blocked: event.blockedURI,
  24  |       })
  25  |     })
  26  |   })
  27  | })
  28  | test.afterEach(async ({ page }, info) => {
  29  |   const evidence = await page
  30  |     .evaluate(() => ({
  31  |       csp: (window as any).__qaCsp,
  32  |       diagnostics: (window as any).__showPreviewQa?.diagnostics(),
  33  |       userAgent: navigator.userAgent,
  34  |     }))
  35  |     .catch(() => null)
  36  |   const path = info.outputPath("native-events.json")
  37  |   await writeFile(
  38  |     path,
  39  |     JSON.stringify({ events: logs.get(page), evidence }, null, 2),
  40  |   )
  41  |   await info.attach("native-events.json", {
  42  |     path,
  43  |     contentType: "application/json",
  44  |   })
  45  | })
  46  | const ready = async (page: Playwright.Page) => {
  47  |   await page.goto("/")
  48  |   await expect(page.locator("html")).toHaveAttribute("data-qa-ready", "true")
  49  | }
  50  | 
  51  | for (const locale of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"] as const)
  52  |   test(`actual localized authored question/choices: ${locale}`, async ({
  53  |     page,
  54  |   }) => {
  55  |     await ready(page)
  56  |     await page.evaluate(
  57  |       (locale) =>
  58  |         (window as any).__showPreviewQa.show({
  59  |           locale,
  60  |           authoredLocale: locale,
  61  |           phase: "results",
  62  |           paused: true,
  63  |           elapsed: 20000,
  64  |         }),
  65  |       locale,
  66  |     )
  67  |     await expect(page.getByTestId("tadazz-question-panel")).toContainText(
  68  |       localizedFixtureText[locale].question,
  69  |     )
  70  |     await expect(page.getByTestId("tadazz-question-panel")).toBeVisible()
> 71  |     await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
      |                                                              ^ Error: expect(locator).toHaveAttribute(expected) failed
  72  |       "data-preview-ready",
  73  |       "true",
  74  |     )
  75  |     await expect(page.getByTestId("native-preview-surface")).toHaveCSS(
  76  |       "opacity",
  77  |       "1",
  78  |     )
  79  |     await expect(page.getByTestId("tadazz-card-0")).toContainText(
  80  |       localizedFixtureText[locale].choices[0],
  81  |     )
  82  |     await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
  83  |     const report = await page.evaluate(() =>
  84  |       (window as any).__showPreviewQa.diagnostics(),
  85  |     )
  86  |     expect(report.handleId).toBeGreaterThan(0)
  87  |     expect(report.jitlessBefore).toBe(false)
  88  |     expect(report.jitlessAfter).toBe(false)
  89  |     expect(await page.evaluate(() => (window as any).__qaCsp)).toEqual([])
  90  |     expect(logs.get(page)).toEqual([])
  91  |   })
  92  | 
  93  | test("actual ref identity survives q2/resize, pending transitions cannot resurrect after disposal", async ({
  94  |   page,
  95  | }) => {
  96  |   await ready(page)
  97  |   await page.evaluate(() =>
  98  |     (window as any).__showPreviewQa.show({ phase: "question", paused: true }),
  99  |   )
  100 |   await expect(page.getByTestId("tadazz-question-panel")).toContainText(
  101 |     "Synthetic question 1",
  102 |   )
  103 |   await expect(page.getByTestId("tadazz-question-panel")).toBeVisible()
  104 |   await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
  105 |     "data-preview-ready",
  106 |     "true",
  107 |   )
  108 |   await expect(page.getByTestId("native-preview-surface")).toHaveCSS(
  109 |     "opacity",
  110 |     "1",
  111 |   )
  112 |   const first = await page.evaluate(
  113 |     () => (window as any).__showPreviewQa.diagnostics().handleId,
  114 |   )
  115 |   await page.evaluate(() =>
  116 |     (window as any).__showPreviewQa.show({
  117 |       phase: "question",
  118 |       question: 1,
  119 |       paused: false,
  120 |     }),
  121 |   )
  122 |   await expect(page.getByTestId("tadazz-question-panel")).toContainText(
  123 |     "Synthetic question 2",
  124 |     { timeout: 15000 },
  125 |   )
  126 |   await page.evaluate(() => (window as any).__showPreviewQa.resize(800, 600))
  127 |   expect(
  128 |     await page.evaluate(
  129 |       () => (window as any).__showPreviewQa.diagnostics().handleId,
  130 |     ),
  131 |   ).toBe(first)
  132 |   await page.evaluate(async () => {
  133 |     await (window as any).__showPreviewQa.show({
  134 |       phase: "voteLocked",
  135 |       question: 1,
  136 |       elapsed: 20000,
  137 |     })
  138 |     ;(window as any).__showPreviewQa.dispose()
  139 |     ;(window as any).__showPreviewQa.dispose()
  140 |   })
  141 |   await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
  142 |   await page.waitForTimeout(1500)
  143 |   const report = await page.evaluate(() =>
  144 |     (window as any).__showPreviewQa.diagnostics(),
  145 |   )
  146 |   expect(report).toMatchObject({ disposed: true, handleId: null })
  147 |   expect(report.lifecycle).toEqual([
  148 |     { event: "mounted", handleId: first },
  149 |     { event: "disposed", handleId: first },
  150 |   ])
  151 |   await expect(page.getByTestId("tadazz-stage")).toHaveCount(0)
  152 |   expect(logs.get(page)).toEqual([])
  153 | })
  154 | 
  155 | for (const answerCount of [2, 3, 4, 5])
  156 |   for (const playMode of ["quiz", "survey"] as const)
  157 |     test(`bounded current-card subset ${playMode}/${answerCount}`, async ({
  158 |       page,
  159 |     }) => {
  160 |       await ready(page)
  161 |       await page.evaluate(
  162 |         ({ answerCount, playMode }) =>
  163 |           (window as any).__showPreviewQa.show({
  164 |             answerCount,
  165 |             playMode,
  166 |             questionType: answerCount === 3 ? "multi" : "single",
  167 |             phase: "results",
  168 |             paused: true,
  169 |             elapsed: 20000,
  170 |           }),
  171 |         { answerCount, playMode },
```