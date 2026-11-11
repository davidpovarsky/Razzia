import { expect, test, type Page } from "@playwright/test"

type MotionWindow = Window & { __tdsMotionEvents: string[] }

async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const win = window as MotionWindow
    win.__tdsMotionEvents = []
    document.addEventListener("animationstart", (event) => {
      win.__tdsMotionEvents.push(`start:${event.animationName}`)
    })
    document.addEventListener("animationend", (event) => {
      win.__tdsMotionEvents.push(`end:${event.animationName}`)
    })
    document.addEventListener("animationcancel", (event) => {
      win.__tdsMotionEvents.push(`cancel:${event.animationName}`)
    })
  })
}

async function events(page: Page) {
  return page.evaluate(() => (window as MotionWindow).__tdsMotionEvents)
}

test("scoped menus, popovers, dialogs, tabs, cards and feedback use token motion and survive interruption", async ({
  page,
}, testInfo) => {
  await recordAnimations(page)
  await page.goto("/")
  await page.getByTestId("site-panel").evaluate((panel) => {
    const root = panel.getRootNode()
    for (const name of ["animationstart", "animationend", "animationcancel"]) {
      root.addEventListener(name, (event) => {
        ;(window as MotionWindow).__tdsMotionEvents.push(
          `site:${name}:${(event as AnimationEvent).animationName}`,
        )
      })
    }
  })

  for (const name of ["host", "site"]) {
    const panel = page.getByTestId(`${name}-panel`)
    const menuTrigger = panel.getByRole("button", {
      name: `${name} actions`,
      exact: true,
    })
    await menuTrigger.click()
    const menu = page.getByRole("menu")
    await expect(menu).toHaveCSS("animation-name", "tds-menu-in")
    await expect(menu).toHaveCSS("animation-duration", "0.12s")
    await page.keyboard.press("Escape")
    await expect(menu).toHaveCount(0)
    await expect(menuTrigger).toBeFocused()

    const popoverTrigger = panel.getByRole("button", {
      name: `${name} open popover`,
      exact: true,
    })
    await popoverTrigger.click()
    const popover = page.getByLabel(`${name} popover`, { exact: true })
    await expect(popover).toHaveCSS("animation-name", "tds-menu-in")
    await page.keyboard.press("Escape")
    await expect(popoverTrigger).toBeFocused()

    const dialogTrigger = panel.getByRole("button", {
      name: `${name} open dialog`,
      exact: true,
    })
    for (let index = 0; index < 4; index += 1) {
      await dialogTrigger.click()
      const dialog = page.getByRole("dialog", {
        name: `${name} dialog`,
        exact: true,
      })
      await expect(dialog).toHaveCSS("animation-name", "tds-dialog-in")
      await expect(dialog).toHaveCSS("animation-duration", "0.18s")
      if (index === 0) {
        await dialog.evaluate((node) => {
          for (const animation of node.getAnimations()) {
            animation.pause()
            animation.currentTime =
              Number(animation.effect?.getTiming().duration) / 2
          }
        })
        await page.screenshot({
          path: `/evidence/phase-10-motion-${name}-dialog-${testInfo.project.name}.png`,
        })
        await dialog.evaluate((node) =>
          node.getAnimations().forEach((animation) => animation.play()),
        )
      }
      await page.keyboard.press("Escape")
      if (name === "site" && index === 0) {
        // Reading the real CSSAnimation also works while WebKit makes the
        // closing native modal inert and suppresses its animation events.
        expect(
          await panel
            .locator("dialog")
            .first()
            .evaluate((node) =>
              node
                .getAnimations()
                .map((animation) => (animation as CSSAnimation).animationName),
            ),
        ).toContain("tds-dialog-out")
      }
      await expect(dialog).toHaveCount(0)
      await expect(dialogTrigger).toBeFocused()
    }

    const secondTab = panel.getByRole("tab", {
      name: `${name} second tab`,
      exact: true,
    })
    await secondTab.click()
    const tabPanel = panel.getByRole("tabpanel")
    await expect(tabPanel).toHaveCSS("animation-name", "tds-selection-in")
    await expect(tabPanel).toHaveCSS("animation-duration", "0.18s")
    await expect(panel.getByTestId(`${name}-message`)).toHaveCSS(
      "animation-name",
      "tds-feedback-in",
    )
    await expect(panel.getByTestId(`${name}-interactive-card`)).toHaveCSS(
      "transition-duration",
      "0.12s, 0.18s, 0.12s",
    )
  }

  await expect
    .poll(
      async () =>
        (await events(page)).filter((name) => name.includes("tds-menu-out"))
          .length,
    )
    .toBeGreaterThanOrEqual(2)
  await expect
    .poll(
      async () =>
        (await events(page)).filter((name) => name.includes("tds-dialog-out"))
          .length,
    )
    .toBeGreaterThanOrEqual(1)
  await page.screenshot({
    path: `/evidence/phase-10-motion-components-${testInfo.project.name}.png`,
    fullPage: true,
  })
})

test("reopening during dialog exit cancels stale dismissal in both portal contexts", async ({
  page,
}) => {
  await page.goto("/")
  for (const name of ["host", "site"]) {
    const trigger = page.getByRole("button", {
      name: `${name} open dialog`,
      exact: true,
    })
    const dialog = page.getByRole("dialog", {
      name: `${name} dialog`,
      exact: true,
    })
    await trigger.click()
    await page.keyboard.press("Escape")
    // Deliberately bypass pointer actionability to interrupt the 120ms exit.
    await trigger.evaluate((button: HTMLButtonElement) => button.click())
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS("animation-name", "tds-dialog-in")
    await page.waitForTimeout(250)
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  }
})

test("reduced motion removes platform animation without changing keyboard state", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await recordAnimations(page)
  await page.goto("/")
  const panel = page.getByTestId("host-panel")

  const menuTrigger = panel.getByRole("button", {
    name: "host actions",
    exact: true,
  })
  await menuTrigger.focus()
  await page.keyboard.press("ArrowDown")
  const menu = page.getByRole("menu")
  await expect(menu).toHaveCSS("animation-name", "none")
  await page.keyboard.press("Escape")
  await expect(menuTrigger).toBeFocused()

  const dialogTrigger = panel.getByRole("button", {
    name: "host open dialog",
    exact: true,
  })
  await dialogTrigger.click()
  const dialog = page.getByRole("dialog", {
    name: "host dialog",
    exact: true,
  })
  await expect(dialog).toHaveCSS("animation-name", "none")
  await page.keyboard.press("Escape")
  await expect(dialogTrigger).toBeFocused()

  await panel.getByRole("tab", { name: "host second tab" }).click()
  await expect(panel.getByRole("tabpanel")).toHaveCSS("animation-name", "none")
  await expect(panel.getByTestId("host-message")).toHaveCSS(
    "animation-name",
    "none",
  )
  expect(
    await panel
      .getByTestId("host-interactive-card")
      .evaluate((card) =>
        Number.parseFloat(getComputedStyle(card).transitionDuration),
      ),
  ).toBe(0.000001)
  expect(await events(page)).toEqual([])
  await page.screenshot({
    path: `/evidence/phase-10-motion-reduced-${testInfo.project.name}.png`,
    fullPage: true,
  })
})
