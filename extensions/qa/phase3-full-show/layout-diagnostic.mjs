import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { prepareHostNavigation } from "./workspace-controls.mjs"

// Development-only diagnosis of the exact existing artifact. No release gate
// accepts the reduced membership of this mode.
export async function runLayoutDiagnostic({
  scenario,
  page,
  base,
  evidence,
  theme,
  engine,
}) {
  const call = async (name, args) => {
    const response = await scenario.client.callTool({
      name,
      arguments: { contractVersion: "0.1.0", ...args },
    })
    assert.equal(
      response.structuredContent.ok,
      true,
      JSON.stringify(response.structuredContent),
    )

    return response.structuredContent.data
  }
  const record = await call("get_game_draft", {
    draftId: scenario.record.draftId,
  })
  let { revision } = record
  const { publicQuestionId } = record.questionRefs.find(
    (question) => question.questionNumber === 3,
  )
  const assets = (purpose) =>
    call("list_editing_assets", {
      draftId: record.draftId,
      expectedRevision: revision,
      purpose,
      locale: "en",
    })
  const patch = async (value) => {
    const { revision: nextRevision } = await call("apply_game_edit", {
      draftId: record.draftId,
      expectedRevision: revision,
      idempotencyKey: randomUUID(),
      patch: value,
    })
    revision = nextRevision
  }
  const backgrounds = await assets("background")
  await patch({
    kind: "set-background",
    asset: backgrounds.assets.find((item) =>
      item.publicUrl.endsWith("/v4/question-bg.webp"),
    ).ref,
  })
  const pictures = await assets("answer-image")
  await patch({
    kind: "set-answer-pictures",
    publicQuestionId,
    pictures: pictures.assets.slice(0, 5).map((item, index) => ({
      answerNumber: index + 1,
      asset: item.ref,
      alt: item.alt,
      display: "both",
    })),
  })
  scenario.selection.chapterId = scenario.chapters.find(
    (chapter) =>
      chapter.questionOrdinal === 3 && chapter.kind === "answerCards",
  ).id
  await prepareHostNavigation(page, "layout diagnostic")
  await page.goto(`${base}/host?scenario=${scenario.id}`)
  await page.locator("html[data-host-ready=true]").waitFor()
  const iframe = page.frameLocator("iframe")
  await iframe.locator('[data-testid="photo-card-choice-4"]').waitFor()
  await iframe.getByTestId("full-show-native-surface").evaluate((host) => {
    const shadow = host.shadowRoot
    window.__fitTrace = []
    window.__fitSnapshot = () => {
      const viewport = shadow.querySelector(
        '[data-testid="native-stage-viewport"]',
      )

      if (!viewport) {
        return { missing: true }
      }

      const canvas = viewport.firstElementChild
      const native = canvas.querySelector(
        '[data-testid="native-razzia-preview-v2"]',
      )
      const rect = (node) => {
        const r = node.getBoundingClientRect()

        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          cw: node.clientWidth,
          ch: node.clientHeight,
          sw: node.scrollWidth,
          sh: node.scrollHeight,
          css: node.getAttribute("style"),
          computed: Object.fromEntries(
            [
              "width",
              "height",
              "max-width",
              "max-height",
              "min-width",
              "min-height",
              "transform",
              "position",
            ].map((key) => [key, getComputedStyle(node).getPropertyValue(key)]),
          ),
        }
      }

      return {
        factor: viewport.dataset.fitFactor,
        ready: viewport.dataset.fitReady,
        viewport: rect(viewport),
        canvas: rect(canvas),
        native: native ? rect(native) : null,
        cards: [
          ...canvas.querySelectorAll('[data-testid^="photo-card-choice-"]'),
        ].map(rect),
      }
    }
    const observer = new MutationObserver(() => {
      const snapshot = window.__fitSnapshot()

      if (
        JSON.stringify(snapshot) !== JSON.stringify(window.__fitTrace.at(-1))
      ) {
        window.__fitTrace.push(snapshot)
      }

      if (window.__fitTrace.length > 24) {
        window.__fitTrace.shift()
      }
    })
    observer.observe(shadow, {
      attributes: true,
      attributeFilter: ["data-fit-factor", "data-fit-ready"],
      subtree: true,
      childList: true,
    })
    window.__fitTrace.push(window.__fitSnapshot())
  })
  await page.setViewportSize({ width: 390, height: 1200 })
  await page.waitForTimeout(1500)
  const child = page.frames().find((frame) => frame.url().endsWith("/widget"))
  assert(child)
  const diagnostic = await child.evaluate(() => ({
    current: window.__fitSnapshot(),
    trace: window.__fitTrace,
    text: document.body.innerText.slice(-900),
  }))
  fs.writeFileSync(
    path.join(evidence, "layout-diagnostic.json"),
    JSON.stringify(diagnostic, null, 2),
  )
  await page.screenshot({
    path: path.join(evidence, `${engine}-${theme}-layout-diagnostic.png`),
    fullPage: true,
  })
  assert.equal(diagnostic.current.ready, "true", JSON.stringify(diagnostic))

  return { engine, theme, check: "development viewport diagnostic", diagnostic }
}
