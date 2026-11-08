/* oxlint-disable eslint/no-await-in-loop -- Ordered remote acceptance follows each saved game. */
import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"
const receipt = process.env.TADAZZ_LAB_SEED_RECEIPT
if (!receipt) throw new Error("Explicit sample receipt required")
const samples = JSON.parse(readFileSync(receipt, "utf8")).samples as {
  quizId: string
  themeId: string
  name: string
  mode: string
}[]

test("three themes are selectable, all packaged demo assets match their hashes and videos decode", async ({
  page,
  request,
}) => {
  await page.goto("/manager")
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill(process.env.MANAGER_PASSWORD ?? "")
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page).toHaveURL(/\/manager\/config$/u)
  for (const sample of samples) {
    await expect(
      page.getByRole("button", { name: sample.name, exact: true }),
    ).toBeVisible()
  }
  await page.reload()
  await expect(page).toHaveURL(/\/manager\/config$/u)
  const response = await request.post("/api/auth/manager", {
    data: { password: process.env.MANAGER_PASSWORD },
  })
  expect(response.ok()).toBe(true)
  const { token } = await response.json()
  const headers = { Authorization: `Bearer ${token}` }
  expect((await request.get("/api/themes/catalog")).status()).toBe(401)
  expect(
    (
      await request.post("/api/themes/workspaces/platform/drafts", {
        headers,
        data: {},
      })
    ).status(),
  ).toBe(404)
  const catalog = await request.get("/api/themes/catalog", { headers })
  expect(catalog.ok()).toBe(true)
  const { definitions } = await catalog.json()
  expect(definitions).toHaveLength(2)
  await page.addInitScript(
    (value) => localStorage.setItem("token", value),
    token,
  )
  await page.goto(`/manager/quizz/${samples[0].quizId}`)
  await page.getByTestId("studio-tab-settings").click()
  for (const id of ["tadazz-classic", "tadazz-demo-cosmic", "tadazz-demo-jade"])
    await expect(page.getByTestId(`show-theme-${id}`)).toBeVisible()
  const jade = page.getByTestId("show-theme-tadazz-demo-jade")
  await jade
    .getByRole("button", { name: "Use this theme", exact: true })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Use this theme", exact: true })
    .click()
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/manager\/config$/u)
  await page.goto(`/manager/quizz/${samples[0].quizId}`)
  await page.getByTestId("studio-tab-settings").click()
  await expect(
    jade.getByRole("button", { name: "Active", exact: true }),
  ).toBeDisabled()
  // Restore the supplied Classic example through the same real editor controls.
  await page
    .getByTestId("show-theme-tadazz-classic")
    .getByRole("button", { name: "Use this theme", exact: true })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Use this theme", exact: true })
    .click()
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/manager\/config$/u)
  for (const definition of definitions) {
    for (const asset of definition.assets.filter((value: { url: string }) =>
      value.url.startsWith("/tadazz-show/demos/"),
    )) {
      const raw = await request.get(asset.url)
      expect(raw.ok()).toBe(true)
      const bytes = await raw.body()
      expect(bytes.length).toBe(asset.bytes)
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        asset.sha256,
      )
    }
    const video = definition.assets.find(
      (value: { kind: string }) => value.kind === "video",
    )
    // WebKit's standalone media document waits for a gesture; exercise an
    // embedded playsinline video, as the actual opening component does.
    const url = new URL(video.url, process.env.TADAZZ_LAB_URL).href
    await page.setContent(
      `<video muted playsinline preload="auto" src="${url}"></video><button onclick="document.querySelector('video').play()">Play opening</button>`,
    )
    await page
      .getByRole("button", { name: "Play opening", exact: true })
      .click()
    await expect
      .poll(() =>
        page.locator("video").evaluate((element: HTMLVideoElement) => ({
          error: element.error?.code ?? 0,
          width: element.videoWidth,
        })),
      )
      .toEqual({ error: 0, width: 1920 })
  }
})
for (const sample of samples)
  test(`${sample.name}: host, participant, display and saved theme`, async ({
    page,
    browser,
    request,
  }, info) => {
    const response = await request.post("/api/auth/manager", {
      data: { password: process.env.MANAGER_PASSWORD },
    })
    expect(response.ok()).toBe(true)
    const { token } = await response.json()
    const headers = { Authorization: `Bearer ${token}` }
    const saved = await request.get(
      `/api/extensions/quizzes/${sample.quizId}`,
      { headers },
    )
    expect(saved.ok()).toBe(true)
    expect((await saved.json()).extras.defaults.showTheme.id).toBe(
      sample.themeId,
    )
    const created = await request.post("/api/games", {
      headers,
      data: { quizzId: sample.quizId },
    })
    expect(created.ok(), await created.text()).toBe(true)
    const { gameId, inviteCode } = await created.json()
    await page.addInitScript(
      (value) => localStorage.setItem("token", value),
      token,
    )
    await page.goto(`/party/manager/${gameId}`)
    const skip = page.getByTestId("tadazz-opening-skip")
    if (await skip.isVisible().catch(() => false)) await skip.click()
    if (sample.themeId !== "tadazz-classic") {
      await expect(
        page.locator(
          'img[src="/tadazz-show/second-library/creating-worlds-intro.png"]',
        ),
      ).toHaveCount(0)
    }
    const stage = page.getByTestId("tadazz-show")
    await expect(stage).toHaveAttribute("data-show-theme", sample.themeId)
    await expect(stage).toHaveAttribute("data-theme-fallback", "false")
    const playerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "en-US",
    })
    const displayBrowser = await browser.browserType().launch()
    try {
      const player = await playerContext.newPage()
      await player.goto(`${process.env.TADAZZ_LAB_URL}/game?pin=${inviteCode}`)
      await player.getByPlaceholder("Username here").fill("Theme Lab QA")
      await player.getByRole("button", { name: "Submit", exact: true }).click()
      await expect(page.getByTestId("host-connected-counter")).toHaveText(
        "1 / 1",
      )
      if (sample.themeId !== "tadazz-classic") {
        await expect(
          page.locator(
            'img[src="/tadazz-show/second-library/creating-worlds-intro.png"]',
          ),
        ).toHaveCount(0)
      }
      await page.bringToFront()
      await page.getByRole("button", { name: "Start", exact: true }).click()
      await expect(stage).toHaveAttribute("data-voting-open", "true", {
        timeout: 35_000,
      })
      await expect
        .poll(() =>
          page
            .getByTestId("tadazz-question-panel")
            .first()
            .evaluate((element) => getComputedStyle(element).opacity),
        )
        .toBe("1")
      await page.getByTestId("host-pause-resume-btn").click()
      await expect(stage).toHaveAttribute("data-game-paused", "true")
      await expect(player.getByTestId("tadazz-show")).toHaveAttribute(
        "data-show-theme",
        sample.themeId,
      )
      const display = await displayBrowser.newPage({
        viewport: { width: 1024, height: 768 },
        locale: "en-US",
      })
      await display.goto(`${process.env.TADAZZ_LAB_URL}/display/${gameId}`)
      await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
        "data-show-theme",
        sample.themeId,
      )
      await expect(display.getByTestId("manager-control-toolbar")).toHaveCount(
        0,
      )
      await display.reload()
      await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
        "data-game-paused",
        "true",
      )
      await page.screenshot({ path: join(info.outputDir, "host.png") })
      await display.screenshot({ path: join(info.outputDir, "display.png") })
      await page.bringToFront()
      await page.getByTestId("host-pause-resume-btn").click()
      await expect(stage).toHaveAttribute("data-game-paused", "false")
      await player.bringToFront()
      await player.getByTestId("tadazz-pad-option-0").click()
      await page.bringToFront()
      await page.getByTestId("host-end-timer-btn").click()
      await expect(stage).toHaveAttribute("data-show-scene", "results")
      await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
        "data-show-scene",
        "results",
      )
      await expect(stage).toHaveAttribute("data-show-theme", sample.themeId)
      await expect
        .poll(() =>
          page
            .getByTestId("tadazz-question-panel")
            .first()
            .evaluate((element) => getComputedStyle(element).opacity),
        )
        .toBe("1")
      await page.screenshot({ path: join(info.outputDir, "result.png") })
    } finally {
      await playerContext.close()
      await displayBrowser.close()
    }
  })
