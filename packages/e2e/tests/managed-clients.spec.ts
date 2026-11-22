/* oxlint-disable no-await-in-loop -- Real account, room and revocation transitions are sequential. */
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test"
import { extname, join } from "node:path"
import { createPackageFixture } from "../../../extensions/src/testkit/package-fixtures"
import { packageSha } from "../../../extensions/src/server/packages/archive"
import type {
  ManagedClientCodeResponse,
  ManagedClientGameSummary,
  ManagedClientLaunchResponse,
  ManagedClientListResponse,
} from "../../common/src/types/managed-clients"
import hebrew from "../../../extensions/src/site/locales/clients/he.json" with { type: "json" }

const baseURL = "http://127.0.0.1:3190"
const managedHeaders = { "X-Tadazz-Session": "managed-client" }

async function login(request: APIRequestContext) {
  const response = await request.post(`${baseURL}/api/accounts/login`, {
    data: {
      email: "package-author@example.invalid",
      password: "Package-QA-only-password-2026",
    },
  })
  expect(response.ok()).toBe(true)

  return response.json() as Promise<{ token: string; clientId: string }>
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true)
}

function decoded(images: Element[]) {
  return images.every(
    (image) =>
      image instanceof HTMLImageElement &&
      image.complete &&
      image.naturalWidth > 0,
  )
}

async function installFixture(
  request: APIRequestContext,
  token: string,
  browserName: string,
) {
  const style = `${browserName}-managed-client`
  const fixture = createPackageFixture(
    "complete",
    style,
    `1.0.${Math.floor(Date.now() / 1000)}`,
  )
  const headers = { Authorization: `Bearer ${token}` }
  const upload = await request.post("/api/packages/uploads", {
    headers: { ...headers, "Idempotency-Key": packageSha(fixture.bytes) },
    data: fixture.bytes,
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  const draft = (await upload.json()) as { uploadId: string }
  expect(
    (
      await request.post(`/api/packages/uploads/${draft.uploadId}/build`, {
        headers,
      })
    ).ok(),
  ).toBe(true)
  await expect
    .poll(
      async () => {
        const current = await request.get(
          `/api/packages/uploads/${draft.uploadId}`,
          { headers },
        )

        return ((await current.json()) as { phase: string }).phase
      },
      { timeout: 120_000 },
    )
    .toBe("preview-ready")
  const receipt = (await (
    await request.get(`/api/packages/uploads/${draft.uploadId}`, { headers })
  ).json()) as { revision: number; reviewed: boolean; sourceDigest: string }
  expect(receipt.reviewed).toBe(false)
  const result = await request.post(
    `/api/packages/uploads/${draft.uploadId}/install`,
    {
      headers,
      data: {
        expectedRevision: receipt.revision,
        selected: fixture.manifest.contents.map((item) => item.id),
      },
    },
  )
  expect(result.ok(), await result.text()).toBe(true)
  const installed = (await result.json()) as { installedGames: string[] }
  expect(installed.installedGames).toHaveLength(2)

  return {
    installed,
    style,
    themeId: `fixture-${style}`,
    headers,
    fixture,
    receipt,
  }
}

test("managed client code opens only assigned canonical games with the native custom host and display", async ({
  page,
  request,
  browser,
  browserName,
}, info) => {
  const author = await login(page.request)
  await page.addInitScript((token) => {
    localStorage.setItem("token", token)
    localStorage.setItem("i18nextLng", "en")
  }, author.token)
  const packageGame = await installFixture(request, author.token, browserName)
  const [quizId, otherQuizId] = packageGame.installed.installedGames
  const readOriginal = async () => ({
    quiz: (await (
      await request.get(`/api/quizz/${quizId}`, {
        headers: packageGame.headers,
      })
    ).json()) as unknown,
    extras: (await (
      await request.get(`/api/extensions/quizzes/${quizId}`, {
        headers: packageGame.headers,
      })
    ).json()) as unknown,
  })
  const original = await readOriginal()
  await page.goto("/studio/clients")
  const owner = page.getByTestId("managed-clients")
  await expect(
    owner.getByRole("heading", { name: "Client accounts", exact: true }),
  ).toBeVisible()
  const clientName = `Synthetic ${browserName} client`
  await owner.getByLabel("Client name", { exact: true }).fill(clientName)
  const createdResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/managed-clients" &&
      response.request().method() === "POST",
  )
  await owner
    .getByRole("button", { name: "Create access code", exact: true })
    .click()
  const created = (await (
    await createdResponse
  ).json()) as ManagedClientCodeResponse
  expect(typeof created.code).toBe("string")
  expect(created.code).toMatch(/^[0-9]{6}$/u)
  await expect(
    owner.getByTestId("client-code-disclosure").locator("output"),
  ).toHaveText(created.code)
  await expect(
    owner.getByTestId("client-code-disclosure").locator("output"),
  ).toHaveAttribute("dir", "ltr")
  const clientCard = owner.getByTestId("managed-client-card").filter({
    has: page.getByRole("heading", { name: clientName, exact: true }),
  })
  await clientCard
    .getByLabel("Choose a game to assign", { exact: true })
    .selectOption(quizId)
  await clientCard
    .getByRole("button", { name: "Assign game", exact: true })
    .click()
  await expect(clientCard).toHaveAttribute("aria-busy", "false")
  const catalogue = (await (
    await request.get("/api/managed-clients", { headers: packageGame.headers })
  ).json()) as ManagedClientListResponse
  const assignedGame = catalogue.games.find((game) => game.id === quizId)
  expect(assignedGame).toBeDefined()

  if (!assignedGame) {
    throw new Error("Assigned canonical fixture game is missing")
  }

  expect(assignedGame).toMatchObject({
    id: quizId,
    themeId: packageGame.themeId,
    available: true,
    customTheme: true,
  })
  expect(
    catalogue.clients.find((client) => client.id === created.client.id)
      ?.gameIds,
  ).toEqual([quizId])
  for (const client of catalogue.clients) {
    expect(client).not.toHaveProperty("code")
    expect(client).not.toHaveProperty("code_digest")
  }
  await expect(
    clientCard.getByRole("button", {
      name: `Remove ${assignedGame.title}`,
      exact: true,
    }),
  ).toBeVisible()
  await owner.getByRole("button", { name: "Hide code", exact: true }).click()
  await owner.screenshot({
    path: join(info.outputDir, "owner-assigned-canonical-game.png"),
  })

  const clientContext = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    viewport: { width: 320, height: 568 },
    reducedMotion: "reduce",
  })
  let playerContext:
    Awaited<ReturnType<typeof browser.newContext>> | undefined = undefined

  try {
    // An existing owner's credential must remain stored but never be sent by
    // the separate client context, including after logout and back navigation.
    const existingOwner = await login(clientContext.request)
    await clientContext.addInitScript(
      (token) => localStorage.setItem("token", token),
      existingOwner.token,
    )
    const client = await clientContext.newPage()
    const credentialLeaks: string[] = []
    clientContext.on("request", (req) => {
      const path = new URL(req.url()).pathname

      if (
        (path.startsWith("/api/") || path === "/ws") &&
        req.headers().authorization
      ) {
        credentialLeaks.push(path)
      }
    })
    await client.goto("/client")
    const codeInput = client.getByLabel("Six-digit access code", {
      exact: true,
    })
    await expect(codeInput).toHaveAttribute("type", "text")
    await expect(codeInput).toHaveAttribute("inputmode", "numeric")
    await expect(
      client.getByRole("button", { name: "Continue", exact: true }),
    ).toBeInViewport({ ratio: 1 })
    await noHorizontalOverflow(client)
    await codeInput.fill("12345")
    await expect(
      client.getByRole("button", { name: "Continue", exact: true }),
    ).toBeDisabled()
    await codeInput.fill(created.code)
    await expect(codeInput).toHaveValue(created.code)
    await client.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(client.getByTestId("client-game-library")).toBeVisible()
    await expect(client.getByTestId("client-game-card")).toHaveCount(1)
    await expect(
      client.getByTestId("client-game-card").getByRole("heading"),
    ).toHaveText(assignedGame.title)
    const library = await clientContext.request.get(
      "/api/client-access/games",
      { headers: managedHeaders },
    )
    expect(
      (
        (await library.json()) as { games: ManagedClientGameSummary[] }
      ).games.map((game) => game.id),
    ).toEqual([quizId])
    expect(
      (
        await clientContext.request.get("/api/managed-clients", {
          headers: managedHeaders,
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await clientContext.request.get("/api/quizz", {
          headers: managedHeaders,
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await clientContext.request.post(
          `/api/client-access/games/${otherQuizId}/launch`,
          {
            headers: { ...managedHeaders, Origin: baseURL },
            data: { requestId: crypto.randomUUID() },
          },
        )
      ).status(),
    ).toBe(404)
    const unassignedRoomResponse = await request.post("/api/games", {
      headers: packageGame.headers,
      data: { quizzId: otherQuizId },
    })
    expect(unassignedRoomResponse.ok()).toBe(true)
    const unassignedRoom = (await unassignedRoomResponse.json()) as {
      gameId: string
    }
    for (const path of [
      `/party/manager/${unassignedRoom.gameId}?client=1`,
      `/display/${unassignedRoom.gameId}?client=1`,
    ]) {
      await client.goto(path)
      await expect(client).toHaveURL(`${baseURL}/client`)
      await expect(client.getByTestId("client-game-library")).toBeVisible()
    }
    expect(await client.evaluate(() => Object.keys(localStorage))).toEqual(
      expect.not.arrayContaining(["tdz_client_auth", "client-code"]),
    )
    expect(await client.evaluate(() => document.cookie)).not.toContain(
      "tdz_client_auth",
    )
    await noHorizontalOverflow(client)
    await client.getByTestId("managed-client-portal").screenshot({
      path: join(info.outputDir, "client-mobile-assigned-library.png"),
    })
    // Keep at most three rendered app pages alive for the native host/player/display.
    await page.goto("about:blank")
    await client.setViewportSize({ width: 390, height: 844 })
    const launchResponses: ManagedClientLaunchResponse[] = []
    // Read the real response before forwarding it to the page: the subsequent
    // document navigation can evict Chromium's response body from its cache.
    await client.route(
      `**/api/client-access/games/${quizId}/launch`,
      async (route) => {
        const response = await route.fetch()
        expect(response.status()).toBe(201)
        launchResponses.push(
          (await response.json()) as ManagedClientLaunchResponse,
        )
        await route.fulfill({ response })
      },
      { times: 1 },
    )
    await client.getByRole("button", { name: "Open game", exact: true }).click()
    await expect.poll(() => launchResponses.length).toBe(1)
    const [launched] = launchResponses
    await expect(client).toHaveURL(`${baseURL}${launched.hostUrl}?client=1`)
    await client.getByTestId("platform-opening-start").click()
    await client.getByTestId("platform-opening-skip").click()
    await expect(client.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-theme",
      packageGame.themeId,
    )
    await expect(
      client
        .frameLocator("[data-testid=package-runtime-frame]")
        .locator("main"),
    ).toHaveAttribute("data-theme-layout", packageGame.style)
    const displayPromise = client.waitForEvent("popup")
    const displayMediaRequest = clientContext.waitForEvent("request", {
      predicate: (req) =>
        new URL(req.url()).pathname ===
        `/api/games/${launched.gameId}/display-media`,
    })
    await client.getByTestId("host-open-display-btn").click()
    const display = await displayPromise
    expect((await displayMediaRequest).headers()["x-tadazz-session"]).toBe(
      "managed-client",
    )
    await expect(display).toHaveURL(
      `${baseURL}/display/${launched.gameId}?client=1`,
    )
    await expect(
      display.frameLocator("iframe").locator("main"),
    ).toHaveAttribute("data-theme-layout", packageGame.style)
    await expect(display.getByTestId("audience-display")).toHaveAttribute(
      "data-role",
      "spectator",
    )
    await expect
      .poll(() =>
        display.frameLocator("iframe").locator("img").evaluateAll(decoded),
      )
      .toBe(true)
    playerContext = await browser.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 844 },
    })
    const player = await playerContext.newPage()
    await player.goto(`/game?pin=${launched.inviteCode}`)
    await player.getByPlaceholder("Username here").fill("Client Game Player")
    await player.getByRole("button", { name: "Submit", exact: true }).click()
    await expect(client.getByTestId("host-connected-counter")).toHaveText(
      "1 / 1",
    )
    await client.getByRole("button", { name: "Start", exact: true }).click()
    await expect(client.getByTestId("tadazz-show")).toHaveAttribute(
      "data-voting-open",
      "true",
      { timeout: 40_000 },
    )
    await expect(
      player.frameLocator("iframe").locator(".answers button"),
    ).toHaveCount(5)
    await expect
      .poll(() =>
        player
          .frameLocator("iframe")
          .locator(".answers img")
          .evaluateAll(decoded),
      )
      .toBe(true)
    await client.getByTestId("host-pause-resume-btn").click()
    await expect(player.getByTestId("tadazz-show")).toHaveAttribute(
      "data-game-paused",
      "true",
    )
    await client.getByTestId("host-pause-resume-btn").click()
    await player
      .frameLocator("iframe")
      .locator(".answers button")
      .first()
      .click()
    await client.getByTestId("host-end-timer-btn").click()
    await expect(
      display.frameLocator("iframe").locator("main"),
    ).toHaveAttribute("data-phase", "results")
    await display.reload()
    await expect(
      display.frameLocator("iframe").locator("main"),
    ).toHaveAttribute("data-phase", "results")
    await expect(
      display.frameLocator("iframe").locator("main"),
    ).toHaveAttribute("data-theme-layout", packageGame.style)
    const audio = packageGame.fixture.manifest.files.find(
      (file) => file.kind === "audio",
    )
    expect(audio).toBeDefined()

    if (!audio) {
      throw new Error("Synthetic fixture audio missing")
    }

    const audioPath = `/media/pkg_${packageGame.receipt.sourceDigest.slice(0, 24)}_${audio.sha256}${extname(audio.path)}`
    const audioResponse = await clientContext.request.get(audioPath)
    expect(audioResponse.status()).toBe(200)
    expect(audioResponse.headers()["content-type"]).toContain("audio/")
    await client.screenshot({
      path: join(info.outputDir, "client-native-custom-host.png"),
    })
    await display.screenshot({
      path: join(info.outputDir, "client-native-custom-display-restored.png"),
    })
    await playerContext.close()
    playerContext = undefined

    // Rotation is performed through the owner UI while both client transports
    // are live. The old code and both sockets must lose access immediately.
    await page.goto("/studio/clients")
    const rotationResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(
        `/${created.client.id}/rotate-code`,
      ),
    )
    await clientCard
      .getByRole("button", { name: "Generate a new code", exact: true })
      .click()
    const rotated = (await (
      await rotationResponse
    ).json()) as ManagedClientCodeResponse
    expect(rotated.code).toMatch(/^[0-9]{6}$/u)
    expect(rotated.code).not.toBe(created.code)
    await expect(client).toHaveURL(`${baseURL}/client?expired=1`)
    await expect(display).toHaveURL(`${baseURL}/client?expired=1`)
    await display.close()
    await codeInput.fill(created.code)
    await client.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(client.getByRole("alert")).toHaveText(
      "That code is not valid. Check all six digits and try again.",
    )
    await codeInput.fill(rotated.code)
    await client.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(client.getByTestId("client-game-library")).toBeVisible()
    await client.goto("/manager/config")
    await expect(client).toHaveURL(`${baseURL}/client`)
    await expect(client.getByTestId("client-game-library")).toBeVisible()
    await expect(
      client.getByRole("link", { name: "My Games", exact: true }),
    ).toHaveCount(0)
    await client.goto("/studio/clients")
    await expect(client).toHaveURL(`${baseURL}/client`)
    await client.getByRole("button", { name: "Open game", exact: true }).click()
    await expect(client.getByTestId("host-exit-btn")).toBeVisible()
    await client.getByTestId("host-exit-btn").click()
    await expect(client).toHaveURL(`${baseURL}/client`)
    await expect(client.getByTestId("client-game-library")).toBeVisible()

    await clientCard
      .getByRole("button", {
        name: `Remove ${assignedGame.title}`,
        exact: true,
      })
      .click()
    await expect(clientCard).toContainText("No games assigned yet.")
    await client.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(client.getByTestId("client-game-card")).toHaveCount(0)
    expect(
      (
        await clientContext.request.post(
          `/api/client-access/games/${quizId}/launch`,
          {
            headers: { ...managedHeaders, Origin: baseURL },
            data: { requestId: crypto.randomUUID() },
          },
        )
      ).status(),
    ).toBe(404)
    await clientCard
      .getByRole("button", { name: "Disable access", exact: true })
      .click()
    await expect(clientCard).toContainText("Access disabled")
    await client.reload()
    await expect(codeInput).toBeVisible()
    await codeInput.fill(rotated.code)
    await client.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(client.getByRole("alert")).toHaveText(
      "That code is not valid. Check all six digits and try again.",
    )

    const enableResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(
        `/${created.client.id}/rotate-code`,
      ),
    )
    await clientCard
      .getByRole("button", { name: "Enable with a new code", exact: true })
      .click()
    const enabled = (await (
      await enableResponse
    ).json()) as ManagedClientCodeResponse
    expect(enabled.client.enabled).toBe(true)
    await client.evaluate(() => localStorage.setItem("i18nextLng", "he"))
    await client.reload()
    await expect(client.locator("html")).toHaveAttribute("dir", "rtl")
    await expect(
      client.getByLabel(hebrew.codeLabel, { exact: true }),
    ).toHaveAttribute("dir", "ltr")
    await expect(
      client.getByRole("button", { name: hebrew.continue, exact: true }),
    ).toBeInViewport({ ratio: 1 })
    await noHorizontalOverflow(client)
    await client.getByTestId("managed-client-portal").screenshot({
      path: join(info.outputDir, "client-code-entry-hebrew.png"),
    })
    await client
      .getByLabel(hebrew.codeLabel, { exact: true })
      .fill(enabled.code)
    await client
      .getByRole("button", { name: hebrew.continue, exact: true })
      .click()
    await expect(client.getByTestId("client-game-library")).toContainText(
      hebrew.noGames,
    )
    await client
      .getByRole("button", { name: hebrew.signOut, exact: true })
      .click()
    await expect(
      client.getByLabel(hebrew.codeLabel, { exact: true }),
    ).toBeVisible()
    await client.goto("/studio/games")
    await expect(client).toHaveURL(`${baseURL}/client`)
    await expect(
      client.getByLabel(hebrew.codeLabel, { exact: true }),
    ).toBeVisible()
    expect(credentialLeaks).toEqual([])
    expect(await client.evaluate(() => localStorage.getItem("token"))).toBe(
      existingOwner.token,
    )
    expect(await readOriginal()).toEqual(original)

    // Only an explicit successful owner login may leave this isolated mode.
    await client.evaluate(() => localStorage.setItem("i18nextLng", "en"))
    await client.goto("/login?returnTo=%2Fstudio%2Fclients")
    await client
      .getByLabel("Email address", { exact: true })
      .fill("package-author@example.invalid")
    await client
      .getByLabel("Password", { exact: true })
      .fill("Package-QA-only-password-2026")
    await client.getByRole("button", { name: "Log in", exact: true }).click()
    await expect(client).toHaveURL(`${baseURL}/studio/clients`)
    await expect(client.getByTestId("managed-clients")).toBeVisible()
  } finally {
    await playerContext?.close()
    await clientContext.close()
  }
})
