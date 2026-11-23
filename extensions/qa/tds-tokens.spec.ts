import { expect, test } from "@playwright/test"
test("one semantic token updates actual site/host primitives while original/show scopes stay unchanged", async ({
  page,
}) => {
  await page.goto("/")
  const site = page.getByTestId("site-consumer")
  const host = page.getByTestId("host-consumer")
  const original = page.getByTestId("original-control")
  const show = page.getByTestId("show-contract")
  await expect(site).toHaveCSS("background-color", "rgb(231, 255, 55)")
  await expect(host).toHaveCSS("background-color", "rgb(231, 255, 55)")
  const oldOriginal = await original.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  )
  const oldShow = await show.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  )
  await page.getByTestId("change-token").click()
  for (const control of [site, host]) {
    await expect(control).toHaveCSS("background-color", "rgb(183, 212, 255)")
  }
  await expect(original).toHaveCSS("background-color", oldOriginal)
  await expect(show).toHaveCSS("background-color", oldShow)
  await page.screenshot({
    path: `/evidence/phase-03-tokens-${test.info().project.name}.png`,
    fullPage: true,
  })
})
test("reduced motion overrides scope timings without inline defaults defeating it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await expect(page.getByTestId("motion-consumer")).toHaveCSS(
    "transition-duration",
    "0s",
  )
})
test("platform light preview is bounded and independent of editor context", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.getByTestId("light-surface")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  )
  await expect(page.getByTestId("light-surface")).toHaveCSS(
    "color",
    "rgb(36, 20, 49)",
  )
  await expect(page.getByTestId("host-consumer")).toHaveCSS(
    "background-color",
    "rgb(231, 255, 55)",
  )
})
