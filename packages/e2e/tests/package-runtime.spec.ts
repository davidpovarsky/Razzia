/* oxlint-disable no-await-in-loop -- Real install and scene transitions must be verified sequentially. */
/* oxlint-disable typescript/no-non-null-assertion -- Expected successful fixtures/frames are asserted before indexed use. */
import { test, expect, type APIRequestContext } from "@playwright/test"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { createPackageFixture } from "../../../extensions/src/testkit/package-fixtures"
import {
  packPackage,
  packageSha,
} from "../../../extensions/src/server/packages/archive"

async function login(request: APIRequestContext, name: string) {
  const response = await request.post("/api/accounts/login", {
    data: {
      email: `package-${name}@example.invalid`,
      password: "Package-QA-only-password-2026",
    },
  })
  expect(response.ok(), await response.text()).toBe(true)

  return response.json() as Promise<{ token: string; clientId: string }>
}

function imagesLoaded(images: Element[]) {
  return images.every(
    (image) =>
      image instanceof HTMLImageElement &&
      image.complete &&
      image.naturalWidth > 0,
  )
}

test("declarative package previews decoded private assets before installation", async ({
  page,
  request,
  browserName,
  browser,
}, info) => {
  const author = await login(page.request, "author")
  const stranger = await login(request, "stranger")
  const headers = { Authorization: `Bearer ${author.token}` }
  await page.addInitScript(
    (token) => localStorage.setItem("token", token),
    author.token,
  )
  const fixture = createPackageFixture(
    "declarative",
    `${browserName}-declarative`,
    `1.0.${Math.floor(Date.now() / 1000)}`,
  )
  const upload = await request.post("/api/packages/uploads", {
    headers: { ...headers, "Idempotency-Key": packageSha(fixture.bytes) },
    data: fixture.bytes,
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  const draft = (await upload.json()) as {
    uploadId: string
    sourceDigest: string
  }
  const previewPath = `/api/packages/uploads/${draft.uploadId}/preview/${fixture.manifest.contents[0].id}`
  expect((await request.get(previewPath, { headers })).status()).toBe(409)
  await request.post(`/api/packages/uploads/${draft.uploadId}/build`, {
    headers,
  })
  await expect
    .poll(
      async () => {
        const receipt = (await (
          await request.get(`/api/packages/uploads/${draft.uploadId}`, {
            headers,
          })
        ).json()) as { phase: string }

        return receipt.phase
      },
      { timeout: 120_000 },
    )
    .toBe("preview-ready")
  expect(
    (
      await request.get(previewPath, {
        headers: { Authorization: `Bearer ${stranger.token}` },
      })
    ).status(),
  ).toBe(404)
  expect(
    (
      await request.get(previewPath, {
        headers: {
          Authorization: `Bearer ${stranger.token}`,
          "X-Tadazz-Workspace": author.clientId,
        },
      })
    ).status(),
  ).toBe(404)
  await page.goto(
    `/manager/config?packageUpload=${encodeURIComponent(draft.uploadId)}`,
  )
  await expect(page.locator("[data-declarative-preview]")).toHaveAttribute(
    "data-declarative-preview",
    fixture.manifest.contents[0].id,
  )
  const image = fixture.manifest.files.find((f) => f.kind === "image")!
  const media = `/media/pkg_${draft.sourceDigest.slice(0, 24)}_${image.sha256}.png`
  expect(
    await page.evaluate(async (url) => {
      const element = new Image()
      element.src = url
      await element.decode()

      return element.naturalWidth > 0
    }, media),
  ).toBe(true)
  await page.locator("[data-declarative-preview]").screenshot({
    path: join(info.outputDir, "declarative-private-preview.png"),
  })
  const context = await browser.newContext()

  try {
    const reviewerPage = await context.newPage()
    const reviewer = await login(reviewerPage.request, "reviewer")
    await reviewerPage.addInitScript(
      (token) => localStorage.setItem("token", token),
      reviewer.token,
    )
    await reviewerPage.goto(
      `/manager/config?packageUpload=${encodeURIComponent(draft.uploadId)}&packageWorkspace=${encodeURIComponent(author.clientId)}`,
    )
    await expect(
      reviewerPage.locator("[data-declarative-preview]"),
    ).toHaveAttribute(
      "data-declarative-preview",
      fixture.manifest.contents[0].id,
    )
    expect(
      await reviewerPage.evaluate(async (url) => {
        const element = new Image()
        element.src = url
        await element.decode()

        return element.naturalWidth > 0
      }, media),
    ).toBe(true)
  } finally {
    await context.close()
  }
})
test("one-file complete React installation without review, independent layouts, live core and sandbox boundary", async ({
  page,
  request,
  browser,
  browserName,
}, info) => {
  const author = await login(page.request, "author"),
    stranger = await login(request, "stranger")
  const headers = { Authorization: `Bearer ${author.token}` }
  await page.addInitScript(
    (token) => localStorage.setItem("token", token),
    author.token,
  )
  const version = `1.0.${Math.floor(Date.now() / 1000)}`
  const style = `${browserName}-arcade`,
    fixture = createPackageFixture("complete", style, version)
  await page.goto("/studio/games")
  await page.getByTestId("package-tools-toggle").click()
  await page.getByTestId("package-file-input").setInputFiles({
    name: "complete.tadazz",
    mimeType: "application/zip",
    buffer: fixture.bytes,
  })
  await expect(page.getByTestId("package-preflight")).toContainText(
    fixture.manifest.displayName,
  )
  await page.getByRole("button", { name: "Build preview", exact: true }).click()
  await expect(page.getByTestId("package-preflight")).toContainText(
    "Ready for preview",
    { timeout: 120_000 },
  )
  const catalog = (await (
    await request.get("/api/packages", { headers })
  ).json()) as { packages: Array<{ upload: string; package_id: string }> }
  const id = catalog.packages.find(
    (c) => c.package_id === fixture.manifest.id,
  )!.upload
  const receipt = (await (
    await request.get(`/api/packages/uploads/${id}`, { headers })
  ).json()) as {
    revision: number
    sourceDigest: string
    buildDigest: string
    reviewed: boolean
  }
  expect(receipt.reviewed).toBe(false)
  const installButton = page.getByTestId("package-install-selected")
  await expect(installButton).toBeEnabled()
  await expect(page.getByTestId("package-preflight")).not.toContainText(
    "An assigned independent reviewer",
  )
  const other = await request.get(`/api/packages/uploads/${id}`, {
    headers: { Authorization: `Bearer ${stranger.token}` },
  })
  expect(other.status()).toBe(404)
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  const previewFrame = page
    .getByTestId("package-preview")
    .frameLocator("iframe")
  const previewNativeStage = page
    .getByTestId("package-preview")
    .locator("[data-native-application-preview][data-preview-phase]")
  const previewTimeline = page
    .getByTestId("package-preview")
    .getByRole("slider", { name: "Chapters", exact: true })
  const previewPlayback = page
    .getByTestId("package-preview")
    .getByTestId("game-preview-play-pause")

  if ((await previewPlayback.getAttribute("aria-label")) === "Pause") {
    await previewPlayback.click()
  }

  await expect(previewPlayback).toHaveAttribute("aria-label", "Resume")
  const seekPreviewChapter = async (target: number | "last") => {
    await previewTimeline.press(target === "last" ? "End" : "Home")
    await expect(previewTimeline).toHaveAttribute("aria-busy", "false")

    if (target !== "last") {
      await expect(previewTimeline).toHaveValue("0")

      for (let index = 1; index <= target; index += 1) {
        await previewTimeline.press("ArrowRight")
        await expect(previewTimeline).toHaveValue(String(index))
        await expect(previewTimeline).toHaveAttribute("aria-busy", "false")
      }
    }

    await expect(previewTimeline).toHaveAttribute("aria-busy", "false")
  }

  // The fixture starts with its opening, then question/cards/vote/lock/results.
  for (const [phase, chapter] of [
    ["Opening", 0],
    ["Voting", 3],
    ["Results", 5],
    ["Closing", "last"],
  ] as const) {
    await seekPreviewChapter(chapter)

    if (phase === "Opening" || phase === "Closing") {
      // Full-game previews retain the shared platform intro and curtain.
      await expect(previewNativeStage).toHaveAttribute(
        "data-preview-phase",
        phase.toLowerCase(),
      )
      await expect(previewNativeStage).toHaveAttribute(
        "data-preview-ready",
        "true",
      )
    } else {
      await expect(previewFrame.locator("main")).toHaveAttribute(
        "data-theme-layout",
        style,
      )
      await expect(previewFrame.locator("main")).toHaveAttribute(
        "data-phase",
        phase.toLowerCase(),
      )
    }
  }

  await seekPreviewChapter(3)
  await expect(previewFrame.locator("main")).toHaveAttribute(
    "data-phase",
    "voting",
  )
  await page
    .getByTestId("package-preview")
    .locator("iframe")
    .screenshot({ path: join(info.outputDir, "independent-arcade-layout.png") })
  await page.screenshot({
    path: join(info.outputDir, "package-preflight-preview.png"),
  })
  await page
    .getByTestId("package-preview")
    .getByTestId("game-viewer-close")
    .click()
  await installButton.click()
  await expect(page.getByTestId("package-preflight")).toContainText(
    "Installed privately",
  )
  const installed = (await (
    await request.get(`/api/packages/uploads/${id}`, { headers })
  ).json()) as { installedGames: string[]; reviewed: boolean }
  expect(installed.installedGames).toHaveLength(2)
  expect(installed.reviewed).toBe(false)
  await expect(page.getByTestId("package-open-games")).toHaveAttribute(
    "href",
    "/studio/games",
  )
  const installedCatalog = await request.get("/api/themes/catalog", { headers })
  expect(installedCatalog.ok(), await installedCatalog.text()).toBe(true)
  const availableThemes = (await installedCatalog.json()) as {
    available: Array<{ id: string; version: string }>
  }
  expect(availableThemes.available).toContainEqual({
    id: `fixture-${style}`,
    version,
  })
  const privateAsset = fixture.manifest.files.find((f) => f.kind === "image")!
  const assetName = `pkg_${receipt.sourceDigest.slice(0, 24)}_${privateAsset.sha256}.png`
  const ownAsset = await page.request.get(`/api/media/raw/${assetName}`, {
    headers: { Cookie: `tdz_media_auth=${author.token}` },
  })
  expect(ownAsset.ok(), await ownAsset.text()).toBe(true)
  const foreignAsset = await request.get(`/api/media/raw/${assetName}`, {
    headers: { Cookie: `tdz_media_auth=${stranger.token}` },
  })
  expect(foreignAsset.status()).toBe(404)
  const copied = await request.post(`/api/packages/uploads/${id}/export`, {
    headers,
  })
  expect(copied.ok()).toBe(true)
  expect(await copied.body()).toEqual(fixture.bytes)
  const themeId = `fixture-${style}`
  for (const gameId of installed.installedGames) {
    const sidecar = (await (
      await request.get(`/api/extensions/quizzes/${gameId}`, { headers })
    ).json()) as {
      extras: {
        defaults: { showTheme: { id: string } }
        perQuestion: Record<string, { answerVisuals: unknown[] }>
      }
    }
    expect(sidecar.extras.defaults.showTheme.id).toBe(themeId)
    expect(
      Object.values(sidecar.extras.perQuestion).flatMap((q) => q.answerVisuals),
    ).toHaveLength(50)
  }
  const portableGame = await request.post(
    `/api/packages/uploads/${id}/games/${installed.installedGames[0]}/export`,
    { headers },
  )
  expect(portableGame.ok(), await portableGame.text()).toBe(true)
  const exportedGameBytes = await portableGame.body()
  const foreignHeaders = { Authorization: `Bearer ${stranger.token}` }
  const gameUpload = await request.post("/api/packages/uploads", {
    headers: {
      ...foreignHeaders,
      "Idempotency-Key": createHash("sha256")
        .update(exportedGameBytes)
        .digest("hex"),
    },
    data: exportedGameBytes,
  })
  expect(gameUpload.ok(), await gameUpload.text()).toBe(true)
  const gameDraft = (await gameUpload.json()) as { uploadId: string }
  await request.post(`/api/packages/uploads/${gameDraft.uploadId}/build`, {
    headers: foreignHeaders,
  })
  await expect
    .poll(
      async () =>
        (
          (await (
            await request.get(`/api/packages/uploads/${gameDraft.uploadId}`, {
              headers: foreignHeaders,
            })
          ).json()) as { phase: string }
        ).phase,
      { timeout: 120_000 },
    )
    .toBe("preview-ready")
  const readyGame = (await (
    await request.get(`/api/packages/uploads/${gameDraft.uploadId}`, {
      headers: foreignHeaders,
    })
  ).json()) as { revision: number }
  const importedGame = await request.post(
    `/api/packages/uploads/${gameDraft.uploadId}/install`,
    {
      headers: foreignHeaders,
      data: {
        expectedRevision: readyGame.revision,
        selected: ["exported-game"],
      },
    },
  )
  expect(importedGame.ok(), await importedGame.text()).toBe(true)
  const imported = (await importedGame.json()) as { installedGames: string[] }
  expect(imported.installedGames).toHaveLength(1)
  expect(imported.installedGames[0]).not.toBe(installed.installedGames[0])
  const room = await request.post("/api/games", {
    headers,
    data: { quizzId: installed.installedGames[0] },
  })
  expect(room.ok(), await room.text()).toBe(true)
  const game = (await room.json()) as { gameId: string; inviteCode: string }
  await page.goto(`/party/manager/${game.gameId}`)
  await page.getByTestId("platform-opening-start").click()
  await page.getByTestId("platform-opening-skip").click()
  await expect(
    page.frameLocator("[data-testid=package-runtime-frame]").locator("main"),
  ).toHaveAttribute("data-theme-layout", style)
  const playerContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
  })
  const displayContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 800, height: 600 },
    reducedMotion: "reduce",
  })

  try {
    const player = await playerContext.newPage(),
      display = await displayContext.newPage()
    await player.goto(`http://127.0.0.1:3190/game?pin=${game.inviteCode}`)
    await player.getByPlaceholder("Username here").fill("Package Player")
    await player.getByRole("button", { name: "Submit", exact: true }).click()
    await display.goto(`http://127.0.0.1:3190/display/${game.gameId}`)
    await expect(
      display.frameLocator("iframe").locator("main"),
    ).toHaveAttribute("data-theme-layout", style)
    await page.getByRole("button", { name: "Start", exact: true }).click()
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
      "data-voting-open",
      "true",
      { timeout: 40_000 },
    )
    const frame = player.frameLocator("iframe")
    await expect(frame.locator(".answers button")).toHaveCount(5)
    await expect(frame.locator(".answers img")).toHaveCount(5)
    await expect(frame.locator(".question-photo")).toHaveCount(1)
    await expect
      .poll(async () => Number(await frame.locator("aside strong").innerText()))
      .toBeGreaterThan(0)
    await expect
      .poll(() => frame.locator(".answers img").evaluateAll(imagesLoaded))
      .toBe(true)
    await page.getByTestId("host-pause-resume-btn").click()
    await expect(player.getByTestId("tadazz-show")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    await expect(frame.locator(".answers button").first()).toBeDisabled()
    const pausedTime = await frame.locator("aside strong").innerText()
    await player.waitForTimeout(1100)
    expect(await frame.locator("aside strong").innerText()).toBe(pausedTime)
    await page.getByTestId("host-pause-resume-btn").click()
    await expect(frame.locator(".answers button").first()).toBeEnabled()
    await frame.locator(".answers button").first().focus()
    await expect(frame.locator(".answers button").first()).toBeFocused()
    await player.keyboard.press("Space")
    await expect
      .poll(() => frame.locator(".answers button:enabled").count())
      .toBe(0)
    await expect(frame.locator("main")).toHaveAttribute(
      "data-phase",
      "voteLocked",
    )
    await page.bringToFront()
    await page.getByTestId("host-end-timer-btn").click()
    await player.bringToFront()
    await expect(frame.locator("main")).toHaveAttribute(
      "data-phase",
      "personalResult",
    )
    await expect(frame.locator(".answers article strong")).toHaveText(
      /^[1-9]\d*$/u,
    )
    // No private state, host DOM or cookies can be read in the opaque-origin child.
    const child = player.frames().find((f) => f.url().includes("/render?"))!
    expect(
      await child.evaluate(() => {
        try {
          return window.parent.document.body.textContent
        } catch {
          return "blocked"
        }
      }),
    ).toBe("blocked")
    expect(["", "blocked"]).toContain(
      await child.evaluate(() => {
        try {
          return document.cookie
        } catch {
          return "blocked"
        }
      }),
    )
    expect(
      await child.evaluate(
        () => window.open("https://example.invalid/forbidden-egress") === null,
      ),
    ).toBe(true)
    expect(
      await child.evaluate(() => {
        try {
          window.top!.location.href = "https://example.invalid/forbidden-egress"

          return "allowed"
        } catch {
          return "blocked"
        }
      }),
    ).toBe("blocked")
    const requests: string[] = []
    await player.route("**/forbidden-egress", async (route) => {
      requests.push(route.request().url())
      await route.abort()
    })
    await child.evaluate(async () => {
      try {
        await fetch("https://example.invalid/forbidden-egress")
      } catch {
        /* CSP */
      }
    })
    await page.screenshot({
      path: join(info.outputDir, "package-live-host.png"),
    })
    await player.screenshot({
      path: join(info.outputDir, "package-live-player.png"),
    })
    await display.screenshot({
      path: join(info.outputDir, "package-live-display-4x3.png"),
    })
    await display.reload()
    await expect(
      display.frameLocator("iframe").locator("main"),
    ).toHaveAttribute("data-theme-layout", style)
    const playerRoomUrl = player.url()
    await child.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent("error", { message: "synthetic renderer failure" }),
      )
    })
    // Question failure unmounts the sandbox host and retains the native stage.
    await expect(player.getByTestId("package-runtime-frame")).toHaveCount(0)
    await expect(player.getByTestId("tadazz-stage")).toBeVisible()
    await expect(player.getByTestId("tadazz-custom-screen")).toBeVisible()
    await expect(player.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-scene",
      "player-result",
    )
    await expect(player).toHaveURL(playerRoomUrl)
    await expect(player.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-theme",
      themeId,
    )
    await player.screenshot({
      path: join(info.outputDir, "renderer-fallback-retained-room.png"),
    })
    // CSP prevents this frame from navigating to a third origin as well.
    await display.route("**/forbidden-egress", async (route) => {
      requests.push(route.request().url())
      await route.abort()
    })
    const displayChild = display
      .frames()
      .find((f) => f.url().includes("/render?"))!
    await displayChild
      .evaluate(() => {
        window.location.href = "https://example.invalid/forbidden-egress"
      })
      .catch(() => undefined)
    await expect.poll(() => requests.length).toBe(0)
    expect(
      await page.getByTestId("tadazz-show").getAttribute("data-show-theme"),
    ).toBe(themeId)
  } finally {
    await playerContext.close()
    await displayContext.close()
  }

  // A separately built theme changes structure, not only tokens.
  const cinema = createPackageFixture(
    "theme",
    `${browserName}-cinematic`,
    version,
  )
  const upload = await request.post("/api/packages/uploads", {
    headers: {
      ...headers,
      "Idempotency-Key": createHash("sha256")
        .update(cinema.bytes)
        .digest("hex"),
    },
    data: cinema.bytes,
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  const draft = (await upload.json()) as {
    uploadId: string
    sourceDigest: string
  }
  await request.post(`/api/packages/uploads/${draft.uploadId}/build`, {
    headers,
  })
  await expect
    .poll(
      async () =>
        (
          (await (
            await request.get(`/api/packages/uploads/${draft.uploadId}`, {
              headers,
            })
          ).json()) as { phase: string }
        ).phase,
      { timeout: 120_000 },
    )
    .toBe("preview-ready")
  await page.goto(
    `/manager/config?packageUpload=${encodeURIComponent(draft.uploadId)}`,
  )
  await expect(
    page.getByTestId("package-preview").frameLocator("iframe").locator("main"),
  ).toHaveAttribute("data-theme-layout", `${browserName}-cinematic`)
  await page
    .getByTestId("package-preview")
    .locator("iframe")
    .screenshot({
      path: join(info.outputDir, "independent-cinematic-layout.png"),
    })
})

test("networkless builder rejects unapproved dependencies and executable import tricks", async ({
  request,
  browserName,
}) => {
  const author = await login(request, "author")
  const headers = { Authorization: `Bearer ${author.token}` }
  for (const [name, code] of [
    [
      "node",
      'import fs from "node:fs"; export default function Stage(){return <p>{fs.readFileSync("/etc/passwd","utf8")}</p>}',
    ],
    [
      "dynamic",
      'export default function Stage(){const name="https://example.invalid/forbidden-egress"; import(name); return <p/>}',
    ],
    [
      "css",
      'import "https://example.invalid/external.css"; export default function Stage(){return <p/>}',
    ],
  ]) {
    const fixture = createPackageFixture(
      "theme",
      `${browserName}-reject-${name}`,
      `1.0.${Math.floor(Date.now() / 1000)}`,
    )
    const entry = fixture.manifest.files.find((f) =>
      f.path.endsWith("entry.tsx"),
    )!
    const bytes = Buffer.from(code)
    fixture.files.set(entry.path, bytes)
    entry.bytes = bytes.length
    entry.sha256 = packageSha(bytes)
    const archive = packPackage(fixture.manifest, fixture.files)
    const uploaded = await request.post("/api/packages/uploads", {
      headers: { ...headers, "Idempotency-Key": packageSha(archive) },
      data: archive,
    })
    expect(uploaded.ok(), await uploaded.text()).toBe(true)
    const draft = (await uploaded.json()) as { uploadId: string }
    await request.post(`/api/packages/uploads/${draft.uploadId}/build`, {
      headers,
    })
    await expect
      .poll(
        async () => {
          const receipt = (await (
            await request.get(`/api/packages/uploads/${draft.uploadId}`, {
              headers,
            })
          ).json()) as { phase: string }

          return receipt.phase
        },
        { timeout: 120_000 },
      )
      .toBe("failed")
  }
})
