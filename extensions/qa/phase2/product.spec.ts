// oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call, typescript/no-unsafe-argument, typescript/no-unsafe-return -- Raw HTTP and browser fixture payloads are asserted at each exercised boundary; production decoders remain strict.
// oxlint-disable typescript/no-unnecessary-condition -- Runtime assertions deliberately verify literal wire invariants and browser state.
import { expect, test, type Page } from "@playwright/test"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { previewResources } from "../../src/site/components/game-preview/resources"

const password = "Isolated-phase2-ui-account-password-2026"
async function loginWorkspaceFixture(
  page: Page,
  role: "publisher" | "collaborator",
) {
  const accounts = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          "../../.site-test-config/phase2-workspaces.json",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  )
  const account = accounts[role]
  await page.goto("/login")
  await page.getByLabel("Email address", { exact: true }).fill(account.email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Your shows." })).toBeVisible()

  return account as { id: string; email: string }
}
async function login(page: Page) {
  const email = `phase2-${crypto.randomUUID()}@example.invalid`
  expect(
    (
      await page.request.post("/api/accounts/register", {
        data: { email, password },
      })
    ).ok(),
  ).toBe(true)
  const mail = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../../.site-test-config/test-mail.json", import.meta.url),
      ),
      "utf8",
    ),
  )
  expect(
    (
      await page.request.post("/api/accounts/verify", {
        data: { email, password, code: mail[email].code },
      })
    ).ok(),
  ).toBe(true)
  await page.goto("/login")
  await page.getByLabel("Email address", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Your shows." })).toBeVisible()
}

async function importApprovedExample(
  page: Page,
  originalRevealVariant = false,
) {
  const source = JSON.parse(
    readFileSync(
      "/evidence/approved-content-TwGGo21j0nTD9XoSZAFzZ.json",
      "utf8",
    ),
  )
  const media = readFileSync("/input/approved-placeholder.png")
  expect(createHash("sha256").update(media).digest("hex")).toBe(
    "80899a7fbb91160fc4c494f22c31dfd8face8c47b189d2528e6471f1f2207bcf",
  )
  const token = await page.evaluate(() => localStorage.getItem("token"))
  const headers = { Authorization: `Bearer ${token}` }
  const uploaded = await page.request.post("/api/media", {
    headers,
    multipart: {
      file: {
        name: "approved-source-placeholder.png",
        mimeType: "image/png",
        buffer: media,
      },
    },
  })
  expect(uploaded.status()).toBe(201)
  const asset = await uploaded.json()
  const show = JSON.parse(
    JSON.stringify(source.show, (_key, value) => {
      if (value === "https://placehold.co/600x400.png") {
        return asset.url
      }

      if (
        typeof value === "string" &&
        (value.startsWith("https://") || value.startsWith("/media/"))
      ) {
        throw new Error("Unresolved approved source media")
      }

      return value
    }),
  )

  if (originalRevealVariant) {
    // Derived QA copy only; the approved Goldy source remains read-only.
    show.defaults = {
      ...show.defaults,
      showTheme: { id: "razzia-original", version: "1.0.0", overrides: {} },
    }
    show.cards[0] = {
      ...show.cards[0],
      media: { type: "image", url: asset.url },
      cooldownSeconds: 15,
      reveal: {
        effect: "blur",
        durationMs: 4000,
        trigger: "automatic",
        audience: "all",
      },
      note: "QA_PRIVATE_EDITORIAL_NOTE",
    }
  }

  const imported = await page.request.post("/api/extensions/import", {
    headers,
    data: show,
  })
  expect(imported.status()).toBe(201)
  const { quizId } = await imported.json()
  const projected = await page.request.get(
    `/api/extensions/preview/quizzes/${quizId}`,
    { headers },
  )
  expect(projected.status()).toBe(200)
  const snapshot = await projected.json()
  expect(snapshot.chapters).toHaveLength(20)
  expect(
    snapshot.show.cards.map((card: { question: string }) => card.question),
  ).toEqual(show.cards.map((card: { question: string }) => card.question))
  expect(
    snapshot.assets.map((entry: { sha256: string }) => entry.sha256),
  ).toContain(createHash("sha256").update(media).digest("hex"))

  return { quizId: quizId as string, title: show.title as string }
}

test("original Razzia components share the preview clock and can mix with cinematic templates", async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await login(page)
  const { quizId } = await importApprovedExample(page, true)
  await page.goto("/studio/games")
  const surface = page.locator(
    `[data-game-id="${quizId}"] .game-preview-surface`,
  )
  await surface.getByRole("button", { name: /^Preview:/u }).click()
  const native = surface.locator(
    "[data-native-application-preview][data-preview-ready=true]",
  )
  await expect(native.locator("[data-original-razzia-preview]")).toBeVisible({
    timeout: 30_000,
  })
  const reveal = native.getByTestId("reveal-media-container")
  await expect
    .poll(() =>
      native
        .getByTestId("reveal-media-image")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(600)
  expect((await reveal.boundingBox())!.height).toBeGreaterThan(10)
  await expect(reveal).toHaveAttribute("data-progress", "0.000")
  await surface.getByRole("button", { name: "Play", exact: true }).click()
  await expect
    .poll(async () => Number(await reveal.getAttribute("data-progress")))
    .toBeGreaterThan(0.15)
  await surface.getByRole("button", { name: "Pause", exact: true }).click()
  const progress = await reveal.getAttribute("data-progress")
  await page.waitForTimeout(700)
  await expect(reveal).toHaveAttribute("data-progress", progress!)
  await page.screenshot({
    path: info.outputPath("razzia-real-reveal-paused.png"),
  })
  const range = surface.getByRole("slider").first()
  await range.focus()
  await page.keyboard.press("Home")
  await page.keyboard.press("ArrowRight")
  await expect(range).toHaveValue("1")
  await expect(native.locator("[data-original-razzia-preview]")).toBeVisible()
  await expect(native.getByText("QA_PRIVATE_EDITORIAL_NOTE")).toHaveCount(0)
  await page.screenshot({
    path: info.outputPath("razzia-original-answer-cards.png"),
  })
  await page.keyboard.press("ArrowRight")
  await expect(range).toHaveValue("2")
  const audio = surface.getByTestId("audio-cue-player-state")
  await expect(audio).toHaveAttribute("data-audio-paused", "true")
  await surface
    .getByRole("button", { name: "Enable sound", exact: true })
    .click()
  await surface.getByRole("button", { name: "Play", exact: true }).click()
  await expect(audio).toHaveAttribute("data-audio-paused", "false")
  await expect(audio).not.toHaveAttribute("data-audio-url", "")
  await surface.getByRole("button", { name: "Pause", exact: true }).click()
  await expect(audio).toHaveAttribute("data-audio-paused", "true")
  await surface.getByRole("button", { name: "Mute", exact: true }).click()
  await page.goto("/studio/themes")
  await page
    .getByRole("textbox", { name: "Theme name", exact: true })
    .first()
    .fill("Original and cinematic mix")
  await page
    .getByRole("button", { name: "Create blank", exact: true })
    .first()
    .click()
  const canvas = page.locator(
    ".theme-builder-live-canvas .game-preview-surface",
  )
  await canvas.getByRole("button", { name: /^Preview:/u }).click()
  const stage = canvas.locator(
    "[data-native-application-preview][data-preview-ready=true]",
  )
  await expect(stage.locator("[data-original-razzia-preview]")).toBeVisible({
    timeout: 30_000,
  })
  await page
    .getByRole("main")
    .getByRole("combobox", { name: "Screens", exact: true })
    .selectOption("native.question.cinematic")
  await expect(
    canvas.locator('[data-native-composition="native.question.cinematic"]'),
  ).toBeVisible()
  await expect(stage).toBeVisible()
  await expect(stage.locator("[data-original-razzia-preview]")).toHaveCount(0)
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled()
  await expect(stage).toBeVisible()
  await page.screenshot({
    path: info.outputPath("mixed-razzia-cinematic-template.png"),
    fullPage: true,
  })
  const chapters = canvas.getByRole("slider").first()
  await chapters.focus()
  await page.keyboard.press("Home")
  for (let n = 0; n < 4; n += 1) {
    await page.keyboard.press("ArrowRight")
  }
  await expect(chapters).toHaveValue("4")
  await expect(stage).toBeVisible()
  await expect(stage.getByText("QA_PRIVATE_EDITORIAL_NOTE")).toHaveCount(0)
  await page
    .getByRole("combobox", { name: "Role scope", exact: true })
    .selectOption("manager")
  await expect(stage.getByText("QA_PRIVATE_EDITORIAL_NOTE")).toBeVisible()
  await page
    .getByRole("combobox", { name: "Role scope", exact: true })
    .selectOption("player")
  await expect(stage).toBeVisible()
  await expect(stage.getByText("QA_PRIVATE_EDITORIAL_NOTE")).toHaveCount(0)
  await page.screenshot({
    path: info.outputPath("razzia-player-readonly-results.png"),
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test("original question decorations use the shared clock through pause, seek and teardown", async ({
  page,
}, info) => {
  test.setTimeout(240_000)
  await login(page)
  const { quizId: originalId } = await importApprovedExample(page, true)
  const headers = {
    Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("token"))}`,
  }
  const original = await (
    await page.request.get(`/api/extensions/preview/quizzes/${originalId}`, {
      headers,
    })
  ).json()
  const presets = [
    "none",
    "pulse-bar",
    "shimmer-line",
    "wave-dots",
    "glow-sweep",
    "lottie",
  ]
  const show = {
    ...original.show,
    title: "Private native question decorations",
    cards: presets.map((preset, index) => ({
      ...original.show.cards[0],
      key: `DECORATION_${index}`,
      questionDecoration: {
        enabled: preset !== "none",
        preset,
        ...(preset === "lottie"
          ? { lottieUrl: "/tadazz-show/opening/TADAZZ-Opening-4-5s.json" }
          : {}),
      },
    })),
  }
  const imported = await page.request.post("/api/extensions/import", {
    headers,
    data: show,
  })
  expect(imported.status()).toBe(201)
  const { quizId } = await imported.json()
  await page.goto("/studio/games")
  const surface = page.locator(
    `[data-game-id="${quizId}"] .game-preview-surface`,
  )
  await surface.getByRole("button", { name: /^Preview:/u }).click()
  const chapters = surface.getByRole("slider", {
    name: "Chapters",
    exact: true,
  })
  for (const [index, preset] of presets.entries()) {
    await chapters.focus()
    await page.keyboard.press("Home")
    for (let chapter = 0; chapter < index * 5; chapter += 1) {
      await page.keyboard.press("ArrowRight")
    }
    await expect(chapters).toHaveValue(String(index * 5))
    await expect(chapters).toHaveAttribute("aria-busy", "false")
    const decoration = surface.getByTestId("question-decoration-underline")

    if (preset === "none") {
      await expect(decoration).toHaveCount(0)

      continue
    }

    await expect(decoration).toHaveAttribute("data-tada-underline", preset)

    if (preset === "lottie") {
      await expect(
        decoration.getByTestId("question-decoration-lottie"),
      ).toHaveAttribute("data-lottie-ready", "true", { timeout: 30_000 })
    }

    await surface.getByRole("button", { name: "Play", exact: true }).click()
    await page.waitForTimeout(600)
    await surface.getByRole("button", { name: "Pause", exact: true }).click()
    await expect(
      surface.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled()
    const sample = () =>
      decoration.evaluate((element) => ({
        frames: [...element.querySelectorAll("[data-lottie-frame]")].map(
          (node) => node.getAttribute("data-lottie-frame"),
        ),
        times: element
          .getAnimations({ subtree: true })
          .map((animation) => Number(animation.currentTime)),
      }))
    const paused = await sample()

    if (preset !== "lottie") {
      expect(paused.times.length).toBeGreaterThan(0)
      expect(Math.max(...paused.times)).toBeGreaterThan(100)
    }

    await page.waitForTimeout(350)
    expect(await sample()).toEqual(paused)
    await surface.screenshot({
      path: info.outputPath(`native-decoration-${preset}-paused.png`),
    })
  }
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-native-application-preview]")).toHaveCount(0)
  await expect(page.locator("[data-controlled-underline]")).toHaveCount(0)
})

test("Builder selected screens seek real results and share original readonly lobby and personal-result views", async ({
  page,
}, info) => {
  test.setTimeout(240_000)
  await login(page)
  await importApprovedExample(page, true)
  const gameWrites: string[] = []
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      /\/api\/games(?:\/|$)/u.test(new URL(request.url()).pathname)
    ) {
      gameWrites.push(request.url())
    }
  })
  for (const family of ["razzia-original", "tadazz-classic"]) {
    await page.goto("/studio/themes")
    await page
      .getByRole("combobox", { name: "Theme Builder", exact: true })
      .selectOption(family)
    await page
      .getByRole("button", { name: "Create blank", exact: true })
      .first()
      .click()
    const canvas = page.locator(
      ".theme-builder-live-canvas .game-preview-surface",
    )
    await canvas.getByRole("button", { name: /^Preview:/u }).click()
    await expect(
      canvas.locator(
        "[data-native-application-preview][data-preview-ready=true]",
      ),
    ).toBeVisible({ timeout: 30_000 })
    const screens = page
      .getByRole("main")
      .getByRole("combobox", { name: "Screens", exact: true })
    await screens.selectOption("native.results.grid")
    await expect(
      canvas.locator('[data-native-composition="native.results.grid"]'),
    ).toBeVisible()
    await expect(
      canvas.getByRole("slider", { name: "Chapters", exact: true }),
    ).toHaveValue("4")
    await canvas.screenshot({
      path: info.outputPath(`selected-results-${family}.png`),
    })
    await screens.selectOption("native.lobby.grid")
    await expect(
      canvas.locator('[data-native-composition="native.lobby.grid"]'),
    ).toBeVisible()
    await expect(
      canvas.locator(
        family === "razzia-original"
          ? ".tds-native-room"
          : '[data-testid="tadazz-screen-lobby"]',
      ),
    ).toBeVisible()
    await expect(canvas.locator("svg[data-qr-url]")).toHaveCount(0)
    await expect(canvas.getByTestId("room-dial-number")).toHaveCount(0)
    await expect(canvas.getByRole("slider")).toHaveCount(0)
    await expect(
      canvas.getByRole("button", { name: "Play", exact: true }),
    ).toBeDisabled()
    await canvas.screenshot({
      path: info.outputPath(`readonly-lobby-${family}.png`),
    })
    await screens.selectOption("native.personalResult.grid")
    await expect(
      canvas.locator('[data-native-composition="native.personalResult.grid"]'),
    ).toBeVisible()
    await expect(
      canvas.getByTestId(
        family === "razzia-original"
          ? "native-razzia-player-result"
          : "tadazz-screen-player-result",
      ),
    ).toBeVisible()
    await expect(canvas.getByText("Too bad", { exact: true })).toBeVisible()
    await expect(canvas.getByText("QA_PRIVATE_EDITORIAL_NOTE")).toHaveCount(0)
    await canvas.screenshot({
      path: info.outputPath(`readonly-personal-result-${family}.png`),
    })
    const layout = page
      .getByRole("main")
      .getByRole("combobox", { name: "Layout plan", exact: true })
      .first()
    for (const viewport of ["safe-4-3", "narrow-player"]) {
      await layout.selectOption(viewport)
      await expect(page.locator(".theme-builder-live-canvas")).toHaveAttribute(
        "data-layout",
        viewport,
      )
      await expect(canvas.getByText("Too bad", { exact: true })).toBeVisible()
      expect(
        await canvas.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true)
      await canvas.screenshot({
        path: info.outputPath(
          `readonly-personal-result-${family}-${viewport}.png`,
        ),
      })
    }
    await layout.selectOption("stage-16-9")
    await screens.selectOption("native.question.grid")
    await expect(
      canvas.getByRole("slider", { name: "Chapters", exact: true }),
    ).toHaveValue("0")
    await expect(canvas.getByTestId("reveal-media-image")).toBeVisible()
    await page.getByRole("button", { name: "Save draft", exact: true }).click()
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible()
  }
  expect(gameWrites).toEqual([])
})

test("Creating Worlds keeps two native rounds, ten questions and twenty-second voting after reopen", async ({
  page,
}, info) => {
  test.setTimeout(240_000)
  await login(page)
  const { quizId: originalId } = await importApprovedExample(page)
  const headers = {
    Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("token"))}`,
  }
  const original = await (
    await page.request.get(`/api/extensions/preview/quizzes/${originalId}`, {
      headers,
    })
  ).json()
  // Text-only private QA derivative of the approved ten-question Goldy source.
  // Missing original media is not fabricated or presented as a licensed package.
  const approved = JSON.parse(
    readFileSync(
      "/evidence/approved-content-9156e4ee-7300-49ab-8a27-c883828362a2.json",
      "utf8",
    ),
  )
  const questions = approved.show.cards.filter(
    (card: { kind: string }) => card.kind === "quiz",
  )
  expect(questions).toHaveLength(10)
  const cards = [0, 1].flatMap((round) => [
    {
      key: `ROUND_${round + 1}`,
      kind: "animation",
      preset: round ? "round-two" : "round-one",
      title: `Round ${round + 1}`,
      advance: "manual",
      durationMs: 5000,
    },
    ...Array.from({ length: 5 }, (_, index) => {
      const card = questions[round * 5 + index]

      return {
        key: `Q${String(round * 5 + index + 1).padStart(2, "0")}`,
        kind: "quiz",
        questionType: "single",
        question: card.question,
        answers: card.answers.map((answer: { text: string }) => ({
          text: answer.text,
        })),
        correctAnswers: card.correctAnswers,
        timeSeconds: 20,
        cooldownSeconds: 3,
      }
    }),
  ])
  const show = {
    ...original.show,
    title: "Private Creating Worlds regression",
    defaults: {
      ...original.show.defaults,
      showTheme: { id: "tadazz-classic", version: "1.0.0", overrides: {} },
    },
    cards,
  }
  const imported = await page.request.post("/api/extensions/import", {
    headers,
    data: show,
  })
  expect(imported.status()).toBe(201)
  const { quizId } = await imported.json()
  await page.goto(`/manager/quizz/${quizId}`)
  await expect(page.getByTestId("editor-question-card-9")).toBeVisible()
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/studio\/games$/u)
  const reopened = await (
    await page.request.get(`/api/extensions/preview/quizzes/${quizId}`, {
      headers,
    })
  ).json()
  expect(reopened.show.cards).toHaveLength(12)
  expect(
    reopened.show.cards
      .filter((card: { kind: string }) => card.kind === "quiz")
      .every((card: { answers: unknown[] }) => card.answers.length === 5),
  ).toBe(true)
  expect(
    reopened.show.cards.filter(
      (card: { kind: string }) => card.kind === "quiz",
    ),
  ).toHaveLength(10)
  expect(
    reopened.show.cards
      .filter((card: { kind: string }) => card.kind === "animation")
      .map((card: { preset: string }) => card.preset),
  ).toEqual(["round-one", "round-two"])
  const surface = page.locator(
    `[data-game-id="${quizId}"] .game-preview-surface`,
  )
  await surface.getByRole("button", { name: /^Preview:/u }).click()
  const range = surface.getByRole("slider", { name: "Chapters", exact: true })
  for (const round of ["round-one", "round-two"]) {
    const index = reopened.chapters.findIndex(
      (chapter: { cardIndex: number }) =>
        reopened.show.cards[chapter.cardIndex].preset === round,
    )
    await range.focus()
    await page.keyboard.press("Home")
    for (let chapterIndex = 0; chapterIndex < index; chapterIndex += 1) {
      await page.keyboard.press("ArrowRight")
    }
    await expect(range).toHaveAttribute("aria-busy", "false")
    await expect(
      surface.locator(`[data-full-show-scene="${round}"]`),
    ).toBeVisible()
    await surface.screenshot({
      path: info.outputPath(`creating-worlds-${round}.png`),
    })
  }
  const voting = reopened.chapters.findIndex(
    (chapter: { phase: string }) => chapter.phase === "voting",
  )
  await range.focus()
  await page.keyboard.press("Home")
  for (let index = 0; index < voting; index += 1) {
    await page.keyboard.press("ArrowRight")
  }
  await expect(range).toHaveAttribute("aria-busy", "false")
  await expect(surface.getByTestId("tadazz-timer").first()).toContainText("20")
  await expect(
    surface.getByText(questions[0].answers[4].text, { exact: true }).first(),
  ).toBeVisible()
  await surface.screenshot({
    path: info.outputPath("creating-worlds-voting-20.png"),
  })
  await page.keyboard.press("Escape")
  expect(
    (
      await (
        await page.request.get(
          `/api/extensions/preview/quizzes/${originalId}`,
          { headers },
        )
      ).json()
    ).source.immutableRevision,
  ).toBe(original.source.immutableRevision)
})

test("manual image effects use native reveal in both themes and reset on chapter seek", async ({
  page,
}, info) => {
  test.setTimeout(300_000)
  await login(page)
  const { quizId: originalId } = await importApprovedExample(page, true)
  const headers = {
    Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("token"))}`,
  }
  const original = await (
    await page.request.get(`/api/extensions/preview/quizzes/${originalId}`, {
      headers,
    })
  ).json()
  for (const family of ["tadazz-classic", "razzia-original"]) {
    for (const effect of ["blur", "pixelate", "tiles", "zoom"]) {
      const show = {
        ...original.show,
        title: `Manual ${family} ${effect}`,
        defaults: {
          ...original.show.defaults,
          showTheme: { id: family, version: "1.0.0", overrides: {} },
        },
        cards: original.show.cards.map(
          (card: { key: string }, index: number) =>
            index
              ? card
              : {
                  ...card,
                  reveal: {
                    effect,
                    durationMs: 4000,
                    trigger: "manual",
                    audience: "all",
                  },
                },
        ),
      }
      const imported = await page.request.post("/api/extensions/import", {
        headers,
        data: show,
      })
      expect(imported.status()).toBe(201)
      const { quizId } = await imported.json()
      await page.goto("/studio/games")
      const surface = page.locator(
        `[data-game-id="${quizId}"] .game-preview-surface`,
      )
      await surface.getByRole("button", { name: /^Preview:/u }).click()
      const image = surface.getByTestId("reveal-media-container")
      await expect(image).toHaveAttribute("data-effect", effect)
      await expect(image).toHaveAttribute("data-revealed", "false")
      await expect
        .poll(() =>
          image
            .getByTestId("reveal-media-image")
            .evaluate((node: HTMLImageElement) => node.naturalWidth),
        )
        .toBe(600)
      await surface
        .getByRole("button", { name: "Show revealed image", exact: true })
        .click()
      await expect(image).toHaveAttribute("data-revealed", "true")
      await surface
        .getByRole("button", { name: "Reset reveal", exact: true })
        .click()
      await expect(image).toHaveAttribute("data-revealed", "false")
      const chapters = surface.getByRole("slider", {
        name: "Chapters",
        exact: true,
      })
      await chapters.focus()
      await page.keyboard.press("ArrowRight")
      await expect(chapters).toHaveAttribute("aria-busy", "false")
      await expect(image).toHaveAttribute("data-revealed", "false")
      await surface.screenshot({
        path: info.outputPath(`native-manual-${family}-${effect}.png`),
      })
      await page.keyboard.press("Escape")
    }
  }
  expect(
    (
      await (
        await page.request.get(
          `/api/extensions/preview/quizzes/${originalId}`,
          { headers },
        )
      ).json()
    ).source.immutableRevision,
  ).toBe(original.source.immutableRevision)
})

test("Builder auditions all 16 audio events through one native owner with real decoding", async ({
  page,
}, info) => {
  test.setTimeout(300_000)
  await page.addInitScript(() => {
    const created: HTMLAudioElement[] = []
    Object.assign(window, { phase2AudioElements: created })
    const Original = window.Audio
    window.Audio = new Proxy(Original, {
      construct(target, args) {
        const audio = Reflect.construct(target, args) as HTMLAudioElement
        created.push(audio)

        return audio
      },
    })
  })
  await login(page)
  await importApprovedExample(page)
  await page.goto("/studio/themes")
  await page
    .getByRole("combobox", { name: "Theme Builder", exact: true })
    .selectOption("tadazz-classic")
  await page
    .getByRole("button", { name: "Create blank", exact: true })
    .first()
    .click()
  const surface = page.locator(
    ".theme-builder-live-canvas .game-preview-surface",
  )
  await surface.getByRole("button", { name: /^Preview:/u }).click()
  await expect(
    surface.locator(
      "[data-native-application-preview][data-preview-ready=true]",
    ),
  ).toBeVisible({ timeout: 30_000 })
  await surface.locator(".game-preview-audition summary").click()
  const events = surface.getByRole("combobox", { name: "Audio", exact: true })
  const values = await events
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    )
  expect(values).toHaveLength(16)
  const measured: unknown[] = []
  for (const event of values) {
    await events.selectOption(event)
    await surface.getByRole("button", { name: "Listen", exact: true }).click()
    const state = surface.locator(`[data-preview-audio-event="${event}"]`)
    await expect(state).toBeAttached()
    const silent =
      (await state.getAttribute("data-preview-audio-silent")) === "true"
    const player = surface.getByTestId("audio-cue-player-state")

    if (silent) {
      await expect(player).toHaveAttribute("data-audio-url", "")
    } else {
      await expect(player).not.toHaveAttribute("data-audio-url", "")
      const unlock = surface.getByTestId("preview-unlock-audio")

      if (await unlock.isVisible()) {
        await unlock.click()
      }

      const url = (await player.getAttribute("data-audio-url"))!
      await expect
        .poll(
          () =>
            page.evaluate((assetUrl) => {
              const list = (
                window as typeof window & {
                  phase2AudioElements: HTMLAudioElement[]
                }
              ).phase2AudioElements

              return list.some(
                (audio) =>
                  audio.src.endsWith(assetUrl) &&
                  audio.readyState >= 2 &&
                  audio.played.length > 0,
              )
            }, url),
          { timeout: 15_000 },
        )
        .toBe(true)
      measured.push({ event, url, decodedAndPlayed: true })
    }

    if (silent) {
      measured.push({ event, explicitSilence: true })
    }

    await surface
      .getByRole("button", { name: "Stop audio", exact: true })
      .click()
    await expect(player).toHaveAttribute("data-audio-paused", "true")
  }
  writeFileSync(
    info.outputPath("native-audio-16-events.json"),
    JSON.stringify(measured, null, 2),
  )
  await page.screenshot({
    path: info.outputPath("builder-native-audio-audition.png"),
    fullPage: true,
  })
  await page.keyboard.press("Escape")
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & { phase2AudioElements: HTMLAudioElement[] }
        ).phase2AudioElements.every((audio) => audio.paused),
      ),
    )
    .toBe(true)
})

test("authorized Goldy content runs the native stage inline; scrub and repeated teardown use one stage", async ({
  page,
}, info) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  const runtimeRequests: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/api/extensions/preview/runtime/")) {
      runtimeRequests.push(request.url())
    }
  })
  page.on("pageerror", (error) => errors.push(error.message))
  await login(page)
  const { quizId } = await importApprovedExample(page)
  await page.goto("/studio/games")
  const surface = page.locator(
    `[data-game-id="${quizId}"] .game-preview-surface`,
  )
  await expect(surface).toBeVisible()
  expect(await page.locator("[data-native-application-preview]").count()).toBe(
    0,
  )
  const trigger = surface.getByRole("button", { name: /^Preview:/u })
  const native = surface.locator(
    "[data-native-application-preview][data-preview-ready=true]",
  )
  await trigger.click()
  await expect(native).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("[data-native-application-preview]")).toHaveCount(1)
  const range = surface.getByRole("slider").first()
  await range.focus()
  await page.keyboard.press("End")
  await expect(range).toHaveValue("19")
  await expect(native).toBeVisible()
  await page.keyboard.press("Home")
  await expect(range).toHaveValue("0")
  await expect(native).toBeVisible()
  for (let n = 0; n < 20; n += 1) {
    await page.keyboard.press(n % 2 ? "Home" : "End")
  }
  await page.keyboard.press("ArrowRight")
  await expect(range).toHaveValue("1")
  await expect(native).toBeVisible()
  await page.screenshot({
    path: info.outputPath("inline-authorized-native-answers.png"),
  })
  await range.focus()
  await page.keyboard.press("ArrowRight")
  await expect(range).toHaveValue("2")
  await expect(native).toBeVisible()
  await native.evaluate((element) => {
    element.setAttribute("data-pause-identity", "preserved")
  })
  const timer = native.locator(".countdown-value")
  await expect(timer).toBeVisible()
  await surface.getByRole("button", { name: "Play", exact: true }).click()
  await page.waitForTimeout(1200)
  await surface.getByRole("button", { name: "Pause", exact: true }).click()
  const paused = await timer.textContent()
  await page.waitForTimeout(1000)
  await expect(timer).toHaveText(paused!)
  await expect(native).toHaveAttribute("data-pause-identity", "preserved")
  await surface.getByRole("button", { name: "Play", exact: true }).click()
  await page.waitForTimeout(1200)
  await surface.getByRole("button", { name: "Pause", exact: true }).click()
  expect(Number(await timer.textContent())).toBeLessThan(Number(paused))
  await expect(native).toHaveAttribute("data-pause-identity", "preserved")
  await page.keyboard.press("Escape")
  for (let n = 0; n < 24; n += 1) {
    await trigger.click()
    await expect(native).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-native-application-preview]")).toHaveCount(
      0,
    )
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await trigger.click()
  await expect(native).toBeVisible()
  await page.screenshot({
    path: info.outputPath("inline-authorized-native-mobile.png"),
  })
  await page.goto("/studio/themes")
  expect(await page.locator("[data-native-application-preview]").count()).toBe(
    0,
  )
  expect(
    runtimeRequests.filter((url) => url.endsWith("renderer.mjs")),
  ).toHaveLength(1)
  expect(
    runtimeRequests.filter((url) => url.endsWith("renderer.css")),
  ).toHaveLength(1)
  expect(errors).toEqual([])
})

test("Builder edits the real composition canvas and reopens its saved native graph", async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await login(page)
  const { quizId } = await importApprovedExample(page)
  await page.goto("/studio/themes")
  await expect(
    page.getByRole("combobox", { name: "Preview game", exact: true }),
  ).toHaveValue(quizId)
  await page
    .getByRole("combobox", { name: "Theme Builder", exact: true })
    .selectOption("tadazz-classic")
  await page
    .getByRole("textbox", { name: "Theme name", exact: true })
    .first()
    .fill("Native composition canvas")
  await page
    .getByRole("button", { name: "Create blank", exact: true })
    .first()
    .click()
  const surface = page.locator(
    ".theme-builder-live-canvas .game-preview-surface",
  )
  await surface.getByRole("button", { name: /^Preview:/u }).click()
  const native = surface.locator(
    "[data-native-application-preview][data-preview-ready=true]",
  )
  await expect(native).toBeVisible({ timeout: 30_000 })
  await page
    .getByRole("main")
    .getByRole("combobox", { name: "Screens", exact: true })
    .selectOption("native.question.grid")
  const composition = surface.locator(
    '[data-native-composition="native.question.grid"]',
  )
  await expect(composition).toBeVisible()
  await page
    .getByRole("combobox", { name: "Spacing", exact: true })
    .selectOption("large")
  await expect(composition).toHaveCSS("gap", "32px")
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled()
  await expect(native).toBeVisible()
  await expect(composition).toHaveCSS("gap", "32px")
  await page.screenshot({
    path: info.outputPath("builder-native-composition-desktop.png"),
    fullPage: true,
  })
  await page.reload()
  const drafts = page
    .getByRole("combobox", { name: "Screens", exact: true })
    .first()
  const option = drafts.locator("option", {
    hasText: "Native composition canvas",
  })
  await expect(option).toHaveCount(1)
  await drafts.selectOption(await option.getAttribute("value"))
  await surface.getByRole("button", { name: /^Preview:/u }).click()
  await expect(native).toBeVisible({ timeout: 30_000 })
  await expect(composition).toHaveCSS("gap", "32px")
  await page
    .getByRole("combobox", { name: "Layout plan", exact: true })
    .first()
    .selectOption("safe-4-3")
  const canvas = page.locator(".theme-builder-live-canvas")
  let bounds = (await canvas.boundingBox())!
  expect(bounds.width / bounds.height).toBeCloseTo(4 / 3, 1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole("combobox", { name: "Layout plan", exact: true })
    .first()
    .selectOption("narrow-player")
  bounds = (await canvas.boundingBox())!
  expect(bounds.width).toBeLessThanOrEqual(390)
  expect(bounds.width / bounds.height).toBeCloseTo(3 / 4, 1)
  await expect(native).toBeVisible()
  await page.screenshot({
    path: info.outputPath("builder-native-composition-mobile.png"),
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test("full mixed authored show preserves real media clocks, Lottie and chapter order after export and reopen", async ({
  page,
}, info) => {
  test.setTimeout(300_000)
  await login(page)
  const { quizId: originalId } = await importApprovedExample(page)
  const headers = {
    Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("token"))}`,
  }
  const original = await (
    await page.request.get(`/api/extensions/preview/quizzes/${originalId}`, {
      headers,
    })
  ).json()
  const video =
    "/tadazz-show/opening/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4"
  const lottie = "/tadazz-show/opening/TADAZZ-Opening-4-5s.json"
  const audio = "/sounds/answersMusic.mp3"
  const manual = { advance: "manual", durationMs: 5000 }
  // Explicit derived QA copy: approved source questions + existing native assets.
  const show = {
    ...original.show,
    title: `Mixed native media ${crypto.randomUUID().slice(0, 8)}`,
    defaults: {
      ...original.show.defaults,
      showTheme: { id: "tadazz-classic", version: "1.0.0", overrides: {} },
    },
    cards: [
      {
        key: "QA_OPEN",
        kind: "opening",
        title: "Opening media",
        mediaType: "video",
        mediaUrl: video,
        ...manual,
      },
      original.show.cards[0],
      {
        key: "QA_SURVEY",
        ...original.show.cards[1],
        kind: "survey",
        correctAnswers: [],
      },
      {
        key: "QA_TRANSITION",
        kind: "transition",
        title: "Between rounds",
        ...manual,
      },
      {
        key: "QA_ANIMATION",
        kind: "animation",
        title: "Native Lottie",
        preset: "spotlight",
        lottieUrl: lottie,
        ...manual,
      },
      {
        key: "QA_VIDEO",
        kind: "media",
        title: "Video card",
        mediaType: "video",
        mediaUrl: video,
        stageLayout: "card",
        ...manual,
      },
      {
        key: "QA_AUDIO",
        kind: "media",
        title: "Audio card",
        mediaType: "audio",
        mediaUrl: audio,
        ...manual,
      },
      {
        key: "QA_IMAGE",
        kind: "media",
        title: "Image card",
        mediaType: "image",
        mediaUrl: original.assets[0].url,
        ...manual,
      },
      ...["leaderboard", "interimResults", "answerRecap"].map((kind) => ({
        key: `QA_${kind}`,
        kind,
        title: kind,
        ...manual,
      })),
      {
        key: "QA_COUNTDOWN",
        kind: "countdown",
        title: "Countdown",
        durationSeconds: 10,
        advance: "manual",
      },
      ...original.show.cards.slice(2),
      { key: "QA_CLOSE", kind: "closing", title: "Closing", ...manual },
    ],
  }
  const imported = await page.request.post("/api/extensions/import", {
    headers,
    data: show,
  })
  expect(imported.status()).toBe(201)
  const { quizId } = await imported.json()
  const exported = await page.request.get(`/api/extensions/export/${quizId}`, {
    headers,
  })
  expect(exported.status()).toBe(200)
  const exportedAgain = await page.request.post("/api/extensions/import", {
    headers,
    data: await exported.json(),
  })
  expect(exportedAgain.status()).toBe(201)
  const projected = await (
    await page.request.get(`/api/extensions/preview/quizzes/${quizId}`, {
      headers,
    })
  ).json()
  expect(
    projected.show.cards.map((card: { kind: string }) => card.kind),
  ).toEqual(show.cards.map((card: { kind: string }) => card.kind))
  await page.goto(`/manager/quizz/${quizId}`)
  await expect(page.getByPlaceholder("Quizz title...")).toHaveValue(show.title)
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/studio\/games$/u)
  const surface = page.locator(
    `[data-game-id="${quizId}"] .game-preview-surface`,
  )
  await surface.getByRole("button", { name: /^Preview:/u }).click()
  const native = surface.locator(
    "[data-native-application-preview][data-preview-ready=true]",
  )
  await expect(native).toBeVisible({ timeout: 30_000 })
  const range = surface.getByRole("slider", { name: "Chapters", exact: true })
  let cursor = 0
  for (const [index, chapter] of projected.chapters.entries()) {
    if (
      index &&
      projected.chapters[index - 1].authoredKey === chapter.authoredKey
    ) {
      continue
    }

    await range.focus()
    for (; cursor < index; cursor += 1) {
      await page.keyboard.press("ArrowRight")
    }
    await expect(range).toHaveValue(String(index))
    await expect(range).toHaveAttribute("aria-busy", "false")
    await expect(native).toBeVisible()

    if (["opening", "media"].includes(chapter.phase)) {
      const media = native.locator("video, audio").first()
      const currentCard = projected.show.cards[chapter.cardIndex]

      if (
        currentCard.mediaType === "video" ||
        currentCard.mediaType === "audio"
      ) {
        await expect(media).toHaveCount(1)
        await expect
          .poll(() =>
            media.evaluate((element: HTMLMediaElement) => element.readyState),
          )
          .toBeGreaterThanOrEqual(2)
        expect(
          await media.evaluate((element: HTMLMediaElement) => element.paused),
        ).toBe(true)
        await surface.getByRole("button", { name: "Play", exact: true }).click()
        await expect
          .poll(() =>
            media.evaluate((element: HTMLMediaElement) => element.currentTime),
          )
          .toBeGreaterThan(0.1)
        await surface
          .getByRole("button", { name: "Pause", exact: true })
          .click()
        await expect
          .poll(() =>
            media.evaluate((element: HTMLMediaElement) => element.paused),
          )
          .toBe(true)
        const mediaSeek = surface.getByRole("slider", {
          name: "Seek within this video",
          exact: true,
        })
        await expect(mediaSeek).toBeVisible()
        await mediaSeek.focus()
        await page.keyboard.press("Home")
        await page.keyboard.press("ArrowRight")
        await expect(range).toHaveAttribute("aria-busy", "false")
      }
    }

    if (chapter.phase === "animation") {
      await expect(native.getByTestId("scene-lottie-player")).toHaveAttribute(
        "data-lottie-ready",
        "true",
        { timeout: 30_000 },
      )
    }

    await surface.screenshot({
      path: info.outputPath(`mixed-${index}-${chapter.phase}.png`),
    })
  }
  await page.keyboard.press("Escape")
  expect(
    (
      await (
        await page.request.get(
          `/api/extensions/preview/quizzes/${originalId}`,
          { headers },
        )
      ).json()
    ).source.immutableRevision,
  ).toBe(original.source.immutableRevision)
})

test("both native themes render all eight locales at desktop and mobile with reduced motion", async ({
  page,
}, info) => {
  test.setTimeout(300_000)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await login(page)
  const razzia = await importApprovedExample(page, true),
    classic = await importApprovedExample(page)
  await page.goto("/studio/games")
  for (const locale of [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "ja",
    "tr",
    "vi",
  ] as const) {
    await page.evaluate(
      (language) => localStorage.setItem("i18nextLng", language),
      locale,
    )
    await page.reload()
    for (const [family, quizId] of [
      ["razzia", razzia.quizId],
      ["classic", classic.quizId],
    ]) {
      const surface = page.locator(
        `[data-game-id="${quizId}"] .game-preview-surface`,
      )
      await expect(surface.locator(".game-preview-trigger")).toContainText(
        previewResources[locale].preview,
      )
      await surface.locator(".game-preview-trigger").click()
      const native = surface.locator(
        "[data-native-application-preview][data-preview-ready=true]",
      )
      await expect(native).toBeVisible({ timeout: 30_000 })
      await expect(surface.locator(".game-preview-overlay")).toHaveAttribute(
        "aria-busy",
        "false",
      )
      await expect(
        surface.locator(`[data-preview-locale="${locale}"]`),
      ).toHaveAttribute("data-preview-reduced-motion", "true")
      await expect(
        surface.getByRole("slider", {
          name: previewResources[locale].chapters,
          exact: true,
        }),
      ).toBeVisible()
      expect(await native.textContent()).not.toMatch(
        /(?:extensions:|game:|tadazzShow\.)[a-zA-Z]/u,
      )
      for (const width of [1366, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 768 })
        await expect(native).toBeVisible()
        const bounds = (await surface.boundingBox())!
        expect(bounds.width).toBeLessThanOrEqual(width)
        expect(
          await surface.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        ).toBe(true)
        await surface.screenshot({
          path: info.outputPath(
            `${locale}-${family}-${width}-reduced-motion.png`,
          ),
        })
      }
      await page.keyboard.press("Escape")
      await expect(
        page.locator("[data-native-application-preview]"),
      ).toHaveCount(0)
    }
  }
})

test("real account isolation, guest denial and logout revoke an active private preview", async ({
  page,
  browser,
}) => {
  await login(page)
  const { quizId } = await importApprovedExample(page)
  const tokenA = await page.evaluate(() => localStorage.getItem("token"))
  const path = `/api/extensions/preview/quizzes/${quizId}`
  const otherContext = await browser.newContext()

  try {
    const other = await otherContext.newPage()
    await login(other)
    const tokenB = await other.evaluate(() => localStorage.getItem("token"))
    const foreign = await other.request.get(path, {
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    expect(foreign.status()).toBe(404)
    expect(await foreign.json()).toEqual({ error: "Preview unavailable" })
    expect((await other.request.get(path)).status()).toBe(401)
    const guestResponse = await other.request.post("/api/auth/session", {
      data: {},
    })
    expect(guestResponse.status()).toBe(200)
    const guest = await guestResponse.json()
    expect(
      (
        await other.request.get(path, {
          headers: { Authorization: `Bearer ${guest.token}` },
        })
      ).status(),
    ).toBe(401)
    await page.goto("/studio/games")
    const surface = page.locator(
      `[data-game-id="${quizId}"] .game-preview-surface`,
    )
    await surface.getByRole("button", { name: /^Preview:/u }).click()
    await expect(
      surface.locator(
        "[data-native-application-preview][data-preview-ready=true]",
      ),
    ).toBeVisible({ timeout: 30_000 })
    expect(
      (
        await page.request.post("/api/auth/logout", {
          headers: { Authorization: `Bearer ${tokenA}` },
        })
      ).status(),
    ).toBe(200)
    const range = surface.getByRole("slider").first()
    await range.focus()
    await page.keyboard.press("End")
    await expect(page.locator("[data-native-application-preview]")).toHaveCount(
      0,
    )
    expect(
      (
        await page.request.get(path, {
          headers: { Authorization: `Bearer ${tokenA}` },
        })
      ).status(),
    ).toBe(401)
  } finally {
    await otherContext.close()
  }
})

test("Builder uploads account media, saves its real background and denies cross-account binding", async ({
  page,
  browser,
}, info) => {
  await login(page)
  await importApprovedExample(page)
  await page.goto("/studio/themes")
  await page
    .getByRole("combobox", { name: "Theme Builder", exact: true })
    .selectOption("tadazz-classic")
  await page
    .getByRole("textbox", { name: "Theme name", exact: true })
    .first()
    .fill("Owned media theme")
  await page
    .getByRole("button", { name: "Create blank", exact: true })
    .first()
    .click()
  const surface = page.locator(
    ".theme-builder-live-canvas .game-preview-surface",
  )
  await surface.getByRole("button", { name: /^Preview:/u }).click()
  const stage = surface.locator(
    "[data-native-application-preview][data-preview-ready=true]",
  )
  await expect(stage).toBeVisible({ timeout: 30_000 })
  const library = page.getByTestId("builder-media-library")
  await library.locator("summary").click()
  const uploaded = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/media") &&
      response.request().method() === "POST",
  )
  await library.getByLabel("Upload media", { exact: true }).setInputFiles({
    name: "theme-panel-upload.png",
    mimeType: "image/png",
    buffer: readFileSync("/input/approved-placeholder.png"),
  })
  const response = await uploaded
  expect(response.status()).toBe(201)
  const asset = await response.json()
  expect(
    await page.evaluate(async (url) => {
      const image = new Image()
      image.src = url
      await image.decode()

      return [image.naturalWidth, image.naturalHeight]
    }, asset.url),
  ).toEqual([600, 400])
  await library.getByRole("button", { name: asset.name, exact: true }).click()
  await expect(stage).toBeVisible()
  await expect
    .poll(() =>
      stage.evaluate(
        (element, url) =>
          [...element.querySelectorAll<HTMLElement>("*")].some((node) =>
            getComputedStyle(node).backgroundImage.includes(url),
          ),
        asset.url,
      ),
    )
    .toBe(true)
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled()
  await page.screenshot({
    path: info.outputPath("builder-owned-media-background.png"),
    fullPage: true,
  })
  const context = await browser.newContext()

  try {
    const other = await context.newPage()
    await login(other)
    const token = await other.evaluate(() => localStorage.getItem("token"))
    const forbidden = await other.request.post(
      "/api/extensions/preview/assets",
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { urls: [asset.url] },
      },
    )
    expect(forbidden.status()).toBe(422)
    expect(await forbidden.json()).toEqual({ error: "Preview unavailable" })
  } finally {
    await context.close()
  }

  await page.reload()
  const drafts = page
    .getByRole("combobox", { name: "Screens", exact: true })
    .first()
  await drafts.selectOption(
    await drafts
      .locator("option", { hasText: "Owned media theme" })
      .getAttribute("value"),
  )
  await surface.getByRole("button", { name: /^Preview:/u }).click()
  await expect(stage).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(() =>
      stage.evaluate(
        (element, url) =>
          [...element.querySelectorAll<HTMLElement>("*")].some((node) =>
            getComputedStyle(node).backgroundImage.includes(url),
          ),
        asset.url,
      ),
    )
    .toBe(true)
})

test("real account Builder draft survives reopen; immutable content version restores with CAS", async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await login(page)
  await page.goto("/studio/themes")
  const create = page
    .getByRole("button", { name: "Create blank", exact: true })
    .first()
  await expect(create).toBeEnabled()
  await page
    .getByRole("textbox", { name: "Theme name", exact: true })
    .first()
    .fill("Phase 2 authored theme")
  await create.click()
  const editorName = page
    .getByRole("textbox", { name: "Theme name", exact: true })
    .last()
  await expect(editorName).toHaveValue("Phase 2 authored theme")
  const save = page.getByRole("button", { name: "Save draft", exact: true })
  await save.click()
  await expect(save).toBeDisabled()
  await page.getByRole("button", { name: "Save version", exact: true }).click()
  await expect(
    page.getByText(
      "Authoring version saved. Runtime publication requires review.",
      { exact: true },
    ),
  ).toBeVisible()
  await editorName.fill("Changed after version")
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(editorName).toHaveValue("Phase 2 authored theme")
  await page.getByRole("button", { name: "Redo", exact: true }).click()
  await expect(editorName).toHaveValue("Changed after version")
  await save.click()
  await expect(save).toBeDisabled()
  await page
    .getByRole("button", { name: "Restore version", exact: true })
    .click()
  await expect(editorName).toHaveValue("Phase 2 authored theme")
  await expect(save).toBeDisabled()
  await page.reload()
  const select = page
    .getByRole("combobox", { name: "Screens", exact: true })
    .first()
  await expect(
    select.locator("option", { hasText: "Phase 2 authored theme" }),
  ).toHaveCount(1)
  const id = await select
    .locator("option", { hasText: "Phase 2 authored theme" })
    .getAttribute("value")
  await select.selectOption(id)
  await expect(editorName).toHaveValue("Phase 2 authored theme")
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled()
  await page.screenshot({
    path: info.outputPath("builder-real-account.png"),
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test("authorized workspace publication rolls back and archives immutable versions; shared author cannot publish", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(300_000)
  await page.addInitScript(() => {
    const events: unknown[] = JSON.parse(
        sessionStorage.getItem("phase2-publication-input-events") ?? "[]",
      ),
      ids = new WeakMap<Element, number>()
    let nextId = 0
    Object.assign(window, { phase2PublicationInputEvents: events })
    const record = (input: HTMLInputElement, kind: string, extra?: unknown) => {
      if (!input.closest('[data-testid="builder-publication"]')) {
        return
      }

      if (!ids.has(input)) {
        ids.set(input, (nextId += 1))
      }

      events.push({
        kind,
        id: ids.get(input),
        value: input.value,
        disabled: input.disabled,
        at: performance.now(),
        path: location.pathname,
        extra,
      })

      if (events.length > 150) {
        events.shift()
      }

      sessionStorage.setItem(
        "phase2-publication-input-events",
        JSON.stringify(events),
      )
    }
    for (const type of ["input", "change", "focusin", "focusout"]) {
      document.addEventListener(
        type,
        (event) => {
          if (event.target instanceof HTMLInputElement) {
            record(event.target, type)
          }
        },
        true,
      )
    }
    const original = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!
    Object.defineProperty(HTMLInputElement.prototype, "value", {
      ...original,
      set(value: string) {
        original.set!.call(this, value)
        record(
          this as HTMLInputElement,
          "set-value",
          new Error().stack?.split("\n").slice(1, 4).join("\n"),
        )
      },
    })
  })
  const owner = await loginWorkspaceFixture(page, "publisher")
  const { quizId } = await importApprovedExample(page, true)
  const token = await page.evaluate(() => localStorage.getItem("token"))
  const headers = { Authorization: `Bearer ${token}` }
  await page.goto("/studio/themes")
  await page
    .getByRole("combobox", { name: "Preview game", exact: true })
    .selectOption(quizId)
  await page
    .getByRole("combobox", { name: "Theme Builder", exact: true })
    .selectOption("tadazz-classic")
  const title = `Published composition ${crypto.randomUUID().slice(0, 8)}`
  await page
    .getByRole("textbox", { name: "Theme name", exact: true })
    .first()
    .fill(title)
  await page
    .getByRole("button", { name: "Create blank", exact: true })
    .first()
    .click()
  const cardScope = page.getByRole("combobox", {
    name: "Card scope",
    exact: true,
  })
  await expect(cardScope.locator("option")).toHaveCount(5)
  await cardScope.selectOption({ index: 1 })
  await page
    .getByRole("main")
    .getByRole("combobox", { name: "Screens", exact: true })
    .selectOption("native.question.grid")
  await page.getByRole("button", { name: "Save draft", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled()
  const publication = page.getByTestId("builder-publication")
  await publication
    .getByRole("button", { name: "Publish", exact: true })
    .click()
  await expect(publication.getByRole("status")).toHaveText("Published")
  const list = await page.request.get(
    `/api/themes/builder/${owner.id}/publications`,
    { headers },
  )
  expect(list.status()).toBe(200)
  const item = (await list.json()).publications.find(
    (entry: { name: string }) => entry.name === title,
  )
  expect(item.version).toBe("1.0.0")
  const base = `/api/themes/builder/${owner.id}/documents/${item.id}`
  const first = await (
    await page.request.get(`${base}/published/1.0.0`, { headers })
  ).json()
  expect(
    first.document.registry.templates.find(
      (t: { id: string }) => t.id === "native.question.grid",
    ).nodes,
  ).toHaveLength(3)
  expect(first.admission.kind).toBe("first-party-composition")
  expect(first.admission.rendererBuildSha256).toMatch(/^[a-f0-9]{64}$/u)
  const roomContext = await browser.newContext(),
    playerContext = await browser.newContext()
  const display = await roomContext.newPage(),
    player = await playerContext.newPage(),
    host = await page.context().newPage()

  try {
    await page.goto(`/manager/quizz/${quizId}`)
    await page.getByTestId("studio-tab-settings").click()
    const themeSelect = page.getByRole("combobox", {
      name: "Published theme",
      exact: true,
    })
    await themeSelect.click()
    await page
      .getByRole("option", { name: `${title} · 1.0.0`, exact: true })
      .click()
    await expect(themeSelect).toContainText(`${title} · 1.0.0`)
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    const draftPreview = page.getByTestId("editor-native-preview")
    await draftPreview.getByRole("button", { name: /^Preview:/u }).click()
    await expect(
      draftPreview.locator('[data-native-composition="native.question.grid"]'),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      draftPreview.locator(
        "[data-native-application-preview][data-preview-ready=true]",
      ),
    ).toBeVisible()
    await expect(draftPreview.locator(".game-preview-overlay")).toHaveAttribute(
      "aria-busy",
      "false",
    )
    await expect(
      draftPreview.getByText("What is good answer ?", { exact: true }),
    ).toBeVisible()
    await expect
      .poll(() =>
        draftPreview
          .getByTestId("tadazz-question-media")
          .locator("img")
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(600)
    await page.screenshot({
      path: info.outputPath("original-editor-unsaved-native-preview.png"),
      fullPage: true,
    })
    await page.keyboard.press("Escape")
    const beforeSave = await (
      await page.request.get(`/api/extensions/quizzes/${quizId}`, { headers })
    ).json()
    expect(beforeSave.extras.defaults.showComposition).toBeUndefined()
    await page.getByTestId("editor-save-btn").click()
    await expect(page).toHaveURL(/\/studio\/games$/u)
    await page.goto(`/manager/quizz/${quizId}`)
    await page.getByTestId("studio-tab-settings").click()
    await expect(themeSelect).toContainText(`${title} · 1.0.0`)
    await page.screenshot({
      path: info.outputPath("original-editor-pinned-composition.png"),
      fullPage: true,
    })
    const savedGame = await (
      await page.request.get(`/api/extensions/quizzes/${quizId}`, { headers })
    ).json()
    expect(savedGame.extras.defaults.showComposition).toMatchObject({
      documentId: item.id,
      version: "1.0.0",
      digest: first.digest,
    })
    expect(first.document.content.composition.scopes[0].scopeId).toBe(
      savedGame.extras.questionIds[0],
    )
    await page.getByTestId("studio-tab-questions").click()
    const pinnedCard = page.getByTestId("editor-question-card-0")
    await pinnedCard.hover()
    await pinnedCard
      .getByRole("button", { name: "Duplicate question", exact: true })
      .click()
    await page.getByTestId("editor-save-btn").click()
    await expect(page).toHaveURL(/\/studio\/games$/u)
    const duplicated = await (
      await page.request.get(`/api/extensions/quizzes/${quizId}`, { headers })
    ).json()
    expect(duplicated.extras.questionIds).toHaveLength(5)
    expect(
      duplicated.extras.defaults.showCompositionScopeAliases[
        duplicated.extras.questionIds[1]
      ],
    ).toBe(savedGame.extras.questionIds[0])
    const copyResponse = await page.request.post("/api/extensions/import", {
      headers,
      data: await (
        await page.request.get(`/api/extensions/export/${quizId}`, { headers })
      ).json(),
    })
    expect(copyResponse.status()).toBe(201)
    const { quizId: copiedId } = await copyResponse.json()
    const copied = await (
      await page.request.get(`/api/extensions/preview/quizzes/${copiedId}`, {
        headers,
      })
    ).json()
    expect(copied.scopeIds.Q01).toBe(savedGame.extras.questionIds[0])
    await expect(page.locator(`[data-game-id="${quizId}"]`)).toBeVisible()
    const inline = page.locator(
      `[data-game-id="${quizId}"] .game-preview-surface`,
    )
    await inline.getByRole("button", { name: /^Preview:/u }).click()
    await expect(
      inline.locator('[data-native-composition="native.question.grid"]'),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      inline.locator(
        "[data-native-application-preview][data-preview-ready=true]",
      ),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    const created = await page.request.post("/api/games", {
      headers,
      data: { quizzId: copiedId },
    })
    expect(created.status()).toBe(201)
    const game = await created.json()
    await host.goto(`/party/manager/${game.gameId}`)
    await display.goto(`/display/${game.gameId}`)
    await expect(display.getByTestId("tadazz-show")).toBeVisible()
    await player.goto(`/?pin=${game.inviteCode}`)
    await player.getByPlaceholder("Username here").fill("Composition QA")
    await player.getByRole("button", { name: "Submit", exact: true }).click()
    await expect(
      player.getByText("Waiting for players", { exact: true }),
    ).toBeVisible()
    await expect(
      host.getByText("Composition QA", { exact: true }),
    ).toBeVisible()
    await host.getByRole("button", { name: "Start", exact: true }).click()
    const roomComposition = display.locator(
      '[data-native-composition="native.question.grid"]',
    )
    await expect(roomComposition).toBeVisible({ timeout: 30_000 })
    await host.getByTestId("host-pause-resume-btn").click()
    await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    await expect(roomComposition).toHaveCSS("gap", "16px")
    const liveReveal = display.getByTestId("reveal-media-container")
    await expect(liveReveal).toHaveAttribute("data-effect", "blur")
    const frozenProgress = await liveReveal.getAttribute("data-progress")
    await display.evaluate(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 250)
        }),
    )
    await expect(liveReveal).toHaveAttribute("data-progress", frozenProgress!)
    await expect(display.getByText("QA_PRIVATE_EDITORIAL_NOTE")).toHaveCount(0)
    await expect(
      player.locator('[data-native-composition="native.question.grid"]'),
    ).toBeVisible()
    await display.screenshot({
      path: info.outputPath("real-room-pinned-composition.png"),
    })
    await playerContext.close()
    await page.goto("/studio/themes")
    await page
      .getByRole("combobox", { name: "Screens", exact: true })
      .first()
      .selectOption(item.id)
    await page
      .getByRole("main")
      .getByRole("combobox", { name: "Screens", exact: true })
      .selectOption("native.question.grid")
    await page
      .getByRole("combobox", { name: "Spacing", exact: true })
      .selectOption("large")
    await page
      .getByRole("textbox", { name: "Theme name", exact: true })
      .last()
      .fill(`${title} second`)
    await page.getByRole("button", { name: "Save draft", exact: true }).click()
    await expect(
      page.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeDisabled()
    await publication
      .getByRole("textbox", { name: "Publication version", exact: true })
      .fill("2.0.0")
    await expect(
      publication.getByRole("textbox", {
        name: "Publication version",
        exact: true,
      }),
    ).toHaveValue("2.0.0")
    await publication
      .getByRole("button", { name: "Publish", exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`${base}/publication`, { headers })
            ).json()
          ).activeVersion,
      )
      .toBe("2.0.0")
    const conflict = await page.request.post(`${base}/publish`, {
      headers,
      data: { expectedRevision: 2, expectedHeadRevision: 2, version: "1.0.0" },
    })
    expect(conflict.status()).toBe(409)
    expect(
      await (
        await page.request.get(`${base}/published/1.0.0`, { headers })
      ).json(),
    ).toEqual(first)
    await expect(roomComposition).toHaveCSS("gap", "16px")
    const stillPinned = await (
      await page.request.get(`/api/extensions/quizzes/${quizId}`, { headers })
    ).json()
    expect(stillPinned.extras.defaults.showComposition.version).toBe("1.0.0")
    await publication
      .getByRole("combobox", { name: "Rollback version", exact: true })
      .selectOption("1.0.0")
    await publication
      .getByRole("button", { name: "Rollback", exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`${base}/publication`, { headers })
            ).json()
          ).activeVersion,
      )
      .toBe("1.0.0")
    await publication
      .getByRole("button", { name: "Archive", exact: true })
      .click()
    await expect(publication.getByRole("status")).toHaveText("Archived")
    await expect(roomComposition).toHaveCSS("gap", "16px")
    expect(
      (
        await (
          await page.request.get(
            `/api/themes/builder/${owner.id}/publications`,
            { headers },
          )
        ).json()
      ).publications.some((value: { id: string }) => value.id === item.id),
    ).toBe(false)
    expect(
      await (
        await page.request.get(`${base}/published/1.0.0`, { headers })
      ).json(),
    ).toEqual(first)
    await page.reload()
    const drafts = page
      .getByRole("combobox", { name: "Screens", exact: true })
      .first()
    await drafts.selectOption(item.id)
    await expect(publication.getByRole("status")).toHaveText("Archived")
    await publication
      .getByRole("button", { name: "Restore from archive", exact: true })
      .click()
    await expect(publication.getByRole("status")).toHaveText("Published")
    const context = await browser.newContext()

    try {
      const other = await context.newPage()
      await loginWorkspaceFixture(other, "collaborator")
      const otherToken = await other.evaluate(() =>
        localStorage.getItem("token"),
      )
      await other.goto("/studio/themes")
      await other
        .getByRole("combobox", { name: "Workspace", exact: true })
        .selectOption(owner.id)
      await other
        .getByRole("combobox", { name: "Screens", exact: true })
        .first()
        .selectOption(item.id)
      await expect(
        other.getByRole("textbox", { name: "Theme name", exact: true }).last(),
      ).toHaveValue(`${title} second`)
      await expect(
        other.getByRole("button", { name: "Publish", exact: true }),
      ).toBeDisabled()
      expect(
        (
          await other.request.post(`${base}/publish`, {
            headers: { Authorization: `Bearer ${otherToken}` },
            data: {
              expectedRevision: 2,
              expectedHeadRevision: 5,
              version: "3.0.0",
            },
          })
        ).status(),
      ).toBe(403)
      await other.screenshot({
        path: info.outputPath("shared-workspace-author-no-publish.png"),
        fullPage: true,
      })
    } finally {
      await context.close()
    }

    await page.screenshot({
      path: info.outputPath("builder-publication-rollback-archive.png"),
      fullPage: true,
    })
  } finally {
    if (!page.isClosed()) {
      writeFileSync(
        info.outputPath("publication-version-input-events.json"),
        JSON.stringify(
          await page.evaluate(
            () =>
              (
                window as typeof window & {
                  phase2PublicationInputEvents: unknown[]
                }
              ).phase2PublicationInputEvents,
          ),
          null,
          2,
        ),
      )
    }

    await host.close()
    await roomContext.close()
    await playerContext.close()
  }
})

test("remote preview performance records real transitions and bounded resources after 24 closes", async ({
  page,
  browserName,
}, info) => {
  test.setTimeout(240_000)
  await page.addInitScript(() =>
    performance.setResourceTimingBufferSize(10_000),
  )
  await login(page)
  const { quizId } = await importApprovedExample(page)
  await page.goto("/studio/games")
  const surface = page.locator(
    `[data-game-id="${quizId}"] .game-preview-surface`,
  )
  const native = surface.locator(
    "[data-native-application-preview][data-preview-ready=true]",
  )
  const trigger = surface.getByRole("button", { name: /^Preview:/u })
  const opens: number[] = [],
    seeks: number[] = []
  const open = async () => {
    const started = performance.now()
    await trigger.click()
    await expect(native).toBeVisible({ timeout: 30_000 })
    await expect(surface.locator(".game-preview-overlay")).toHaveAttribute(
      "aria-busy",
      "false",
    )
    opens.push(performance.now() - started)
  }
  const close = async () => {
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-native-application-preview]")).toHaveCount(
      0,
    )
  }
  await open()
  // Cache only the exact generic immutable module before baseline.
  await close()
  const cdp =
    browserName === "chromium" ? await page.context().newCDPSession(page) : null

  if (cdp) {
    await cdp.send("Performance.enable")
    await cdp.send("HeapProfiler.enable")
  }

  const memory = async () => {
    if (!cdp) {
      return null
    }

    // Let the browser finish style invalidation and unmount effects before GC.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }),
    )
    await cdp.send("HeapProfiler.collectGarbage")
    const dom = await cdp.send("Memory.getDOMCounters"),
      values = await cdp.send("Performance.getMetrics")

    return {
      ...dom,
      heapUsedBytes:
        values.metrics.find((metric) => metric.name === "JSHeapUsedSize")
          ?.value ?? 0,
    }
  }
  const before = await memory()
  for (let n = 0; n < 24; n += 1) {
    await open()
    await close()
  }
  const after = await memory()
  writeFileSync(
    info.outputPath("preview-resources.json"),
    JSON.stringify({ before, after }, null, 2),
  )

  if (before && after) {
    expect(after.nodes).toBeLessThan(before.nodes + 80)
    expect(after.jsEventListeners).toBeLessThan(before.jsEventListeners + 30)
    expect(after.heapUsedBytes).toBeLessThan(before.heapUsedBytes + 8_000_000)
  }

  await open()
  const range = surface.getByRole("slider").first()
  await range.focus()
  for (let n = 0; n < 20; n += 1) {
    const started = performance.now()
    await page.keyboard.press(n % 2 ? "Home" : "End")
    await expect(range).toHaveValue(n % 2 ? "0" : "19")
    await expect(range).toHaveAttribute("aria-busy", "false")
    await expect(native).toBeVisible()
    seeks.push(performance.now() - started)
  }

  if (cdp) {
    await cdp.send("Tracing.start", {
      categories: "devtools.timeline,v8.execute",
      transferMode: "ReturnAsStream",
    })
  }

  await surface.getByRole("button", { name: "Replay", exact: true }).click()
  await expect(native).toBeVisible()
  await expect(surface.locator(".game-preview-overlay")).toHaveAttribute(
    "aria-busy",
    "false",
  )
  const frames = await page.evaluate(async () => {
    const elapsed: number[] = []
    let last = performance.now()
    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        elapsed.push(now - last)
        last = now

        if (elapsed.length < 120) {
          requestAnimationFrame(frame)
        } else {
          resolve()
        }
      }
      requestAnimationFrame(frame)
    })

    return elapsed
  })
  await close()

  if (cdp) {
    const completed = new Promise<{ stream?: string }>((resolve) => {
      cdp.once("Tracing.tracingComplete", resolve)
    })
    await cdp.send("Tracing.end")
    const { stream } = await completed

    if (!stream) {
      throw new Error("Expected remote Chromium trace stream")
    }

    const chunks: string[] = []
    let size = 0
    for (;;) {
      const chunk = await cdp.send("IO.read", { handle: stream })
      const value = chunk.base64Encoded
        ? Buffer.from(chunk.data, "base64").toString("utf8")
        : chunk.data
      chunks.push(value)
      size += value.length

      if (size > 50_000_000) {
        throw new Error("Remote trace byte budget exceeded")
      }

      if (chunk.eof) {
        break
      }
    }
    await cdp.send("IO.close", { handle: stream })
    writeFileSync(info.outputPath("preview-trace.json"), chunks.join(""))
  }

  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) =>
        entry.name.includes("/api/extensions/preview/runtime/"),
      )
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming

        return {
          kind: resource.name.endsWith("renderer.mjs") ? "renderer" : "css",
          milliseconds: resource.duration,
          transferBytes: resource.transferSize,
          decodedBytes: resource.decodedBodySize,
        }
      }),
  )
  expect(
    resources.filter((resource) => resource.kind === "renderer"),
  ).toHaveLength(1)
  expect(resources.filter((resource) => resource.kind === "css")).toHaveLength(
    1,
  )
  const percentile = (values: number[], quantile: number) =>
    [...values].sort((a, b) => a - b)[
      Math.min(values.length - 1, Math.floor(values.length * quantile))
    ]
  writeFileSync(
    info.outputPath("preview-performance.json"),
    JSON.stringify(
      {
        browser: browserName,
        viewport: page.viewportSize(),
        mode: "isolated-server-development-build; synthetic interaction timings, not field Core Web Vitals",
        opens,
        seeks,
        p95OpenMs: percentile(opens.slice(1), 0.95),
        coldOpenMs: opens[0],
        p95SeekMs: percentile(seeks, 0.95),
        frameIntervalsMs: frames,
        resources,
        before,
        after,
        memoryMeasurement: cdp
          ? "Chromium CDP after forced GC"
          : "unavailable on WebKit",
        closedRoots: await page
          .locator("[data-native-application-preview]")
          .count(),
      },
      null,
      2,
    ),
  )
  await cdp?.detach()
})

test("owner-approved public quiz opens the real original engine on hold without an account or room", async ({
  page,
}, info) => {
  const writes: string[] = []
  const publicAuthorization: boolean[] = []
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname

    if (path.startsWith("/api/extensions/preview/public")) {
      publicAuthorization.push(Boolean(request.headers().authorization))
    }

    if (
      request.method() !== "GET" &&
      path.startsWith("/api/") &&
      path !== "/api/auth/session"
    ) {
      writes.push(request.url())
    }
  })
  await page.goto("/")
  // The existing homepage may create a guest player session. Preview needs no account.
  expect(
    await page.evaluate(() => {
      const token = localStorage.getItem("token")

      return token
        ? JSON.parse(atob(token.split(".")[1])).role === "manager"
        : false
    }),
  ).toBe(false)
  const response = await page.request.get("/api/extensions/preview/public/quiz")
  expect(response.status()).toBe(200)
  const projection = await response.json()
  expect(projection.show.cards).toHaveLength(4)
  expect(projection.assets).toEqual([])
  expect(JSON.stringify(projection)).not.toMatch(
    /(?:note|accountId|quizId|goldysterling|631212f9)/u,
  )
  expect(
    (
      await page.request.get("/api/extensions/preview/public/not-approved")
    ).status(),
  ).toBe(404)
  const card = page
    .locator(".game-card")
    .filter({
      has: page.getByRole("heading", { name: "The Big Quiz", exact: true }),
    })
    .first()
  const surface = card.locator(".game-preview-surface")
  await surface.scrollIntoViewIfNeeded()
  const box = (await surface.boundingBox())!
  await page.mouse.move(box.x + 45, box.y + 45)
  await page.mouse.down()
  await expect(
    surface.locator(
      "[data-native-application-preview][data-preview-ready=true]",
    ),
  ).toBeVisible({ timeout: 30_000 })
  await page.mouse.up()
  expect(new URL(page.url()).search).toBe("")
  await expect(surface.locator("[data-original-razzia-preview]")).toBeVisible()
  await expect(
    surface.getByText(projection.show.cards[0].question, { exact: true }),
  ).toBeVisible()
  const chapters = surface.getByRole("slider", {
    name: "Chapters",
    exact: true,
  })
  await expect(chapters).toHaveAttribute("max", "19")
  await chapters.focus()
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("ArrowRight")
  }
  await expect(chapters).toHaveValue("4")
  await expect(chapters).toHaveAttribute("aria-busy", "false")
  await surface.screenshot({
    path: info.outputPath("approved-public-original-results.png"),
  })
  await page.route("**/api/extensions/preview/public/quiz", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Preview unavailable" }),
    }),
  )
  await page.keyboard.press("ArrowRight")
  await expect(
    surface.locator("[data-native-application-preview]"),
  ).toHaveCount(0)
  await expect(surface.getByRole("status")).toContainText("unavailable")
  expect(writes).toEqual([])
  expect(publicAuthorization.length).toBeGreaterThan(0)
  expect(publicAuthorization.every((value) => !value)).toBe(true)
})

test("public covers preserve click and cancel hold on movement; unavailable source never mounts an engine", async ({
  page,
}, info) => {
  await page.goto("/")
  const surface = page.locator(".game-preview-surface").first()
  await surface.scrollIntoViewIfNeeded()
  const box = (await surface.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 65, box.y + 40)
  await page.waitForTimeout(520)
  await expect(surface).not.toHaveAttribute("data-preview-active")
  await page.mouse.up()
  // Movement canceled hold; preserve normal button navigation on a separate click.
  await page.goto("/")
  const cover = page.locator(".game-preview-cover-action").first()
  await cover.click()
  await expect(page).toHaveURL(/view=product/u)
  await page.goto("/")
  const target = page.locator(".game-preview-surface").first()
  await target.scrollIntoViewIfNeeded()
  const before = (await target.boundingBox())!
  await page.mouse.move(before.x + 30, before.y + 40)
  await page.mouse.down()
  await expect(target).toHaveAttribute("data-preview-active", "true")
  await page.mouse.up()
  await expect(target.getByRole("status")).toContainText(
    "No published or account-owned preview is available.",
  )
  expect(new URL(page.url()).search).toBe("")
  const after = (await target.boundingBox())!
  expect(Math.abs(before.height - after.height)).toBeLessThan(1)
  expect(
    await target
      .locator(".game-preview-stage")
      .evaluate((el) => el.childElementCount),
  ).toBe(0)
  await page.screenshot({
    path: info.outputPath("inline-unavailable-desktop.png"),
  })
  await page.keyboard.press("Escape")
  await expect(target).not.toHaveAttribute("data-preview-active")
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole("button", { name: /^Preview: View /u })
    .first()
    .click()
  await expect(page.locator("[data-preview-active]")).toHaveCount(1)
  await page.screenshot({
    path: info.outputPath("inline-unavailable-mobile.png"),
  })
})

test("original editor creates mixed quiz, survey and transition, saves and reopens the authored order", async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await login(page)
  await page.goto("/manager/quizz")
  const title = `Mixed phase2 ${crypto.randomUUID().slice(0, 8)}`
  await page.getByPlaceholder("Quizz title...").fill(title)
  const question = page.getByPlaceholder("Start typing your question...")
  await question.fill("Scored question")
  const answers = page.getByPlaceholder("Add an answer...")
  for (let n = 0; n < (await answers.count()); n += 1) {
    await answers.nth(n).fill(`Quiz answer ${n + 1}`)
  }
  await page.getByTestId("studio-card-kind-select").click()
  await page.getByRole("option", { name: "Survey", exact: true }).click()
  await page.getByTestId("studio-add-card-btn").click()
  await question.fill("Audience survey")
  for (let n = 0; n < (await answers.count()); n += 1) {
    await answers.nth(n).fill(`Survey answer ${n + 1}`)
  }
  await expect(page.getByTestId("toggle-kind-survey")).toHaveAttribute(
    "data-state",
    "on",
  )
  const scored = page.getByTestId("editor-question-card-0")
  await scored.hover()
  await scored
    .getByRole("button", { name: "Duplicate question", exact: true })
    .click()
  await expect(question).toHaveValue("Scored question (Copy)")
  const moving = page.getByTestId("editor-question-card-1"),
    target = page.getByTestId("editor-question-card-2")
  await target.scrollIntoViewIfNeeded()
  const from = (await moving.boundingBox())!,
    to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
  await expect(page.getByTestId("editor-question-card-1")).toContainText(
    "Audience survey",
  )
  await page.getByTestId("studio-card-kind-select").click()
  await page.getByRole("option", { name: "Transition", exact: true }).click()
  await page.getByTestId("studio-add-card-btn").click()
  await page.getByPlaceholder("Card title...").fill("Between rounds")
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/studio\/games$/u)
  const card = page
    .locator(".game-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
  await expect(card).toBeVisible()
  await card.getByRole("link", { name: "Edit game", exact: true }).click()
  await expect(question).toHaveValue("Scored question")
  await expect(
    page.locator("aside").getByText("Scored question (Copy)", { exact: true }),
  ).toHaveCount(1)
  await expect(page.getByTestId("toggle-kind-quiz")).toHaveAttribute(
    "data-state",
    "on",
  )
  await page
    .locator("aside")
    .getByText("Audience survey", { exact: true })
    .click()
  await expect(question).toHaveValue("Audience survey")
  await expect(page.getByTestId("toggle-kind-survey")).toHaveAttribute(
    "data-state",
    "on",
  )
  await page
    .locator("aside")
    .getByText("Between rounds", { exact: true })
    .click()
  await expect(page.getByPlaceholder("Card title...")).toHaveValue(
    "Between rounds",
  )
  await page.screenshot({ path: info.outputPath("mixed-editor-reopened.png") })
  expect(errors).toEqual([])
})
