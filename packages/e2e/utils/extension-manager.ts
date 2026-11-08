import type { Page } from "@playwright/test"
import { t } from "@razzia/e2e/utils/i18n"

export const endTimer = async (manager: Page) => {
  const btn = manager.getByRole("button", {
    name: t("extensions:host.endTimer"),
  })

  try {
    await btn.click({ timeout: 2000 })
  } catch {
    // If timer expired naturally, question transitions to results automatically
  }
}
