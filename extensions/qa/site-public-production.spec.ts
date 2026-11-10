import { test, expect } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const evidence = fileURLToPath(
  new URL(
    "../../docs/extensions/qa-evidence/unified-site-20261110/",
    import.meta.url,
  ),
)

test("deployed homepage, account routes and guest boundary stay on the production origin", async ({
  page,
  request,
}) => {
  const pageErrors: string[] = []
  const failedAssets: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      /\/(?:assets|tadazz-design-reference)\//u.test(response.url())
    ) {
      failedAssets.push(`${response.status()} ${response.url()}`)
    }
  })
  mkdirSync(evidence, { recursive: true })

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto("/")
    await expect(
      page.getByRole("heading", { name: "Make it a show.", exact: true }),
    ).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)
    await page.screenshot({
      path: join(evidence, `production-marketing-${width}.png`),
      fullPage: true,
    })
  }

  await page.goto("/login")
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible()
  await page.goto("/signup")
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeVisible()
  await page.goto("/forgot")
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible()
  await page.goto("/studio/games")
  await expect(page).toHaveURL(/https:\/\/tadazz\.com\/login/u)
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible()

  for (const path of [
    "/api/quizz",
    "/api/results",
    "/api/accounts/me",
    "/api/packages/capabilities",
  ]) {
    expect((await request.get(path)).status()).toBe(401)
  }

  expect(await (await request.get("/api/auth/mode")).json()).toEqual({
    accountsEnabled: true,
  })
  expect(await (await request.get("/api/billing/config")).json()).toEqual({
    enabled: false,
  })
  expect(pageErrors).toEqual([])
  expect(failedAssets).toEqual([])
})
