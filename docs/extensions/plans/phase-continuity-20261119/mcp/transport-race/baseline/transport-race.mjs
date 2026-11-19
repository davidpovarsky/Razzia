import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { prepareHostNavigation } from "./workspace-controls.mjs"
import {
  installHeldPreviewResponses,
  waitForHeldPreview,
} from "./preference-race.mjs"

export async function verifyTransportRace({
  page,
  base,
  scenario,
  engine,
  theme,
  evidence,
  readRecord,
}) {
  const before = await readRecord()
  const held = await installHeldPreviewResponses(page, base, scenario)
  const witness = { engine, theme, status: "RUNNING", cases: [] }

  try {
    const chapter = (kind, ordinal) =>
      scenario.chapters.find(
        (candidate) =>
          candidate.kind === kind && candidate.questionOrdinal === ordinal,
      )
    const question = chapter("question", 3)
    const voting = chapter("voting", 3)
    assert(question && voting)
    for (const action of ["pause", "replay", "next", "previous"]) {
      const result = { action, snapshots: [] }
      witness.cases.push(result)
      scenario.selection.chapterId = question.id
      scenario.selection.context.locale = "en"
      scenario.selection.context.reducedMotion = true
      const automatic = held.arm(
        `${action} automatic`,
        (input) => input.chapterId === voting.id,
      )
      await prepareHostNavigation(page, `${action} automatic transport race`)
      await page.goto(`${base}/host?scenario=${scenario.id}`)
      await page.locator("html[data-host-ready=true]").waitFor()
      const iframe = page.frameLocator("iframe")
      const stage = iframe.locator("[data-full-show-chapter]")
      await iframe
        .locator(`[data-full-show-chapter="${question.id}"]`)
        .waitFor()
      const child = page
        .frames()
        .find((frame) => frame.url().endsWith("/widget"))
      assert(child)
      await child.evaluate(() => {
        window.__transportEvents = []
        for (const type of ["pointerdown", "pointerup", "click"]) {
          document.addEventListener(
            type,
            (event) => {
              const button = event.target?.closest?.("button[data-testid]")

              if (
                button &&
                [
                  "full-show-pause",
                  "full-show-replay",
                  "full-show-next",
                  "full-show-previous",
                ].includes(button.dataset.testid)
              ) {
                window.__transportEvents.push({
                  type,
                  id: button.dataset.testid,
                  disabled: button.disabled,
                  at: performance.now(),
                })
              }
            },
            true,
          )
        }
      })
      await waitForHeldPreview(automatic.ready.promise, "Automatic preview ACK")
      const snapshot = async (step) => {
        const disabled = {}
        for (const control of ["pause", "replay", "next", "previous"]) {
          disabled[control] = await iframe
            .getByTestId(`full-show-${control}`)
            .isDisabled()
        }
        const value = {
          step,
          disabled,
          authoringDisabled: await iframe
            .getByTestId("full-show-load-assets")
            .isDisabled(),
          chapter: await stage.getAttribute("data-full-show-chapter"),
          epoch: Number(await stage.getAttribute("data-playback-epoch")),
          paused: await stage.getAttribute("data-playback-paused"),
        }
        result.snapshots.push(value)

        return value
      }
      const initial = await snapshot("automatic ACK held")
      assert.equal(initial.authoringDisabled, true)
      assert.equal(initial.chapter, question.id)
      assert.equal(
        initial.disabled[action],
        false,
        `Automatic loading must not disable ${action}`,
      )
      const oldNode = await stage
        .locator(":scope > div")
        .first()
        .elementHandle()
      assert(oldNode)

      if (action === "pause") {
        const callsBefore = await page.evaluate(() => window.__host.calls())
        await iframe.getByTestId("full-show-pause").click()
        await iframe.locator('[data-playback-paused="true"]').waitFor()
        assert.deepEqual(
          await page.evaluate(() => window.__host.calls()),
          callsBefore,
        )
        await snapshot("paused while automatic ACK held")
        automatic.release.resolve()
        await waitForHeldPreview(
          automatic.done.promise,
          "Automatic ACK delivery",
        )
        await iframe
          .locator(
            `[data-full-show-chapter="${voting.id}"][data-playback-paused="true"]`,
          )
          .waitFor()
        const applied = await snapshot("automatic ACK preserves user pause")
        assert.equal(applied.paused, "true")
        assert(applied.epoch > initial.epoch)
        result.userPausePreserved = true
      } else {
        const target = chapter(
          "question",
          { next: 4, previous: 2, replay: 3 }[action],
        )
        assert(target)
        const manual = held.arm(
          `${action} manual`,
          (input) => input.chapterId === target.id,
        )
        await iframe.getByTestId(`full-show-${action}`).click()
        await waitForHeldPreview(manual.ready.promise, "Explicit transport ACK")
        const waiting = await snapshot("explicit transport ACK held")
        assert(Object.values(waiting.disabled).every(Boolean))
        assert.equal(waiting.authoringDisabled, true)
        assert.equal(manual.input.chapterId, target.id)
        manual.release.resolve()
        await child.waitForFunction(
          ({ previousNode, targetId, previousEpoch }) => {
            const native = document.querySelector(
              '[data-testid="full-show-native-surface"]',
            )?.shadowRoot
            const current = native?.querySelector("[data-full-show-chapter]")

            return (
              current?.getAttribute("data-full-show-chapter") === targetId &&
              Number(current.getAttribute("data-playback-epoch")) >
                previousEpoch &&
              !previousNode.isConnected &&
              Boolean(current.innerText.trim())
            )
          },
          {
            previousNode: oldNode,
            targetId: target.id,
            previousEpoch: initial.epoch,
          },
        )
        await snapshot("explicit transport acknowledged and native remounted")
        assert.equal(automatic.fulfilled, false)
        await iframe.getByTestId("full-show-pause").click()
        await iframe.locator('[data-playback-paused="true"]').waitFor()
        automatic.release.resolve()
        await waitForHeldPreview(
          automatic.done.promise,
          "Old automatic ACK delivery",
        )
        await page.waitForFunction(() => {
          const pending = window.__host.lifecycle().remaining

          return (
            pending.http === 0 &&
            pending.handlers === 0 &&
            pending.replies === 0
          )
        })
        await child.evaluate(async () => {
          await new Promise(requestAnimationFrame)
          await new Promise(requestAnimationFrame)
        })
        const final = await snapshot("old automatic ACK ignored")
        assert.equal(final.chapter, target.id)
        assert.equal(final.paused, "true")
        assert.equal(
          await oldNode.evaluate((element) => element.isConnected),
          false,
        )
        assert.equal(final.authoringDisabled, false)
        assert(Object.values(final.disabled).every((value) => !value))
        result.explicitTarget = manual.input.chapterId
        result.oldAutomaticTarget = automatic.input.chapterId
      }

      assert.equal(automatic.fulfilled, true)
      result.events = await child.evaluate(() => window.__transportEvents)
      assert(
        result.events.some(
          (event) =>
            event.type === "click" &&
            event.id === `full-show-${action}` &&
            !event.disabled,
        ),
      )
      result.status = "PASS"
      await oldNode.dispose()
      await page.screenshot({
        path: path.join(
          evidence,
          `${engine}-${theme}-${action}-transport-race.png`,
        ),
      })
    }
    assert.deepEqual(await readRecord(), before)
    assert.deepEqual(held.routeErrors, [])
    witness.status = "PASS"

    return witness
  } catch (error) {
    witness.status = "FAIL"
    witness.error = String(error)
    throw error
  } finally {
    await held.dispose()
    witness.gates = held.gates.map(({ label, input, claimed, fulfilled }) => ({
      label,
      input,
      claimed,
      fulfilled,
    }))
    fs.writeFileSync(
      path.join(evidence, `${engine}-${theme}-transport-race.json`),
      `${JSON.stringify(witness, null, 2)}\n`,
    )
  }
}
