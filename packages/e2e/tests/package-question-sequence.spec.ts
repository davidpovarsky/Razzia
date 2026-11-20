import {
  test,
  expect,
  type APIRequestContext,
  type Frame,
  type Page,
} from "@playwright/test"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { join } from "node:path"
import { createPackageFixture } from "../../../extensions/src/testkit/package-fixtures"
import { packageSha } from "../../../extensions/src/server/packages/archive"

interface SequenceObservation {
  marker: string
  questionAt: number | null
  answersAt: number | null
  timerAt: number | null
  earlyAnswers: number
  earlyTimer: number
  readingClocks: Array<{ remainingMs: number; deadline: number | null }>
  headingReplacements: number
  stageReplacements: number
  phases: string[]
}
interface ProofGroup {
  passed: boolean
  [key: string]: unknown
}
interface PresentationProof {
  revision: string
  sourceRun: string
  passed: boolean
  sequence: ProofGroup
  continuity: ProofGroup
  fallbackLatch: ProofGroup
  newQuestionRetry: ProofGroup
  currentStep: string
  failure?: string
  failureState?: Record<string, unknown>
}
declare global {
  interface Window {
    __packageQuestionProbe?: { read: () => SequenceObservation }
    __packageRuntimeErrors?: number
  }
}

// Passive observation only: real SDK messages, real DOM and the browser's clock.
// No fake time, renderer substitution, postMessage replacement or CSS overrides.
function installProbe() {
  if (window === window.top) {
    window.__packageRuntimeErrors = 0
    window.addEventListener("message", (event: MessageEvent<unknown>) => {
      const frame = document.querySelector<HTMLIFrameElement>(
        '[data-testid="package-runtime-frame"]',
      )
      const message = event.data as { type?: string } | null

      if (
        event.source === frame?.contentWindow &&
        event.origin === "null" &&
        message?.type === "RUNTIME_ERROR"
      ) {
        window.__packageRuntimeErrors = (window.__packageRuntimeErrors ?? 0) + 1
      }
    })

    return
  }

  const observation: SequenceObservation = {
    marker: crypto.randomUUID(),
    questionAt: null,
    answersAt: null,
    timerAt: null,
    earlyAnswers: 0,
    earlyTimer: 0,
    readingClocks: [],
    headingReplacements: 0,
    stageReplacements: 0,
    phases: [],
  }
  let originalHeading: Element | null = null
  let originalStage: Element | null = null

  window.__packageQuestionProbe = {
    read: () => ({
      ...observation,
      readingClocks: observation.readingClocks.map((clock) => ({ ...clock })),
      phases: [...observation.phases],
    }),
  }
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = event.data as {
      type?: string
      snapshot?: {
        phase?: string
        remainingMs?: number
        deadline?: number | null
      }
    } | null

    if (
      event.source !== window.parent ||
      (message?.type !== "BOOTSTRAP" && message?.type !== "STATE_SNAPSHOT")
    ) {
      return
    }

    const { snapshot } = message

    if (
      snapshot?.phase === "question" &&
      observation.readingClocks.length < 32
    ) {
      observation.readingClocks.push({
        remainingMs: snapshot.remainingMs ?? -1,
        deadline: snapshot.deadline === null ? null : (snapshot.deadline ?? -1),
      })
    }
  })

  const visible = (element: Element | null) => {
    if (!(element instanceof HTMLElement)) {
      return false
    }

    const rectangle = element.getBoundingClientRect()
    const style = getComputedStyle(element)

    return (
      element.isConnected &&
      rectangle.width > 0 &&
      rectangle.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0
    )
  }
  const sample = () => {
    const stage = document.querySelector("main[data-theme-layout]")
    const heading = stage?.querySelector("header h1") ?? null
    const phase = stage?.getAttribute("data-phase") ?? ""

    if (phase && !observation.phases.includes(phase)) {
      observation.phases.push(phase)
    }

    const answersVisible = Array.from(
      stage?.querySelectorAll(".answers button") ?? [],
    ).some(visible)
    const timerVisible = visible(
      stage?.querySelector('aside[aria-label="timer"]') ?? null,
    )

    if (phase === "question" && visible(heading)) {
      if (observation.questionAt === null) {
        observation.questionAt = performance.now()
        originalHeading = heading
        originalStage = stage
      }

      observation.earlyAnswers += Number(answersVisible)
      observation.earlyTimer += Number(timerVisible)
    }

    if (observation.questionAt !== null) {
      if (heading !== originalHeading) {
        observation.headingReplacements += 1
      }

      if (stage !== originalStage) {
        observation.stageReplacements += 1
      }

      if (answersVisible && observation.answersAt === null) {
        observation.answersAt = performance.now()
      }

      if (timerVisible && observation.timerAt === null) {
        observation.timerAt = performance.now()
      }
    }

    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
}

async function login(request: APIRequestContext, role: string) {
  const response = await request.post("/api/accounts/login", {
    data: {
      email: `package-${role}@example.invalid`,
      password: "Package-QA-only-password-2026",
    },
  })
  expect(response.ok(), "Synthetic account login").toBe(true)

  return response.json() as Promise<{ token: string; clientId: string }>
}

function readObservation(frame: Frame) {
  return frame.evaluate(() => {
    const probe = window.__packageQuestionProbe

    if (!probe) {
      throw new Error("Passive package probe missing")
    }

    return probe.read()
  })
}

async function getQuestionFrame(page: Page, question: string) {
  await expect(
    page
      .frameLocator('[data-testid="package-runtime-frame"]')
      .locator('main[data-phase="question"] header h1'),
  ).toHaveText(question)
  const locator = page.getByTestId("package-runtime-frame")
  await expect(locator).toHaveCount(1)
  const handle = await locator.elementHandle()
  const frame = await handle.contentFrame()

  if (!frame) {
    throw new Error("Expected one real package iframe")
  }

  await expect(frame.locator("header h1")).toHaveText(question)
  await expect(frame.locator("main")).toHaveAttribute("data-phase", "question")

  return { handle, frame }
}

async function finishVoting(page: Page) {
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-voting-open",
    "true",
  )
  await page.getByTestId("host-end-timer-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-scene",
    "results",
  )
}

async function nextQuestion(page: Page) {
  await page.getByTestId("host-next-screen-btn").click()
  await expect
    .poll(() => page.getByTestId("tadazz-show").getAttribute("data-show-scene"))
    .not.toBe("results")
  const scene = await page
    .getByTestId("tadazz-show")
    .getAttribute("data-show-scene")

  if (scene === "leaderboard") {
    await page.getByTestId("host-next-screen-btn").click()
  }
}

test("package question sequence, persistent iframe and real SDK failure recovery", async ({
  page,
  context,
  browser,
  request,
}) => {
  const evidence = process.env.TADAZZ_PACKAGE_QA_EVIDENCE ?? ""
  const revision = process.env.TADAZZ_PACKAGE_PRESENTATION_SHA ?? ""
  const sourceRun = process.env.TADAZZ_PACKAGE_PRESENTATION_SOURCE_RUN ?? ""
  expect(evidence).toBe("/evidence/browser")
  expect(revision).toMatch(/^[a-f0-9]{40}$/u)
  const proof: PresentationProof = {
    revision,
    sourceRun,
    passed: false,
    sequence: { passed: false },
    continuity: { passed: false },
    fallbackLatch: { passed: false },
    newQuestionRetry: { passed: false },
    currentStep: "install-isolated-fixture",
  }
  const save = () =>
    fs.writeFileSync(
      join(evidence, "package-presentation-proof.json"),
      `${JSON.stringify(proof, null, 2)}\n`,
      "utf8",
    )
  fs.mkdirSync(evidence, { recursive: true })
  save()
  const playerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
  })

  try {
    await context.addInitScript(installProbe)
    const author = await login(page.request, "author")
    const reviewer = await login(request, "reviewer")
    const headers = { Authorization: `Bearer ${author.token}` }
    await page.addInitScript((token) => {
      if (window === window.top) {
        localStorage.setItem("token", token)
      }
    }, author.token)
    const style = `sequence-${revision.slice(0, 12)}`
    const fixture = createPackageFixture("complete", style, "1.0.0")
    const upload = await request.post("/api/packages/uploads", {
      headers: { ...headers, "Idempotency-Key": packageSha(fixture.bytes) },
      data: fixture.bytes,
    })
    expect(upload.ok(), "Synthetic package upload").toBe(true)
    const draft = (await upload.json()) as { uploadId: string }
    const uploadPath = `/api/packages/uploads/${draft.uploadId}`
    const build = await request.post(`${uploadPath}/build`, { headers })
    expect(build.ok(), "Pinned isolated package worker accepted build").toBe(
      true,
    )
    await expect
      .poll(
        async () => {
          const response = await request.get(uploadPath, { headers })
          expect(response.ok()).toBe(true)

          return ((await response.json()) as { phase: string }).phase
        },
        { timeout: 120_000 },
      )
      .toBe("preview-ready")
    const receipt = (await (
      await request.get(uploadPath, { headers })
    ).json()) as {
      revision: number
      sourceDigest: string
      buildDigest: string
    }
    const review = {
      revision: receipt.revision,
      sourceDigest: receipt.sourceDigest,
      buildDigest: receipt.buildDigest,
      qaEvidenceSha256: createHash("sha256")
        .update("synthetic QA approval fixture, NOT human rights approval")
        .digest("hex"),
      rightsReviewed: true,
      contentReviewed: true,
      accessibilityReviewed: true,
      performanceReviewed: true,
    }
    expect(
      (
        await request.post(`${uploadPath}/approval`, {
          headers,
          data: review,
        })
      ).status(),
    ).toBe(403)
    const approved = await request.post(`${uploadPath}/approval`, {
      headers: {
        Authorization: `Bearer ${reviewer.token}`,
        "X-Tadazz-Workspace": author.clientId,
      },
      data: review,
    })
    expect(approved.ok(), "Separate synthetic reviewer approval").toBe(true)
    const approvedReceipt = (await (
      await request.get(uploadPath, { headers })
    ).json()) as {
      revision: number
    }
    const install = await request.post(`${uploadPath}/install`, {
      headers,
      data: {
        expectedRevision: approvedReceipt.revision,
        selected: [`fixture-${style}`, "demo-game-1"],
      },
    })
    expect(install.ok(), "Private package installation").toBe(true)
    const installed = (await install.json()) as { installedGames: string[] }
    expect(installed.installedGames).toHaveLength(1)
    const room = await request.post("/api/games", {
      headers,
      data: { quizzId: installed.installedGames[0] },
    })
    expect(room.ok(), "Private package room").toBe(true)
    const game = (await room.json()) as { gameId: string; inviteCode: string }
    const settings = await request.patch(`/api/games/${game.gameId}/settings`, {
      headers,
      data: {
        endOnAllAnswered: false,
        autoAdvance: {
          enable: false,
          responsesDelay: 5,
          leaderboardDelay: 5,
        },
      },
    })
    expect(
      settings.ok(),
      "Manual progression preserves observation window",
    ).toBe(true)
    const admission = await request.patch(
      `/api/games/${game.gameId}/roster/settings`,
      {
        headers,
        data: { allowUnregisteredPlayers: true },
      },
    )
    expect(admission.ok(), "Synthetic player admission").toBe(true)

    proof.currentStep = "root-platform-opening"
    save()
    await page.goto(`/party/manager/${game.gameId}?lng=en`)
    const opening = page.getByTestId("platform-game-opening")
    await expect(opening).toHaveAttribute(
      "data-platform-opening-stage",
      "standby",
    )
    await page.getByTestId("platform-opening-start").click()
    await expect(opening).toHaveAttribute(
      "data-platform-opening-stage",
      "opening",
    )
    // Let the real root-owned ceremony finish; joining happens only in its lobby.
    await expect(opening).toHaveCount(0)

    proof.currentStep = "root-lobby-and-player-join"
    save()
    const hostStage = page.getByTestId("tadazz-show")
    const hostToolbar = page.getByTestId("manager-control-toolbar")
    const packageFrame = page.frameLocator(
      '[data-testid="package-runtime-frame"]',
    )
    await expect(hostStage).toHaveAttribute("data-show-scene", "lobby")
    await expect(hostToolbar).toHaveAttribute("data-host-lobby", "true")
    await expect(packageFrame.locator("main")).toHaveAttribute(
      "data-phase",
      "lobby",
    )
    await expect(packageFrame.locator("header h1")).toHaveText("Lobby")
    const player = await playerContext.newPage()
    await player.goto(
      `http://127.0.0.1:3190/game?pin=${game.inviteCode}&lng=en`,
    )
    await player.getByPlaceholder("Username here").fill("Sequence QA Player")
    await player.getByRole("button", { name: "Submit", exact: true }).click()
    await expect(player).toHaveURL(
      new URL(game.gameId, "http://127.0.0.1:3190/party/").href,
    )
    await expect(player.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-scene",
      "lobby",
    )
    await expect(page.getByTestId("host-connected-counter")).toHaveText(
      /^1\s*\/\s*1$/u,
    )
    await page.bringToFront()

    proof.currentStep = "root-start-leaves-ready-lobby"
    save()
    await hostToolbar
      .getByRole("button", { name: "Start", exact: true })
      .click()
    await expect(hostStage).not.toHaveAttribute("data-show-scene", "lobby")

    proof.currentStep = "visible-question-two-second-sequence"
    save()
    const first = await getQuestionFrame(page, "Question 1")
    await expect(first.frame.locator(".answers button")).toHaveCount(0)
    await expect(first.frame.locator('aside[aria-label="timer"]')).toHaveCount(
      0,
    )
    await expect(first.frame.locator("main")).toHaveAttribute(
      "data-phase",
      "voting",
    )
    await expect
      .poll(async () => {
        const current = await readObservation(first.frame)

        return current.answersAt !== null && current.timerAt !== null
      })
      .toBe(true)
    const firstReading = await readObservation(first.frame)
    const { questionAt, answersAt, timerAt } = firstReading

    if (questionAt === null || answersAt === null || timerAt === null) {
      throw new Error("Missing physically visible phase boundaries")
    }

    const answersLeadMs = answersAt - questionAt
    const timerLeadMs = timerAt - questionAt
    // Same real-frame tolerance as the public gallery acceptance, measured from
    // visible question DOM rather than the parent transport/status timestamp.
    expect(answersLeadMs).toBeGreaterThanOrEqual(1800)
    expect(answersLeadMs).toBeLessThanOrEqual(2500)
    expect(timerLeadMs).toBeGreaterThanOrEqual(1800)
    expect(timerLeadMs).toBeLessThanOrEqual(2500)
    expect(Math.abs(answersAt - timerAt)).toBeLessThanOrEqual(34)
    expect(firstReading.earlyAnswers).toBe(0)
    expect(firstReading.earlyTimer).toBe(0)
    expect(firstReading.readingClocks.length).toBeGreaterThan(0)
    expect(
      firstReading.readingClocks.every(
        (clock) => clock.deadline === null && clock.remainingMs === 0,
      ),
    ).toBe(true)
    expect(firstReading.headingReplacements).toBe(0)
    expect(firstReading.stageReplacements).toBe(0)
    expect(
      await first.handle.evaluate(
        (element) =>
          element.isConnected &&
          element ===
            document.querySelector('[data-testid="package-runtime-frame"]'),
      ),
    ).toBe(true)
    proof.sequence = {
      passed: true,
      nominalLeadInMs: 2000,
      answersLeadMs,
      timerLeadMs,
      firstPaintDifferenceMs: Math.abs(answersAt - timerAt),
      ...firstReading,
    }
    save()

    proof.currentStep = "actual-vote-and-question-identity-through-results"
    const playerFrame = player.frameLocator(
      '[data-testid="package-runtime-frame"]',
    )
    await expect(playerFrame.locator(".answers button")).toHaveCount(5)
    await playerFrame.locator(".answers button").first().click()
    await expect(playerFrame.locator("main")).toHaveAttribute(
      "data-phase",
      "voteLocked",
    )
    await page.bringToFront()
    await finishVoting(page)
    await expect(first.frame.locator("main")).toHaveAttribute(
      "data-phase",
      "results",
    )
    await expect(first.frame.locator("header h1")).toHaveText("Question 1")
    const afterResults = await readObservation(first.frame)
    expect(afterResults.marker).toBe(firstReading.marker)
    expect(afterResults.headingReplacements).toBe(0)
    expect(afterResults.stageReplacements).toBe(0)
    expect(
      await first.handle.evaluate(
        (element) =>
          element.isConnected &&
          element ===
            document.querySelector('[data-testid="package-runtime-frame"]'),
      ),
    ).toBe(true)
    expect(afterResults.phases).toEqual(
      expect.arrayContaining(["question", "voting", "results"]),
    )
    proof.continuity = {
      passed: true,
      iframeRetained: true,
      questionHeadingRetained: true,
      actualPlayerVoteLocked: true,
      observation: afterResults,
    }
    await page.screenshot({
      path: join(evidence, "package-question-results.png"),
    })
    save()

    proof.currentStep = "real-sdk-error-native-fallback"
    await nextQuestion(page)
    const second = await getQuestionFrame(page, "Question 2")
    const secondMarker = (await readObservation(second.frame)).marker
    const beforeErrors = await page.evaluate(
      () => window.__packageRuntimeErrors ?? 0,
    )
    await second.frame.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "Synthetic package presentation recovery probe",
        }),
      )
    })
    await expect
      .poll(() => page.evaluate(() => window.__packageRuntimeErrors ?? 0))
      .toBe(beforeErrors + 1)
    await expect(page.getByTestId("package-runtime-frame")).toHaveCount(0)
    await expect(page.locator(".tzv4-stage .q-text")).toHaveText("Question 2")
    await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
      "data-voting-open",
      "true",
    )
    await expect(page.getByTestId("package-runtime-frame")).toHaveCount(0)
    await expect(page.locator(".tzv4-stage .q-text")).toHaveText("Question 2")
    await finishVoting(page)
    await expect(page.getByTestId("package-runtime-frame")).toHaveCount(0)
    await expect(page.locator(".tzv4-stage .q-text")).toHaveText("Question 2")
    proof.fallbackLatch = {
      passed: true,
      actualSdkRuntimeErrors: 1,
      nativeDuringVoting: true,
      nativeDuringResults: true,
      sameRoom: true,
    }
    await page.screenshot({
      path: join(evidence, "package-question-native-fallback.png"),
    })
    save()

    proof.currentStep = "new-question-sandbox-retry"
    await nextQuestion(page)
    const third = await getQuestionFrame(page, "Question 3")
    const thirdObservation = await readObservation(third.frame)
    expect(thirdObservation.marker).not.toBe(secondMarker)
    expect(await second.handle.evaluate((element) => element.isConnected)).toBe(
      false,
    )
    await expect(third.frame.locator("main")).toHaveAttribute(
      "data-phase",
      "voting",
    )
    await expect(third.frame.locator("header h1")).toHaveText("Question 3")
    expect(await page.evaluate(() => window.__packageRuntimeErrors ?? 0)).toBe(
      beforeErrors + 1,
    )
    await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
    expect(
      await page
        .getByTestId("manager-control-toolbar")
        .evaluate((toolbar) => toolbar.ownerDocument.defaultView === window),
    ).toBe(true)
    proof.newQuestionRetry = {
      passed: true,
      freshIframe: true,
      previousFailedIframeDisconnected: true,
      sameRoom: true,
      rootHostControlsRetained: true,
      phases: (await readObservation(third.frame)).phases,
    }
    proof.currentStep = "complete"
    proof.passed = true
    await page.screenshot({
      path: join(evidence, "package-question-retry.png"),
    })
    save()
  } catch (error) {
    proof.failureState = await page
      .evaluate(() => ({
        platformOpeningStage:
          document
            .querySelector('[data-testid="platform-game-opening"]')
            ?.getAttribute("data-platform-opening-stage") ?? null,
        hostScene:
          document
            .querySelector('[data-testid="tadazz-show"]')
            ?.getAttribute("data-show-scene") ?? null,
        hostLobby:
          document
            .querySelector('[data-testid="manager-control-toolbar"]')
            ?.getAttribute("data-host-lobby") ?? null,
        connected:
          document.querySelector('[data-testid="host-connected-counter"]')
            ?.textContent ?? null,
        iframeCount: document.querySelectorAll(
          '[data-testid="package-runtime-frame"]',
        ).length,
      }))
      .catch(() => ({ unavailable: true }))
    proof.failureState.frames = await Promise.all(
      page
        .frames()
        .filter((frame) => frame.parentFrame() !== null)
        .map((frame) =>
          frame
            .evaluate(() => ({
              phase:
                document
                  .querySelector("main[data-theme-layout]")
                  ?.getAttribute("data-phase") ?? null,
              heading:
                document
                  .querySelector("main[data-theme-layout] header h1")
                  ?.textContent.slice(0, 100) ?? null,
              observation: window.__packageQuestionProbe?.read() ?? null,
            }))
            .catch(() => ({ unavailable: true })),
        ),
    )
    proof.failure = (
      error instanceof Error ? error.message : "Unknown browser failure"
    )
      .replace(/https?:\/\/[^\s"'<>]+/gu, "[redacted-url]")
      .replace(/Bearer\s+[^\s]+/gu, "Bearer [redacted]")
    save()
    await page
      .screenshot({
        path: join(evidence, "package-question-failure.png"),
      })
      .catch(() => undefined)
    throw new Error(
      `Package presentation failed at ${proof.currentStep}: ${proof.failure}`,
    )
  } finally {
    await playerContext.close()
  }
})
