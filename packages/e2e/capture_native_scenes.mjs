import { chromium } from "@playwright/test"
import { join } from "node:path"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"

const HARNESS_PATH = join(
  import.meta.dirname,
  "../../docs/extensions/qa-evidence/tadazz-next-source-parity-20261106/native_scenes_harness.html",
)
const OUTPUT_DIR = join(
  import.meta.dirname,
  "../../docs/extensions/qa-evidence/tadazz-next-source-parity-20261106",
)

const SCENES = [
  "01_company_opening",
  "02_grand_opening",
  "03_representative_directory",
  "04_phone_instructions",
  "05_connection_readiness",
  "06_round_one",
  "07_picture_answers_cards",
  "08_voting_open",
  "09_chosen_highlight",
  "10_survey_results_tracks",
  "11_story_progress",
  "12_tie_break",
  "13_story_assembly",
  "14_story_live",
  "15_round_two",
  "16_grand_finale_curtains",
]

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  console.log("Launching Chromium at 1920x1080 for native React show capture...")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

  const publicRoot = path.resolve(import.meta.dirname, '../web/public')
  const server = http.createServer((req, res) => {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const file = route === '/' ? HARNESS_PATH : path.resolve(publicRoot, '.' + route)
    if ((file !== HARNESS_PATH && !file.startsWith(publicRoot + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return}
    res.setHeader('Content-Type', ({'.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[path.extname(file)] || 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve=>server.listen(0, '127.0.0.1', resolve))
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' })

  const metrics = {}

  for (const scene of SCENES) {
    console.log(`Activating scene: ${scene}...`)
    await page.evaluate((k) => window.showScene(k), scene)
    await page.waitForTimeout(3000)
    const broken = await page.locator(`#scene-${scene} img`).evaluateAll(imgs=>imgs.filter(img=>!img.complete || img.naturalWidth===0).map(img=>img.src))
    if(broken.length) throw new Error(`Broken scene images: ${broken.join(', ')}`)

    const shotPath = join(OUTPUT_DIR, `native_${scene}.png`)
    await page.screenshot({ path: shotPath })
    console.log(`Captured native_${scene}.png`)

    if (scene === "07_picture_answers_cards" || scene === "10_survey_results_tracks" || scene === "09_chosen_highlight") {
      const cardData = await page.evaluate((k) => {
        const container = document.getElementById("scene-" + k)
        if (!container) return []
        const cards = Array.from(container.querySelectorAll(".answer-card"))
        return cards.map((c, i) => {
          const cardRect = c.getBoundingClientRect()
          const photo = c.querySelector(".tz-photo-frame") || c.querySelector(".answer-image")
          const photoRect = photo ? photo.getBoundingClientRect() : null
          const title = c.querySelector(".answer-title")
          const titleRect = title ? title.getBoundingClientRect() : null
          const cornerBadge = c.querySelector(".corner.answer-card-badge")
          const bottomBadge = c.querySelector(".answer-index")
          const track = c.querySelector(".result-track")
          const pct = c.querySelector(".result-percentage")
          return {
            index: i,
            cardRect: { top: cardRect.top, bottom: cardRect.bottom, width: cardRect.width, height: cardRect.height },
            photoRect: photoRect ? { top: photoRect.top, bottom: photoRect.bottom, width: photoRect.width, height: photoRect.height } : null,
            titleRect: titleRect ? { top: titleRect.top, bottom: titleRect.bottom, width: titleRect.width, height: titleRect.height } : null,
            captionBelowPhoto: photoRect && titleRect ? titleRect.top >= (photoRect.bottom - 2) : false,
            cornerBadgeText: cornerBadge ? cornerBadge.textContent.trim() : null,
            bottomBadgeText: bottomBadge ? bottomBadge.textContent.trim() : null,
            pctText: pct ? pct.textContent.trim() : null,
            trackVisible: Boolean(track && getComputedStyle(track).opacity !== '0' && track.getBoundingClientRect().height > 0),
          }
        })
      }, scene)
      metrics[scene] = cardData
    }
  }

  // Save metrics
  fs.writeFileSync(
    join(OUTPUT_DIR, "NATIVE_CARD_METRICS.json"),
    JSON.stringify(metrics, null, 2),
  )
  console.log("Wrote NATIVE_CARD_METRICS.json")

  await browser.close()
  server.close()
  console.log("Native capture complete!")
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
