import { expect, type Page } from "@playwright/test"
import { BASIC_QUIZZ, MANAGER_PASSWORD } from "@razzia/e2e/utils/constants"
import { t } from "@razzia/e2e/utils/i18n"

export const loginManager = async (page: Page) => {
  if (page.url().includes("/manager/config")) {
    return
  }

  await page.goto("/manager")

  if (page.url().includes("/manager/config")) {
    return
  }

  const passwordInput = page.getByPlaceholder(t("manager:passwordPlaceholder"))
  const isPromptVisible = await passwordInput
    .waitFor({ state: "visible", timeout: 2000 })
    .then(
      () => true,
      () => false,
    )

  if (isPromptVisible) {
    await passwordInput.fill(MANAGER_PASSWORD)
    await page.getByRole("button", { name: t("common:submit") }).click()
    await expect(page).toHaveURL(/\/manager\/config$/u)
  }
}

/** General game tests start at the lobby; platform-opening.spec covers the ident. */
export const skipPlatformOpening = async (page: Page) => {
  const opening = page.getByTestId("platform-game-opening")
  const start = page.getByTestId("platform-opening-start")
  const skip = page.getByTestId("platform-opening-skip")
  const pin = page.getByText(/^\d{6}$/u).first()

  // A new room must receive its authoritative launch snapshot before setup
  // advances it; the native lobby can render before that socket event arrives.
  await expect(opening).toBeVisible({ timeout: 20_000 })
  await expect(start.or(skip).first()).toBeVisible({ timeout: 20_000 })

  if (await start.isVisible()) {
    await start.click()
  }

  await expect(skip).toBeVisible({ timeout: 20_000 })
  await skip.click()

  await expect(opening).toHaveCount(0, { timeout: 20_000 })
  await expect(pin).toBeVisible({ timeout: 20_000 })
}

export const createGame = async (page: Page, subject = BASIC_QUIZZ) => {
  await loginManager(page)
  await page.getByRole("button", { name: subject }).click()
  await page.getByRole("button", { name: t("manager:quizz.startGame") }).click()
  await skipPlatformOpening(page)

  const pin = page.getByText(/^\d{6}$/u)

  await expect(pin).toBeVisible()

  return (await pin.textContent()) ?? ""
}

export const startGame = async (manager: Page) => {
  await manager
    .getByRole("button", { name: t("game:startGame"), exact: true })
    .click()
}

export const next = async (manager: Page) => {
  const btn = manager.getByRole("button", {
    name: new RegExp(
      `^(${t("common:next")}|${t("extensions:host.nextScreen")})$`,
      "u",
    ),
  })
  await btn.click()
}
