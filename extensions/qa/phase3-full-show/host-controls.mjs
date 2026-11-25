import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import path from "node:path"
import {
  closeWorkspaceDrawers,
  openWorkspacePanel,
  prepareHostNavigation,
} from "./workspace-controls.mjs"

// Real AppBridge/UI behavior with explicitly synthetic save responses. Native
// consent/storage authority is proved separately by the real issuer SDK tests.
export async function verifyHostControls({
  page,
  base,
  scenario,
  engine,
  theme,
  readRecord,
  evidence,
}) {
  const iframe = page.frameLocator("iframe")
  const before = await readRecord()
  await page.evaluate(() => window.__host.enableSaveFixture())
  await openWorkspacePanel(page, "save")
  await iframe.getByTestId("full-show-save").click()
  await iframe.getByTestId("full-show-save-consent").waitFor()
  await iframe.getByTestId("full-show-review-save").click()
  await iframe.getByTestId("full-show-save").click()
  await iframe.getByTestId("full-show-save-error").waitFor()
  await iframe
    .getByRole("button", { name: "Refresh draft", exact: true })
    .click()
  await iframe.locator("[data-full-show-chapter]").waitFor()
  await iframe.getByTestId("full-show-save").click()
  await iframe.getByTestId("full-show-save-complete").waitFor()
  await iframe.getByTestId("full-show-open-saved").click()
  await closeWorkspaceDrawers(page)
  const expectedLinks = [
    `https://tadazz.com/studio/native-save-consent/${"S".repeat(54)}`,
    `https://tadazz.com/manager/quizz/${"Q".repeat(21)}`,
  ]
  const readiness = {
    engine,
    theme,
    check: "host control request readiness",
    timeoutMs: 5000,
    status: "waiting",
  }
  const child = page.frames().find((frame) => frame.url().endsWith("/widget"))
  assert(child)
  const stage = iframe.locator("[data-full-show-chapter]")
  const originallyPaused =
    (await stage.getAttribute("data-playback-paused")) === "true"
  readiness.originallyPaused = originallyPaused

  if (!originallyPaused) {
    await iframe.getByTestId("full-show-pause").click()
  }

  await iframe.locator('[data-playback-paused="true"]').waitFor()
  // The controls closure belongs to the document's const AppBridge. Retain its
  // identity and target window so another host/bridge cannot satisfy this wait.
  const hostProbe = await page.evaluateHandle((links) => {
    const probe = {
      document,
      host: window.__host,
      controls: window.__host.hostControls,
      frame: document.querySelector("iframe"),
      frameWindow: document.querySelector("iframe")?.contentWindow,
      expectedLinks: links,
      startedAt: performance.now(),
      firstReadyMs: null,
      holding: false,
      previewBaseline: 0,
      messageStart: 0,
      messages: [],
    }
    const receive = (event) => {
      const message = event.data

      if (
        event.source !== probe.frameWindow ||
        !message ||
        (message.method !== "ui/request-display-mode" &&
          !(
            message.method === "tools/call" &&
            message.params?.name === "preview_show"
          ))
      ) {
        return
      }

      if (probe.messages.length < 8) {
        probe.messages.push({
          at: new Date().toISOString(),
          elapsedMs: performance.now() - probe.startedAt,
          method: message.method,
          id: message.id,
          name: message.params?.name,
          mode: message.params?.mode,
        })
      }
    }
    window.addEventListener("message", receive)

    probe.cleanup = () => window.removeEventListener("message", receive)

    return probe
  }, expectedLinks)
  const controlProbe = await child.evaluateHandle(() => {
    const button = document.querySelector('[data-testid="full-show-expand"]')
    const events = []
    const startedAt = performance.now()
    const snapshot = () => ({
      at: new Date().toISOString(),
      elapsedMs: performance.now() - startedAt,
      sameButton:
        document.querySelector('[data-testid="full-show-expand"]') === button,
      expandDisabled: button?.disabled,
      refreshDisabled: document.querySelector(
        '[data-testid="full-show-refresh"]',
      )?.disabled,
      pauseDisabled: document.querySelector('[data-testid="full-show-pause"]')
        ?.disabled,
      status:
        document.querySelector(".widget-workspace-status")?.textContent ?? null,
      focusedControl: document.activeElement?.getAttribute("data-testid"),
    })
    const record = (event) => {
      if (event.composedPath().includes(button) && events.length < 10) {
        events.push({
          type: event.type,
          trusted: event.isTrusted,
          ...snapshot(),
        })
      }
    }
    const eventTypes = [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "click",
    ]
    for (const type of eventTypes) {
      document.addEventListener(type, record, true)
    }

    return {
      snapshot,
      events,
      cleanup: () => {
        for (const type of eventTypes) {
          document.removeEventListener(type, record, true)
        }
      },
    }
  })
  let proof = null
  let failure = null

  try {
    const idle = await page.waitForFunction(
      () => {
        const lifecycle = window.__host.lifecycle()
        const counts = lifecycle.remaining

        return (
          !lifecycle.disposing &&
          !counts.http &&
          !counts.handlers &&
          !counts.replies &&
          !counts.initialization &&
          !counts.connecting
        )
      },
      undefined,
      { timeout: 5000, polling: 50 },
    )
    await idle.dispose()
    await hostProbe.evaluate((probe) => {
      probe.previewBaseline = probe.host
        .calls()
        .filter((name) => name === "preview_show").length
      probe.messageStart = probe.messages.length
      probe.host.hold(true)
      probe.holding = true
    })
    // A real readonly preview finishes its HTTP work, but the fixture retains
    // the genuine result before the SDK reply. Display mode is independent.
    await iframe.getByTestId("full-show-replay").click()
    const held = await page.waitForFunction(
      (probe) => {
        const counts = probe.host.lifecycle().remaining

        return (
          probe.host === window.__host &&
          probe.holding &&
          probe.host.calls().filter((name) => name === "preview_show")
            .length ===
            probe.previewBaseline + 1 &&
          counts.http === 0 &&
          counts.handlers === 1 &&
          counts.replies === 1 &&
          counts.initialization === 0 &&
          !counts.connecting
        )
      },
      hostProbe,
      { timeout: 5000, polling: 50 },
    )
    await held.dispose()
    readiness.heldPreview = await hostProbe.evaluate((probe) => ({
      holding: probe.holding,
      lifecycle: probe.host.lifecycle(),
      newPreviewCalls:
        probe.host.calls().filter((name) => name === "preview_show").length -
        probe.previewBaseline,
    }))
    readiness.beforeClick = await controlProbe.evaluate((probe) =>
      probe.snapshot(),
    )
    assert.equal(readiness.beforeClick.sameButton, true)
    assert.equal(readiness.beforeClick.refreshDisabled, true)
    assert.equal(readiness.beforeClick.pauseDisabled, true)
    assert.equal(readiness.beforeClick.expandDisabled, false)
    assert(readiness.beforeClick.status)
    await iframe.getByTestId("full-show-expand").click()
    const hostReceipt = await page.waitForFunction(
      (probe) => {
        const frame = document.querySelector("iframe")

        if (
          document !== probe.document ||
          window.__host !== probe.host ||
          window.__host.hostControls !== probe.controls ||
          frame !== probe.frame ||
          frame?.contentWindow !== probe.frameWindow
        ) {
          return false
        }

        const received = probe.controls()
        const ready =
          received.displayRequests.includes("fullscreen") &&
          probe.expectedLinks.every((url) => received.openedLinks.includes(url))

        if (ready && probe.firstReadyMs === null) {
          probe.firstReadyMs = performance.now() - probe.startedAt
        }

        return ready
      },
      hostProbe,
      { timeout: 5000, polling: 50 },
    )
    await hostReceipt.dispose()
    proof = await hostProbe.evaluate((probe) => probe.controls())
    assert.equal(proof.saveRequests.length, 3)
    assert.deepEqual(proof.saveRequests[1], proof.saveRequests[0])
    assert.deepEqual(proof.saveRequests[2], proof.saveRequests[0])
    assert.deepEqual(proof.openedLinks, expectedLinks)
    assert.deepEqual(proof.displayRequests, ["fullscreen"])
    const beforeRelease = await hostProbe.evaluate((probe) => ({
      holding: probe.holding,
      remaining: probe.host.lifecycle().remaining,
      messages: probe.messages.slice(probe.messageStart),
    }))
    readiness.beforeRelease = beforeRelease
    assert.equal(beforeRelease.holding, true)
    assert.equal(beforeRelease.remaining.http, 0)
    assert.equal(beforeRelease.remaining.handlers, 1)
    assert.equal(beforeRelease.remaining.replies, 1)
    assert.equal(
      beforeRelease.messages.filter(
        (message) => message.method === "ui/request-display-mode",
      ).length,
      1,
    )
    assert.equal(
      beforeRelease.messages.filter(
        (message) => message.method === "tools/call",
      ).length,
      1,
    )
    const clickEvents = await controlProbe.evaluate((probe) => probe.events)
    assert.equal(
      clickEvents.filter((event) => event.type === "click").length,
      1,
    )
    assert(clickEvents.every((event) => event.trusted && !event.expandDisabled))
    readiness.status = "ready"
  } catch (error) {
    readiness.status = "failed"
    readiness.error = String(error)
    failure = error
  } finally {
    try {
      readiness.snapshot = await hostProbe.evaluate((probe) => ({
        waitedMs: performance.now() - probe.startedAt,
        firstReadyMs: probe.firstReadyMs,
        sameDocument: document === probe.document,
        sameHost: window.__host === probe.host,
        sameBridgeBinding:
          window.__host?.hostControls === probe.controls &&
          document.querySelector("iframe") === probe.frame &&
          document.querySelector("iframe")?.contentWindow === probe.frameWindow,
        received: probe.controls(),
        holding: probe.holding,
        lifecycle: probe.host.lifecycle(),
        messages: probe.messages,
      }))
      readiness.control = await controlProbe.evaluate((probe) => ({
        snapshot: probe.snapshot(),
        events: probe.events,
      }))
    } catch (error) {
      readiness.snapshotError = String(error)
    }

    try {
      // Always release the genuine result, including failed click/readiness
      // assertions. Never navigate with a parked handler or invent a reply.
      await hostProbe.evaluate((probe) => {
        probe.host.hold(false)
        probe.holding = false
      })
      const settled = await page.waitForFunction(
        (probe) => {
          const counts = probe.host.lifecycle().remaining

          return (
            window.__host === probe.host &&
            !counts.http &&
            !counts.handlers &&
            !counts.replies &&
            !counts.initialization &&
            !counts.connecting
          )
        },
        hostProbe,
        { timeout: 5000, polling: 50 },
      )
      await settled.dispose()
      await iframe.locator('[data-testid="full-show-pause"]:enabled').waitFor()
      readiness.afterRelease = await controlProbe.evaluate((probe) =>
        probe.snapshot(),
      )
      assert.equal(
        readiness.afterRelease.status,
        null,
        "Unexpected host display/loading status after the real preview reply",
      )

      if (
        !failure &&
        ((await stage.getAttribute("data-playback-paused")) === "true") !==
          originallyPaused
      ) {
        await iframe.getByTestId("full-show-pause").click()
      }

      if (!failure) {
        await iframe
          .locator(`[data-playback-paused="${originallyPaused}"]`)
          .waitFor()
      }

      readiness.cleanup = {
        released: true,
        restoredPaused: failure ? null : originallyPaused,
        lifecycle: await hostProbe.evaluate((probe) => probe.host.lifecycle()),
      }
    } catch (error) {
      readiness.cleanupError = String(error)
      readiness.status = "failed"
      failure ??= error
    } finally {
      await controlProbe
        .evaluate((probe) => probe.cleanup())
        .catch(() => undefined)
      await hostProbe
        .evaluate((probe) => probe.cleanup())
        .catch(() => undefined)
      await controlProbe.dispose().catch(() => undefined)
      await hostProbe.dispose().catch(() => undefined)
    }

    writeFileSync(
      path.join(evidence, `${engine}-${theme}-host-controls-readiness.json`),
      JSON.stringify(readiness, null, 2),
    )
  }

  if (failure) {
    throw failure
  }

  const after = await readRecord()
  assert.equal(after.revision, before.revision)
  assert.equal(after.authoredShowJson, before.authoredShowJson)
  await page.screenshot({
    path: path.join(evidence, `${engine}-${theme}-host-controls.png`),
    fullPage: true,
  })
  await prepareHostNavigation(page, "unsupported host fixture")
  await page.goto(`${base}/host?scenario=${scenario.id}&unsupported=1`)
  await page.locator("html[data-host-ready=true]").waitFor()
  await iframe.locator("[data-full-show-chapter]").waitFor()
  assert.equal(await iframe.getByTestId("full-show-expand").count(), 0)
  assert.equal(await iframe.getByTestId("full-show-save").isDisabled(), true)
  assert((await iframe.locator("main").innerText()).includes("Preview / demo"))
  const unsupported = await page.evaluate(() => window.__host.hostControls())
  assert.equal(unsupported.saveRequests.length, 0)
  assert.equal(unsupported.displayRequests.length, 0)
  await prepareHostNavigation(page, "restore supported host")
  await page.goto(`${base}/host?scenario=${scenario.id}`)
  await page.locator("html[data-host-ready=true]").waitFor()
  await iframe.locator("[data-full-show-chapter]").waitFor()

  return {
    engine,
    theme,
    ...proof,
    readiness,
    unsupportedFeaturesHiddenOrDisabled: true,
    draftUnchanged: true,
  }
}
