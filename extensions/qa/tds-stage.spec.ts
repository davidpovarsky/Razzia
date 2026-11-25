import { test, expect } from "@playwright/test"
import { execFileSync } from "node:child_process"
test("public join fails closed, decodes current room QR, follows live lock and omits cookies", async ({
  page,
}, info) => {
  let locked = false,
    unavailable = false
  const pins: string[] = []
  await page.context().addCookies([
    {
      name: "private-test",
      value: "must-not-send",
      url: "http://127.0.0.1:4330",
    },
  ])
  await page.route("**/api/games/check", async (route) => {
    expect(route.request().headers().cookie).toBeUndefined()
    expect(route.request().headers().authorization).toBeUndefined()
    pins.push(
      (route.request().postDataJSON() as { inviteCode: string }).inviteCode,
    )
    const successStatus = locked ? 403 : 200
    await route.fulfill({
      status: unavailable ? 503 : successStatus,
      contentType: "application/json",
      body: JSON.stringify(
        locked ? { error: "errors:game.locked" } : { generatedUsernames: [] },
      ),
    })
  })
  await page.goto("/")
  const contract = page.getByTestId("join-contract"),
    qr = page.locator("svg[data-qr-url]")
  await expect(contract).toContainText('"lockState":"open"')
  await expect(qr).toHaveAttribute(
    "data-qr-url",
    "http://127.0.0.1:4330/game?pin=246810",
  )
  const path = `/evidence/phase-07-qr-${info.project.name}.png`
  await qr.screenshot({ path })
  expect(
    execFileSync("zbarimg", ["--quiet", "--raw", path], {
      encoding: "utf8",
    }).trim(),
  ).toBe("http://127.0.0.1:4330/game?pin=246810")
  expect(await contract.textContent()).not.toContain("+10000000000")
  locked = true
  await expect(contract).toContainText('"lockState":"locked"', {
    timeout: 7000,
  })
  await expect(qr).toHaveCount(0)
  unavailable = true
  await expect(contract).toContainText('"lockState":"checking"', {
    timeout: 7000,
  })
  locked = false
  unavailable = false
  await expect(contract).toContainText('"lockState":"open"', { timeout: 8000 })
  await page.getByRole("button", { name: "Switch room" }).click()
  await expect(qr).toHaveAttribute(
    "data-qr-url",
    "http://127.0.0.1:4330/game?pin=135790",
  )
  expect(pins).toContain("135790")
  await page.getByRole("button", { name: "Toggle join mount" }).click()
  const count = pins.length
  await page.waitForTimeout(3300)
  expect(pins).toHaveLength(count)
})
test("real HTTP credentials-omit neither sends nor accepts cookies", async ({
  page,
}) => {
  await page.route("**/api/games/check", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  )
  await page.context().addCookies([
    {
      name: "private-test",
      value: "must-not-send",
      url: "http://127.0.0.1:4330",
    },
  ])
  await page.goto("/")
  const result = await page.evaluate(
    async () =>
      (
        await fetch("/__tds-credential-probe", {
          credentials: "omit",
          cache: "no-store",
        })
      ).json() as Promise<{ cookie: string | null }>,
  )
  expect(result.cookie).toBeNull()
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "native-probe",
    ),
  ).toBe(false)
})
test("room navigation ignores a late response from the previous PIN; manager performs no public probe", async ({
  page,
}) => {
  let release: (() => void) | undefined = undefined
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  const pins: string[] = []
  await page.route("**/api/games/check", async (route) => {
    const pin = (route.request().postDataJSON() as { inviteCode: string })
      .inviteCode
    pins.push(pin)

    if (pin === "246810") {
      await delayed
    }

    await route
      .fulfill({ status: 200, contentType: "application/json", body: "{}" })
      .catch(() => {})
  })
  await page.goto("/")
  await expect(page.getByTestId("join-contract")).toContainText(
    '"lockState":"checking"',
  )
  await expect(page.locator("svg[data-qr-url]")).toHaveCount(0)
  await expect.poll(() => pins.length).toBe(1)
  await page.getByRole("button", { name: "Switch room" }).click()
  await expect(page.locator("svg[data-qr-url]")).toHaveAttribute(
    "data-qr-url",
    /135790$/u,
  )
  release!()
  await page.getByRole("button", { name: "Toggle manager" }).click()
  const count = pins.length
  await page.getByRole("button", { name: "Switch room" }).click()
  await expect(page.locator("svg[data-qr-url]")).toHaveAttribute(
    "data-qr-url",
    /246810$/u,
  )
  await page.waitForTimeout(3300)
  expect(pins).toHaveLength(count)
})
test("a hanging public probe expires, hides the QR, and recovers on the next bounded attempt", async ({
  page,
}) => {
  await page.clock.install()
  let calls = 0
  let release: (() => void) | undefined = undefined
  const stalled = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/api/games/check", async (route) => {
    calls += 1

    if (calls === 2) {
      await stalled
    }

    await route
      .fulfill({ status: 200, contentType: "application/json", body: "{}" })
      .catch(() => {})
  })
  await page.goto("/")
  await expect(page.getByTestId("join-contract")).toContainText(
    '"lockState":"open"',
  )
  await page.clock.fastForward(3100)
  await expect.poll(() => calls).toBe(2)
  await page.clock.fastForward(8100)
  await expect(page.getByTestId("join-contract")).toContainText(
    '"lockState":"checking"',
  )
  await expect(page.locator("svg[data-qr-url]")).toHaveCount(0)
  release!()
  await page.clock.fastForward(5100)
  await expect(page.getByTestId("join-contract")).toContainText(
    '"lockState":"open"',
  )
  expect(calls).toBe(3)
})
test("selected backdrop owns entire viewport on resize, decorative layers occur once, original theme stays independent", async ({
  page,
}, info) => {
  await page.route("**/api/games/check", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  )
  await page.goto("/")
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    const frame = page.getByTestId("fixture-viewport"),
      layers = page.getByTestId("show-viewport-layers")
    await expect(frame).toHaveCSS("background-image", /tadazz-show/u)
    expect(await layers.boundingBox()).toEqual(await frame.boundingBox())
    expect((await frame.boundingBox())?.height).toBe(height)
    await expect(layers.getByTestId("decoration")).toHaveCount(1)
    await expect(page.getByTestId("decoration")).toHaveCount(1)
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true)
  }
  await page.screenshot({
    path: `/evidence/phase-07-viewport-${info.project.name}.png`,
  })
  await page.getByRole("button", { name: "Toggle original theme" }).click()
  await expect(page.getByTestId("fixture-viewport")).toHaveCSS(
    "background-image",
    "none",
  )
  await expect(
    page.getByTestId("show-viewport-layers").getByTestId("decoration"),
  ).toHaveCount(0)
  await expect(page.getByTestId("decoration")).toHaveCount(1)
})
