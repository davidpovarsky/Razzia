/** Shared viewer acceptance against the real Linux-hosted site; no mocked app clock. */
import assert from "node:assert/strict"
import { PUBLIC_GALLERY_IDS } from "./catalogue-inventory.mjs"
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import {
  watchQuestionSequence,
  readQuestionSequence,
  stopQuestionSequence,
} from "./question-sequence-verify.mjs"

const require = createRequire("/cleanup/extensions/package.json")
const { expect } = require("@playwright/test")
const expectedLabels = {
  en: {
    controls: "Presentation controls",
    previous: "Previous",
    next: "Start",
    replay: "Replay",
    sound: "Enable sound",
    mute: "Mute",
  },
  he: {
    controls: "בקרי הפעלה",
    previous: "הקודם",
    next: "התחלה",
    replay: "הפעלה מחדש",
    sound: "הפעלת קול",
    mute: "השתקה",
  },
}
const actions = ["previous", "next", "replay", "sound"]
const toolbar = (dialog) =>
  dialog
    .locator(
      '.game-viewer-controls [data-platform-component="presentation-controls"]',
    )
    .first()
const openDialog = (page) => page.locator(".game-viewer-dialog[open]").first()

function observeMedia() {
  const states = new WeakMap()
  const refs = []
  let nextId = 0
  const original = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function play(...args) {
    let state = states.get(this)

    if (!state) {
      state = { id: (nextId += 1), attempts: 0 }
      states.set(this, state)
      refs.push(new WeakRef(this))
    }

    state.attempts += 1

    return original.apply(this, args)
  }
  window.__viewerMedia = () =>
    refs.flatMap((reference) => {
      const element = reference.deref()

      if (
        !element ||
        !(element instanceof HTMLAudioElement) ||
        element.paused ||
        element.ended ||
        element.muted ||
        element.volume <= 0
      ) {
        return []
      }

      return [
        {
          ...states.get(element),
          url: new URL(element.currentSrc || element.src, location.href)
            .pathname,
          time: element.currentTime,
        },
      ]
    })
}

async function controlSnapshot(dialog, locale) {
  const controls = toolbar(dialog)
  await expect(controls).toHaveAttribute("data-platform-scope", "platform.host")
  await expect(controls).toHaveAttribute("data-platform-appearance", "dark")
  await expect(controls).toHaveAttribute("dir", locale === "he" ? "rtl" : "ltr")
  await expect(controls).toHaveAttribute(
    "aria-label",
    expectedLabels[locale].controls,
  )
  const buttons = controls.locator("[data-presentation-action]")
  assert.deepEqual(
    await buttons.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-presentation-action")),
    ),
    actions,
  )
  for (const action of actions) {
    const button = controls.locator(`[data-presentation-action="${action}"]`)
    await expect(button).toHaveAttribute(
      "aria-label",
      expectedLabels[locale][action],
    )
    await expect(
      button.locator(".tds-presentation-control-icon svg"),
    ).toHaveCount(1)
    await expect(button.locator(".tds-presentation-control-label")).toHaveText(
      expectedLabels[locale][action],
    )
    assert(
      (await button.boundingBox()).height >= 44,
      "Every shared action has a 44px target",
    )
  }
  await expect(
    controls.locator('[data-presentation-action="previous"]'),
  ).toBeDisabled()
  await expect(
    controls.locator('[data-presentation-action="sound"]'),
  ).toHaveAttribute("aria-pressed", "false")

  return buttons.evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node)

      return {
        action: node.getAttribute("data-presentation-action"),
        className: node.className,
        variant: node.getAttribute("data-variant"),
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        borderRadius: style.borderRadius,
        color: style.color,
        backgroundColor: style.backgroundColor,
        padding: style.padding,
        minHeight: style.minHeight,
        gap: style.gap,
      }
    }),
  )
}

export async function verifyViewerGeometry(
  page,
  { desktop = true, label = "viewer" } = {},
) {
  const dialog = openDialog(page)
  await expect(dialog).toHaveAttribute("data-expanded", "true")
  await expect
    .poll(() => dialog.evaluate((node) => node.matches(":modal")))
    .toBe(true)
  const measure = () =>
    dialog.evaluate((node) => {
      const box = (selector) => {
        const value = node.querySelector(selector)?.getBoundingClientRect()

        return value
          ? {
              x: value.x,
              y: value.y,
              width: value.width,
              height: value.height,
              right: value.right,
              bottom: value.bottom,
            }
          : null
      }

      return {
        viewport: { width: innerWidth, height: innerHeight },
        stage: box(".game-viewer-stage"),
        header: box(".game-viewer-header"),
        controls: box(".game-viewer-controls"),
        dialogOverflow: node.scrollWidth - node.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        detailsOpen: [...node.querySelectorAll(".game-viewer-details")].some(
          (details) => details.open,
        ),
      }
    })
  const metrics = await measure()
  const { stage, header, controls, viewport } = metrics
  assert(stage && header && controls, `${label}: complete shared viewer`)
  assert(
    Math.abs(stage.width / stage.height / (16 / 9) - 1) <= 0.01,
    `${label}: true landscape 16:9`,
  )
  assert(
    stage.x >= -1 &&
      stage.right <= viewport.width + 1 &&
      stage.y >= -1 &&
      stage.bottom <= viewport.height + 1,
    `${label}: entire stage fits the viewport`,
  )
  assert(
    controls.y >= stage.bottom - 1,
    `${label}: controls stay outside the game picture`,
  )
  assert(
    metrics.dialogOverflow <= 1 && metrics.pageOverflow <= 1,
    `${label}: no horizontal clipping`,
  )
  assert.equal(
    metrics.detailsOpen,
    false,
    `${label}: secondary details start collapsed`,
  )

  if (desktop) {
    assert(
      stage.width >= viewport.width * 0.75,
      `${label}: game uses at least 75% of viewport width`,
    )
    assert(
      stage.height >= viewport.height * 0.6,
      `${label}: game uses at least 60% of viewport height`,
    )
    assert(
      header.height + controls.height <= 128,
      `${label}: compact header and toolbar`,
    )
  }

  const native = dialog.getByTestId("tadazz-stage").first()
  await expect(native).toBeVisible()
  await expect
    .poll(
      async () => {
        const actual = await native.boundingBox()
        const current = (await measure()).stage

        return Boolean(
          actual &&
          actual.x >= current.x - 2 &&
          actual.y >= current.y - 2 &&
          actual.x + actual.width <= current.right + 2 &&
          actual.y + actual.height <= current.bottom + 2 &&
          actual.width >= current.width * 0.97 &&
          actual.height >= current.height * 0.97,
        )
      },
      { timeout: 10_000 },
    )
    .toBe(true)

  return metrics
}

async function retainedViewer(dialog, handles) {
  assert.equal(
    await dialog.evaluate(
      (node, original) => node === original,
      handles.dialog,
    ),
    true,
    "Same dialog node",
  )
  assert.equal(
    await dialog
      .locator(".game-viewer-stage")
      .evaluate((node, original) => node === original, handles.stage),
    true,
    "Same stage container",
  )
  assert.equal(
    await dialog
      .getByTestId("tadazz-stage")
      .first()
      .evaluate((node, original) => node === original, handles.native),
    true,
    "Same native renderer",
  )
}

async function activeMedia(page, expectedUrl) {
  await expect
    .poll(
      () =>
        page.evaluate(
          (receivedExpectedUrl) =>
            (window.__viewerMedia?.() ?? []).filter(
              (item) => item.url === receivedExpectedUrl && item.time > 0.1,
            ).length,
          expectedUrl,
        ),
      { timeout: 15_000 },
    )
    .toBe(1)

  return page.evaluate(
    (receivedExpectedUrl2) =>
      window.__viewerMedia().find((item) => item.url === receivedExpectedUrl2),
    expectedUrl,
  )
}

const demoRoot = (page, id) =>
  page.getByTestId(
    id === "great-guessoff" ? "great-guessoff-demo" : "catalogue-game-demo",
  )
const phaseAttribute = (id) =>
  id === "great-guessoff" ? "data-ggo-phase" : "data-game-phase"
async function gotoDemo({ page, origin, id, locale }) {
  const response = await page.goto(
    `${origin}/?view=demo&game=${encodeURIComponent(id)}&lng=${locale}`,
    { waitUntil: "domcontentloaded" },
  )
  assert.equal(response?.status(), 200)
  await expect(demoRoot(page, id)).toHaveAttribute(
    phaseAttribute(id),
    "intro",
    { timeout: 30_000 },
  )
  await expect(
    openDialog(page).getByTestId("tadazz-stage").first(),
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    toolbar(openDialog(page)).locator('[data-presentation-action="next"]'),
  ).toBeEnabled({ timeout: 30_000 })
  await page.mouse.move(0, 0)
}

async function verifyActiveLandscape({
  page,
  id,
  locale,
  question,
  directory,
}) {
  assert(question, "The landscape case uses the actual first authored question")
  const root = demoRoot(page, id)
  const dialog = openDialog(page)
  const phase = phaseAttribute(id)
  const detail = {
    questionKey: question.key,
    question: question.question,
    sequence: null,
    answerSurface: null,
    options: [],
    selected: null,
  }
  const evidencePath = join(
    directory,

    `active-landscape-${locale}-${id}.json`,
  )
  const save = () =>
    writeFileSync(evidencePath, `${JSON.stringify(detail, null, 2)}\n`)

  await watchQuestionSequence(root, { phaseAttribute: phase })

  try {
    await toolbar(dialog).locator('[data-presentation-action="next"]').click()
    await expect(root).toHaveAttribute(phase, "voting", { timeout: 30_000 })
    // Measure the real two-second lead-in before deliberate user scrolling.
    // The existing full-round cases retain their stricter through-results proof.
    detail.sequence = await readQuestionSequence(root, 0, {
      throughResults: false,
    })
  } finally {
    await stopQuestionSequence(root)
  }

  save()

  const companion = dialog.getByTestId("catalogue-mobile-question")
  const compact = await companion.isVisible()
  detail.answerSurface = compact ? "unscaled-companion" : "native-stage"
  const optionAt = (index) =>
    compact
      ? companion.getByTestId(`tadazz-pad-option-${index}`)
      : dialog.getByTestId(`tadazz-card-${index}`)

  if (compact) {
    await expect(companion).toHaveAttribute("data-question-key", question.key)
    await expect(companion).toHaveAttribute("data-phase", "voting")
    await expect(
      companion.getByTestId("catalogue-mobile-question-heading"),
    ).toHaveText(question.question)
    await expect(
      companion.getByTestId("tadazz-answer-pad").getByRole("button"),
    ).toHaveCount(question.answers.length)
    assert.equal(
      await companion.evaluate((element) =>
        Boolean(element.closest(".game-viewer-controls")),
      ),
      true,
      "Readable landscape answers live outside the scaled game picture",
    )
  } else {
    await expect(dialog.locator("[data-v4-choice]")).toHaveCount(
      question.answers.length,
    )
  }

  for (let index = 0; index < question.answers.length; index += 1) {
    const option = optionAt(index)
    await option.scrollIntoViewIfNeeded()
    await expect(option).toBeVisible()
    await expect(option).toBeEnabled()
    await expect(option.locator(compact ? "p" : ".answer-title")).toHaveText(
      question.answers[index].text,
    )
    // Trial performs the browser's real hit-testing without submitting early.
    await option.click({ trial: true })
    const metrics = await option.evaluate((element, receivedCompact) => {
      const bounds = element.getBoundingClientRect()
      const text = element.querySelector(
        receivedCompact ? "p" : ".answer-title",
      )
      const range = document.createRange()
      range.selectNodeContents(text)
      const lineBoxes = [...range.getClientRects()].filter(
        (box) => box.width > 0 && box.height > 0,
      )

      return {
        width: bounds.width,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        fontSize: Number.parseFloat(getComputedStyle(text).fontSize),
        renderedLineHeight: Math.min(...lineBoxes.map((box) => box.height)),
        clipped:
          text.scrollWidth > text.clientWidth + 1 ||
          text.scrollHeight > text.clientHeight + 1,
      }
    }, compact)
    const layout = await dialog.evaluate((element) => {
      const stage = element
        .querySelector(".game-viewer-stage")
        .getBoundingClientRect()
      const controls = element
        .querySelector(".game-viewer-controls")
        .getBoundingClientRect()

      return {
        stageBottom: stage.bottom,
        controlsTop: controls.top,
        dialogOverflow: element.scrollWidth - element.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
      }
    })
    detail.options.push({ index, ...metrics, layout })
    save()
    assert(
      metrics.width >= 44 && metrics.height >= 44,
      "Every landscape answer has a usable 44px target",
    )
    assert(
      metrics.fontSize >= 16 &&
        Number.isFinite(metrics.renderedLineHeight) &&
        metrics.renderedLineHeight >= 16,
      "Landscape answer text is actually rendered at a readable size",
    )
    assert(!metrics.clipped, "Complete landscape answer text remains visible")
    assert(
      metrics.left >= -1 &&
        metrics.right <= metrics.viewportWidth + 1 &&
        metrics.top >= -1 &&
        metrics.bottom <= metrics.viewportHeight + 1,
      "Each landscape answer is fully reachable by scrolling within the dialog",
    )
    assert(
      layout.dialogOverflow <= 1 && layout.pageOverflow <= 1,
      "No active landscape horizontal overflow",
    )
    assert(
      layout.controlsTop >= layout.stageBottom - 1,
      "Active controls remain outside the game picture",
    )
  }
  await page.screenshot({
    path: join(directory, `active-landscape-${locale}-${id}.png`),
  })
  const selected = question.correctAnswers[0]
    ? question.correctAnswers[0] - 1
    : 0
  await optionAt(selected).click()
  await expect(root).toHaveAttribute(phase, "results")
  await expect(optionAt(selected)).toBeDisabled()

  if (compact) {
    await expect(optionAt(selected)).toHaveAttribute("aria-pressed", "true")
    await expect(
      companion.getByTestId("catalogue-mobile-selected-answer"),
    ).toContainText(question.answers[selected].text)
  } else {
    await expect(optionAt(selected)).toHaveClass(/is-selected/)
  }

  detail.selected = selected
  save()

  return detail
}

export async function verifyPublicViewers({
  browser,
  origin,
  ids,
  previews,
  evidence,
  inspect,
  record,
  onPage,
}) {
  assert.equal(process.platform, "linux")
  const directory = join(evidence, "viewer-controls")
  mkdirSync(directory, { recursive: true })
  for (const locale of ["en", "he"]) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      locale: locale === "he" ? "he-IL" : "en-GB",
      reducedMotion: "no-preference",
      ignoreHTTPSErrors: new URL(origin).hostname !== "tadazz.com",
    })
    await context.addInitScript(
      (receivedLocale) => localStorage.setItem("i18nextLng", receivedLocale),
      locale,
    )
    await context.addInitScript(observeMedia)
    const page = await context.newPage()
    inspect(page)
    onPage(page)
    let baseline = undefined

    try {
      for (const id of ids) {
        await page.setViewportSize({ width: 1366, height: 768 })
        await gotoDemo({ page, origin, id, locale })
        const dialog = openDialog(page)
        const controls = await controlSnapshot(dialog, locale)

        if (!baseline) {
          baseline = controls
        } else {
          assert.deepEqual(
            controls,
            baseline,
            `Identical root-owned button styles across every game: ${id}/${
              locale
            }`,
          )
        }

        const handles = {
          dialog: await dialog.elementHandle(),
          stage: await dialog.locator(".game-viewer-stage").elementHandle(),
          native: await dialog
            .getByTestId("tadazz-stage")
            .first()
            .elementHandle(),
        }
        let beforeAudio = undefined

        if (["great-guessoff", "family"].includes(id)) {
          await toolbar(dialog)
            .locator('[data-presentation-action="sound"]')
            .click()
          await expect(
            toolbar(dialog).locator('[data-presentation-action="sound"]'),
          ).toHaveAttribute("aria-label", expectedLabels[locale].mute)
          await expect(demoRoot(page, id)).toHaveAttribute(
            "data-audio-url",
            /\S/,
          )
          const requested = await demoRoot(page, id).getAttribute(
            "data-audio-url",
          )
          assert(requested, "Actual active soundtrack URL")
          beforeAudio = await activeMedia(
            page,
            new URL(requested, origin).pathname,
          )
        }

        const expand = dialog.getByTestId("game-viewer-expand")
        await expand.focus()
        await page.keyboard.press("Enter")
        const geometries = []
        for (const viewport of [
          { width: 1366, height: 768 },
          { width: 1440, height: 900 },
        ]) {
          await page.setViewportSize(viewport)
          geometries.push(
            await verifyViewerGeometry(page, { label: `${id}/${locale}` }),
          )
          await retainedViewer(dialog, handles)
        }
        await page.keyboard.press("Escape")
        await expect(dialog).toHaveAttribute("data-expanded", "false")
        await expect(expand).toBeFocused()
        await retainedViewer(dialog, handles)
        await expand.click()
        await expect(dialog).toHaveAttribute("data-expanded", "true")
        await expand.click()
        await expect(dialog).toHaveAttribute("data-expanded", "false")
        await expect(expand).toBeFocused()
        await retainedViewer(dialog, handles)
        let audio = undefined

        if (beforeAudio) {
          audio = await activeMedia(page, beforeAudio.url)
          assert.equal(
            audio.id,
            beforeAudio.id,
            "Expansion retains the active audio element",
          )
          assert.equal(
            audio.attempts,
            beforeAudio.attempts,
            "Expansion never restarts audio playback",
          )
          assert(
            audio.time > beforeAudio.time,
            "Audio clock continues through expansion and collapse",
          )
          await toolbar(dialog)
            .locator('[data-presentation-action="sound"]')
            .click()
        }

        for (const handle of Object.values(handles)) {
          await handle.dispose()
        }
        await dialog.getByTestId("game-viewer-close").click()
        await expect(dialog).toBeHidden()
        await expect
          .poll(() => new URL(page.url()).searchParams.get("view"))
          .toBe("product")
        const detail = {
          locale,
          game: id,
          geometries,
          controls,
          audio: audio ? { before: beforeAudio, after: audio } : null,
        }
        writeFileSync(
          join(directory, `desktop-${locale}-${id}.json`),
          `${JSON.stringify(detail, null, 2)}\n`,
        )
        record(`shared-viewer-desktop-${locale}-${id}`, {
          viewports: 2,
          retainedRenderer: true,
          audioRetained: Boolean(audio),
        })
      }
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        for (const id of ["great-guessoff", "family"]) {
          await page.setViewportSize(viewport)
          await gotoDemo({ page, origin, id, locale })
          const dialog = openDialog(page)
          await controlSnapshot(dialog, locale)
          await dialog.getByTestId("game-viewer-expand").click()
          const detail = await verifyViewerGeometry(page, {
            desktop: false,
            label: `${id}/${locale}/${viewport.width}`,
          })
          await page.screenshot({
            path: join(
              directory,
              `mobile-${locale}-${viewport.width}-${id}.png`,
            ),
          })

          if (viewport.width === 844) {
            const question = previews
              .get(id)
              .show.cards.find(
                (card) => card.kind === "quiz" || card.kind === "survey",
              )
            detail.activeLandscape = await verifyActiveLandscape({
              page,
              id,
              locale,
              question,
              directory,
            })
          }

          record(
            `shared-viewer-mobile-${locale}-${viewport.width}-${id}`,
            detail,
          )
        }
      }

      if (locale === "en") {
        await page.setViewportSize({ width: 1440, height: 900 })
        for (const id of ["family", "picture"]) {
          await gotoDemo({ page, origin, id, locale })
          const dialog = openDialog(page)
          await dialog.getByTestId("game-viewer-expand").click()
          await verifyViewerGeometry(page, {
            label: `${id}/normal-motion-replay`,
          })
          const root = demoRoot(page, id)
          await watchQuestionSequence(root)
          const controls = toolbar(dialog)
          const rounds = []
          for (let replay = 0; replay < 2; replay += 1) {
            await controls.locator('[data-presentation-action="next"]').click()
            await expect(root).toHaveAttribute("data-game-phase", "voting", {
              timeout: 30_000,
            })
            await page.getByTestId("tadazz-card-0").first().click()
            await expect(root).toHaveAttribute("data-game-phase", "results")
            rounds.push(
              await readQuestionSequence(root, replay, {
                evidencePath: join(
                  directory,
                  `normal-motion-replay-${id}-${replay}.json`,
                ),
              }),
            )

            if (replay === 0) {
              await controls
                .locator('[data-presentation-action="replay"]')
                .click()
              await expect(root).toHaveAttribute("data-game-phase", "intro")
              await expect(
                controls.locator('[data-presentation-action="next"]'),
              ).toBeEnabled({ timeout: 30_000 })
            }
          }
          await stopQuestionSequence(root)
          writeFileSync(
            join(directory, `normal-motion-replay-${id}.json`),
            `${JSON.stringify(rounds, null, 2)}\n`,
          )
          record(`question-sequence-normal-motion-and-replay-${id}`, {
            rounds: 2,
            answerImages: id === "picture",
          })
        }
      }
    } catch (error) {
      writeFileSync(
        join(directory, `failure-${locale}.json`),
        `${JSON.stringify(
          { url: page.url(), error: String(error?.stack ?? error) },
          null,
          2,
        )}\n`,
      )
      await page
        .screenshot({
          path: join(directory, `failure-${locale}.png`),
          fullPage: true,
        })
        .catch(() => {
          /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
        })
      throw error
    } finally {
      await context.close()
    }
  }
}

export async function verifyStudioViewer(options) {
  assert.equal(process.platform, "linux")
  assert.equal(
    new URL(options.origin).hostname,
    "127.0.0.1",
    "Owned disposable fixture only",
  )
  const { context, origin, token } = options
  const evidence = join(options.evidence, "studio-viewer")
  mkdirSync(evidence, { recursive: true })
  const page = await context.newPage()
  const errors = []
  const failedAssets = []
  const results = []
  const headers = { Authorization: `Bearer ${token}` }
  let ownedQuizId = undefined

  page.on("pageerror", (error) => errors.push(error.message))
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      ["image", "script", "stylesheet", "font", "media"].includes(
        response.request().resourceType(),
      )
    ) {
      failedAssets.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      })
    }
  })

  try {
    for (const locale of ["en", "he"]) {
      for (const viewport of [
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport)
        const response = await page.goto(
          `${origin}/studio/explore?lng=${locale}`,
          { waitUntil: "domcontentloaded" },
        )
        assert.equal(response?.status(), 200)
        const cards = page.locator("[data-catalogue-card]")
        await expect(cards).toHaveCount(PUBLIC_GALLERY_IDS.length, {
          timeout: 30_000,
        })
        await expect(cards.first()).toHaveAttribute(
          "data-catalogue-card",
          "royal-quiz",
        )
        assert.equal(
          await cards.locator(".catalogue-studio-details[open]").count(),
          0,
          "Studio descriptions are secondary and collapsed",
        )
        const trigger = cards.first().locator(".game-preview-trigger")
        await trigger.focus()
        await page.keyboard.press("Enter")
        await expect(
          page
            .locator(
              '[data-native-application-preview][data-preview-ready="true"]',
            )
            .first(),
        ).toBeVisible({ timeout: 30_000 })
        const geometry = await verifyViewerGeometry(page, {
          label: `Studio/${locale}`,
        })
        await expect(openDialog(page)).toHaveAttribute(
          "dir",
          locale === "he" ? "rtl" : "ltr",
        )
        const resize = openDialog(page).getByTestId("game-viewer-expand")
        await resize.click()
        await expect(openDialog(page)).toHaveAttribute("data-expanded", "false")
        await expect(
          openDialog(page).getByTestId("game-viewer-close"),
        ).toBeVisible()
        await resize.click()
        await expect(openDialog(page)).toHaveAttribute("data-expanded", "true")
        await page.screenshot({
          path: join(evidence, `preview-${locale}-${viewport.width}.png`),
        })
        await page.keyboard.press("Escape")
        await expect(openDialog(page)).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await trigger.press("Enter")
        await expect(openDialog(page)).toBeVisible()
        await openDialog(page).getByTestId("game-viewer-close").click()
        await expect(openDialog(page)).toHaveCount(0)
        await expect(trigger).toBeFocused()
        results.push({
          name: `studio-preview-modal-keyboard-${locale}-${viewport.width}`,
          passed: true,
          geometry,
        })
      }
    }
    const { computeCanonicalBaseDigest } =
      await import("../../src/core/digest.ts")
    const photoCases = [
      {
        question: "Which fruit is shown in this photograph?",
        answers: ["Banana", "Apple", "Orange", "Pear"],
        screenshot: "private-question-image-results.png",
      },
      {
        question: "Which fruit appears in this photograph?",
        answers: ["Banana", "Apple", "Orange", "Pear", "Peach"],
        screenshot: "private-question-image-five-results.png",
      },
    ]
    const questionIds = photoCases.map(() => randomUUID())
    const quizz = {
      subject: `Private viewer question-image acceptance ${randomUUID()}`,
      gameMode: "quiz",
      questions: photoCases.map(({ question, answers }) => ({
        type: "single",
        question,
        answers,
        solutions: [0],
        cooldown: 9,
        time: 5,
        media: {
          type: "image",
          url: `${origin}/tadazz-show/great-guessoff/banana.webp`,
        },
      })),
    }
    const extras = {
      schemaVersion: 2,
      revision: 1,
      quizId: "draft",
      baseDigest: computeCanonicalBaseDigest(quizz),
      questionIds,
      timeline: questionIds.map((questionId) => ({
        id: randomUUID(),
        kind: "question",
        questionId,
      })),
      scenes: {},
      defaults: {
        showTheme: { id: "tadazz-classic", version: "1.0.0", overrides: {} },
        advanceMode: "auto",
        leaderboardPolicy: "disabled",
      },
    }
    const saved = await context.request.post(
      `${origin}/api/extensions/quizzes`,
      { headers, data: { quizz, extras } },
    )
    assert.equal(
      saved.status(),
      201,
      "Create one isolated private quiz with four- and five-answer photos",
    )
    const created = await saved.json()
    ownedQuizId = created.quizId ?? created.id
    assert(ownedQuizId)
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(
      `${origin}/manager/quizz/${encodeURIComponent(ownedQuizId)}?lng=en`,
    )
    const preview = page.getByTestId("question-live-preview")
    await expect(preview).toBeVisible({ timeout: 30_000 })
    const inspectPhotoAnswers = (labels) =>
      preview
        .locator(".photo-option[data-v4-choice]")
        .evaluateAll((cards, receivedExpectedLabels) => {
          const rect = (node) => {
            const box = node.getBoundingClientRect()

            return {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              right: box.right,
              bottom: box.bottom,
            }
          }
          const inside = (inner, outer) =>
            inner.width > 0 &&
            inner.height > 0 &&
            inner.x >= outer.x - 1 &&
            inner.y >= outer.y - 1 &&
            inner.right <= outer.right + 1 &&
            inner.bottom <= outer.bottom + 1
          const painted = (node) => {
            let current = node

            while (current instanceof Element) {
              const style = getComputedStyle(current)

              if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                Number(style.opacity) < 0.99
              ) {
                return false
              }

              current = current.parentElement ?? current.getRootNode().host
            }

            return node.isConnected
          }
          const stage = cards[0]?.closest(".tzv4-stage")
          const grid = cards[0]?.closest(".photo-options")

          if (!stage || !grid) {
            return {
              passed: false,
              count: cards.length,
              reason: "Missing photo grid",
            }
          }

          const stageBounds = rect(stage)
          const gridBounds = rect(grid)
          const viewport = {
            x: 0,
            y: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
          }
          const image = stage.querySelector(".photo-question-img")
          const imageVisible = Boolean(
            image?.complete &&
            image.naturalWidth > 0 &&
            painted(image) &&
            inside(rect(image), stageBounds) &&
            inside(rect(image), viewport),
          )
          const choices = cards.map((card, index) => {
            const cardBounds = rect(card)
            const label = receivedExpectedLabels[index]
            const renderedLabel = card.querySelector(".photo-option-label")
            const labelBounds = []
            const walker = document.createTreeWalker(
              renderedLabel ?? card,
              NodeFilter.SHOW_TEXT,
            )
            let node = walker.nextNode()

            while (node) {
              if (node.textContent.trim()) {
                const range = document.createRange()
                range.selectNodeContents(node)
                for (const box of range.getClientRects()) {
                  labelBounds.push({
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                    right: box.right,
                    bottom: box.bottom,
                  })
                }
              }

              node = walker.nextNode()
            }

            const passed = Boolean(
              painted(card) &&
              label &&
              renderedLabel?.textContent.includes(label) &&
              painted(renderedLabel) &&
              card.getAttribute("data-v4-choice") === String(index) &&
              inside(cardBounds, stageBounds) &&
              inside(cardBounds, gridBounds) &&
              inside(cardBounds, viewport) &&
              labelBounds.length > 0 &&
              labelBounds.every(
                (box) =>
                  inside(box, cardBounds) &&
                  inside(box, stageBounds) &&
                  inside(box, viewport),
              ),
            )

            return { index, label, cardBounds, labelBounds, passed }
          })

          return {
            passed:
              imageVisible &&
              choices.length === receivedExpectedLabels.length &&
              choices.every((choice) => choice.passed),
            at: performance.now(),
            stageBounds,
            gridBounds,
            viewport,
            imageVisible,
            choices,
          }
        }, labels)
    const verifyPhotoAnswers = async (labels, replay, phase) => {
      let observed = undefined

      try {
        // The sequence observer still checks the first answers/timer paint.
        // Here every settled card and its actual text lines must fit; a DOM
        // count or visibility of only the first option cannot satisfy this.
        await expect
          .poll(
            async () => {
              observed = await inspectPhotoAnswers(labels)

              return observed.passed
            },
            { timeout: 3000 },
          )
          .toBe(true)
        await expect(preview).toHaveAttribute("data-preview-phase", phase)

        return observed
      } finally {
        writeFileSync(
          join(
            evidence,
            `private-photo-${labels.length}-${replay}-${phase}-bounds.json`,
          ),
          `${JSON.stringify(
            { phase, expectedLabels: labels, observed },
            null,
            2,
          )}\n`,
        )
      }
    }
    const rounds = []
    for (const [questionIndex, photoCase] of photoCases.entries()) {
      await page.getByTestId(`editor-question-card-${questionIndex}`).click()
      await expect(
        preview.getByTestId("tadazz-question-image-scene"),
      ).toBeVisible({ timeout: 30_000 })
      await expect(preview.locator(".photo-question-head")).toHaveText(
        photoCase.question,
      )
      await expect
        .poll(() =>
          preview
            .locator(".photo-question-img")
            .evaluate((image) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true)
      await watchQuestionSequence(preview, {
        phaseAttribute: "data-preview-phase",
        votingPhase: "answers",
        startAction: '[data-testid="question-preview-replay"]',
        allowInitialReplayRemount: true,
      })
      for (let replay = 0; replay < 2; replay += 1) {
        await preview.getByTestId("question-preview-replay").click()
        await expect(preview).toHaveAttribute("data-preview-phase", "answers", {
          timeout: 10_000,
        })
        await expect(preview.locator("[data-v4-choice]")).toHaveCount(
          photoCase.answers.length,
        )
        await expect(
          preview.getByTestId("tadazz-question-image-scene"),
        ).toBeVisible()
        const answers = await verifyPhotoAnswers(
          photoCase.answers,
          replay,
          "answers",
        )
        await expect(preview).toHaveAttribute("data-preview-phase", "results", {
          timeout: 10_000,
        })
        const resultsBounds = await verifyPhotoAnswers(
          photoCase.answers,
          replay,
          "results",
        )
        rounds.push({
          ...(await readQuestionSequence(preview, replay, { photo: true })),
          answerCount: photoCase.answers.length,
          answerVisibility: { answers, results: resultsBounds },
        })
      }
      await stopQuestionSequence(preview)
      writeFileSync(
        join(evidence, "private-question-image-sequence.json"),
        `${JSON.stringify({ quizId: ownedQuizId, rounds }, null, 2)}\n`,
      )
      await page.screenshot({ path: join(evidence, photoCase.screenshot) })
    }
    results.push({
      name: "private-photo-question-two-second-lead-in-retained-node-and-replay",
      passed: true,
      rounds: rounds.length,
      textAnswerCounts: photoCases.map(({ answers }) => answers.length),
      questionImage: true,
      allAnswerCardsAndLabelsWithinBounds: true,
    })
    assert.deepEqual(errors, [], "No Studio viewer JavaScript errors")
    assert.deepEqual(failedAssets, [], "No Studio viewer asset failures")

    return { passed: true, results }
  } catch (error) {
    writeFileSync(
      join(evidence, "failure.json"),
      `${JSON.stringify(
        { results, errors, failedAssets, error: String(error?.stack ?? error) },
        null,
        2,
      )}\n`,
    )
    await page
      .screenshot({ path: join(evidence, "failure.png"), fullPage: true })
      .catch(() => {
        /* Keep the recorded audit outcome if its diagnostic screenshot is unavailable. */
      })
    throw error
  } finally {
    await page.close()

    if (ownedQuizId) {
      const removed = await context.request.delete(
        `${origin}/api/extensions/quizzes/${encodeURIComponent(ownedQuizId)}`,
        { headers },
      )
      assert.equal(
        removed.status(),
        204,
        "Remove only this helper's newly created private fixture",
      )
    }
  }
}
