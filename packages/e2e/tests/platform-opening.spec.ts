import { joinGame } from "../utils/player"
import { CONFIG_PATH } from "../utils/constants"
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
  {
    theme,
    terminalFinale = false,
  }: {
    theme: "tadazz-classic" | "razzia-original" | "legacy"
    terminalFinale?: boolean
  },
) {
  const legacy = theme === "legacy"
  const selectedTheme = legacy ? "razzia-original" : theme
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
        time: 3,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [crypto.randomUUID()],
    computeCanonicalBaseDigest(quizz),
  )
  extras.defaults.showTheme = {
    id: selectedTheme,
    version: "1.0.0",
    overrides: {},
  }
  extras.defaults.advanceMode = "auto"

  if (terminalFinale) {
    const sceneId = crypto.randomUUID()
    extras.scenes[sceneId] = {
      id: sceneId,
      kind: "animation",
      preset: "grand-finale",
      durationMs: 9200,
      advance: "auto",
    }
    extras.timeline.push({
      id: crypto.randomUUID(),
      kind: "animation",
      sceneId,
    })
  }

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
  const { gameId, inviteCode } = (await created.json()) as {
    gameId: string
    inviteCode: string
  }
  await host.addInitScript(
    (tokenValue) => localStorage.setItem("token", tokenValue),
    token,
  )
  await host.goto(`/party/manager/${gameId}`)
  await expect(host.getByTestId("platform-game-opening")).toHaveAttribute(
    "data-platform-opening-stage",
    "standby",
  )

  return { gameId, quizId, inviteCode }
}

test("shared product curtain, video, pause and reconnect return to the selected theme", async ({
  page: host,
  browser,
  request,
}) => {
  const errors: string[] = []
  host.on("pageerror", (error) => errors.push(error.message))
  await host.addInitScript(() => {
    const media: HTMLMediaElement[] = []
    ;(
      window as Window & { __platformAudio?: HTMLMediaElement[] }
    ).__platformAudio = media
    // oxlint-disable-next-line typescript/unbound-method -- Rebound to the actual media element with call below.
    const { play } = HTMLMediaElement.prototype
    HTMLMediaElement.prototype.play = function recordPlatformMedia() {
      if (this instanceof HTMLAudioElement && !media.includes(this)) {
        media.push(this)
      }

      return play.call(this)
    }
  })
  const { gameId } = await openRoom(host, request, { theme: "tadazz-classic" })
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
    await expect(host.getByTestId("audio-cue-player-state")).toHaveAttribute(
      "data-audio-url",
      "/tadazz-show/music/platform/tadazz-production-intro-20261106.wav",
    )
    await expect
      .poll(() =>
        host.evaluate(
          () =>
            (
              (window as Window & { __platformAudio?: HTMLMediaElement[] })
                .__platformAudio ?? []
            ).filter(
              (audio) =>
                !audio.paused &&
                !audio.ended &&
                audio.volume > 0 &&
                audio.readyState >= 2,
            ).length,
        ),
      )
      .toBe(1)
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
  await openRoom(host, request, { theme: "razzia-original" })
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
  const { quizId } = await openRoom(host, request, { theme: "legacy" })
  const configPath = process.env.PLATFORM_OPENING_QA_CONFIG ?? CONFIG_PATH
  const quizDir = join(configPath, "quizz")
  const baseName = fs.readdirSync(quizDir).find((name) => {
    if (!name.endsWith(".json")) {
      return false
    }

    return (
      (
        JSON.parse(fs.readFileSync(join(quizDir, name), "utf-8")) as {
          id?: string
        }
      ).id === quizId
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

for (const theme of ["razzia-original", "tadazz-classic"] as const) {
  test(`one product curtain closes ${theme}, including pause and audience reconnect`, async ({
    page: host,
    browser,
    request,
  }) => {
    test.setTimeout(120000)
    const errors: string[] = []
    host.on("pageerror", (error) => errors.push(error.message))
    const { gameId, inviteCode } = await openRoom(host, request, {
      theme,
      terminalFinale: theme === "tadazz-classic",
    })
    const playerContext = await browser.newContext()
    const displayContext = await browser.newContext()
    const player = await playerContext.newPage()
    const display = await displayContext.newPage()
    display.on("pageerror", (error) => errors.push(error.message))

    try {
      await host.getByTestId("platform-opening-start").click()
      await host.getByTestId("platform-opening-skip").click()
      await expect(host.getByTestId("platform-game-opening")).toHaveCount(0)
      await joinGame(player, inviteCode, "Closing participant")
      await display.goto(`/display/${gameId}`)
      await host
        .getByTestId("manager-control-toolbar")
        .getByRole("button", { name: "Start", exact: true })
        .click()
      const stage = host.getByTestId("tadazz-show")
      await expect(stage).toHaveAttribute("data-show-theme", theme)
      await expect(stage).toHaveAttribute("data-role", "manager")
      await expect(stage).toHaveAttribute("data-show-scene", "results")
      await host.getByTestId("host-next-screen-btn").click()
      const curtain = host.getByTestId("platform-game-closing")
      await expect(curtain).toBeVisible({ timeout: 60000 })
      await expect(curtain).toHaveCount(1)
      await expect(host.locator(".full-curtain")).toHaveCount(0)
      await host.getByTestId("host-pause-resume-btn").click()
      await host.waitForTimeout(200)
      const frozen = Number(await curtain.getAttribute("data-elapsed-ms"))
      await host.waitForTimeout(600)
      expect(
        Math.abs(
          Number(await curtain.getAttribute("data-elapsed-ms")) - frozen,
        ),
      ).toBeLessThan(150)
      await display.reload()
      const audienceCurtain = display.getByTestId("platform-game-closing")
      await expect(audienceCurtain).toBeVisible()
      expect(
        Math.abs(
          Number(await audienceCurtain.getAttribute("data-elapsed-ms")) -
            frozen,
        ),
      ).toBeLessThan(250)
      await expect(display.locator(".full-curtain")).toHaveCount(0)
      await host.screenshot({
        path: join(evidenceDir, `${theme}-closing-paused.png`),
      })
      await host.getByTestId("host-pause-resume-btn").click()
      await expect(
        host.getByTestId("platform-closing-boundary"),
      ).toHaveAttribute("data-closing-stage", "closed", { timeout: 15000 })
      await expect(
        display.getByTestId("platform-closing-boundary"),
      ).toHaveAttribute("data-closing-stage", "closed")
      await host.reload()
      await expect(
        host.getByTestId("platform-closing-boundary"),
      ).toHaveAttribute("data-closing-stage", "closed")
      await expect(host.getByTestId("platform-game-opening")).toHaveCount(0)
      await expect(host.getByTestId("platform-game-closing")).toHaveCount(1)
      await host.screenshot({
        path: join(evidenceDir, `${theme}-closing-rejoined.png`),
      })
      expect(errors).toEqual([])
    } finally {
      await playerContext.close()
      await displayContext.close()
    }
  })
}
