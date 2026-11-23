# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-appearance-stage-acceptance.spec.ts >> Tada Studio Complete: Media Library Reuse, Card Backgrounds, Audio, Staged Motion & Zero-Scroll Stage >> 2. Live Runtime & Zero-Scroll Stage Matrix (STAGE-P0) across 8 Viewports + Card Background + Single Audio + Staged Motion
- Location: tests/media-appearance-stage-acceptance.spec.ts:700:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/manager\/config$/u
Received string:  "http://127.0.0.1:3010/studio/games"
Timeout: 20000ms

Call log:
  - Expect "toHaveURL" with timeout 20000ms
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:3010/studio/games"
    42 × locator resolved to <html lang="en" dir="ltr">…</html>
       - unexpected value "http://127.0.0.1:3010/studio/games"

```

```yaml
- alert:
  - paragraph: Account service is unavailable.
  - button "Retry"
  - link "Log in":
    - /url: /login
```

# Test source

```ts
  1  | import { expect, type Page } from "@playwright/test"
  2  | import { BASIC_QUIZZ, MANAGER_PASSWORD } from "@razzia/e2e/utils/constants"
  3  | import { t } from "@razzia/e2e/utils/i18n"
  4  | 
  5  | export const loginManager = async (page: Page) => {
  6  |   if (page.url().includes("/manager/config")) {
  7  |     return
  8  |   }
  9  | 
  10 |   await page.goto("/manager")
  11 | 
  12 |   if (page.url().includes("/manager/config")) {
  13 |     return
  14 |   }
  15 | 
  16 |   const passwordInput = page.getByPlaceholder(t("manager:passwordPlaceholder"))
  17 |   const isPromptVisible = await passwordInput
  18 |     .waitFor({ state: "visible", timeout: 2000 })
  19 |     .then(
  20 |       () => true,
  21 |       () => false,
  22 |     )
  23 | 
  24 |   if (isPromptVisible) {
  25 |     await passwordInput.fill(MANAGER_PASSWORD)
  26 |     await page.getByRole("button", { name: t("common:submit") }).click()
> 27 |     await expect(page).toHaveURL(/\/manager\/config$/u)
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  28 |   }
  29 | }
  30 | 
  31 | /** General game tests start at the lobby; platform-opening.spec covers the ident. */
  32 | export const skipPlatformOpening = async (page: Page) => {
  33 |   const opening = page.getByTestId("platform-game-opening")
  34 |   const start = page.getByTestId("platform-opening-start")
  35 |   const skip = page.getByTestId("platform-opening-skip")
  36 |   const pin = page.getByText(/^\d{6}$/u).first()
  37 | 
  38 |   // A new room must receive its authoritative launch snapshot before setup
  39 |   // advances it; the native lobby can render before that socket event arrives.
  40 |   await expect(opening).toBeVisible({ timeout: 20_000 })
  41 |   await expect(start.or(skip).first()).toBeVisible({ timeout: 20_000 })
  42 | 
  43 |   if (await start.isVisible()) {
  44 |     await start.click()
  45 |   }
  46 | 
  47 |   await expect(skip).toBeVisible({ timeout: 20_000 })
  48 |   await skip.click()
  49 | 
  50 |   await expect(opening).toHaveCount(0, { timeout: 20_000 })
  51 |   await expect(pin).toBeVisible({ timeout: 20_000 })
  52 | }
  53 | 
  54 | export const createGame = async (page: Page, subject = BASIC_QUIZZ) => {
  55 |   await loginManager(page)
  56 |   await page.getByRole("button", { name: subject }).click()
  57 |   await page.getByRole("button", { name: t("manager:quizz.startGame") }).click()
  58 |   await skipPlatformOpening(page)
  59 | 
  60 |   const pin = page.getByText(/^\d{6}$/u)
  61 | 
  62 |   await expect(pin).toBeVisible()
  63 | 
  64 |   return (await pin.textContent()) ?? ""
  65 | }
  66 | 
  67 | export const startGame = async (manager: Page) => {
  68 |   await manager
  69 |     .getByRole("button", { name: t("game:startGame"), exact: true })
  70 |     .click()
  71 | }
  72 | 
  73 | export const next = async (manager: Page) => {
  74 |   const btn = manager.getByRole("button", {
  75 |     name: new RegExp(
  76 |       `^(${t("common:next")}|${t("extensions:host.nextScreen")})$`,
  77 |       "u",
  78 |     ),
  79 |   })
  80 |   await btn.click()
  81 | }
  82 | 
```