/* oxlint-disable eslint/max-nested-callbacks, eslint/prefer-destructuring, typescript/no-non-null-assertion -- Explicit staged receipts and polling callbacks keep the end-to-end fixture readable; published assets are asserted before use. */
/* oxlint-disable no-await-in-loop -- Installation transitions and real role interactions must run sequentially. */
import { test, expect, type APIRequestContext } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join, dirname } from "node:path"
import { createInstallationFixture } from "@razzia/extensions/server/show-themes/installation.fixture"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  quizExtrasV2Schema,
  nativeBundleToAuthoredShow,
  authoredShowToNativeBundleDraft,
  exportTadaShowWorkbook,
  parseTadaShowWorkbook,
} from "@razzia/extensions/core"

const root = resolve(import.meta.dirname, "../../..")
test.skip(process.env.TADAZZ_REMOTE_QA !== "1", "Remote QA only")
async function login(request: APIRequestContext, email: string) {
  const response = await request.post("/api/accounts/login", {
    data: { email, password: "Theme-QA-only-password-2026" },
  })
  expect(response.ok()).toBe(true)

  return (await response.json()) as { token: string; clientId: string }
}

test("package to private review, approved publication, Studio persistence and all real game roles", async ({
  page,
  request,
  browser,
  browserName,
}, info) => {
  const author = await login(page.request, "theme-author@example.invalid")
  const reviewer = await login(request, "theme-reviewer@example.invalid")
  const stranger = await login(request, "theme-stranger@example.invalid")
  const themeId = `qa-installation-${browserName}`
  const definition = createInstallationFixture(
    "1.0.0",
    "declarative",
    themeId,
    true,
  )
  const work = mkdtempSync(join(tmpdir(), "theme-package-browser-"))
  writeFileSync(join(work, "manifest.json"), JSON.stringify(definition))
  for (const asset of definition.assets) {
    const file = resolve(work, `.${asset.url}`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      readFileSync(resolve(root, "packages/web/public", `.${asset.url}`)),
    )
  }
  const packageFile = join(work, "package.theme.json")
  function cli(args: string[], token = author.token) {
    const output = execFileSync(
      "pnpm",
      [
        "--filter",
        "@razzia/extensions",
        "exec",
        "tsx",
        "qa/theme-authoring.ts",
        ...args,
      ],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 4_000_000,
        env: {
          ...process.env,
          TADAZZ_THEME_SERVER: "http://127.0.0.1:3180/",
          TADAZZ_THEME_TOKEN: token,
          TADAZZ_THEME_WORKSPACE: author.clientId,
        },
      },
    )

    return JSON.parse(output) as Record<string, string>
  }
  expect(
    cli(["package", join(work, "manifest.json"), work, packageFile]).status,
  ).toBe("PACKAGED_NOT_INSTALLED")
  const uploaded = cli(["upload", packageFile])
  expect(uploaded.status).toBe("VALIDATED_PRIVATE_DRAFT")
  const id = uploaded.artifactId
  expect(cli(["revise", id, packageFile, uploaded.revision]).revision).toBe(2)
  const preview = cli(["preview", id])
  const headers = { Authorization: `Bearer ${author.token}` }
  const before = await page.request.get("/api/themes/catalog", { headers })
  expect(
    (
      (await before.json()) as { definitions: Array<{ id: string }> }
    ).definitions.some((item) => item.id === themeId),
  ).toBe(false)
  const stolen = await request.get(
    `/api/themes/workspaces/${author.clientId}/drafts/${id}/preview`,
    { headers: { Authorization: `Bearer ${stranger.token}` } },
  )
  expect(stolen.status()).toBe(404)
  await page.addInitScript(
    (value) => localStorage.setItem("token", value),
    author.token,
  )
  await page.goto(preview.url)
  await expect(page.getByTestId("theme-installation-preview")).toBeVisible()
  await expect(page.locator("[data-preview-theme]")).toHaveAttribute(
    "data-preview-theme",
    themeId,
  )
  let qaEvidenceSha256 = ""
  let expectedRevision = Number(preview.revision)
  let { manifestSha256 } = preview

  if (browserName === "chromium") {
    const qa = cli(["qa", id, join(info.outputDir, "complete-preview-matrix")])
    expect(qa.status).toBe("REMOTE_BROWSER_QA_PASSED")
    qaEvidenceSha256 = qa.qaEvidenceSha256
    expectedRevision = Number(qa.expectedRevision)
    manifestSha256 = qa.manifestSha256
  } else {
    const screenshot = await page.screenshot({
      path: join(info.outputDir, "private-theme-review.png"),
    })
    qaEvidenceSha256 = createHash("sha256").update(screenshot).digest("hex")
  }

  cli(["request-review", id])
  const evidence = join(work, "human-review.fixture.json")
  writeFileSync(
    evidence,
    JSON.stringify({
      approved: true,
      expectedRevision,
      manifestSha256,
      qaEvidenceSha256,
      rightsReviewed: true,
      contentReviewed: true,
      accessibilityReviewed: true,
      performanceReviewed: true,
    }),
  )
  cli(["approve", id, evidence], reviewer.token)
  cli(["stage", id])
  cli(["publish", id])
  const catalog = await page.request.get("/api/themes/catalog", { headers })
  const published = (
    (await catalog.json()) as {
      definitions: Array<{ id: string; assets: Array<{ url: string }> }>
    }
  ).definitions.find((item) => item.id === themeId)!
  expect(published).toBeTruthy()
  const foreign = await request.get("/api/themes/catalog", {
    headers: { Authorization: `Bearer ${stranger.token}` },
  })
  expect(
    ((await foreign.json()) as { definitions: unknown[] }).definitions,
  ).toEqual([])

  const quizz = {
    subject: `Installation ${browserName}`,
    gameMode: "quiz",
    questions: [
      {
        type: "single",
        question: "Verified installation?",
        answers: ["Yes", "No"],
        solutions: [0],
        time: 400,
        cooldown: 3,
      },
    ],
  }
  const questionId = crypto.randomUUID()
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [questionId],
    computeCanonicalBaseDigest(quizz),
  )
  extras.timeline = [{ id: crypto.randomUUID(), kind: "question", questionId }]
  extras.scenes = {}
  extras.perQuestion[questionId] = {
    answerVisuals: [0, 1].map((answerIndex) => ({
      answerIndex,
      url: published.assets[0].url,
      display: "both",
      alt: String(answerIndex + 1),
    })),
  }
  const created = await page.request.post("/api/extensions/quizzes", {
    headers,
    data: { quizz, extras },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const { quizId } = (await created.json()) as { quizId: string }
  await page.goto(`/manager/quizz/${quizId}`)
  await page.getByTestId("studio-tab-settings").click()
  const choice = page.getByTestId(`show-theme-${themeId}`)
  await expect(choice).toBeVisible()
  await choice
    .getByRole("button", { name: "Use this theme", exact: true })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Use this theme", exact: true })
    .click()
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/manager\/config$/u)
  await page.goto(`/manager/quizz/${quizId}`)
  await page.getByTestId("studio-tab-settings").click()
  await expect(
    page
      .getByTestId(`show-theme-${themeId}`)
      .getByRole("button", { name: "Active", exact: true }),
  ).toBeDisabled()
  const saved = await page.request.get(`/api/extensions/quizzes/${quizId}`, {
    headers,
  })
  const bundle = (await saved.json()) as {
    base?: typeof quizz
    quizz?: typeof quizz
    extras: unknown
  }
  const sidecar = quizExtrasV2Schema.parse(bundle.extras)
  expect(sidecar.defaults.showTheme?.id).toBe(themeId)
  // Actual import/export contracts are also used when creating a new show copy.
  const exported = await page.request.get(`/api/extensions/export/${quizId}`, {
    headers,
  })
  expect(exported.ok()).toBe(true)
  const nativeBundle = (await exported.json()) as {
    bundleVersion: 1
    quizz: unknown
    extras: typeof sidecar
  }
  const jsonCopy = await page.request.post("/api/extensions/import", {
    headers,
    data: JSON.parse(JSON.stringify(nativeBundle)) as unknown,
  })
  expect(jsonCopy.ok(), await jsonCopy.text()).toBe(true)
  const authored = nativeBundleToAuthoredShow(nativeBundle)
  const workbook = exportTadaShowWorkbook(authored)
  const parsed = parseTadaShowWorkbook(workbook)
  const converted = authoredShowToNativeBundleDraft(parsed)
  expect(converted.ok).toBe(true)
  const cloned = converted.bundleDraft

  if (!cloned) {
    throw new Error("Workbook conversion must provide a valid bundle")
  }

  expect(cloned.extras.defaults.showTheme?.id).toBe(themeId)
  const copied = await page.request.post("/api/extensions/import", {
    headers,
    data: { bundleVersion: 1, ...cloned },
  })
  expect(copied.ok(), await copied.text()).toBe(true)
  const roomResponse = await page.request.post("/api/games", {
    headers,
    data: { quizzId: quizId },
  })
  expect(roomResponse.ok()).toBe(true)
  const game = (await roomResponse.json()) as {
    gameId: string
    inviteCode: string
  }
  await page.goto(`/party/manager/${game.gameId}`)
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-theme",
    themeId,
  )
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-theme-fallback",
    "false",
  )
  const participantContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const audienceBrowser = await browser.browserType().launch()

  try {
    const participant = await participantContext.newPage()
    await participant.addInitScript(() => {
      const cues: string[] = []
      Object.assign(window, { __installedThemeCues: cues })
      window.addEventListener("tadazz:sfx", (event) =>
        cues.push((event as CustomEvent<{ name: string }>).detail.name),
      )
    })
    await participant.goto(`http://127.0.0.1:3180/game?pin=${game.inviteCode}`)
    await participant.getByPlaceholder("Username here").fill("Installation QA")
    await participant
      .getByRole("button", { name: "Submit", exact: true })
      .click()
    await expect(participant.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-theme",
      themeId,
    )
    await expect(page.getByTestId("host-connected-counter")).toHaveText("1 / 1")
    await page.bringToFront()
    await page.getByRole("button", { name: "Start", exact: true }).click()
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
      "data-voting-open",
      "true",
      { timeout: 30_000 },
    )
    await page.getByTestId("host-pause-resume-btn").click()
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    const display = await audienceBrowser.newPage({
      viewport: { width: 1024, height: 768 },
    })
    await display.goto(`http://127.0.0.1:3180/display/${game.gameId}`)
    await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-theme",
      themeId,
    )
    await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
      "data-theme-fallback",
      "false",
    )
    await display.reload()
    await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-theme",
      themeId,
    )
    await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    await page.screenshot({ path: join(info.outputDir, "installed-host.png") })
    await participant.screenshot({
      path: join(info.outputDir, "installed-player.png"),
    })
    await display.screenshot({
      path: join(info.outputDir, "installed-display.png"),
    })
    const raw = await participant.request.get(published.assets[0].url)
    expect(raw.ok()).toBe(true)
    expect(
      createHash("sha256")
        .update(await raw.body())
        .digest("hex"),
    ).toBe(definition.assets[0].sha256)
    // A newly published version changes catalog choices, never an existing room.
    const secondDefinition = { ...definition, version: "2.0.0" }
    const secondManifest = join(work, "manifest-v2.json")
    const secondPackage = join(work, "package-v2.theme.json")
    writeFileSync(secondManifest, JSON.stringify(secondDefinition))
    cli(["package", secondManifest, work, secondPackage])
    const second = cli(["upload", secondPackage])
    const secondPreview = cli(["preview", second.artifactId])
    const reviewPage = await page.context().newPage()

    try {
      await reviewPage.goto(secondPreview.url)
      await expect(
        reviewPage.getByTestId("theme-installation-preview"),
      ).toBeVisible()
      await expect(reviewPage.getByRole("heading", { level: 1 })).toContainText(
        "2.0.0",
      )
      const proof = await reviewPage.screenshot({
        path: join(info.outputDir, "second-version-review.png"),
      })
      const secondReview = join(work, "second-review.fixture.json")
      writeFileSync(
        secondReview,
        JSON.stringify({
          approved: true,
          expectedRevision: Number(secondPreview.revision),
          manifestSha256: secondPreview.manifestSha256,
          qaEvidenceSha256: createHash("sha256").update(proof).digest("hex"),
          rightsReviewed: true,
          contentReviewed: true,
          accessibilityReviewed: true,
          performanceReviewed: true,
        }),
      )
      cli(["request-review", second.artifactId])
      cli(["approve", second.artifactId, secondReview], reviewer.token)
      cli(["stage", second.artifactId])
      cli(["publish", second.artifactId])
      const activeCatalog = async () =>
        (await (
          await page.request.get("/api/themes/catalog", { headers })
        ).json()) as {
          available: Array<{ id: string; version: string }>
          definitions: Array<{ id: string; version: string }>
        }
      expect((await activeCatalog()).available).toContainEqual({
        id: themeId,
        version: "2.0.0",
      })
      for (const surface of [page, participant, display]) {
        await expect(surface.getByTestId("tadazz-show")).toHaveAttribute(
          "data-show-theme-version",
          "1.0.0",
        )
      }
      cli(["rollback", id])
      const rolledBack = await activeCatalog()
      expect(rolledBack.available).toContainEqual({
        id: themeId,
        version: "1.0.0",
      })
      expect(
        rolledBack.definitions
          .filter((item) => item.id === themeId)
          .map((item) => item.version)
          .sort(),
      ).toEqual(["1.0.0", "2.0.0"])
      await display.reload()
      await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
        "data-show-theme-version",
        "1.0.0",
      )
    } finally {
      await reviewPage.close()
    }

    await page.bringToFront()
    await page.getByTestId("host-pause-resume-btn").click()
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
      "data-game-paused",
      "false",
    )
    await participant.bringToFront()
    await participant.getByTestId("tadazz-pad-option-0").click()
    await expect
      .poll(() =>
        participant.evaluate(
          () =>
            (
              window as unknown as { __installedThemeCues: string[] }
            ).__installedThemeCues.filter((cue) => cue === "answer-submitted")
              .length,
        ),
      )
      .toBe(1)
    await page.bringToFront()
    await page.getByTestId("host-end-timer-btn").click()
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-scene",
      "results",
    )
    await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-scene",
      "results",
    )
    await page.screenshot({
      path: join(info.outputDir, "installed-result.png"),
    })
  } finally {
    await audienceBrowser.close()
    await participantContext.close()
  }

  const audit = await page.request.get(
    `/api/themes/workspaces/${author.clientId}/audit`,
    { headers },
  )
  const events = (
    (await audit.json()) as { events: Array<{ action: string }> }
  ).events.map((event) => event.action)
  for (const action of [
    "draft",
    "upload",
    "validate",
    "preview",
    "request-review",
    "approve",
    "stage",
    "publish",
  ]) {
    expect(events).toContain(action)
  }
  await info.attach("installation-result.json", {
    body: JSON.stringify({
      themeId,
      artifactId: id,
      qaEvidenceSha256,
      events,
      approvalMode: "synthetic-test-fixture-independent-account",
      productionCatalogModified: false,
      realRooms: true,
    }),
    contentType: "application/json",
  })
})
