/** Built-candidate guest policy acceptance. Only disposable loopback QA data is used. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { join } from "node:path"
import { writeFileSync } from "node:fs"

const require = createRequire("/cleanup/extensions/package.json")
const { expect } = require("@playwright/test")

export async function verifyGuestAdmission(options) {
  assert.equal(process.platform, "linux")
  assert.equal(new URL(options.origin).hostname, "127.0.0.1")
  const { browser, context, origin, token, evidence } = options
  assert(browser && context && options.page && options.player && options.room)
  const headers = { Authorization: "Bearer " + token }
  const results = []
  const created = []
  const errors = []
  const trackedPages = new Set()
  const track = (page) => {
    if (!trackedPages.has(page)) {
      trackedPages.add(page)
      page.on("pageerror", (error) => errors.push(error.message))
    }
  }
  const presence = async (room) => {
    const response = await context.request.get(
      origin + "/api/games/" + room.gameId + "/roster",
      { headers },
    )
    assert.equal(response.status(), 200, "Owner roster readback")
    const body = await response.json()
    assert.equal(body.presence.gameId, room.gameId)
    return body.presence
  }
  const policy = async (room, value) => {
    const response = await context.request.patch(
      origin + "/api/games/" + room.gameId + "/roster/settings",
      { headers, data: value },
    )
    assert.equal(response.status(), 200, "Owner admission policy update")
    return (await response.json()).presence
  }
  const anonymous = async () => {
    const owned = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "en-GB",
      reducedMotion: "reduce",
      ignoreHTTPSErrors: true,
    })
    await owned.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
    const page = await owned.newPage()
    track(page)
    return { context: owned, page }
  }
  const enter = async (page, pin, name) => {
    await page.goto(origin + "/game?pin=" + encodeURIComponent(pin))
    await expect(page.getByPlaceholder("Username here")).toBeVisible({
      timeout: 30_000,
    })
    await page.getByPlaceholder("Username here").fill(name)
    const answer = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/games/join" &&
        response.request().method() === "POST",
    )
    await page.getByRole("button", { name: "Submit", exact: true }).click()
    return answer
  }
  const joinedRow = async (room, name) => {
    await expect
      .poll(
        async () => {
          const snapshot = await presence(room)
          return snapshot.players.some(
            (row) => row.displayName === name && row.status === "connected",
          )
        },
        { timeout: 30_000 },
      )
      .toBe(true)
    return (await presence(room)).players.find(
      (row) => row.displayName === name && row.status === "connected",
    )
  }
  const reconnect = async (room, page, row, label) => {
    const before = await presence(room)
    const original = before.players.find(
      (entry) => entry.rosterPlayerId === row.rosterPlayerId,
    )
    assert(original && original.clientId, label + " has an admitted identity")
    await page.reload()
    await expect(page).toHaveURL(origin + "/party/" + room.gameId)
    await expect
      .poll(
        async () => {
          const after = await presence(room)
          return after.players.find(
            (entry) => entry.rosterPlayerId === row.rosterPlayerId,
          )?.status
        },
        { timeout: 30_000 },
      )
      .toBe("connected")
    const after = await presence(room)
    const restored = after.players.find(
      (entry) => entry.rosterPlayerId === row.rosterPlayerId,
    )
    assert.equal(
      restored.clientId,
      original.clientId,
      label + " client identity",
    )
    assert.equal(restored.points, original.points, label + " points")
    assert.equal(
      restored.answeredCurrentQuestion,
      original.answeredCurrentQuestion,
      label + " accepted answer state",
    )
    assert.equal(
      after.registeredTotal,
      before.registeredTotal,
      "No duplicate roster row",
    )
    return restored
  }

  async function verifyRoom(host, room, label, existingPlayer) {
    track(host)
    const original = await presence(room)
    assert.equal(typeof original.allowUnregisteredPlayers, "boolean")
    assert.match(room.inviteCode, /^\d{6}$/)
    const originalUrl = host.url()
    const originalViewport = host.viewportSize()
    const owned = []
    const ownedRosterIds = new Set()
    const endpoint = origin + "/api/games/" + room.gameId + "/roster/settings"
    const rejectSave = (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "errors:auth.unauthorized" }),
      })
    const toggle = host.getByTestId("host-guest-join-toggle")
    const keyboardToggle = async (expected) => {
      await expect(toggle).toBeEnabled()
      const response = host.waitForResponse(
        (value) =>
          value.url() === endpoint && value.request().method() === "PATCH",
      )
      await toggle.focus()
      await toggle.press("Space")
      const saved = await response
      assert.equal(saved.status(), 200, label + " keyboard update")
      const body = await saved.json()
      assert.equal(body.presence.allowUnregisteredPlayers, expected)
      await expect(toggle).toHaveAttribute("aria-checked", String(expected))
      assert.equal((await presence(room)).allowUnregisteredPlayers, expected)
      return body.presence
    }

    try {
      await expect(toggle).toBeVisible({ timeout: 30_000 })
      await expect(toggle).toBeEnabled()
      await expect(toggle).toHaveAccessibleName(
        "Allow unregistered participants",
      )
      await policy(room, { allowUnregisteredPlayers: true })
      await policy(room, { phoneInviteOnly: true })
      await expect(toggle).toHaveAttribute("aria-checked", "true")
      await keyboardToggle(false)

      const guest = await anonymous()
      owned.push(guest.context)
      const guestName = "Unlisted " + label
      const denied = await enter(guest.page, room.inviteCode, guestName)
      assert.equal(
        denied.status(),
        403,
        label + " fresh anonymous admission is denied",
      )
      assert.equal((await denied.json()).reason, "roster_only")
      assert(
        !guest.page.url().includes("/party/"),
        "Rejected guest never enters game",
      )

      const guestToken = await guest.page.evaluate(() =>
        localStorage.getItem("token"),
      )
      assert(
        guestToken,
        "Fresh anonymous session exists independently of site account",
      )
      const unauthorized = await guest.context.request.patch(endpoint, {
        headers: { Authorization: "Bearer " + guestToken },
        data: { allowUnregisteredPlayers: true },
      })
      assert(
        [401, 403, 404].includes(unauthorized.status()),
        "Guest cannot update host policy",
      )
      assert.equal((await presence(room)).allowUnregisteredPlayers, false)
      results.push({
        name: label + "-keyboard-off-denies-fresh-anonymous-and-owner-action",
        passed: true,
      })

      const registeredName = "Registered " + label
      const added = await context.request.post(
        origin + "/api/games/" + room.gameId + "/roster",
        { headers, data: { displayName: registeredName } },
      )
      assert.equal(added.status(), 200)
      const registeredId = (await added.json()).participant.rosterPlayerId
      ownedRosterIds.add(registeredId)
      const registered = await anonymous()
      owned.push(registered.context)
      const accepted = await enter(
        registered.page,
        room.inviteCode,
        registeredName,
      )
      assert.equal(
        accepted.status(),
        200,
        "Pre-registered participant is accepted while OFF",
      )
      await expect(registered.page).toHaveURL(origin + "/party/" + room.gameId)
      const registeredRow = await joinedRow(room, registeredName)
      assert.equal(registeredRow.rosterPlayerId, registeredId)
      results.push({
        name: label + "-registered-player-enters-while-off",
        passed: true,
      })

      await host.route(endpoint, rejectSave, { times: 1 })
      await toggle.click()
      await expect(
        host.getByTestId("host-guest-join-control").getByRole("alert"),
      ).toBeVisible()
      await expect(toggle).toHaveAttribute("aria-checked", "false")
      assert.equal((await presence(room)).allowUnregisteredPlayers, false)
      await host.unroute(endpoint, rejectSave)
      const enabled = await keyboardToggle(true)
      assert.equal(
        enabled.phoneInviteOnly,
        false,
        "ON atomically clears phone restriction",
      )
      const enabledReadback = await presence(room)
      assert.equal(enabledReadback.phoneInviteOnly, false)
      results.push({
        name:
          label + "-rejected-save-shows-error-and-on-clears-phone-restriction",
        passed: true,
      })

      const guestAccepted = await enter(guest.page, room.inviteCode, guestName)
      assert.equal(
        guestAccepted.status(),
        200,
        label + " ON allows the previously rejected guest",
      )
      await expect(guest.page).toHaveURL(origin + "/party/" + room.gameId)
      const guestRow = await joinedRow(room, guestName)
      ownedRosterIds.add(guestRow.rosterPlayerId)
      await keyboardToggle(false)
      await reconnect(room, guest.page, guestRow, label + " admitted guest")
      await reconnect(
        room,
        registered.page,
        registeredRow,
        label + " registered player",
      )
      if (existingPlayer) {
        const existing = (await presence(room)).players.find(
          (row) => row.displayName === "Gallery QA player",
        )
        assert(existing, "Original voted gallery player remains present")
        await reconnect(
          room,
          existingPlayer,
          existing,
          "Original voted gallery player",
        )
      }
      results.push({
        name:
          label +
          "-off-keeps-admitted-and-registered-reconnect-score-and-answer",
        passed: true,
      })

      await host.reload()
      await expect(toggle).toBeVisible({ timeout: 30_000 })
      await expect(toggle).toBeEnabled()
      await expect(toggle).toHaveAttribute("aria-checked", "false")
      await expect(host.getByTestId("platform-game-opening")).toHaveCount(0)
      assert.equal((await presence(room)).allowUnregisteredPlayers, false)

      const rtlUrl = new URL(originalUrl)
      rtlUrl.searchParams.set("lng", "he")
      await host.setViewportSize({ width: 360, height: 900 })
      await host.goto(rtlUrl.href)
      await expect(toggle).toBeVisible({ timeout: 30_000 })
      await expect(toggle).toBeEnabled()
      await expect(toggle).toHaveAccessibleName("צירוף משתתפים לא רשומים")
      await expect(toggle).toHaveAttribute("aria-checked", "false")
      await expect(host.locator("html")).toHaveAttribute("dir", "rtl")
      const geometry = await host
        .getByTestId("host-guest-join-control")
        .evaluate((node) => {
          const bounds = node.getBoundingClientRect()
          return {
            left: bounds.left,
            right: bounds.right,
            width: innerWidth,
            overflow: document.documentElement.scrollWidth - innerWidth,
          }
        })
      assert(
        geometry.left >= -1 && geometry.right <= geometry.width + 1,
        "RTL guest switch stays in viewport",
      )
      assert(geometry.overflow <= 1, "Host page has no horizontal overflow")
      await host.screenshot({
        path: join(evidence, "guest-policy-" + label + "-he-360.png"),
        fullPage: true,
      })
      results.push({
        name: label + "-authoritative-reload-and-hebrew-mobile-layout",
        passed: true,
        geometry,
      })
    } catch (error) {
      await host
        .screenshot({
          path: join(evidence, "guest-policy-" + label + "-failure.png"),
          fullPage: true,
        })
        .catch(() => {})
      throw error
    } finally {
      await host.unroute(endpoint, rejectSave)
      await policy(room, {
        allowUnregisteredPlayers: original.allowUnregisteredPlayers,
      })
      await policy(room, { phoneInviteOnly: original.phoneInviteOnly })
      for (const id of ownedRosterIds) {
        const response = await context.request.delete(
          origin +
            "/api/games/" +
            room.gameId +
            "/roster/" +
            encodeURIComponent(id),
          { headers },
        )
        assert(
          [200, 204].includes(response.status()),
          "Remove only the helper's roster fixture",
        )
      }
      for (const ownedContext of owned) await ownedContext.close()
      if (originalViewport) await host.setViewportSize(originalViewport)
      if (!host.isClosed()) {
        await host.goto(originalUrl)
        await expect(toggle).toBeVisible({ timeout: 30_000 })
      }
    }
  }

  let nativeHost
  try {
    await expect(options.page.getByTestId("tadazz-show")).toBeVisible()
    await verifyRoom(options.page, options.room, "cinematic", options.player)

    const originalQuiz = await options.readQuiz()
    const nativeCopy = {
      subject: "Guest native QA " + Date.now(),
      gameMode: originalQuiz.gameMode,
      questions: [structuredClone(originalQuiz.questions[0])],
    }
    const saved = await context.request.post(origin + "/api/quizz", {
      headers,
      data: nativeCopy,
    })
    assert.equal(saved.status(), 201, "Create only a disposable native quiz")
    const nativeQuiz = await saved.json()
    assert(nativeQuiz.id)
    const createdRoom = await context.request.post(origin + "/api/games", {
      headers,
      data: { quizzId: nativeQuiz.id },
    })
    assert.equal(createdRoom.status(), 201)
    const room = await createdRoom.json()
    created.push({ quizId: nativeQuiz.id, gameId: room.gameId })

    nativeHost = await context.newPage()
    track(nativeHost)
    await nativeHost.goto(origin + "/party/manager/" + room.gameId + "?lng=en")
    await expect(nativeHost.getByTestId("platform-opening-start")).toBeEnabled({
      timeout: 30_000,
    })
    await expect(nativeHost.getByTestId("host-guest-join-toggle")).toBeVisible()
    await expect(nativeHost.getByTestId("host-guest-join-toggle")).toBeEnabled()
    results.push({
      name: "native-opening-exposes-authoritative-guest-control",
      passed: true,
    })
    await nativeHost.getByTestId("platform-opening-start").click()
    await expect(nativeHost.getByTestId("platform-opening-skip")).toBeEnabled()
    await nativeHost.getByTestId("platform-opening-skip").click()
    await expect(nativeHost.getByTestId("platform-game-opening")).toHaveCount(0)
    await expect(nativeHost.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-theme",
      "razzia-original",
    )
    await expect(
      nativeHost.locator('[data-native-layout="true"]'),
    ).toBeVisible()
    await verifyRoom(nativeHost, room, "native")
    assert.deepEqual(errors, [], "No guest policy browser JavaScript errors")
    return { passed: true, results, createdFixtures: created }
  } catch (error) {
    writeFileSync(
      join(evidence, "guest-policy-partial-receipt.json"),
      JSON.stringify(
        {
          passed: false,
          results,
          createdFixtures: created,
          errors,
          error: String(error?.stack ?? error),
        },
        null,
        2,
      ) + "\n",
    )
    throw error
  } finally {
    if (nativeHost && !nativeHost.isClosed()) await nativeHost.close()
  }
}
