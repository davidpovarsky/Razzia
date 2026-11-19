import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {
  closeWorkspaceDrawers,
  openWorkspacePanel,
  prepareHostNavigation,
} from "./workspace-controls.mjs"

const deferred = () => {
  let resolve = () => undefined
  let reject = () => undefined
  const promise = new Promise((accept, fail) => {
    resolve = accept
    reject = fail
  })

  return { promise, resolve, reject }
}
const bounded = async (promise, label) => {
  let timer = null

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} was not observed`)),
          10000,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Delay real loopback ACKs; preserve the issuer, SDK, AppBridge and native renderer. */
export async function verifyPreferenceRace({
  page,
  base,
  scenario,
  engine,
  theme,
  evidence,
  readRecord,
}) {
  const witness = {
    engine,
    theme,
    mechanism:
      "Unmodified real responses held at loopback HTTP before AppBridge ACK",
    cases: [],
    status: "RUNNING",
  }
  const before = await readRecord()
  const gates = []
  const active = new Set()
  const routeErrors = []
  const pattern = `${base}/qa/call?scenario=${scenario.id}`
  const arm = (label, matches) => {
    const gate = {
      label,
      matches,
      ready: deferred(),
      release: deferred(),
      done: deferred(),
      claimed: false,
      fulfilled: false,
    }
    gates.push(gate)

    return gate
  }
  const handler = async (route) => {
    const call = route.request().postDataJSON()
    const gate =
      call.name === "preview_show"
        ? gates.find(
            (candidate) =>
              !candidate.claimed && candidate.matches(call.arguments),
          )
        : null

    if (!gate) {
      await route.continue()

      return
    }

    gate.claimed = true
    gate.input = structuredClone(call.arguments)
    const operation = (async () => {
      // The intercepted request reaches the real QA backend and official MCP client.
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      const packet = await response.json()
      assert.equal(packet.structuredContent.ok, true)
      assert.notEqual(packet.isError, true)
      gate.result = packet.structuredContent.data
      gate.ready.resolve()
      await gate.release.promise
      await route.fulfill({ response })
      gate.fulfilled = true
    })()
    active.add(operation)

    try {
      await operation
    } catch (error) {
      gate.ready.reject(error)
      routeErrors.push(String(error))
      throw error
    } finally {
      active.delete(operation)
      gate.done.resolve()
    }
  }
  await page.route(pattern, handler)

  try {
    const question = scenario.chapters.find(
      (chapter) => chapter.kind === "question" && chapter.questionOrdinal === 3,
    )
    const voting = scenario.chapters.find(
      (chapter) => chapter.kind === "voting" && chapter.questionOrdinal === 3,
    )
    assert(question && voting)
    assert.equal(question.duration.kind, "known")
    for (const preference of ["motion", "language"]) {
      const expected = {
        locale: preference === "language" ? "fr" : "en",
        reducedMotion: preference !== "motion",
      }
      const result = { preference, expected, snapshots: [] }
      witness.cases.push(result)
      scenario.selection.chapterId = question.id
      scenario.selection.context.locale = "en"
      scenario.selection.context.reducedMotion = true
      const automatic = arm(
        `${preference} automatic`,
        (input) =>
          input.chapterId === voting.id &&
          input.context.locale === "en" &&
          input.context.reducedMotion === true,
      )
      await prepareHostNavigation(page, `${preference} preference race`)
      await page.goto(`${base}/host?scenario=${scenario.id}`)
      await page.locator("html[data-host-ready=true]").waitFor()
      const iframe = page.frameLocator("iframe")
      await iframe
        .locator(`[data-full-show-chapter="${question.id}"]`)
        .waitFor()
      const child = page
        .frames()
        .find((frame) => frame.url().endsWith("/widget"))
      assert(child)
      await child.evaluate(() => {
        window.__preferenceEvents = []
        for (const type of [
          "pointerdown",
          "pointerup",
          "click",
          "input",
          "change",
        ]) {
          document.addEventListener(
            type,
            (event) => {
              const { target } = event
              const id = target?.dataset?.testid

              if (
                id === "full-show-reduce-motion" ||
                id === "full-show-language"
              ) {
                window.__preferenceEvents.push({
                  type,
                  id,
                  at: performance.now(),
                  disabled: target.disabled,
                  checked:
                    id === "full-show-reduce-motion"
                      ? target.checked
                      : undefined,
                  locale:
                    id === "full-show-language" ? target.value : undefined,
                })
              }
            },
            true,
          )
        }
      })
      await openWorkspacePanel(page, "display")
      await bounded(automatic.ready.promise, "Genuine automatic preview")
      const snapshot = async (step) => {
        const value = {
          step,
          motionDisabled: await iframe
            .getByTestId("full-show-reduce-motion")
            .isDisabled(),
          languageDisabled: await iframe
            .getByTestId("full-show-language")
            .isDisabled(),
          motion: await iframe
            .getByTestId("full-show-reduce-motion")
            .isChecked(),
          locale: await iframe.getByTestId("full-show-language").inputValue(),
          authoringDisabled: await iframe
            .getByTestId("full-show-load-assets")
            .isDisabled(),
          chapter: await iframe
            .locator("[data-full-show-chapter]")
            .getAttribute("data-full-show-chapter"),
        }
        result.snapshots.push(value)

        return value
      }
      const pendingAuto = await snapshot("automatic ACK held")
      assert.equal(pendingAuto.chapter, question.id)
      assert.equal(
        pendingAuto.authoringDisabled,
        true,
        "Authoring must stay disabled during automatic loading",
      )
      assert.equal(
        pendingAuto.motionDisabled,
        false,
        "Automatic loading must not disable the motion preference",
      )
      assert.equal(
        pendingAuto.languageDisabled,
        false,
        "Automatic loading must not disable the language preference",
      )

      const explicit = arm(
        `${preference} explicit`,
        (input) =>
          input.chapterId === voting.id &&
          input.context.locale === expected.locale &&
          input.context.reducedMotion === expected.reducedMotion,
      )

      if (preference === "motion") {
        await iframe.getByTestId("full-show-reduce-motion").click()
      } else {
        await iframe
          .getByTestId("full-show-language")
          .selectOption(expected.locale)
      }

      await bounded(explicit.ready.promise, "Explicit preference preview")
      const pendingExplicit = await snapshot("preference ACK held")
      assert.equal(pendingExplicit.motionDisabled, true)
      assert.equal(pendingExplicit.languageDisabled, true)
      assert.equal(pendingExplicit.authoringDisabled, true)
      assert.equal(
        explicit.input.chapterId,
        automatic.input.chapterId,
        "Keep the pending automatic navigation",
      )
      explicit.release.resolve()
      await child.waitForFunction((desiredPreference) => {
        const motion = document.querySelector(
          '[data-testid="full-show-reduce-motion"]',
        )
        const language = document.querySelector(
          '[data-testid="full-show-language"]',
        )

        return (
          motion &&
          language &&
          !motion.disabled &&
          !language.disabled &&
          motion.checked === desiredPreference.reducedMotion &&
          language.value === desiredPreference.locale
        )
      }, expected)
      await iframe.locator(`[data-full-show-chapter="${voting.id}"]`).waitFor()
      await snapshot("new preference acknowledged")
      assert.equal(
        automatic.fulfilled,
        false,
        "The old automatic ACK must still be held",
      )
      automatic.release.resolve()
      await bounded(automatic.done.promise, "Old automatic ACK delivery")
      assert.equal(automatic.fulfilled, true)
      await page.waitForFunction(() => {
        const pending = window.__host.lifecycle().remaining

        return (
          pending.http === 0 && pending.handlers === 0 && pending.replies === 0
        )
      })
      // Let the delivered old SDK response finish its normal consumer callback.
      await child.evaluate(async () => {
        await new Promise(requestAnimationFrame)
        await new Promise(requestAnimationFrame)
      })
      const afterOld = await snapshot("old automatic ACK delivered")
      assert.equal(
        afterOld.motion,
        expected.reducedMotion,
        "Old automatic ACK must not overwrite motion",
      )
      assert.equal(
        afterOld.locale,
        expected.locale,
        "Old automatic ACK must not overwrite language",
      )
      assert.equal(afterOld.chapter, voting.id)
      assert.equal(afterOld.motionDisabled, false)
      assert.equal(afterOld.languageDisabled, false)
      assert.equal(afterOld.authoringDisabled, false)
      result.requests = {
        automatic: automatic.input,
        preference: explicit.input,
        deliveredOldAfterNew: true,
      }
      result.events = await child.evaluate(() => window.__preferenceEvents)
      assert(result.events.some((event) => event.type === "change"))
      await page.screenshot({
        path: path.join(
          evidence,
          `${engine}-${theme}-${preference}-preference-race.png`,
        ),
      })
      await closeWorkspaceDrawers(page)
      result.status = "PASS"
    }
    assert.deepEqual(
      await readRecord(),
      before,
      "Preference changes must not mutate the draft",
    )
    assert.deepEqual(routeErrors, [])
    witness.status = "PASS"

    return witness
  } catch (error) {
    witness.status = "FAIL"
    witness.error = String(error)
    throw error
  } finally {
    for (const gate of gates) {
      gate.release.resolve()
    }
    await Promise.allSettled([...active])
    await page.unroute(pattern, handler)
    witness.gates = gates.map(({ label, input, claimed, fulfilled }) => ({
      label,
      input,
      claimed,
      fulfilled,
    }))
    fs.writeFileSync(
      path.join(evidence, `${engine}-${theme}-preference-race.json`),
      `${JSON.stringify(witness, null, 2)}\n`,
    )
  }
}
