# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-native-v2.spec.ts >> native current-card locale/count/mode/phase and host clock projections
- Location: ../docs/extensions/qa-evidence/show-ui-20261115/qa-native-v2.spec.ts:133:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByTestId('native-razzia-question')
Expected: "Bạn thích màu nào? 1"
Received: "どの色が好きですか？ 1"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByTestId('native-razzia-question') with timeout 5000ms
  - waiting for getByTestId('native-razzia-question')

```

```yaml
- heading "どの色が好きですか？ 1" [level=2]
```

# Test source

```ts
  47  |   )
  48  |   await expect(page.getByTestId("tadazz-card-0")).toBeVisible()
  49  |   await expect(page.getByTestId("native-preview-surface")).toHaveAttribute(
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
> 147 |     await expect(page.getByTestId("native-razzia-question")).toHaveText(
      |                                                              ^ Error: expect(locator).toHaveText(expected) failed
  148 |       `${localizedFixtureText[locale].question} 1`,
  149 |     )
  150 |     await expect(
  151 |       page.getByTestId(`native-razzia-answer-${Number(count) - 1}`),
  152 |     ).toBeVisible()
  153 |     await expect(
  154 |       page.getByTestId(`native-razzia-answer-${Number(count)}`),
  155 |     ).toHaveCount(0)
  156 |   }
  157 |   await page.evaluate(() =>
  158 |     (window as any).__v2Qa.show({
  159 |       theme: "razzia-original",
  160 |       phase: "voting",
  161 |       paused: "true",
  162 |     }),
  163 |   )
  164 |   await expect(page.getByTestId("native-razzia-clock")).toHaveText("15")
  165 |   await page.waitForTimeout(350)
  166 |   await expect(page.getByTestId("native-razzia-clock")).toHaveText("15")
  167 |   await page.evaluate(() =>
  168 |     (window as any).__v2Qa.show({
  169 |       theme: "razzia-original",
  170 |       phase: "question",
  171 |       question: "1",
  172 |     }),
  173 |   )
  174 |   await expect(page.getByTestId("native-razzia-question")).toHaveText(
  175 |     `${localizedFixtureText.en.question} 2`,
  176 |   )
  177 |   await expect(page.getByTestId("native-razzia-answer-0")).toHaveCount(0)
  178 |   expect(events.get(page)).toEqual([])
  179 | })
  180 | 
```