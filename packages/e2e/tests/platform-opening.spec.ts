import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test"
import fs from "node:fs"
import { join } from "node:path"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
} from "../../../extensions/src/core"

const evidenceDir = join(
  import.meta.dirname,
  "../../../docs/extensions/plans/ux-unified-20261119/platform-opening/browser",
)
fs.mkdirSync(evidenceDir, { recursive: true })

async function openRoom(
  host: Page,
  request: APIRequestContext,
  theme: "tadazz-classic" | "razzia-original",
  legacy = false,
) {
  const title = `Platform opening ${theme} ${Date.now()}`
  const quizz = {
    subject: title,
    gameMode: "quiz" as const,
    questions: [
      {
        type: "single" as const,
        question: "Which answer is correct?",
        answers: ["One", "Two", "Three", "Four"],
        solutions: [0],
        cooldown: 3,
        time: 30,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [crypto.randomUUID()],
    computeCanonicalBaseDigest(quizz),
  )
  extras.defaults.showTheme = { id: theme, version: "1.0.0", overrides: {} }
  const login = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  expect(login.ok()).toBe(true)
  const { token } = (await login.json()) as { token: string }
  const save = await request.post(
    legacy ? "/api/quizz" : "/api/extensions/quizzes",
    {
      headers: { Authorization: `Bearer ${token}` },
      data: legacy ? quizz : { quizz, extras },
    },
  )
  expect(save.ok(), await save.text()).toBe(true)

  const saved = (await save.json()) as { quizId?: string; id?: string }
  const quizId = (saved.quizId ?? saved.id)!
  const created = await request.post("/api/games", {
    headers: { Authorization: `Bearer ${token}` },
    data: { quizzId: quizId },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const { gameId } = (await created.json()) as { gameId: string }
  await host.addInitScript(
    (tokenValue) => localStorage.setItem("token", tokenValue),
    token,
  )
  await host.goto(`/party/manager/${gameId}`)
  await expect(host.getByTestId("platform-game-opening")).toHaveAttribute(
    "data-platform-opening-stage",
    "standby",
  )
  return { gameId, quizId }
}

test("shared product curtain, video, pause and reconnect return to the selected theme", async ({
  page: host,
  browser,
  request,
}) => {
  const errors: string[] = []
  host.on("pageerror", (error) => errors.push(error.message))
  const { gameId } = await openRoom(host, request, "tadazz-classic")
  const displayContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })
  const display = await displayContext.newPage()
  display.on("pageerror", (error) => errors.push(error.message))
  try {
    await display.goto(`/display/${gameId}`)
    await expect(display.getByTestId("platform-game-opening")).toHaveAttribute(
      "data-platform-opening-stage",
      "standby",
    )
    await expect(display.getByTestId("platform-opening-start")).toHaveCount(0)
    await expect(display.getByTestId("manager-control-toolbar")).toHaveCount(0)
    await host.screenshot({ path: join(evidenceDir, "host-curtain.png") })
    await display.screenshot({ path: join(evidenceDir, "display-curtain.png") })

    await host.getByTestId("host-present-from-host-btn").click()
    await expect(host.getByTestId("platform-game-opening")).toHaveAttribute(
      "data-host-presenting",
      "true",
    )
    await expect(host.getByTestId("manager-control-toolbar")).toHaveCount(0)
    await host.keyboard.press("Escape")
    await expect(host.getByTestId("platform-game-opening")).toHaveAttribute(
      "data-host-presenting",
      "false",
    )

    await host.getByTestId("platform-opening-start").click()
    await expect(display.getByTestId("platform-game-opening")).toHaveAttribute(
      "data-platform-opening-stage",
      "opening",
    )
    const hostVideo = host.getByTestId("tadazz-opening-video")
    const displayVideo = display.getByTestId("tadazz-opening-video")
    await expect
      .poll(() =>
        hostVideo.evaluate((el) => (el as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.5)
    await expect
      .poll(() =>
        displayVideo.evaluate((el) => (el as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.2)
    await host.getByTestId("host-pause-resume-btn").click()
    await expect(host.getByTestId("platform-game-opening")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    await expect(display.getByTestId("platform-game-opening")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    const pausedTime = await hostVideo.evaluate(
      (el) => (el as HTMLVideoElement).currentTime,
    )
    await host.waitForTimeout(900)
    expect(
      Math.abs(
        (await hostVideo.evaluate(
          (el) => (el as HTMLVideoElement).currentTime,
        )) - pausedTime,
      ),
    ).toBeLessThan(0.2)
    await display.reload()
    await expect(display.getByTestId("platform-game-opening")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    await expect
      .poll(() =>
        displayVideo.evaluate((el) => (el as HTMLVideoElement).readyState),
      )
      .toBeGreaterThanOrEqual(2)
    const rejoinedTime = await displayVideo.evaluate(
      (el) => (el as HTMLVideoElement).currentTime,
    )
    expect(Math.abs(rejoinedTime - pausedTime)).toBeLessThan(0.8)
    await display.screenshot({
      path: join(evidenceDir, "display-rejoined-paused.png"),
    })

    await host.getByTestId("host-pause-resume-btn").click()
    await expect(display.getByTestId("platform-game-opening")).toHaveAttribute(
      "data-game-paused",
      "false",
    )
    await expect(host.getByTestId("platform-game-opening")).toHaveCount(0)
    await expect(display.getByTestId("platform-game-opening")).toHaveCount(0)
    await expect(
      host.locator('[data-show-theme="tadazz-classic"]').first(),
    ).toBeVisible()
    await expect(
      display.locator('[data-show-theme="tadazz-classic"]').first(),
    ).toBeVisible()
    await expect(display.getByText(/^\d{6}$/u).first()).toBeVisible()
    await host.reload()
    await expect(host.getByText(/^\d{6}$/u).first()).toBeVisible()
    await expect(host.getByTestId("platform-game-opening")).toHaveCount(0)
    await host.screenshot({ path: join(evidenceDir, "host-themed-lobby.png") })
    expect(errors).toEqual([])
  } finally {
    await displayContext.close()
  }
})

test("original theme receives the same product opening and a failed video never traps its lobby", async ({
  page: host,
  request,
}) => {
  await host.setViewportSize({ width: 390, height: 844 })
  await host.route(
    "**/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4",
    (route) => route.abort(),
  )
  await openRoom(host, request, "razzia-original")
  const overflow = await host.evaluate(() => ({
    x: document.documentElement.scrollWidth - innerWidth,
    y: document.documentElement.scrollHeight - innerHeight,
  }))
  expect(overflow.x).toBeLessThanOrEqual(1)
  expect(overflow.y).toBeLessThanOrEqual(1)
  await host.screenshot({
    path: join(evidenceDir, "narrow-original-curtain.png"),
  })
  await host.getByTestId("platform-opening-start").click()
  await expect(host.getByTestId("platform-game-opening")).toHaveAttribute(
    "data-platform-opening-stage",
    "opening",
  )
  await expect(host.getByTestId("platform-game-opening")).toHaveCount(0, {
    timeout: 18000,
  })
  await expect(
    host.locator('[data-show-theme="razzia-original"]').first(),
  ).toBeVisible()
  await expect(host.getByText(/^\d{6}$/u).first()).toBeVisible()
  await host.screenshot({
    path: join(evidenceDir, "narrow-original-lobby.png"),
  })
})

test("legacy imports get an in-memory original-theme launch and reduced motion keeps a static ident", async ({
  page: host,
  request,
}) => {
  await host.emulateMedia({ reducedMotion: "reduce" })
  const { quizId } = await openRoom(host, request, "razzia-original", true)
  const configPath =
    process.env.PLATFORM_OPENING_QA_CONFIG ??
    join(import.meta.dirname, "../../../work/platform-opening-qa-20261119")
  const quizDir = join(configPath, "quizz")
  const baseName = fs.readdirSync(quizDir).find((name) => {
    if (!name.endsWith(".json")) return false
    return (
      JSON.parse(fs.readFileSync(join(quizDir, name), "utf-8")).id === quizId
    )
  })
  expect(baseName).toBeTruthy()
  const baseFile = join(quizDir, baseName!)
  const original = fs.readFileSync(baseFile, "utf-8")
  const sidecar = join(configPath, "extensions/quizzes", `${quizId}.json`)
  expect(fs.existsSync(sidecar)).toBe(false)

  await host.getByTestId("platform-opening-start").click()
  await expect(
    host.getByTestId("platform-opening-reduced-motion"),
  ).toBeVisible()
  await expect(host.getByTestId("tadazz-opening-video")).toHaveCount(0)
  await host.screenshot({
    path: join(evidenceDir, "legacy-reduced-motion-ident.png"),
  })
  await host.getByTestId("platform-opening-skip").click()
  await expect(host.getByTestId("platform-game-opening")).toHaveCount(0)
  await expect(
    host.locator('[data-show-theme="razzia-original"]').first(),
  ).toBeVisible()
  await expect(host.getByText(/^\d{6}$/u).first()).toBeVisible()
  await host.reload()
  await expect(host.getByText(/^\d{6}$/u).first()).toBeVisible()
  await expect(host.getByTestId("platform-game-opening")).toHaveCount(0)
  expect(fs.readFileSync(baseFile, "utf-8")).toBe(original)
  expect(fs.existsSync(sidecar)).toBe(false)
})
