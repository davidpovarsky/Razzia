import { expect, test } from "@playwright/test"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
} from "../../../extensions/src/core"
import { loginManager } from "../utils/manager"

const INTRO = "/tadazz-show/music/platform/tadazz-production-intro-20261106.wav"
const LOBBY = "/tadazz-show/music/platform/tadazz-exploration-20261106.mp3"

test("real presenter media: rejected autoplay unlocks, opening hands off once, pause retains position, one engine survives fullscreen", async ({
  page,
  request,
}) => {
  test.setTimeout(90000)
  page.setDefaultTimeout(10000)
  await page.addInitScript(() => {
    const qa = window as unknown as {
      qaAudio: HTMLAudioElement[]
      qaAllowAudio: boolean
    }
    qa.qaAudio = []
    qa.qaAllowAudio = false
    // oxlint-disable-next-line typescript/unbound-method -- Rebound to the actual media element with apply below.
    const originalPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function play() {
      if (this instanceof HTMLAudioElement) {
        if (!qa.qaAudio.includes(this)) {
          qa.qaAudio.push(this)
        }

        if (!qa.qaAllowAudio) {
          return Promise.reject(
            new DOMException("QA autoplay restriction", "NotAllowedError"),
          )
        }
      }

      return originalPlay.call(this)
    }
  })
  const title = `Audio timeline ${Date.now()}`
  const quizz = {
    subject: title,
    gameMode: "quiz" as const,
    questions: [
      {
        type: "single" as const,
        question: "Audio QA",
        answers: ["One", "Two"],
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
  extras.defaults.showTheme = {
    id: "tadazz-classic",
    version: "1.0.0",
    overrides: {},
  }
  // Use the release recordings included in the built site. Their ownership
  // moves from the product opening to the selected theme at the lobby boundary.
  extras.audio.soundtrack = {
    openingIntro: {
      mode: "media",
      url: INTRO,
      volume: 0.3,
      loop: false,
      fadeMs: 0,
      startOffsetSeconds: 0,
      maxDurationMs: 12000,
    },
    lobby: {
      mode: "media",
      url: LOBBY,
      volume: 0.2,
      loop: true,
      fadeMs: 300,
      startOffsetSeconds: 0,
    },
  }
  const login = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  const { token } = (await login.json()) as { token: string }
  const saved = await request.post("/api/extensions/quizzes", {
    headers: { Authorization: `Bearer ${token}` },
    data: { quizz, extras },
  })
  expect(saved.ok(), await saved.text()).toBe(true)
  await loginManager(page)
  await page.getByRole("button", { name: title, exact: true }).click()
  await page.getByRole("button", { name: "Start game", exact: true }).click()
  const audio = page.getByTestId("audio-cue-player-state")
  await expect(page.getByTestId("platform-game-opening")).toHaveAttribute(
    "data-platform-opening-stage",
    "standby",
  )
  await page.getByTestId("platform-opening-start").click()
  await expect(audio).toHaveAttribute("data-audio-blocked", "true")
  const video = page.getByTestId("tadazz-opening-video")
  await expect(video).toBeVisible()
  expect(
    await video.evaluate((el: HTMLVideoElement) => el.muted && el.volume === 0),
  ).toBe(true)
  // Keep the injected rejection active through the start gesture. Only the
  // explicit recovery gesture below is allowed to retry real audio playback.
  await page.evaluate(() => {
    ;(window as unknown as { qaAllowAudio: boolean }).qaAllowAudio = true
  })
  await page.getByTestId("host-enable-audio").click()
  await expect(audio).toHaveAttribute("data-audio-blocked", "false")
  const introTime = () =>
    page.evaluate(() => {
      const qa = window as unknown as { qaAudio: HTMLAudioElement[] }
      const intro = qa.qaAudio.find((a) =>
        a.src.endsWith("/tadazz-production-intro-20261106.wav"),
      )

      return { time: intro?.currentTime ?? 0, paused: intro?.paused ?? true }
    })
  await expect.poll(async () => (await introTime()).time).toBeGreaterThan(0.2)
  expect((await introTime()).paused).toBe(false)
  await expect(audio).toHaveAttribute("data-audio-url", INTRO)
  await expect(page.getByTestId("platform-game-opening")).toHaveCount(0, {
    timeout: 11000,
  })
  await expect(page.getByTestId("tadazz-lobby-pin")).toBeVisible()
  await expect(audio).toHaveCount(1)
  await expect(audio).toHaveAttribute("data-soundtrack-slot", "lobby")
  await expect(audio).toHaveAttribute("data-audio-url", LOBBY)
  const mediaState = () =>
    page.evaluate(
      ({ intro, lobby }) => {
        const qa = window as unknown as { qaAudio: HTMLAudioElement[] }
        const background = qa.qaAudio.filter((a) =>
          [intro, lobby].some((path) => a.src.endsWith(path)),
        )
        const active = background.filter((a) => !a.paused && a.volume > 0)
        const lobbyTrack = background.find((a) => a.src.endsWith(lobby))

        return {
          total: qa.qaAudio.length,
          playing: active.length,
          activePaths: active.map((a) => new URL(a.src).pathname),
          lobbyTime: lobbyTrack?.currentTime ?? 0,
          lobbyPaused: lobbyTrack?.paused ?? true,
        }
      },
      { intro: INTRO, lobby: LOBBY },
    )
  await expect
    .poll(async () => (await mediaState()).activePaths)
    .toEqual([LOBBY])
  await expect
    .poll(async () => (await mediaState()).lobbyTime)
    .toBeGreaterThan(0.2)
  expect((await introTime()).paused).toBe(true)
  expect((await mediaState()).lobbyPaused).toBe(false)
  // The platform opening ends at its authoritative boundary. The theme now
  // owns the single lobby soundtrack, whose local media pause retains position.
  await page.getByTestId("host-toggle-audio-pause").click()
  await expect(audio).toHaveAttribute("data-audio-paused", "true")
  const pausedAt = (await mediaState()).lobbyTime
  await page.waitForTimeout(1300)
  expect(Math.abs((await mediaState()).lobbyTime - pausedAt)).toBeLessThan(0.12)
  await page.getByTestId("host-toggle-audio-pause").click()
  await expect(audio).toHaveAttribute("data-audio-paused", "false")
  await expect
    .poll(async () => (await mediaState()).lobbyTime)
    .toBeGreaterThan(pausedAt + 0.2)
  await expect.poll(async () => (await mediaState()).playing).toBe(1)
  const beforeFullscreen = await mediaState()
  await page.getByTestId("host-present-from-host-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-host-presenting",
    "true",
  )
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("host-audio-controls")).toBeVisible()
  expect((await mediaState()).total).toBe(beforeFullscreen.total)
  expect((await mediaState()).playing).toBe(1)
})
