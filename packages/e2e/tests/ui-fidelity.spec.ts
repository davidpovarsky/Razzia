/* oxlint-disable eslint/no-await-in-loop -- Ordered browser actions exercise real authoritative rooms. */
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test"
import {
  createDefaultQuizExtrasV2,
  computeCanonicalBaseDigest,
  TADAZZ_PRODUCT_LOGO_URL,
  createDefaultOverlayAnimation,
} from "../../../extensions/src/core"
import { join } from "node:path"
const families = [
  "tadazz-classic",
  "tadazz-demo-cosmic",
  "tadazz-demo-jade",
  "razzia-original",
]
/* oxlint-disable max-params -- Preserve the existing positional protocol/animation API; changing callers is outside this lint repair. */
async function room(
  request: APIRequestContext,
  page: Page,
  id: string,
  type = "single",
  scene: boolean | "overlay" = false,
  many = false,
) {
  const login = await request.post("/api/auth/manager", {
    data: {
      password: "e2e-password",
    },
  })
  expect(login.ok()).toBe(true)
  const { token } = (await login.json()) as {
    token: string
  }
  const questionId = crypto.randomUUID()
  const question = {
    type,
    question: type === "estimation" ? "Pick 50" : "Which answer is correct?",
    answers: (() => {
      if (many) {
        return Array.from(
          {
            length: 5,
          },
          (_, index) => `Option ${index + 1}`,
        )
      }

      if (type === "estimation") {
        return []
      }

      return ["One", "Two", "Three", "Four"]
    })(),
    solutions: (() => {
      if (many) {
        return [4]
      }

      if (type === "estimation") {
        return [50]
      }

      if (type === "multi") {
        return [0, 2]
      }

      return [0]
    })(),
    options:
      type === "estimation"
        ? {
            inputMode: "input",
            min: 0,
            max: 100,
            step: 1,
            margin: 10,
          }
        : undefined,
    time: 120,
    cooldown: 3,
  }
  const quizz = {
    subject: `UI fidelity ${id} ${crypto.randomUUID()}`,
    gameMode: "quiz",
    questions: [question],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [questionId],
    computeCanonicalBaseDigest(quizz),
  )
  extras.defaults.showTheme = {
    id,
    version: id.startsWith("tadazz-demo-") ? "2.0.0" : "1.0.0",
    overrides: {},
  }
  extras.scenes = {}
  extras.timeline = [
    {
      id: crypto.randomUUID(),
      kind: "question",
      questionId,
    },
  ]

  if (scene) {
    const sceneId = crypto.randomUUID()
    extras.scenes[sceneId] = {
      id: sceneId,
      kind: "transition",
      title: "Native enhancement scene",
      durationMs: 5000,
      advance: "manual",
    }

    if (scene === "overlay") {
      extras.scenes[sceneId] = {
        id: sceneId,
        kind: "opening",
        title: "Native overlay controls",
        durationMs: 10000,
        advance: "manual",
        mediaUrl: "/media/native-preview.webm",
        mediaType: "video",
        stageLayout: "cinema",
        endBehavior: "holdFrame",
        overlayAnimations: [
          createDefaultOverlayAnimation({
            id: "native-edit-overlay",
            label: "Editable overlay",
            assetUrl: "/media/native-overlay.json",
            timeBase: "scene",
            durationMs: 10000,
            loop: true,
          }),
        ],
      }
      extras.timeline.unshift({
        id: crypto.randomUUID(),
        kind: "opening",
        sceneId,
      })
    } else {
      extras.timeline.unshift({
        id: crypto.randomUUID(),
        kind: "transition",
        sceneId,
      })
    }
  }

  if (type === "multi" || (type === "single" && !scene && !many)) {
    extras.perQuestion[questionId] = {
      answerVisuals: [0, 1, 2, 3].map((answerIndex) => ({
        answerIndex,
        url: "/media/theme-answer.png",
        display: "both",
        alt: `Image ${answerIndex + 1}`,
      })),
    }
  }

  const headers = {
    Authorization: `Bearer ${token}`,
  }
  const saved = await request.post("/api/extensions/quizzes", {
    headers,
    data: {
      quizz,
      extras,
    },
  })
  expect(saved.ok(), await saved.text()).toBe(true)
  const { quizId } = (await saved.json()) as {
    quizId: string
  }
  const created = await request.post("/api/games", {
    headers,
    data: {
      quizzId: quizId,
    },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const game = (await created.json()) as {
    gameId: string
    inviteCode: string
  }
  await page.addInitScript(
    (value) => localStorage.setItem("token", value),
    token,
  )
  await page.goto(`/party/manager/${game.gameId}`)
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-native-layout",
    "true",
  )

  return {
    ...game,
    quizId,
    token,
  }
}
/* oxlint-enable max-params */
async function noOverflow(page: Page) {
  await expect(page.locator('[data-control-source="standalone"]')).toHaveCount(
    0,
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true)
  const box = await page.getByTestId("native-game-surface").boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(
    (await page.evaluate(() => innerWidth)) * 0.95,
  )
  await expect(page.locator(".tzv4-stage")).toHaveCount(0)
  await expect(page.getByTestId("product-logo").first()).toHaveAttribute(
    "src",
    TADAZZ_PRODUCT_LOGO_URL,
  )
}
for (const family of families) {
  test(`${family}: native operator, responsive iPad, fixed brand and projector`, async ({
    page,
    browser,
    request,
  }, info) => {
    const game = await room(request, page, family)
    const ctx = await browser.newContext({
      viewport: {
        width: 1024,
        height: 768,
      },
      isMobile: true,
      hasTouch: true,
      locale: "en-US",
    })
    const player = await ctx.newPage()
    const displayBrowser = await browser.browserType().launch()

    try {
      await player.goto(`http://127.0.0.1:3190/game?pin=${game.inviteCode}`)
      await player.getByPlaceholder("Username here").fill("Responsive iPad")
      await player
        .getByRole("button", {
          name: "Submit",
          exact: true,
        })
        .click()
      await expect(page.getByTestId("host-connected-counter")).toHaveText(
        "1 / 1",
      )
      await page.bringToFront()
      await page
        .getByRole("button", {
          name: "Start",
          exact: true,
        })
        .click()
      await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
        "data-voting-open",
        "true",
      )
      await expect(
        player.getByRole("button", {
          name: /One/,
        }),
      ).toBeVisible()
      await noOverflow(page)
      await noOverflow(player)
      expect(
        await page
          .getByTestId("host-toggle-audio-mute")
          .evaluate((element) => getComputedStyle(element).fontFamily),
      ).toContain("Rubik Variable")
      expect(
        await page
          .getByTestId("host-toggle-audio-mute")
          .evaluate((element) => getComputedStyle(element).borderRadius),
      ).toBe("8px")
      await page.getByTestId("host-pause-resume-btn").click()
      await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
        "data-game-paused",
        "true",
      )
      await expect(
        player.getByRole("button", {
          name: /One/,
        }),
      ).toBeDisabled()
      await player.screenshot({
        path: join(info.outputDir, "ipad-landscape.png"),
      })
      await player.setViewportSize({
        width: 768,
        height: 1024,
      })
      await noOverflow(player)
      await player.screenshot({
        path: join(info.outputDir, "ipad-portrait.png"),
      })
      await page.getByTestId("host-bottom-players-btn").click()
      await expect(page.getByRole("dialog")).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
        "data-game-paused",
        "true",
      )
      await page.getByTestId("host-pause-resume-btn").click()
      await player.bringToFront()
      await player
        .getByRole("button", {
          name: /One/,
        })
        .click()
      await expect(
        player.getByText("Waiting for the players to answer", {
          exact: true,
        }),
      ).toBeVisible()
      const display = await displayBrowser.newPage({
        viewport: {
          width: 1280,
          height: 720,
        },
        locale: "en-US",
      })
      await display.goto(`http://127.0.0.1:3190/display/${game.gameId}`)
      await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
        "data-show-theme",
        family,
      )
      await expect(display.getByTestId("manager-control-toolbar")).toHaveCount(
        0,
      )
      await expect(display.getByTestId("host-audio-controls")).toHaveCount(0)

      if (family === "razzia-original") {
        await expect(display.locator(".tzv4-stage")).toHaveCount(0)
        await expect(display.getByTestId("native-game-surface")).toBeVisible()
      } else {
        await expect(display.locator(".tzv4-stage")).toHaveCount(1)
        await expect(display.locator(".stage-brand-logo")).toHaveAttribute(
          "src",
          TADAZZ_PRODUCT_LOGO_URL,
        )
      }

      await page.bringToFront()
      await page.getByTestId("host-end-timer-btn").click()
      await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
        "data-show-scene",
        "results",
      )
      await expect(
        player.getByText("Nice!", {
          exact: true,
        }),
      ).toBeVisible()
      await page.screenshot({
        path: join(info.outputDir, "native-host.png"),
      })
      await display.screenshot({
        path: join(info.outputDir, "projector.png"),
      })
    } finally {
      await ctx.close()
      await displayBrowser.close()
    }
  })
}
for (const type of ["multi", "estimation"]) {
  test(`native ${type} retains scoring, picture cards and confirmation`, async ({
    page,
    browser,
    request,
  }) => {
    const game = await room(request, page, "razzia-original", type)
    const ctx = await browser.newContext({
      viewport: {
        width: 1024,
        height: 768,
      },
      hasTouch: true,
      isMobile: true,
      locale: "en-US",
    })

    try {
      const player = await ctx.newPage()
      await player.goto(`http://127.0.0.1:3190/game?pin=${game.inviteCode}`)
      await player.getByPlaceholder("Username here").fill("Native Types")
      await player
        .getByRole("button", {
          name: "Submit",
          exact: true,
        })
        .click()
      await expect(page.getByTestId("host-connected-counter")).toHaveText(
        "1 / 1",
      )
      await page.bringToFront()
      await page
        .getByRole("button", {
          name: "Start",
          exact: true,
        })
        .click()
      await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
        "data-voting-open",
        "true",
      )
      await player.bringToFront()

      if (type === "multi") {
        await expect(
          player.locator('img[src="/media/theme-answer.png"]').first(),
        ).toBeVisible()
        await player
          .getByRole("button", {
            name: /One/,
          })
          .click()
        await player
          .getByRole("button", {
            name: /Three/,
          })
          .click()
      } else {
        await player.getByRole("spinbutton").fill("50")
      }

      await player
        .getByRole("button", {
          name: "Confirm",
          exact: true,
        })
        .click()
      await page.bringToFront()
      await page.getByTestId("host-end-timer-btn").click()
      await expect(
        player.getByText("Nice!", {
          exact: true,
        }),
      ).toBeVisible()
    } finally {
      await ctx.close()
    }
  })
}
test("native game keeps timeline scenes and original editor remains outside game styles", async ({
  page,
  request,
  browser,
}) => {
  const game = await room(request, page, "razzia-original", "single", true)
  const context = await browser.newContext()
  const participant = await context.newPage()
  await participant.goto(`http://127.0.0.1:3190/game?pin=${game.inviteCode}`)
  await participant.getByPlaceholder("Username here").fill("Scene QA")
  await participant
    .getByRole("button", {
      name: "Submit",
      exact: true,
    })
    .click()
  await expect(page.getByTestId("host-connected-counter")).toHaveText("1 / 1")
  await page.bringToFront()
  await page
    .getByRole("button", {
      name: "Start",
      exact: true,
    })
    .click()
  await expect(page.getByTestId("studio-scene-presenter")).toBeVisible()
  await expect(page.locator('[data-control-source="standalone"]')).toHaveCount(
    0,
  )
  await expect(
    page.getByText("Native enhancement scene", {
      exact: true,
    }),
  ).toBeVisible()
  await page.getByTestId("host-next-screen-btn").click()
  await expect(page.getByTestId("game-question-title")).toBeVisible()
  await page.goto(`/manager/quizz/${game.quizId}`)
  await page.getByTestId("studio-tab-settings").click()
  for (const id of families) {
    await expect(page.getByTestId(`show-theme-${id}`)).toBeVisible()
  }
  await expect(page.getByTestId("tadazz-show")).toHaveCount(0)
  expect(
    await page
      .getByTestId("editor-save-btn")
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("Rubik Variable")
  await context.close()
})
test("operator projection preserves native audio preferences and can return to responsive controls", async ({
  page,
  request,
  browserName,
}) => {
  await room(request, page, "tadazz-demo-cosmic")
  await page.getByTestId("host-toggle-audio-mute").click()
  await expect(page.getByTestId("host-toggle-audio-mute")).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await page.getByTestId("host-audio-volume").fill("0.37")
  await page.getByTestId("host-toggle-audio-pause").click()

  if (browserName === "webkit") {
    await page.evaluate(() => {
      HTMLElement.prototype.requestFullscreen = () =>
        Promise.reject(new Error("Fullscreen denial fixture"))
    })
  }

  await page.getByTestId("host-present-from-host-btn").click()

  if (browserName === "webkit") {
    await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
    await expect(page.getByTestId("host-toggle-audio-mute")).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    return
  }

  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-host-presenting",
    "true",
  )
  await expect(page.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(page.getByTestId("host-audio-controls")).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.fullscreenElement?.getAttribute("data-testid"),
      ),
    )
    .toBe("game-viewport")
  await page.keyboard.press("Escape")
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true)
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-host-presenting",
    "false",
  )
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-native-layout",
    "true",
  )
  await expect(page.getByTestId("host-toggle-audio-mute")).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByTestId("host-audio-volume")).toHaveValue("0.37")
  await expect(page.getByTestId("host-toggle-audio-pause")).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await page.getByTestId("host-present-from-host-btn").click()
  await page.keyboard.press("Escape")
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true)
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-native-layout",
    "true",
  )
})
test("native iPad keeps the upstream five choices reachable and scores the last choice", async ({
  page,
  request,
  browser,
}) => {
  const game = await room(
    request,
    page,
    "razzia-original",
    "single",
    false,
    true,
  )
  const context = await browser.newContext({
    viewport: {
      width: 1024,
      height: 768,
    },
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
  })

  try {
    const player = await context.newPage()
    await player.goto(`http://127.0.0.1:3190/game?pin=${game.inviteCode}`)
    await player.getByPlaceholder("Username here").fill("Long list QA")
    await player
      .getByRole("button", {
        name: "Submit",
        exact: true,
      })
      .click()
    await expect(page.getByTestId("host-connected-counter")).toHaveText("1 / 1")
    await page.bringToFront()
    await page
      .getByRole("button", {
        name: "Start",
        exact: true,
      })
      .click()
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
      "data-voting-open",
      "true",
    )
    await player.bringToFront()
    expect(
      await player.evaluate(() => getComputedStyle(document.body).touchAction),
    ).toBe("pan-y")
    await player
      .getByRole("button", {
        name: /Option 5/,
      })
      .click()
    await page.bringToFront()
    await page.getByTestId("host-end-timer-btn").click()
    await expect(
      player.getByText("Nice!", {
        exact: true,
      }),
    ).toBeVisible()
  } finally {
    await context.close()
  }
})
test("native public lobby reuses the Razzia invitation and QR without management controls", async ({
  page,
  request,
  browser,
}) => {
  const game = await room(request, page, "razzia-original")
  const context = await browser.newContext({
    locale: "en-US",
  })

  try {
    const display = await context.newPage()
    await display.goto(`http://127.0.0.1:3190/display/${game.gameId}`)
    await expect(
      display.getByText(game.inviteCode, {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      display.getByRole("button", {
        name: "Show QR code",
        exact: true,
      }),
    ).toBeVisible()
    await expect(display.getByTestId("manager-control-toolbar")).toHaveCount(0)
    await expect(display.getByTestId("host-bottom-players-btn")).toHaveCount(0)
    await expect(display.getByTestId("product-logo")).toHaveAttribute(
      "src",
      TADAZZ_PRODUCT_LOGO_URL,
    )
  } finally {
    await context.close()
  }
})
test("native overlay and timeline buttons preserve keyboard positioning, pointer drag and saving", async ({
  page,
  request,
}, info) => {
  const game = await room(request, page, "razzia-original", "single", "overlay")
  await page.goto(`/manager/quizz/${game.quizId}`)
  const track = page.getByTestId("studio-preview-track-native-edit-overlay")
  await expect(track).toHaveJSProperty("tagName", "BUTTON")
  await track.click()
  const scrub = page.getByTestId("studio-preview-scrub-slider")
  await scrub.fill("1000")
  const overlay = page.getByTestId("cinematic-overlay-native-edit-overlay")
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveJSProperty("tagName", "BUTTON")
  await expect(overlay).toHaveAttribute("data-control-source", "razzia")
  await overlay.focus()
  await overlay.press("ArrowRight")
  await expect(
    page.getByTestId("studio-overlay-x-native-edit-overlay"),
  ).toHaveValue("51")
  await overlay.press("Shift+ArrowDown")
  await expect(
    page.getByTestId("studio-overlay-y-native-edit-overlay"),
  ).toHaveValue("55")
  const plane = await page
    .getByTestId("cinematic-layer-stack-opening")
    .boundingBox()
  const box = await overlay.boundingBox()
  expect(plane).not.toBeNull()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    plane!.x + plane!.width * 0.65,
    plane!.y + plane!.height * 0.45,
    {
      steps: 5,
    },
  )
  await page.mouse.up()
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId("studio-overlay-x-native-edit-overlay")
          .inputValue(),
      ),
    )
    .toBeGreaterThanOrEqual(64)
  expect(
    Number(
      await page
        .getByTestId("studio-overlay-x-native-edit-overlay")
        .inputValue(),
    ),
  ).toBeLessThanOrEqual(66)
  const y = Number(
    await page.getByTestId("studio-overlay-y-native-edit-overlay").inputValue(),
  )
  expect(y).toBeGreaterThanOrEqual(44)
  expect(y).toBeLessThanOrEqual(46)
  await expect(page.locator('[data-control-source="standalone"]')).toHaveCount(
    0,
  )
  await page.screenshot({
    path: info.outputPath("native-overlay-controls.png"),
  })
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/manager\/config$/)
  const saved = await request.get(`/api/extensions/quizzes/${game.quizId}`, {
    headers: {
      Authorization: `Bearer ${game.token}`,
    },
  })
  expect(saved.ok()).toBe(true)
  const { extras } = (await saved.json()) as {
    extras: import("../../../extensions/src/core").QuizExtrasV2
  }
  const scenes = extras.scenes as Record<
    string,
    {
      kind: string
      overlayAnimations: Array<{
        position: {
          x: number
          y: number
        }
      }>
    }
  >
  const opening = Object.values(scenes).find(
    (scene) => scene.kind === "opening",
  )

  if (!opening) {
    throw new Error("Saved opening is missing")
  }

  expect(opening.overlayAnimations[0].position.x).toBeCloseTo(0.65, 1)
  expect(opening.overlayAnimations[0].position.y).toBeCloseTo(0.45, 1)
})
