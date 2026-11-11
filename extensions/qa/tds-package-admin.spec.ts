import { expect, test } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createPackageFixture } from "../src/testkit/package-fixtures"
import { packageSha } from "../src/server/packages/archive"
import { registerSynthetic } from "./tds-site-fixture"

test("current Studio package administration preserves build, install, export and responsive controls", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const headers = await registerSynthetic(page)
  await page.goto("/studio/games")
  await expect(page.getByTestId("package-manager")).toHaveCount(0)
  await page.getByTestId("package-tools-toggle").click()
  await expect(page.getByTestId("package-manager")).toBeVisible()

  const fixture = createPackageFixture(
    "game",
    `tds-package-admin-${testInfo.project.name}-${Date.now()}`,
    "1.0.0",
  )
  await page.getByTestId("package-file-input").setInputFiles({
    name: "tds-package-admin.tadazz",
    mimeType: "application/octet-stream",
    buffer: fixture.bytes,
  })
  await expect(page.getByTestId("package-preflight")).toContainText(
    fixture.manifest.displayName,
  )
  const built = page.waitForResponse(
    (response) =>
      response.url().endsWith("/build") &&
      response.request().method() === "POST",
  )
  await page.getByRole("button", { name: "Build preview", exact: true }).click()
  expect((await built).ok()).toBe(true)

  const token = headers.Authorization.slice("Bearer ".length)
  const claims = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  ) as { sub: string }
  const catalog = (await (
    await page.request.get("/api/packages", { headers })
  ).json()) as { packages: Array<{ upload: string }> }
  const [{ upload }] = catalog.packages
  const receipt = (await (
    await page.request.get(`/api/packages/uploads/${upload}`, { headers })
  ).json()) as { sourceDigest: string }
  const job = fileURLToPath(
    new URL(
      `../.site-test-config/extensions/packages/${packageSha(claims.sub)}/jobs/${upload}/`,
      import.meta.url,
    ),
  )
  mkdirSync(job, { recursive: true })
  const output = Buffer.from("{}")
  writeFileSync(`${job}/bundle.json`, output)
  writeFileSync(
    `${job}/result.json`,
    JSON.stringify({
      sourceDigest: receipt.sourceDigest,
      outputDigest: packageSha(output),
      mediaValidated: true,
    }),
  )
  const install = page.getByRole("button", {
    name: "Install selected",
    exact: true,
  })
  await expect(install).toBeEnabled({ timeout: 15000 })
  await install.click()
  await expect(
    page
      .getByTestId("package-manager")
      .getByText("Installed privately", { exact: true })
      .first(),
  ).toBeVisible()

  const exportButton = page
    .getByTestId("package-manager")
    .getByRole("button", { name: "Export package", exact: true })
  await expect(exportButton).toHaveCSS("background-color", "rgb(231, 255, 55)")
  const download = page.waitForEvent("download")
  await exportButton.click()
  expect((await download).suggestedFilename()).toMatch(/\.tadazz$/u)

  await page.setViewportSize({ width: 1024, height: 768 })
  await page.getByTestId("package-manager").screenshot({
    path: `/evidence/phase-09-package-admin-1024-${testInfo.project.name}.png`,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  const bounds = await page.getByTestId("package-manager").evaluate((panel) => {
    const parent = panel.getBoundingClientRect()
    return [...panel.querySelectorAll("h2,p,button,label,li")].every(
      (element) => {
        const rect = element.getBoundingClientRect()
        return rect.right <= parent.right + 1 && rect.left >= parent.left - 1
      },
    )
  })
  expect(bounds).toBe(true)
  await page.getByTestId("package-manager").screenshot({
    path: `/evidence/phase-09-package-admin-390-${testInfo.project.name}.png`,
  })

  const mobile = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  })
  try {
    await mobile.addInitScript(
      (value) => localStorage.setItem("token", value),
      token,
    )
    const phone = await mobile.newPage()
    await phone.goto("/studio/games")
    await phone.getByTestId("package-tools-toggle").click()
    await phone
      .getByTestId("package-manager")
      .locator("ul li")
      .first()
      .getByRole("button")
      .first()
      .click()
    await expect(phone.getByTestId("package-preflight")).toBeVisible()
    await phone.getByTestId("package-manager").screenshot({
      path: `/evidence/phase-09-package-admin-mobile-${testInfo.project.name}.png`,
    })
  } finally {
    await mobile.close()
  }
})
