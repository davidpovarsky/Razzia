import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { EXTENSION_EVENTS } from "@razzia/extensions/core"
import { expect, type Locator, type Page } from "@playwright/test"
import { t } from "@razzia/e2e/utils/i18n"

export const endTimer = async (manager: Page) => {
  const btn = manager.getByRole("button", {
    name: t("extensions:host.endTimer"),
  })

  try {
    await btn.click({ timeout: 2000 })
  } catch {
    // If timer expired naturally, question transitions to results automatically
  }
}

export interface LiveObservation {
  name: string
  observedAt: number
  data: Record<string, unknown>
}

export const liveRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

// Observe the actual Engine.IO transports, including initial polling and reconnect snapshots.
// These listeners never send a game command, replace a clock or alter the connection.
export const observeLiveFlow = (page: Page) => {
  const rows: LiveObservation[] = []
  const record = (payload: string | Buffer, outgoing: boolean) => {
    const raw = typeof payload === "string" ? payload : payload.toString()

    for (const frame of raw.split("\x1e")) {
      if (!frame.startsWith("42")) {
        continue
      }

      let packet: unknown = undefined

      try {
        packet = JSON.parse(frame.slice(frame.indexOf("[")))
      } catch {
        continue
      }

      if (!Array.isArray(packet)) {
        continue
      }

      const event: unknown = packet[0]
      const value: unknown = packet[1]
      const observedAt = Date.now()

      if (outgoing) {
        if (event === EXTENSION_EVENTS.COMMAND) {
          rows.push({
            name: `sent:${event}`,
            observedAt,
            data: liveRecord(value),
          })
        }

        continue
      }

      if (event === EVENTS.GAME.PLAYER_ANSWER && typeof value === "number") {
        rows.push({ name: event, observedAt, data: { count: value } })

        continue
      }

      const data = liveRecord(value)

      if (event === EVENTS.GAME.STATUS && typeof data.name === "string") {
        rows.push({ name: data.name, observedAt, data: liveRecord(data.data) })
      }

      if (
        event === EVENTS.EXTENSIONS.STATE ||
        event === EVENTS.MANAGER.AUTO_ADVANCE ||
        event === EVENTS.MANAGER.SUCCESS_RECONNECT ||
        event === EVENTS.PLAYER.SUCCESS_RECONNECT
      ) {
        rows.push({ name: event, observedAt, data })
      }
    }
  }
  const isPollingTransport = (address: string) => {
    const url = new URL(address)

    return (
      url.pathname === "/ws/" && url.searchParams.get("transport") === "polling"
    )
  }
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => record(payload, false))
    socket.on("framesent", ({ payload }) => record(payload, true))
  })
  page.on("request", (request) => {
    if (request.method() === "POST" && isPollingTransport(request.url())) {
      record(request.postData() ?? "", true)
    }
  })
  page.on("response", (response) => {
    if (
      response.request().method() !== "GET" ||
      response.status() !== 200 ||
      !isPollingTransport(response.url())
    ) {
      return
    }

    void response.text().then(
      (body) => record(body, false),
      (error: unknown) => {
        rows.push({
          name: "observer:transport-error",
          observedAt: Date.now(),
          data: {
            message: error instanceof Error ? error.message : String(error),
          },
        })
      },
    )
  })

  return rows
}

export const latestState = (rows: LiveObservation[]) =>
  rows.findLast((row) => row.name === EVENTS.EXTENSIONS.STATE)?.data

const latestStatus = (rows: LiveObservation[]) =>
  rows.findLast((row) =>
    Object.values(STATUS).some((status) => status === row.name),
  )

export const waitForRecordedVoting = async (
  rows: LiveObservation[],
  questionId: string,
) => {
  // The Studio phase is "question" during both the lead-in and voting.
  // SELECT_ANSWER is the authoritative signal that answers are now accepted.
  await expect
    .poll(() => ({
      status: latestStatus(rows)?.name,
      statusQuestionId: latestStatus(rows)?.data.questionId,
      phase: latestState(rows)?.phase,
      questionId: latestState(rows)?.questionId,
    }))
    .toEqual({
      status: STATUS.SELECT_ANSWER,
      statusQuestionId: questionId,
      phase: "question",
      questionId,
    })
  const voting = latestStatus(rows)

  if (
    voting?.name !== STATUS.SELECT_ANSWER ||
    voting.data.questionId !== questionId
  ) {
    throw new Error("The current question must still be accepting answers")
  }

  return voting
}

export const endRecordedVote = async (
  manager: Page,
  rows: LiveObservation[],
  { questionId, count }: { questionId: string; count: number },
) => {
  const voting = await waitForRecordedVoting(rows, questionId)
  const votingIndex = rows.indexOf(voting)
  const epoch = latestState(rows)?.epoch
  expect(epoch).toEqual(expect.any(Number))

  await expect
    .poll(() =>
      rows
        .slice(votingIndex + 1)
        .some(
          (row) =>
            row.name === EVENTS.GAME.PLAYER_ANSWER && row.data.count === count,
        ),
    )
    .toBe(true)
  const end = manager.getByTestId("host-end-timer-btn")
  await expect(end).toHaveCount(1)
  await expect(end).toBeEnabled()
  const beforeEnd = rows.length
  await end.click()
  await expect
    .poll(() => ({
      status: latestStatus(rows.slice(beforeEnd))?.name,
      statusQuestionId: latestStatus(rows.slice(beforeEnd))?.data.questionId,
      phase: latestState(rows)?.phase,
      questionId: latestState(rows)?.questionId,
      epoch: latestState(rows)?.epoch,
    }))
    .toEqual({
      status: STATUS.SHOW_RESPONSES,
      statusQuestionId: questionId,
      phase: "responses",
      questionId,
      epoch,
    })
}

export const setManualProgression = async (manager: Page) => {
  await manager.getByRole("button", { name: t("game:settings.title") }).click()
  const settings = manager.getByRole("dialog")
  const disable = async (control: Locator) => {
    if ((await control.getAttribute("aria-checked")) === "true") {
      await control.click()
    }

    await expect(control).toHaveAttribute("aria-checked", "false")
  }
  await disable(settings.getByTestId("settings-end-on-all-answered"))
  await disable(
    settings.getByRole("switch", {
      name: t("game:settings.autoAdvance.label"),
      exact: true,
    }),
  )
  await settings
    .getByRole("button", { name: t("common:save"), exact: true })
    .click()
  await expect(settings).toBeHidden()
}
