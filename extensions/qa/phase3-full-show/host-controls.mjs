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
  // The controls closure belongs to the document's const AppBridge. Retain its
  // identity and target window so another host/bridge cannot satisfy this wait.
  const hostProbe = await page.evaluateHandle(
    (links) => ({
      document,
      host: window.__host,
      controls: window.__host.hostControls,
      frame: document.querySelector("iframe"),
      frameWindow: document.querySelector("iframe")?.contentWindow,
      expectedLinks: links,
      startedAt: performance.now(),
      firstReadyMs: null,
    }),
    expectedLinks,
  )
  let proof = null

  try {
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
    readiness.status = "ready"
  } catch (error) {
    readiness.status = "failed"
    readiness.error = String(error)
    throw error
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
      }))
    } catch (error) {
      readiness.snapshotError = String(error)
    } finally {
      await hostProbe.dispose().catch(() => undefined)
    }

    writeFileSync(
      path.join(evidence, `${engine}-${theme}-host-controls-readiness.json`),
      JSON.stringify(readiness, null, 2),
    )
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
