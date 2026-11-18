import assert from "node:assert/strict"
import path from "node:path"

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
  await iframe.getByTestId("full-show-expand").click()
  const proof = await page.evaluate(() => window.__host.hostControls())
  assert.equal(proof.saveRequests.length, 3)
  assert.deepEqual(proof.saveRequests[1], proof.saveRequests[0])
  assert.deepEqual(proof.saveRequests[2], proof.saveRequests[0])
  assert.deepEqual(proof.openedLinks, [
    `https://tadazz.com/studio/native-save-consent/${"S".repeat(54)}`,
    `https://tadazz.com/manager/quizz/${"Q".repeat(21)}`,
  ])
  assert.deepEqual(proof.displayRequests, ["fullscreen"])
  const after = await readRecord()
  assert.equal(after.revision, before.revision)
  assert.equal(after.authoredShowJson, before.authoredShowJson)
  await page.screenshot({
    path: path.join(evidence, `${engine}-${theme}-host-controls.png`),
    fullPage: true,
  })
  await page.goto(`${base}/host?scenario=${scenario.id}&unsupported=1`)
  await page.locator("html[data-host-ready=true]").waitFor()
  await iframe.locator("[data-full-show-chapter]").waitFor()
  assert.equal(await iframe.getByTestId("full-show-expand").count(), 0)
  assert.equal(await iframe.getByTestId("full-show-save").isDisabled(), true)
  assert((await iframe.locator("main").innerText()).includes("Preview / demo"))
  const unsupported = await page.evaluate(() => window.__host.hostControls())
  assert.equal(unsupported.saveRequests.length, 0)
  assert.equal(unsupported.displayRequests.length, 0)
  await page.goto(`${base}/host?scenario=${scenario.id}`)
  await page.locator("html[data-host-ready=true]").waitFor()
  await iframe.locator("[data-full-show-chapter]").waitFor()
  return {
    engine,
    theme,
    ...proof,
    unsupportedFeaturesHiddenOrDisabled: true,
    draftUnchanged: true,
  }
}
