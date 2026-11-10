import { expect, test } from "@playwright/test"

for (const name of ["host", "site"]) {
  test(`${name}: native pending/disabled, labels, switch and roving tabs`, async ({
    page,
  }) => {
    await page.goto("/")
    const panel = page.getByTestId(`${name}-panel`)
    await panel
      .getByRole("button", { name: `${name} action`, exact: true })
      .click()
    await expect(panel.getByTestId(`${name}-count`)).toHaveText("1")
    for (const label of ["disabled", "pending"]) {
      const button = panel.getByRole("button", {
        name: `${name} ${label}`,
        exact: true,
      })
      await expect(button).toBeDisabled()
      await button.evaluate((node: HTMLButtonElement) => node.click())
    }
    await expect(panel.getByTestId(`${name}-count`)).toHaveText("1")
    await expect(
      panel.getByRole("button", { name: `${name} pending`, exact: true }),
    ).toHaveAttribute("aria-busy", "true")
    await panel.getByLabel(`${name} search`, { exact: true }).fill("fixture")
    await expect(
      panel.getByLabel(`${name} invalid field`, { exact: true }),
    ).toHaveAttribute("aria-invalid", "true")
    await panel
      .getByLabel(`${name} choice`, { exact: true })
      .selectOption("second")
    const toggle = panel.getByRole("switch", { name: `${name} setting` })
    await toggle.focus()
    await page.keyboard.press("Space")
    await expect(toggle).toBeChecked()
    const first = panel.getByRole("tab", { name: `${name} first tab` })
    await first.focus()
    await page.keyboard.press("ArrowRight")
    await expect(
      panel.getByRole("tab", { name: `${name} second tab` }),
    ).toHaveAttribute("aria-selected", "true")
    await panel.getByRole("button", { name: `${name} toggle RTL` }).click()
    await panel.getByRole("tab", { name: `${name} second tab` }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(first).toHaveAttribute("aria-selected", "true")
  })
  test(`${name}: keyboard menu, native/Radix dialog trap, nested portal and focus return`, async ({
    page,
  }) => {
    await page.goto("/")
    const panel = page.getByTestId(`${name}-panel`)
    const menu = panel.getByRole("button", {
      name: `${name} actions`,
      exact: true,
    })
    await menu.focus()
    await page.keyboard.press("ArrowDown")
    await expect(
      page.getByRole("menuitem", { name: `${name} first action`, exact: true }),
    ).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(panel.getByTestId(`${name}-message`)).toHaveText(
      "First action",
    )
    await expect(menu).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    await expect(
      page.getByRole("menuitem", { name: `${name} export`, exact: true }),
    ).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(
      page.getByRole("menuitem", {
        name: `${name} export fixture`,
        exact: true,
      }),
    ).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(panel.getByTestId(`${name}-message`)).toHaveText(
      "Exported fixture",
    )
    await expect(menu).toBeFocused()
    const trigger = panel.getByRole("button", {
      name: `${name} open dialog`,
      exact: true,
    })
    await trigger.click()
    const dialog = page.getByRole("dialog", {
      name: `${name} dialog`,
      exact: true,
    })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute("aria-describedby", /.+/u)
    await dialog.getByRole("button", { name: `${name} nested menu` }).click()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: `${name} nested menu` }),
    ).toBeFocused()
    await dialog.getByRole("button", { name: `${name} nested menu` }).click()
    await page
      .getByRole("menuitem", { name: `${name} nested action`, exact: true })
      .click()
    await expect(dialog.getByRole("status")).toHaveText("Nested action")
    await dialog.screenshot({
      path: `/evidence/phase-04-dialog-${name}-${test.info().project.name}.png`,
    })
    await dialog.getByLabel(`${name} dialog field`).focus()
    for (const key of [
      ...Array<string>(7).fill("Tab"),
      ...Array<string>(7).fill("Shift+Tab"),
    ]) {
      await page.keyboard.press(key)
      expect(
        await dialog.evaluate((node) => {
          let active = document.activeElement
          while (active?.shadowRoot?.activeElement)
            active = active.shadowRoot.activeElement
          return !!active && node.contains(active)
        }),
      ).toBe(true)
    }
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await page.screenshot({
      path: `/evidence/phase-04-${name}-${test.info().project.name}.png`,
      fullPage: true,
    })
  })
  test(`${name}: alert cancel, single async confirmation and visible failure`, async ({
    page,
  }) => {
    await page.goto("/")
    const panel = page.getByTestId(`${name}-panel`)
    const trigger = panel.getByRole("button", {
      name: `${name} remove`,
      exact: true,
    })
    await trigger.click()
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(panel.getByTestId(`${name}-removed`)).toHaveText("0")
    await expect(trigger).toBeFocused()
    await trigger.click()
    await page
      .getByRole("button", { name: `${name} confirm removal` })
      .evaluate((node: HTMLButtonElement) => {
        node.click()
        node.click()
      })
    await expect(panel.getByTestId(`${name}-removed`)).toHaveText("1")
    await panel.getByRole("button", { name: `${name} failed removal` }).click()
    await page.getByRole("button", { name: `${name} confirm failure` }).click()
    await expect(page.getByRole("alertdialog").getByRole("alert")).toHaveText(
      "Fixture removal rejected",
    )
    await page.keyboard.press("Escape")
    await expect(page.getByRole("alertdialog")).not.toBeVisible()
  })
  test(`${name}: popover Escape and keyboard tooltip`, async ({ page }) => {
    await page.goto("/")
    const panel = page.getByTestId(`${name}-panel`)
    const trigger = panel.getByRole("button", { name: `${name} open popover` })
    await trigger.click()
    await page.getByLabel(`${name} popover field`).fill("Fixture value")
    await page.keyboard.press("Escape")
    await expect(trigger).toBeFocused()
    await panel
      .getByRole("button", { name: `${name} hint`, exact: true })
      .focus()
    await expect(page.getByRole("tooltip")).toHaveText(
      `${name} contextual hint`,
    )
  })
}
test("host Radix portal stays inside actual native fullscreen", async ({
  page,
}) => {
  await page.goto("/")
  test.skip(
    !(await page.evaluate(() => document.fullscreenEnabled)),
    "Native fullscreen unavailable in this engine; NOT RUN, not a containment pass",
  )
  await page.getByRole("button", { name: "Enter fixture fullscreen" }).click()
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true)
  await page
    .getByTestId("host-panel")
    .getByRole("button", { name: "host open dialog", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "host dialog", exact: true })
  await expect(dialog).toBeVisible()
  expect(
    await dialog.evaluate((node) => document.fullscreenElement?.contains(node)),
  ).toBe(true)
  await page.screenshot({
    path: `/evidence/phase-04-fullscreen-${test.info().project.name}.png`,
  })
})
