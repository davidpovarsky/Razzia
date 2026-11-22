import { test, expect, type Page } from "@playwright/test"
import {
  createDefaultQuizExtrasV2,
  type TimelineItem,
} from "../../../extensions/src/core/studio-timeline-schema"
import { computeCanonicalBaseDigest } from "@razzia/extensions/core"
import { completeCreatingWorldsShow } from "../../../extensions/src/core/creating-worlds-show"
import { createGame, startGame } from "../utils/manager"
import { answer, joinGame } from "../utils/player"
import fs from "node:fs"
import { join } from "node:path"
import { randomUUID, createHash } from "node:crypto"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { t } from "../utils/i18n"

interface RoundObservation {
  name: string
  ordinal: number
  questionNumber?: number
  answeredCount?: number
}

const observeRounds = (page: Page) => {
  const rows: RoundObservation[] = []
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const raw = typeof payload === "string" ? payload : payload.toString()

      if (!raw.startsWith("42")) {
        return
      }

      let packet: unknown = undefined

      try {
        packet = JSON.parse(raw.slice(raw.indexOf("[")))
      } catch {
        return
      }

      if (!Array.isArray(packet)) {
        return
      }

      const [event, data] = packet as unknown[]

      if (event === EVENTS.GAME.PLAYER_ANSWER && typeof data === "number") {
        rows.push({ name: event, ordinal: rows.length, answeredCount: data })

        return
      }

      if (
        event !== EVENTS.GAME.STATUS ||
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
      ) {
        return
      }

      const status = data as Record<string, unknown>

      if (typeof status.name !== "string") {
        return
      }

      const value = status.data
      const number =
        value && typeof value === "object" && "questionNumber" in value
          ? value.questionNumber
          : undefined
      rows.push({
        name: status.name,
        ordinal: rows.length,
        ...(typeof number === "number" ? { questionNumber: number } : {}),
      })
    })
  })

  return rows
}

const next = async (page: Page) => {
  const control = page.getByTestId("host-next-screen-btn")
  await expect(control).toHaveCount(1)
  await expect(control).toBeVisible()
  await expect(control).toBeEnabled()
  await control.click()
}

const configureManualCompletion = async (host: Page) => {
  await host.getByRole("button", { name: t("game:settings.title") }).click()
  const settings = host.getByRole("dialog")
  const completion = settings.getByTestId("settings-end-on-all-answered")

  if ((await completion.getAttribute("aria-checked")) === "true") {
    await completion.click()
  }

  await expect(completion).toHaveAttribute("aria-checked", "false")
  const auto = settings.getByRole("switch", {
    name: t("game:settings.autoAdvance.label"),
    exact: true,
  })

  if ((await auto.getAttribute("aria-checked")) === "true") {
    await auto.click()
  }

  await expect(auto).toHaveAttribute("aria-checked", "false")
  await settings
    .getByRole("button", { name: t("common:save"), exact: true })
    .click()
  await expect(settings).toBeHidden()
}

const endRecordedVote = async (
  host: Page,
  rows: RoundObservation[],
  count: number,
) => {
  const renderer = host.getByTestId("tadazz-show")
  await expect(renderer).toHaveAttribute("data-role", "manager")
  await expect(renderer).toHaveAttribute("data-show-scene", "voting")
  const voting = rows.filter((row) => row.name === STATUS.SELECT_ANSWER).at(-1)
  expect(voting).toBeDefined()

  if (!voting) {
    throw new Error("An actual voting status is required")
  }

  await expect
    .poll(() =>
      rows.some(
        (row) =>
          row.ordinal > voting.ordinal &&
          row.name === EVENTS.GAME.PLAYER_ANSWER &&
          row.answeredCount === count,
      ),
    )
    .toBe(true)
  const end = host.getByTestId("host-end-timer-btn")
  await expect(end).toHaveCount(1)
  await expect(end).toBeVisible()
  await expect(end).toBeEnabled()
  await end.click()
  await expect
    .poll(() =>
      rows.some(
        (row) =>
          row.ordinal > voting.ordinal && row.name === STATUS.SHOW_RESPONSES,
      ),
    )
    .toBe(true)
  await expect(renderer).toHaveAttribute("data-show-scene", "results")
}

test("native source cards: 40 saved representatives, focus pages, live join, readiness and story progress", async ({
  page: host,
  browser,
  request,
}, info) => {
  const hostWire = observeRounds(host)
  const title = `Source cards acceptance ${randomUUID()}`
  const ids = Array.from(
    {
      length: 10,
    },
    () => crypto.randomUUID(),
  )
  const assets = ["pirate", "shadchan", "dog", "therapist", "lamplighter"]
  const q = {
    subject: title,
    gameMode: "survey" as const,
    questions: ids.map((_, i) => ({
      type: "single" as const,
      question: `Question ${i + 1}`,
      answers: ["Pirate", "Shadchan", "Dog", "Therapist", "Lamplighter"],
      solutions: [],
      cooldown: 3,
      time: 120,
    })),
  }
  const initial = createDefaultQuizExtrasV2(
    randomUUID(),
    ids,
    computeCanonicalBaseDigest(q),
  )
  for (const id of ids) {
    initial.perQuestion[id] = {
      answerVisuals: assets.map((asset, i) => ({
        answerIndex: i,
        display: "both",
        url: `/tadazz-show/second-library/cards/${asset}.svg`,
        alt: asset,
      })),
    }
  }
  const extras = completeCreatingWorldsShow(initial)
  const defaultPresets = extras.timeline.flatMap((item) => {
    if (item.kind !== "animation") {
      return []
    }

    const timelineScene = new Map(Object.entries(extras.scenes)).get(
      item.sceneId,
    )

    return timelineScene?.kind === "animation" ? [timelineScene.preset] : []
  })
  const optionalPresets = [
    "company-opening",
    "grand-opening",
    "representative-directory",
    "phone-instructions",
    "connection-readiness",
    "story-progress",
  ]
  expect(defaultPresets[0]).toBe("round-one")
  expect(
    defaultPresets.filter((preset) => optionalPresets.includes(preset)),
  ).toEqual([])
  expect(extras.roster.participants).toHaveLength(40)
  expect(
    extras.roster.participants.every(
      (person) => person.tableNumber === undefined,
    ),
  ).toBe(true)
  // These existing optional source cards are explicitly authored only in this
  // fixture. The production default remains a single lobby then round-one.
  const authored = (
    preset: (typeof optionalPresets)[number],
    groupPage?: number,
  ): TimelineItem => {
    const id = randomUUID()
    extras.scenes[id] = {
      id,
      kind: "animation",
      preset,
      round: 1,
      advance: "manual",
      durationMs: 10000,
      ...(groupPage === undefined ? {} : { groupPage }),
    }

    return { id: randomUUID(), kind: "animation", sceneId: id }
  }
  const optionalOpening = [
    authored("company-opening"),
    authored("grand-opening"),
    authored("representative-directory"),
    ...[0, 1, 2, 3].map((group) => authored("representative-directory", group)),
    authored("phone-instructions"),
    authored("connection-readiness"),
  ]
  extras.timeline.unshift(...optionalOpening)
  const firstTopPick = extras.timeline.findIndex((item) => {
    if (item.kind !== "animation") {
      return false
    }

    const timelineScene = new Map(Object.entries(extras.scenes)).get(
      item.sceneId,
    )

    return (
      timelineScene?.kind === "animation" && timelineScene.preset === "top-pick"
    )
  })
  expect(firstTopPick).toBeGreaterThan(0)
  extras.timeline.splice(firstTopPick + 1, 0, authored("story-progress"))
  const callerPhone = "+12025550123"
  extras.roster.participants[0].phoneE164 = callerPhone
  const login = await request.post("/api/auth/manager", {
    data: {
      password: "e2e-password",
    },
  })
  const { token } = (await login.json()) as {
    token: string
  }
  const save = await request.post("/api/extensions/quizzes", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      quizz: q,
      extras,
    },
  })
  expect(save.ok(), await save.text()).toBe(true)
  const code = await createGame(host, title)
  const room = /\/party\/manager\/([0-9a-f-]{36})/u.exec(
    new URL(host.url()).pathname,
  )

  if (!room) {
    throw new Error("Actual native manager room is required")
  }

  const [, gameId] = room
  await configureManualCompletion(host)
  const displayContext = await browser.newContext({
    viewport: {
      width: 1920,
      height: 1080,
    },
  })
  const display = await displayContext.newPage()
  await display.goto(`/display/${gameId}`)
  // Preserve the default-lobby40 requirement before any optional scene/vote.
  for (const page of [host, display]) {
    const lobby = page.getByTestId("tadazz-screen-lobby")
    await expect(lobby).toBeVisible()
    for (const person of extras.roster.participants) {
      await expect(
        lobby.getByText(person.displayName, { exact: true }),
      ).toBeVisible()
    }
  }
  const playerContext = await browser.newContext({
    viewport: {
      width: 390,
      height: 844,
    },
    reducedMotion: "reduce",
  })
  const player = await playerContext.newPage()
  const guest = host.getByTestId("host-guest-join-toggle")
  await expect(guest).toBeEnabled()

  if ((await guest.getAttribute("aria-checked")) !== "true") {
    await guest.click()
  }

  await expect(guest).toHaveAttribute("aria-checked", "true")
  await expect(host.getByTestId("host-guest-join-control")).toHaveAttribute(
    "aria-busy",
    "false",
  )
  await joinGame(player, code, "Native QA voter")
  await startGame(host)
  const out = info.outputPath("native-source-evidence")
  fs.mkdirSync(out, {
    recursive: true,
  })
  async function scene(name: string) {
    for (const page of [host, display]) {
      await expect(page.locator(`[data-v4-scene="${name}"]`)).toBeVisible()
    }
    await host.waitForTimeout(2200)
  }
  async function shot(name: string) {
    await host.screenshot({
      path: join(out, `${name}-host.png`),
      timeout: 15000,
    })
    await display.screenshot({
      path: join(out, `${name}-display.png`),
      timeout: 15000,
    })
  }
  await scene("company-opening")
  await next(host)
  await scene("grand-opening")
  await next(host)
  await scene("representative-directory")
  for (const page of [host, display]) {
    await expect(page.locator(".full-rep-row")).toHaveCount(40)
    await expect(page.locator(".full-rep-name").first()).toHaveText(
      "Test Representative 01",
    )
    await expect(page.locator(".full-rep-name").last()).toHaveText(
      "Test Representative 40",
    )
    await expect(page.locator(".full-rep-row.connected")).toHaveCount(0)
    expect(await page.locator("iframe").count()).toBe(0)
  }
  await shot("directory-40")
  // Original HTML is opened only as a test reference, never embedded in the game.
  const referencePath = join(
    import.meta.dirname,
    "../../../docs/extensions/references/user-20261106/source/second library.html",
  )
  expect(
    createHash("sha256").update(fs.readFileSync(referencePath)).digest("hex"),
  ).toBe("a9328b7d2931dcaee7ae3efa00389fe49130acab71fe8621cb35d97d69d220fa")
  const reference = await browser.newPage({
    viewport: {
      width: 1920,
      height: 1080,
    },
  })
  await reference.goto(`file:///${referencePath.replaceAll("\\", "/")}`)
  await reference.addStyleTag({
    content:
      "#stage{position:fixed!important;left:0!important;top:0!important;transform:none!important;width:1920px!important;height:1080px!important;z-index:9999!important}",
  })
  await reference.evaluate(
    (reps) =>
      (
        window as unknown as {
          TadazzShowPreview: {
            kit: {
              play(...args: unknown[]): unknown
            }
          }
        }
      ).TadazzShowPreview.kit.play("representative-directory", {
        representatives: reps,
        connectedTables: [],
        isLive: true,
      }),
    extras.roster.participants.map((p, i) => ({
      table: i + 1,
      name: p.displayName,
    })),
  )
  await reference.waitForTimeout(2200)
  await reference.screenshot({
    path: join(out, "directory-40-reference.png"),
  })
  /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
  const metrics = async (page: typeof display) =>
    page.locator(".full-rep-row").evaluateAll((rows) =>
      rows.map((row) => {
        const r = row.getBoundingClientRect()

        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        }
      }),
    )
  /* oxlint-enable require-await, typescript/require-await */
  const expected = await metrics(reference),
    actual = await metrics(display)
  expect(actual).toHaveLength(40)
  for (let i = 0; i < 40; i += 1) {
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(
        Math.abs(actual[i][key] - expected[i][key]),
        `Row ${i + 1} ${key}`,
      ).toBeLessThan(3)
    }
  }
  await reference.close()
  const retainedRow = await display.locator('[data-table="2"]').elementHandle()
  expect(retainedRow).not.toBeNull()
  const sim = await request.post("/api/games/pilot-phone", {
    headers: {
      "x-tada-pilot-secret": "next-local-simulation-only",
    },
    data: {
      action: "join_or_poll",
      gameId,
      callId: `native-roster-demo-${randomUUID()}`,
      phone: callerPhone,
      rosterPlayerId: extras.roster.participants[0].rosterPlayerId,
    },
  })
  expect(sim.ok(), await sim.text()).toBe(true)
  await expect(display.locator(".full-rep-row.connected")).toHaveCount(1)
  expect(
    await display
      .locator('[data-table="2"]')
      .evaluate((element, original) => element === original, retainedRow),
  ).toBe(true)
  await display.reload()
  await scene("representative-directory")
  await expect(display.locator(".full-rep-row.connected")).toHaveCount(1)
  await shot("directory-one-joined")
  for (let group = 0; group < 4; group += 1) {
    await next(host)
    await scene("representative-directory")
    await expect(display.locator(".full-rep-row")).toHaveCount(10)
    await expect(display.locator(".full-table-number").first()).toHaveText(
      String(group * 10 + 1).padStart(2, "0"),
    )
  }
  await next(host)
  await scene("phone-instructions")
  await expect(display.locator(".full-phone-key")).toHaveCount(12)
  await expect(display.locator(".full-step")).toHaveCount(3)
  await shot("phone-instructions")
  await next(host)
  await scene("connection-readiness")
  await expect(display.locator(".full-table-led")).toHaveCount(40)
  await expect(display.locator(".full-connected-count")).toHaveText(
    "1 / 40 TABLES CONNECTED",
  )
  await shot("readiness")
  await display.setViewportSize({
    width: 1194,
    height: 834,
  })
  await expect(display.locator(".full-connected-count")).toBeVisible()
  await shot("readiness-tablet")
  await display.setViewportSize({
    width: 1920,
    height: 1080,
  })
  await next(host)
  await scene("round-one")
  await next(host)
  await answer(player, "Pirate")
  await endRecordedVote(host, hostWire, 1)
  await expect(display.locator(".result-percentage").first()).toHaveText("100%")
  // No-tie step is skipped by the authoritative server
  await next(host)
  await expect(display.locator('[data-v4-scene="top-pick"]')).toBeVisible()
  await next(host)
  await scene("story-progress")
  await expect(display.locator(".full-progress-piece.is-filled")).toHaveCount(1)
  await expect(display.locator(".full-progress-placeholder")).toHaveCount(4)
  await shot("story-progress-one-piece")
  const proof = info.outputPath("native-source-contract.json")
  fs.writeFileSync(
    proof,
    JSON.stringify(
      {
        defaultPresets,
        optionalPresetsExplicitlyAuthored: optionalPresets,
        originalRepresentativeCount: 40,
        callerBinding: "matching synthetic phone and saved roster identity",
        actualGeometry: actual,
        referenceGeometry: expected,
        hostWire,
      },
      null,
      2,
    ),
  )
  await info.attach("native-source-contract", {
    path: proof,
    contentType: "application/json",
  })
  await playerContext.close()
  await displayContext.close()
})
