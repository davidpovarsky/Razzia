import { expect, test } from "@playwright/test"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
} from "../../../extensions/src/core"
import { loginManager } from "../utils/manager"

test("real presenter media: rejected autoplay unlocks, intro survives video end, pause retains position, one engine survives fullscreen", async ({
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
    const originalPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLAudioElement) {
        if (!qa.qaAudio.includes(this)) qa.qaAudio.push(this)
        if (!qa.qaAllowAudio)
          return Promise.reject(
            new DOMException("QA autoplay restriction", "NotAllowedError"),
          )
      }
      return originalPlay.call(this)
    }
    window.addEventListener(
      "tadazz:audio-unlock",
      () => {
        qa.qaAllowAudio = true
      },
      true,
    )
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
  const extras = createDefaultQuizExtras(
    "draft",
    [crypto.randomUUID()],
    computeCanonicalBaseDigest(quizz),
  )
  // Exercise the owner-cleared release recordings through the actual media route.
  extras.audio.soundtrack = {
    openingIntro: {
      mode: "media",
      url: "/media/tadazz-production-intro-20261106.wav",
      volume: 0.3,
      loop: false,
      fadeMs: 0,
      startOffsetSeconds: 0,
      maxDurationMs: 12000,
    },
    lobby: {
      mode: "media",
      url: "/media/tadazz-exploration-20261106.mp3",
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
  await expect(audio).toHaveAttribute("data-audio-blocked", "true")
  const video = page.getByTestId("tadazz-opening-video")
  await expect(video).toBeVisible()
  expect(
    await video.evaluate((el: HTMLVideoElement) => el.muted && el.volume === 0),
  ).toBe(true)
  await page.getByTestId("tadazz-opening-enable-sound").click()
  await expect(audio).toHaveAttribute("data-audio-blocked", "false")
  const introTime = () =>
    page.evaluate(() => {
      const qa = window as unknown as { qaAudio: HTMLAudioElement[] }
      const intro = qa.qaAudio.find((a) =>
        a.src.endsWith("/media/tadazz-production-intro-20261106.wav"),
      )
      return { time: intro?.currentTime ?? 0, paused: intro?.paused ?? true }
    })
  await expect.poll(async () => (await introTime()).time).toBeGreaterThan(0.2)
  await expect(page.getByTestId("tadazz-opening")).toHaveCount(0, {
    timeout: 11000,
  })
  await expect(page.getByTestId("tadazz-lobby-pin")).toBeVisible()
  const duringLobby = await introTime()
  // The intentionally blocked soundtrack begins only after the explicit gesture.
  expect(duringLobby.time).toBeGreaterThan(4)
  expect(duringLobby.time).toBeLessThan(11)
  expect(duringLobby.paused).toBe(false)
  // Lobby has no game timer; exercise the presenter's media pause here.
  await page.getByTestId("host-toggle-audio-pause").click()
  await expect(audio).toHaveAttribute(
    "data-audio-paused",
    "true",
  )
  const pausedAt = (await introTime()).time
  await page.waitForTimeout(1300)
  expect(Math.abs((await introTime()).time - pausedAt)).toBeLessThan(0.12)
  await page.getByTestId("host-toggle-audio-pause").click()
  await expect
    .poll(async () => (await introTime()).time)
    .toBeGreaterThan(pausedAt + 0.2)
  await expect(audio).toHaveAttribute("data-soundtrack-slot", "lobby", {
    timeout: 7000,
  })
  const mediaState = () =>
    page.evaluate(() => {
      const qa = window as unknown as { qaAudio: HTMLAudioElement[] }
      const background = qa.qaAudio.filter((a) =>
        /\/tadazz-(production-intro|exploration)-20261106\.(wav|mp3)$/u.test(a.src),
      )
      return {
        total: qa.qaAudio.length,
        playing: background.filter((a) => !a.paused && a.volume > 0).length,
        introTime:
          background.find((a) => a.src.endsWith("tadazz-production-intro-20261106.wav"))
            ?.currentTime ?? 0,
      }
    })
  await expect.poll(async () => (await mediaState()).playing).toBe(1)
  const stopped = await mediaState()
  expect(stopped.introTime).toBeGreaterThanOrEqual(11.8)
  expect(stopped.introTime).toBeLessThan(12.5)
  await page.getByTestId("host-present-from-host-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-host-presenting",
    "true",
  )
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("host-audio-controls")).toBeVisible()
  expect((await mediaState()).total).toBe(stopped.total)
  expect((await mediaState()).playing).toBe(1)
})
