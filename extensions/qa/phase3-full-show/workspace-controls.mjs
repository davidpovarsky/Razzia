import assert from "node:assert/strict"
import path from "node:path"
import { FULL_SHOW_META_V3 } from "../../src/mcp-app/contracts/full-show-frame.ts"

const lifecycleObservers = new WeakMap()

export function observeHostLifecycle(page, observer) {
  lifecycleObservers.set(page, observer)
}

export async function prepareHostNavigation(page, reason = "navigation") {
  const event = {
    at: new Date().toISOString(),
    reason,
    url: page.url(),
    status: "waiting",
  }

  try {
    if (event.url === "about:blank") {
      event.status = "no-host"

      return
    }

    event.receipt = await page.evaluate(async () => {
      const owner = document
      const host = window.__host

      if (!host?.prepareNavigation) {
        throw new Error("QA host lifecycle API missing")
      }

      const receipt = await host.prepareNavigation()

      if (owner !== document || host !== window.__host) {
        throw new Error("QA host changed during disposal")
      }

      return receipt
    })
    assert.equal(event.receipt.status, "drained")
    assert.deepEqual(event.receipt.remaining, {
      http: 0,
      handlers: 0,
      initialization: 0,
      replies: 0,
      connecting: false,
    })
    assert.deepEqual(event.receipt.errors, [])
    event.status = "drained"
  } catch (error) {
    event.status = "failed"
    event.error = String(error)

    try {
      event.snapshot = await page.evaluate(() => window.__host?.lifecycle())
    } catch (snapshotError) {
      event.snapshotError = String(snapshotError)
    }

    throw error
  } finally {
    event.finishedAt = new Date().toISOString()
    lifecycleObservers.get(page)?.(event)
  }
}

export async function closeWorkspaceDrawers(page) {
  const close = page
    .frameLocator("iframe")
    .locator(
      '.editor-workspace-panel[data-docked="false"]:not([hidden]) [data-editor-drawer-close]',
    )

  if (await close.count()) {
    await close.first().click()
  }
}

export async function openWorkspacePanel(page, id) {
  const iframe = page.frameLocator("iframe")
  const panel = iframe.getByTestId(`editor-panel-${id}`)

  if (await panel.isVisible()) {
    if ((await panel.getAttribute("data-docked")) === "true") {
      await closeWorkspaceDrawers(page)
    }

    return panel
  }

  await closeWorkspaceDrawers(page)
  await iframe.getByTestId(`editor-panel-toggle-${id}`).click()
  await panel.waitFor({ state: "visible" })

  return panel
}

// Scoped development proof using the real issuer, MCP client and AppBridge.
// No authored changes, live votes or native-save responses are fabricated here.
export async function verifyWorkspaceControls({
  page,
  base,
  scenario,
  engine,
  theme,
  evidence,
  readRecord,
}) {
  const before = await readRecord()
  const cards = scenario.chapters.filter(
    (chapter, index, chapters) =>
      chapters.findIndex((candidate) => candidate.cardId === chapter.cardId) ===
      index,
  )
  const question = scenario.chapters.find(
    (chapter) => chapter.kind === "question",
  )
  assert(question)
  const results = scenario.chapters.find(
    (chapter) =>
      chapter.cardId === question.cardId && chapter.kind === "results",
  )
  const voting = scenario.chapters.find(
    (chapter) =>
      chapter.cardId === question.cardId && chapter.kind === "voting",
  )
  const cardIndex = cards.findIndex((card) => card.cardId === question.cardId)
  const nextCard = cards[cardIndex + 1]
  assert(results && voting && nextCard)
  scenario.selection.chapterId = results.id
  await prepareHostNavigation(page, "workspace scenario")
  await page.goto(`${base}/host?scenario=${scenario.id}`)
  await page.locator("html[data-host-ready=true]").waitFor()
  const iframe = page.frameLocator("iframe")
  const stage = iframe.locator("[data-full-show-chapter]")
  const waitChapter = (id, timeout = 10000) =>
    iframe.locator(`[data-full-show-chapter="${id}"]`).waitFor({ timeout })
  await waitChapter(results.id)
  const child = page.frames().find((frame) => frame.url().endsWith("/widget"))
  assert(child)
  const pause = async () => {
    if ((await stage.getAttribute("data-playback-paused")) !== "true") {
      await iframe.getByTestId("full-show-pause").click()
    }

    await iframe.locator('[data-playback-paused="true"]').waitFor()
  }
  await pause()
  assert.equal(
    (await iframe.getByTestId("full-show-position").innerText()).trim(),
    `${cardIndex + 1} / ${cards.length}`,
  )
  await iframe.getByTestId("full-show-next").click()
  await waitChapter(nextCard.id)
  await iframe.getByTestId("full-show-previous").click()
  await waitChapter(question.id)
  assert.equal(await stage.getAttribute("data-playback-paused"), "true")
  const replayEpoch = await stage.getAttribute("data-playback-epoch")
  await iframe.getByTestId("full-show-replay").click()
  await child.waitForFunction((epoch) => {
    const host = document.querySelector(
      '[data-testid="full-show-native-surface"]',
    )

    return (
      host?.shadowRoot
        ?.querySelector("[data-playback-epoch]")
        ?.getAttribute("data-playback-epoch") !== epoch
    )
  }, replayEpoch)
  await waitChapter(question.id)
  assert.equal(question.duration.kind, "known")
  await iframe.getByTestId("full-show-pause").click()
  await waitChapter(voting.id, question.duration.milliseconds + 10000)
  await pause()
  assert.equal(
    (await iframe.getByTestId("full-show-position").innerText()).trim(),
    `${cardIndex + 1} / ${cards.length}`,
  )
  const beforeChoose = await page.evaluate(() => window.__host.calls())
  const choice = iframe.getByTestId(
    theme === "tadazz-classic" ? "tadazz-card-0" : "native-razzia-answer-0",
  )
  await choice.focus()
  await choice.press("Enter")
  await iframe.locator('[data-demo-selected-index="0"]').waitFor()
  assert.deepEqual(
    await page.evaluate(() => window.__host.calls()),
    beforeChoose,
  )
  await iframe.getByTestId("full-show-demo-reveal").click()
  await waitChapter(results.id)
  const resultFrame =
    scenario.lastPreviewResult._meta[FULL_SHOW_META_V3].content.frame
  assert(
    resultFrame.results.every(
      (result) => result.count === 0 && result.percent === 0,
    ),
  )

  const layout = []
  for (const [width, height] of [
    [320, 640],
    [390, 844],
    [768, 700],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width, height })
    await page.locator("iframe").evaluate((element, nextHeight) => {
      document.body.style.margin = "0"
      element.style.height = `${nextHeight}px`
      element.style.display = "block"
    }, height)
    await child.evaluate(async () => {
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
    })
    const wide = width >= 1100
    await iframe
      .locator(
        `[data-testid="editor-workspace"][data-layout="${wide ? "wide" : "compact"}"]`,
      )
      .waitFor()
    await child.waitForFunction(() => {
      const surface = document
        .querySelector('[data-testid="full-show-native-surface"]')
        .getBoundingClientRect()

      const canvas = document
        .querySelector('[data-testid="editor-workspace-canvas"]')
        .getBoundingClientRect()

      return (
        Math.abs(canvas.bottom - innerHeight) <= 1 &&
        surface.bottom <= innerHeight + 1 &&
        Math.abs(
          surface.width - Math.min(canvas.width, (canvas.height * 16) / 9),
        ) <= 1 &&
        surface.width > 100 &&
        Math.abs(surface.width / surface.height - 16 / 9) < 0.02
      )
    })
    const geometry = await child.evaluate(() => {
      const bounds = (selector) => {
        const node = document.querySelector(selector)
        const box = node.getBoundingClientRect()

        return { x: box.x, y: box.y, width: box.width, height: box.height }
      }

      return {
        viewport: { width: innerWidth, height: innerHeight },
        scroll: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        canvas: bounds('[data-testid="editor-workspace-canvas"]'),
        surface: bounds('[data-testid="full-show-native-surface"]'),
        backdrop: {
          color: getComputedStyle(
            document.querySelector(".widget-stage-viewport"),
          ).backgroundColor,
          image: getComputedStyle(
            document.querySelector(".widget-stage-viewport"),
          ).backgroundImage,
        },
      }
    })
    assert(
      geometry.scroll.width <= geometry.viewport.width + 1,
      JSON.stringify(geometry),
    )
    assert(
      geometry.scroll.height <= geometry.viewport.height + 1,
      JSON.stringify(geometry),
    )
    assert(
      geometry.surface.width > 100 && geometry.surface.height > 50,
      JSON.stringify(geometry),
    )
    assert(
      geometry.surface.y >= 0 &&
        geometry.surface.y + geometry.surface.height <= height + 1,
      JSON.stringify(geometry),
    )
    assert(
      Math.abs(geometry.surface.width / geometry.surface.height - 16 / 9) <
        0.02,
      JSON.stringify(geometry),
    )
    for (const id of ["edit", "display", "save"]) {
      const panel = iframe.getByTestId(`editor-panel-${id}`)
      assert.equal(
        await panel.count(),
        1,
        "Closed panels must retain mounted state",
      )

      if (wide && id === "edit") {
        assert.equal(await panel.getAttribute("data-docked"), "true")
        assert(await panel.isVisible())

        continue
      }

      const toggle = iframe.getByTestId(`editor-panel-toggle-${id}`)
      await toggle.click()
      await panel.waitFor({ state: "visible" })
      const panelBounds = await panel.boundingBox()
      assert(
        panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= width + 1,
        JSON.stringify(panelBounds),
      )
      assert(
        panelBounds.y >= 0 && panelBounds.y + panelBounds.height <= height + 1,
        JSON.stringify(panelBounds),
      )

      if (id === "edit") {
        const title = iframe.getByTestId("full-show-title")
        const originalTitle = await title.inputValue()
        await title.fill(`${originalTitle} unsaved`)
        await title.press("Escape")
        await panel.waitFor({ state: "hidden" })
        assert.equal(
          await child.evaluate(() =>
            document.activeElement?.getAttribute("data-testid"),
          ),
          `editor-panel-toggle-${id}`,
        )
        await toggle.click()
        await panel.waitFor({ state: "visible" })
        assert.equal(await title.inputValue(), `${originalTitle} unsaved`)
        await title.fill(originalTitle)
      }

      if (id === "display") {
        await iframe.getByTestId("full-show-aspect").selectOption("4 / 3")
        await child.waitForFunction(() => {
          const surface = document
            .querySelector('[data-testid="full-show-native-surface"]')
            .getBoundingClientRect()

          return Math.abs(surface.width / surface.height - 4 / 3) < 0.02
        })
        await iframe.getByTestId("full-show-aspect").selectOption("16 / 9")
      }

      await iframe.getByTestId(`editor-panel-close-${id}`).press("Escape")
      await panel.waitFor({ state: "hidden" })
      assert.equal(
        await child.evaluate(() =>
          document.activeElement?.getAttribute("data-testid"),
        ),
        `editor-panel-toggle-${id}`,
      )
    }

    if (theme === "razzia-original") {
      await iframe
        .locator('[data-testid="native-stage-viewport"][data-fit-ready="true"]')
        .waitFor()
      const nativeCards = await iframe
        .locator(
          '[data-full-show-chapter] [data-testid^="native-razzia-answer-"]',
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const stageBounds = node
              .closest("[data-full-show-chapter]")
              .getBoundingClientRect()
            const card = node.getBoundingClientRect()

            return {
              x: card.x,
              y: card.y,
              width: card.width,
              height: card.height,
              inside:
                card.width > 0 &&
                card.height > 0 &&
                card.left >= stageBounds.left - 1 &&
                card.top >= stageBounds.top - 1 &&
                card.right <= stageBounds.right + 1 &&
                card.bottom <= stageBounds.bottom + 1,
            }
          }),
        )
      assert.equal(nativeCards.length, 5)
      assert(
        nativeCards.every((card) => card.inside),
        `All native text answers must fit the canvas: ${JSON.stringify(
          nativeCards,
        )}`,
      )
      geometry.nativeCards = nativeCards
    }

    layout.push({ width, height, ...geometry })

    if (width === 390 || width === 1366) {
      await page.screenshot({
        path: path.join(evidence, `${engine}-${theme}-workspace-${width}.png`),
      })
    }
  }
  const after = await readRecord()
  assert.equal(after.revision, before.revision)
  assert.equal(after.authoredShowJson, before.authoredShowJson)
  assert.deepEqual(await child.evaluate(() => window.__cspViolations ?? []), [])

  return {
    engine,
    theme,
    check: "shared workspace and logical card navigation",
    logicalCards: cards.length,
    nativePhaseCount: scenario.chapters.length,
    nextSkipsInternalPhases: true,
    automaticQuestionToVoting: true,
    replayRestartsLogicalCard: true,
    localAnswerPreservesZeroVotes: true,
    drawerStateAndFocusPreserved: true,
    draftUnchanged: true,
    layout,
  }
}
