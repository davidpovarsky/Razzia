import { expect, type APIRequestContext, type Browser } from "@playwright/test"
import { createPackageFixture } from "../../../extensions/src/testkit/package-fixtures"
import {
  packPackage,
  packageSha,
} from "../../../extensions/src/server/packages/archive"

/** Private Oracle synthetic content/review only; never a customer approval. */
export async function installRuntimeFixture(
  request: APIRequestContext,
  style: string,
  heavy = false,
) {
  async function login(name: string) {
    const response = await request.post("/api/accounts/login", {
      data: {
        email: `package-${name}@example.invalid`,
        password: "Package-QA-only-password-2026",
      },
    })
    expect(response.ok(), await response.text()).toBe(true)

    return response.json() as Promise<{ token: string; clientId: string }>
  }
  const author = await login("author")
  const reviewer = await login("reviewer")
  const headers = { Authorization: `Bearer ${author.token}` }
  const fixture = createPackageFixture("complete", style, `1.0.${Date.now()}`)

  if (style.includes("-load-")) {
    // Isolate steady-state game/runtime fanout from the separately covered
    // opening-video choreography. Keep ten real questions and their media.
    for (const game of fixture.manifest.contents.filter(
      (content) => content.kind === "game",
    )) {
      const item = fixture.manifest.files.find(
        (file) => file.path === game.path,
      )
      const input = fixture.files.get(game.path)

      if (!item || !input) {
        throw new Error("Missing load fixture game")
      }

      const doc = JSON.parse(input.toString()) as {
        cards: Array<{ kind: string; timeSeconds?: number }>
      }
      doc.cards = doc.cards
        .filter((card) => card.kind === "quiz")
        .map((card) => ({ ...card, timeSeconds: 120 }))
      const bytes = Buffer.from(JSON.stringify(doc))
      fixture.files.set(game.path, bytes)
      item.bytes = bytes.length
      item.sha256 = packageSha(bytes)
    }
  }

  if (heavy) {
    const entry = fixture.manifest.files.find((file) =>
      file.path.endsWith("entry.tsx"),
    )
    expect(entry).toBeDefined()

    if (!entry) {
      throw new Error("Missing fixture entry")
    }

    const original = fixture.files.get(entry.path)

    if (!original) {
      throw new Error("Missing fixture source")
    }

    // A bounded 60ms main-thread task every 500ms: actual customer TSX work,
    // not an infinite loop that could freeze a shared browser process.
    const code = original
      .toString()
      .replace(
        "return <main",
        "React.useEffect(()=>{const timer=setInterval(()=>{const until=performance.now()+60;while(performance.now()<until){}},500);return()=>clearInterval(timer)},[]);return <main",
      )
    const bytes = Buffer.from(code)
    fixture.files.set(entry.path, bytes)
    entry.bytes = bytes.length
    entry.sha256 = packageSha(bytes)
  }

  const bytes = packPackage(fixture.manifest, fixture.files)
  const upload = await request.post("/api/packages/uploads", {
    headers: { ...headers, "Idempotency-Key": packageSha(bytes) },
    data: bytes,
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  const draft = (await upload.json()) as { uploadId: string }
  const path = `/api/packages/uploads/${draft.uploadId}`
  expect((await request.post(`${path}/build`, { headers })).ok()).toBe(true)
  await expect
    .poll(
      async () => {
        const response = await request.get(path, { headers })
        const result = (await response.json()) as { phase: string }

        return result.phase
      },
      { timeout: 120_000 },
    )
    .toBe("preview-ready")
  const receipt = (await (await request.get(path, { headers })).json()) as {
    revision: number
    sourceDigest: string
    buildDigest: string
  }
  const approved = await request.post(`${path}/approval`, {
    headers: {
      Authorization: `Bearer ${reviewer.token}`,
      "X-Tadazz-Workspace": author.clientId,
    },
    data: {
      revision: receipt.revision,
      sourceDigest: receipt.sourceDigest,
      buildDigest: receipt.buildDigest,
      qaEvidenceSha256: packageSha("Synthetic load QA; not human approval"),
      rightsReviewed: true,
      contentReviewed: true,
      accessibilityReviewed: true,
      performanceReviewed: true,
    },
  })
  expect(approved.ok(), await approved.text()).toBe(true)
  const installed = await request.post(`${path}/install`, {
    headers,
    data: {
      expectedRevision: receipt.revision,
      selected: fixture.manifest.contents.map((content) => content.id),
    },
  })
  expect(installed.ok(), await installed.text()).toBe(true)
  const result = (await installed.json()) as { installedGames: string[] }
  const [gameId] = result.installedGames
  expect(gameId).toBeTruthy()
  const room = await request.post("/api/games", {
    headers,
    data: { quizzId: gameId },
  })
  expect(room.ok(), await room.text()).toBe(true)
  const game = (await room.json()) as { gameId: string; inviteCode: string }

  return {
    token: author.token,
    gameId: game.gameId,
    inviteCode: game.inviteCode,
    themeId: `fixture-${style}`,
  }
}

export async function joinIdleRuntimePlayer(
  browser: Browser,
  inviteCode: string,
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const player = await context.newPage()
  await player.goto(`http://127.0.0.1:3190/game?pin=${inviteCode}`)
  await player
    .getByPlaceholder("Username here")
    .fill("Runtime load participant")
  await player.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(player.getByTestId("package-runtime-frame")).toBeVisible()

  return context
}
