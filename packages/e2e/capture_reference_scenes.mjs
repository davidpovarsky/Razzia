import { chromium } from "@playwright/test"
import { join } from "node:path"
import fs from "node:fs"

const REF_HTML = join(
  import.meta.dirname,
  "../../docs/extensions/references/user-20261106/source/second library.html",
)
const OUTPUT_DIR = join(
  import.meta.dirname,
  "../../docs/extensions/qa-evidence/tadazz-next-source-parity-20261106",
)

const SCENES_TO_CAPTURE = [
  { id: "company-opening", name: "01_company_opening", waitMs: 1200 },
  { id: "grand-opening", name: "02_grand_opening", waitMs: 1200 },
  {
    id: "representative-directory",
    name: "03_representative_directory",
    waitMs: 1000,
  },
  { id: "phone-instructions", name: "04_phone_instructions", waitMs: 1000 },
  { id: "connection-readiness", name: "05_connection_readiness", waitMs: 1000 },
  { id: "round-one", name: "06_round_one", waitMs: 1000 },
  { id: "picture-answers", name: "07_picture_answers_cards", waitMs: 1000 },
  { id: "voting-open", name: "08_voting_open", waitMs: 1000 },
  { id: "countdown", name: "09_countdown", waitMs: 1000 },
  {
    id: "chosen",
    name: "10_chosen_highlight",
    waitMs: 1200,
    data: { selectedIndex: 3, percentages: [25, 0, 0, 75, 0] },
  },
  {
    id: "survey-results",
    name: "11_survey_results_tracks",
    waitMs: 1500,
    data: { counts: [5, 0, 0, 15, 0], percentages: [25, 0, 0, 75, 0] },
  },
  { id: "story-progress", name: "12_story_progress", waitMs: 1200 },
  { id: "tie-break", name: "13_tie_break", waitMs: 1200 },
  { id: "story-assembly", name: "14_story_assembly", waitMs: 1500 },
  { id: "story-live", name: "15_story_live", waitMs: 1200 },
  { id: "round-two", name: "16_round_two", waitMs: 1000 },
  { id: "grand-finale", name: "17_grand_finale_curtains", waitMs: 2500 },
  { id: "z-wipe", name: "18_z_wipe", waitMs: 600 },
]

async function capture() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  console.log("Launching Chromium at 1920x1080...")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  })

  const fileUrl = `file:///${REF_HTML.replace(/\\/gu, "/")}`
  console.log(`Loading primary authority: ${fileUrl}`)
  await page.goto(fileUrl, { waitUntil: "networkidle" })

  // Install scene bridge for full show methods in second library.html
  await page.evaluate(() => {
    const kit = window.TadazzShowPreview?.kit

    if (!kit) {
      return
    }

    const origPlay = kit.play.bind(kit)
    kit.play = function play(sceneName, data = {}) {
      const merged = { ...this._defaultData, ...data }
      this.currentScene = sceneName
      this.currentData = merged
      const isShowBg =
        sceneName === "company-opening" ||
        sceneName === "grand-opening" ||
        sceneName === "grand-finale" ||
        sceneName === "round-one" ||
        sceneName === "round-two" ||
        sceneName === "story-assembly" ||
        sceneName === "story-live" ||
        sceneName === "story-progress"
      this.stage.classList.toggle("stage-show", isShowBg)

      if (isShowBg && this._bg) {
        this._bg.style.backgroundImage = 'url("assets/show-stage.webp")'
      }

      switch (sceneName) {
        case "grand-opening":
          this._cancel()
          this._playGrandOpening(merged)

          return this._animAll()

        case "phone-instructions":
          this._cancel()
          this._playPhone(merged)

          return this._animAll()

        case "connection-readiness":
          this._cancel()
          this._playReadiness(merged)

          return this._animAll()

        case "round-one":
          this._cancel()
          this._playRoundLaunch(merged, false)

          return this._animAll()

        case "round-two":
          this._cancel()
          this._playRoundLaunch(merged, true)

          return this._animAll()

        case "story-progress":
          this._cancel()
          this._playStoryProgress(merged)

          return this._animAll()

        case "story-live":
          this._cancel()
          this._playStoryLive(merged)

          return this._animAll()

        default:
          return origPlay(sceneName, merged)
      }
    }
  })

  // Capture initial loaded state
  await page.screenshot({ path: join(OUTPUT_DIR, "ref_00_initial_loaded.png") })
  console.log("Captured ref_00_initial_loaded.png")

  for (const scene of SCENES_TO_CAPTURE) {
    console.log(`Triggering scene: ${scene.id}...`)
    await page.evaluate(
      ({ id, data }) => {
        const preview = window.TadazzShowPreview

        if (preview?.showScene) {
          preview.showScene(id, data || {})
        } else if (preview?.kit?.play) {
          preview.kit.play(id, data || {})
        }
      },
      { id: scene.id, data: scene.data },
    )
    await page.waitForTimeout(scene.waitMs)
    const outPath = join(OUTPUT_DIR, `ref_${scene.name}.png`)
    await page.screenshot({ path: outPath })
    console.log(`Captured ref_${scene.name}.png`)
  }

  // Also capture zoomed / detailed crop of answer cards for captions, badges & result tracks
  const cardMetrics = await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll(".answer-card, .tz-card"),
    )

    return cards.map((c, idx) => {
      const rect = c.getBoundingClientRect()
      const title = c.querySelector(".answer-title, .tz-answer-title")
      const titleRect = title ? title.getBoundingClientRect() : null
      const photo = c.querySelector(
        ".tz-photo-frame, .full-story-image-box, img",
      )
      const photoRect = photo ? photo.getBoundingClientRect() : null
      const badge = c.querySelector(
        ".corner, .answer-card-badge, .answer-index",
      )
      const track = c.querySelector(".result-track, .tz-result-track")
      const pct = c.querySelector(".result-percentage, .tz-result-number")

      return {
        idx,
        cardRect: {
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        photoRect: photoRect
          ? { top: photoRect.top, bottom: photoRect.bottom }
          : null,
        titleRect: titleRect
          ? { top: titleRect.top, bottom: titleRect.bottom }
          : null,
        badgeText: badge?.textContent?.trim() || null,
        trackVisible: Boolean(track),
        pctText: pct?.textContent?.trim() || null,
      }
    })
  })

  fs.writeFileSync(
    join(OUTPUT_DIR, "ref_card_metrics.json"),
    JSON.stringify(cardMetrics, null, 2),
  )
  console.log("Wrote ref_card_metrics.json")

  await browser.close()
  console.log("Reference capture complete!")
}

capture().catch((err) => {
  console.error("Capture error:", err)
  process.exit(1)
})
