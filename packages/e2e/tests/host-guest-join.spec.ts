import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"
import fs from "node:fs"
import { join } from "node:path"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  RAZZIA_THEME_ID,
} from "../../../extensions/src/core"
import { MANAGER_PASSWORD } from "../utils/constants"
import { skipPlatformOpening } from "../utils/manager"

const evidence = join(
  import.meta.dirname,
  "../../../docs/extensions/experience-refinement-20261119/guest-controls",
)
fs.mkdirSync(evidence, { recursive: true })

async function fixture(
  page: Page,
  request: APIRequestContext,
  theme: string,
  language: string,
) {
  const quizz = {
    subject: `Guest policy ${theme} ${Date.now()}`,
    gameMode: "quiz" as const,
    questions: [
      {
        type: "single" as const,
        question: "Guest admission check",
        answers: ["Ready", "Later"],
        solutions: [0],
        cooldown: 3,
        time: 20,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [crypto.randomUUID()],
    computeCanonicalBaseDigest(quizz),
  )
  extras.defaults.showTheme = {
    id: theme,
    version: "1.0.0",
    overrides: {},
  }
  extras.roster.phoneInviteOnly = true
  extras.roster.participants = [
    {
      rosterPlayerId: "registered-web",
      displayName: "Registered",
      phoneE164: null,
    },
  ]

  const login = await request.post("/api/auth/manager", {
    data: { password: MANAGER_PASSWORD },
  })
  expect(login.ok(), await login.text()).toBe(true)
  const { token } = (await login.json()) as { token: string }
  const headers = { Authorization: `Bearer ${token}` }
  const saved = await request.post("/api/extensions/quizzes", {
    headers,
    data: { quizz, extras },
  })
  expect(saved.ok(), await saved.text()).toBe(true)
  const { quizId } = (await saved.json()) as { quizId: string }
  const created = await request.post("/api/games", {
    headers,
    data: { quizzId: quizId },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const room = (await created.json()) as { gameId: string; inviteCode: string }
  await page.addInitScript(
    (value) => localStorage.setItem("token", value),
    token,
  )
  await page.goto(`/party/manager/${room.gameId}?lng=${language}`)
  await skipPlatformOpening(page)

  return { ...room, headers }
}

for (const variant of [
  {
    theme: RAZZIA_THEME_ID,
    language: "en",
    width: 1280,
    label: "Allow unregistered participants",
  },
  {
    theme: "tadazz-classic",
    language: "he",
    width: 360,
    label: "צירוף משתתפים לא רשומים",
  },
]) {
  test(`host guest switch enforces live admission in ${variant.theme} / ${variant.language}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.setViewportSize({ width: variant.width, height: 900 })
    const room = await fixture(page, request, variant.theme, variant.language)
    const toggle = page.getByTestId("host-guest-join-toggle")
    await expect(toggle).toBeVisible()
    await expect(toggle).toBeEnabled()
    await expect(toggle).toHaveAccessibleName(variant.label)
    await expect(toggle).toHaveAttribute("aria-checked", "true")

    const endpoint = `/api/games/${room.gameId}/roster/settings`
    const patch = () =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === endpoint &&
          response.request().method() === "PATCH",
      )
    const disabledResponse = patch()
    await toggle.focus()
    await toggle.press("Space")
    expect((await disabledResponse).ok()).toBe(true)
    await expect(toggle).toHaveAttribute("aria-checked", "false")

    const session = await request.post("/api/auth/session", { data: {} })
    expect(session.ok()).toBe(true)
    const guest = (await session.json()) as { token: string }
    const guestHeaders = { Authorization: `Bearer ${guest.token}` }
    const denied = await request.post("/api/games/join", {
      headers: guestHeaders,
      data: { inviteCode: room.inviteCode, username: "Unlisted" },
    })
    expect(denied.status()).toBe(403)
    expect(await denied.json()).toMatchObject({ reason: "roster_only" })

    const check = await request.post("/api/games/check", {
      data: { inviteCode: room.inviteCode },
    })
    expect(check.ok()).toBe(true)
    const registered = await request.post("/api/games/join", {
      headers: guestHeaders,
      data: { inviteCode: room.inviteCode, username: "Registered" },
    })
    expect(registered.ok(), await registered.text()).toBe(true)
    expect(await registered.json()).toMatchObject({
      rosterPlayerId: "registered-web",
    })

    await page.route(
      `**${endpoint}`,
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "errors:route.description" }),
        }),
      { times: 1 },
    )
    await toggle.click()
    await expect(
      page.getByTestId("host-guest-join-control").getByRole("alert"),
    ).toBeVisible()
    await expect(toggle).toHaveAttribute("aria-checked", "false")

    const enabledResponse = patch()
    await toggle.click()
    const enabled = await enabledResponse
    expect(enabled.ok(), await enabled.text()).toBe(true)
    expect(await enabled.json()).toMatchObject({
      presence: { allowUnregisteredPlayers: true, phoneInviteOnly: false },
    })
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    const admitted = await request.post("/api/games/join", {
      headers: guestHeaders,
      data: { inviteCode: room.inviteCode, username: "Unlisted" },
    })
    expect(admitted.ok(), await admitted.text()).toBe(true)

    await page.reload()
    await expect(toggle).toBeVisible()
    await expect(toggle).toBeEnabled()
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      variant.language === "he" ? "rtl" : "ltr",
    )
    const bounds = await toggle.evaluate((node) => {
      const rect = node.getBoundingClientRect()

      return {
        left: rect.left,
        right: rect.right,
        width: window.innerWidth,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1)
    expect(bounds.overflow).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: join(
        evidence,
        `host-guests-${variant.theme}-${variant.language}.png`,
      ),
    })
    expect(errors).toEqual([])
  })
}
