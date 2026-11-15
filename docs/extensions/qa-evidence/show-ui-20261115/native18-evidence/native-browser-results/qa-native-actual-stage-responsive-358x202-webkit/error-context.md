# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-native.spec.ts >> actual stage responsive 358x202
- Location: ../docs/extensions/qa-evidence/show-ui-20261115/qa-native.spec.ts:192:3

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
    - generic:
      - generic: ROUND 01 · QUESTION 01 / 5
      - generic:
        - generic: AUDIENCE RESULTS
        - generic: Synthetic question 1
      - generic:
        - button [disabled]:
          - article:
            - figure:
              - generic: "1"
              - generic: Choice 1
            - generic: 0%
            - generic: CORRECT ANSWER
          - generic: "01"
        - button [disabled]:
          - article:
            - figure:
              - generic: "2"
              - generic: Choice 2
            - generic: 0%
            - generic: AUDIENCE FAVOURITE
          - generic: "02"
        - button [disabled]:
          - article:
            - figure:
              - generic: "3"
              - generic: Choice 3
            - generic: 0%
            - generic: AUDIENCE FAVOURITE
          - generic: "03"
        - button [disabled]:
          - article:
            - figure:
              - generic: "4"
              - generic: Choice 4
            - generic: 0%
            - generic: AUDIENCE FAVOURITE
          - generic: "04"
        - button [disabled]:
          - article:
            - figure:
              - generic: "5"
              - generic: Choice 5
            - generic: 0%
            - generic: AUDIENCE FAVOURITE
          - generic: "05"
      - generic: AUDIENCE RESULTS
```

# Test source

```ts
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
  172 |       )
  173 |       for (let index = 0; index < answerCount; index++)
  174 |         await expect(page.getByTestId(`tadazz-card-${index}`)).toBeVisible()
  175 |       for (let index = answerCount; index < 5; index++)
  176 |         await expect(page.getByTestId(`tadazz-card-${index}`)).not.toBeVisible()
  177 |       await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
  178 |         "data-preview-ready", "true",
  179 |       )
  180 |       await expect(page.getByTestId("native-preview-surface")).toHaveCSS("opacity", "1")
  181 |       expect(
  182 |         await page.evaluate(() => (window as any).__showPreviewQa.failures()),
  183 |       ).toBe(0)
  184 |       expect(logs.get(page)).toEqual([])
  185 |     })
  186 | 
  187 | for (const size of [
  188 |   { width: 358, height: 202 },
  189 |   { width: 992, height: 744 },
  190 |   { width: 1888, height: 1062 },
  191 | ])
  192 |   test(`actual stage responsive ${size.width}x${size.height}`, async ({
  193 |     page,
  194 |   }, info) => {
  195 |     await page.setViewportSize({
  196 |       width: size.width + 32,
  197 |       height: Math.max(768, size.height + 32),
  198 |     })
  199 |     await ready(page)
  200 |     await page.evaluate((size) => {
  201 |       ;(window as any).__showPreviewQa.resize(size.width, size.height)
  202 |       return (window as any).__showPreviewQa.show({
  203 |         phase: "results",
  204 |         paused: true,
  205 |         elapsed: 20000,
  206 |       })
  207 |     }, size)
  208 |     await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
> 209 |     await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
      |                                                              ^ Error: expect(locator).toHaveAttribute(expected) failed
  210 |       "data-preview-ready", "true",
  211 |     )
  212 |     await expect(page.getByTestId("native-preview-surface")).toHaveCSS("opacity", "1")
  213 |     const path = info.outputPath("native-stage.png")
  214 |     await page.screenshot({ path })
  215 |     await info.attach("native-stage.png", { path, contentType: "image/png" })
  216 |     expect(logs.get(page)).toEqual([])
  217 |   })
  218 | 
```