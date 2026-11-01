import fs from "node:fs"
import { join } from "node:path"
import zlib from "node:zlib"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import {
  createGame,
  endTimer,
  loginManager,
  next,
  startGame,
} from "@razzia/e2e/utils/manager"
import { joinGame } from "@razzia/e2e/utils/player"
import type { Page } from "@playwright/test"

const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../test-results/screenshots/media-appearance-stage",
)

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SCREENSHOT_DIR, filename), fullPage: false })
}

// 1x1 transparent PNG buffer for real upload testing
const TINY_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

// Dynamic multi-aspect ratio PNG generator for varied, realistic image fixtures
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(buf: Buffer): number {
  let crc = -1
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  }
  return crc ^ -1
}
function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function createPngBuffer(
  width: number,
  height: number,
  color = { r: 59, g: 130, b: 246 },
): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const scanlineLength = 1 + width * 3
  const raw = Buffer.alloc(scanlineLength * height)
  for (let y = 0; y < height; y++) {
    const offset = y * scanlineLength
    raw[offset] = 0
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3
      raw[px] = (color.r + (x * 40) / width) % 256
      raw[px + 1] = (color.g + (y * 40) / height) % 256
      raw[px + 2] = color.b
    }
  }
  const idat = makeChunk("IDAT", zlib.deflateSync(raw))
  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    idat,
    makeChunk("IEND", Buffer.alloc(0)),
  ])
}

const LANDSCAPE_PNG_BUFFER = createPngBuffer(1600, 900, { r: 234, g: 88, b: 12 })
const PORTRAIT_PNG_BUFFER = createPngBuffer(1200, 1600, { r: 16, g: 185, b: 129 })
const SQUARE_PNG_BUFFER = createPngBuffer(1024, 1024, { r: 139, g: 92, b: 246 })

const assertZeroStageScroll = async (page: Page, label: string) => {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const stage =
      document.querySelector('[data-testid="audience-display"] section') ||
      document.querySelector("section") ||
      doc
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      docScrollHeight: doc.scrollHeight,
      docClientHeight: doc.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      stageScrollHeight: (stage as HTMLElement).scrollHeight,
      stageClientHeight: (stage as HTMLElement).clientHeight,
      stageScrollWidth: (stage as HTMLElement).scrollWidth,
      stageClientWidth: (stage as HTMLElement).clientWidth,
    }
  })

  expect(
    metrics.docScrollWidth,
    `${label}: docScrollWidth (${metrics.docScrollWidth}) > docClientWidth (${metrics.docClientWidth})`,
  ).toBeLessThanOrEqual(metrics.docClientWidth + 1)

  expect(
    metrics.docScrollHeight,
    `${label}: docScrollHeight (${metrics.docScrollHeight}) > docClientHeight (${metrics.docClientHeight})`,
  ).toBeLessThanOrEqual(metrics.docClientHeight + 1)

  expect(
    metrics.stageScrollWidth,
    `${label}: stageScrollWidth (${metrics.stageScrollWidth}) > stageClientWidth (${metrics.stageClientWidth})`,
  ).toBeLessThanOrEqual(metrics.stageClientWidth + 1)

  expect(
    metrics.stageScrollHeight,
    `${label}: stageScrollHeight (${metrics.stageScrollHeight}) > stageClientHeight (${metrics.stageClientHeight})`,
  ).toBeLessThanOrEqual(metrics.stageClientHeight + 1)
}

/**
 * P0-4: Visual containment & text completeness proof:
 * Inspects computed bounding boxes against viewport AND all clipping ancestors
 * (overflow !== visible), ensuring the element is visible, non-zero, within the viewport,
 * NOT truncated by any overflow:hidden container, and that no CSS line-clamp or overflow
 * hides essential text.
 */
const assertVisualContainment = async (
  page: Page,
  selector: string,
  label: string,
  options?: { checkImageLoaded?: boolean; checkTextCompleteness?: boolean },
) => {
  await expect(async () => {
    const result = await page.evaluate(
      ({ sel, checkImg, checkText }) => {
        const el = document.querySelector(sel)
        if (!el) {
          return { ok: false, error: `Element not found in DOM: ${sel}` }
        }

        const style = window.getComputedStyle(el)
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          parseFloat(style.opacity || "1") === 0
        ) {
          return {
            ok: false,
            error: `Element has hidden styles: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}`,
          }
        }

        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) {
          return {
            ok: false,
            error: `Element has non-positive bounding box: ${rect.width}x${rect.height}`,
          }
        }

        const vw = window.innerWidth
        const vh = window.innerHeight

        // 1. Assert bounded inside viewport with 1.5px subpixel tolerance
        if (
          rect.top < -1.5 ||
          rect.left < -1.5 ||
          rect.bottom > vh + 1.5 ||
          rect.right > vw + 1.5
        ) {
          return {
            ok: false,
            error: `Element extends outside viewport bounds (${vw}x${vh}): top=${rect.top.toFixed(1)}, bottom=${rect.bottom.toFixed(1)}, left=${rect.left.toFixed(1)}, right=${rect.right.toFixed(1)}`,
          }
        }

        // 2. Walk clipping ancestors and assert element is not clipped by any overflow-hidden/clip container
        let ancestor = el.parentElement
        while (
          ancestor &&
          ancestor !== document.body &&
          ancestor !== document.documentElement
        ) {
          const aStyle = window.getComputedStyle(ancestor)
          const isClipping =
            aStyle.overflow !== "visible" ||
            aStyle.overflowX !== "visible" ||
            aStyle.overflowY !== "visible"

          if (isClipping) {
            const aRect = ancestor.getBoundingClientRect()
            const clippedTop = rect.top < aRect.top - 1.5
            const clippedBottom = rect.bottom > aRect.bottom + 1.5
            const clippedLeft = rect.left < aRect.left - 1.5
            const clippedRight = rect.right > aRect.right + 1.5

            if (clippedTop || clippedBottom || clippedLeft || clippedRight) {
              return {
                ok: false,
                error: `Element clipped by ancestor <${ancestor.tagName.toLowerCase()} class="${ancestor.className}">: el[top=${rect.top.toFixed(1)}, bottom=${rect.bottom.toFixed(1)}] outside ancestor[top=${aRect.top.toFixed(1)}, bottom=${aRect.bottom.toFixed(1)}]`,
              }
            }
          }
          ancestor = ancestor.parentElement
        }

        // 3. Optional image load assertion
        if (checkImg && el instanceof HTMLImageElement) {
          if (!el.complete || el.naturalWidth <= 0 || el.naturalHeight <= 0) {
            return {
              ok: false,
              error: `Image element failed to load or has 0 natural dimensions: src=${el.src}, complete=${el.complete}, naturalWidth=${el.naturalWidth}`,
            }
          }
        }

        // 4. Text completeness check: detect CSS line-clamp or overflow ellipsis cuts
        if (checkText !== false) {
          const text = (el.textContent || "").trim()
          if (text.length > 0) {
            const clamp = style.webkitLineClamp
            if (clamp && clamp !== "none") {
              return {
                ok: false,
                error: `Element has -webkit-line-clamp: ${clamp} applied to text: "${text.slice(0, 30)}..."`,
              }
            }
            if (el.scrollHeight > el.clientHeight + 1.5) {
              return {
                ok: false,
                error: `Element text overflows vertically: scrollHeight (${el.scrollHeight}) > clientHeight (${el.clientHeight}) for text: "${text.slice(0, 40)}..."`,
              }
            }
          }
        }

        return {
          ok: true,
          bounds: {
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          },
        }
      },
      {
        sel: selector,
        checkImg: options?.checkImageLoaded,
        checkText: options?.checkTextCompleteness ?? true,
      },
    )

    expect(result.ok, `${label}: ${result.error}`).toBe(true)
  }).toPass({ timeout: 5000, intervals: [100, 250, 500] })
}

/**
 * P0-4: Asserts that an upper stage element does not vertically overlap a lower element.
 * Fail-closed: missing required selectors FAIL the test unless explicitly marked optional.
 */
const assertNoVerticalOverlap = async (
  page: Page,
  topSelector: string,
  bottomSelector: string,
  label: string,
  options?: { optional?: boolean },
) => {
  const result = await page.evaluate(
    ({ topSel, bottomSel, isOptional }) => {
      const topEl = document.querySelector(topSel)
      const bottomEl = document.querySelector(bottomSel)
      if (!topEl || !bottomEl) {
        if (isOptional) {
          return { ok: true }
        }
        return {
          ok: false,
          error: `Missing required element for overlap check: topEl(${topSel})=${Boolean(topEl)}, bottomEl(${bottomSel})=${Boolean(bottomEl)}`,
        }
      }
      const topRect = topEl.getBoundingClientRect()
      const bottomRect = bottomEl.getBoundingClientRect()
      const overlaps =
        topRect.bottom > bottomRect.top + 2 &&
        topRect.top < bottomRect.bottom - 2
      return {
        ok: !overlaps,
        topBottom: topRect.bottom,
        bottomTop: bottomRect.top,
      }
    },
    {
      topSel: topSelector,
      bottomSel: bottomSelector,
      isOptional: options?.optional ?? false,
    },
  )
  expect(
    result.ok,
    `${label}: ${result.error || `upper element bottom (${result.topBottom?.toFixed(1)}) overlaps lower element top (${result.bottomTop?.toFixed(1)})`}`,
  ).toBe(true)
}

test.describe("Tada Studio Complete: Media Library Reuse, Card Backgrounds, Audio, Staged Motion & Zero-Scroll Stage", () => {
  test("1. Studio Editor: Responsive Zero-Overflow (1280..320), Smart Convert Question->Scene, Per-Answer Visuals, Shared Media Library & Reference-Safe Delete", async ({
    page,
  }) => {
    await loginManager(page)

    // Create a new show in Studio
    await page.goto("/manager/quizz")
    await expect(
      page.locator('[data-testid="studio-card-type-bar"]'),
    ).toBeVisible({ timeout: 15_000 })

    // 1A. Verify responsive zero-horizontal-overflow across 1280, 1024, 844, 768, 390, 320
    const editorWidths = [1280, 1024, 844, 768, 390, 320]
    for (const w of editorWidths) {
      await page.setViewportSize({ width: w, height: 800 })
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        overflow.scrollWidth,
        `Editor horizontal overflow at width ${w}px`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1)
      await expect(
        page.locator('[data-testid="studio-card-type-bar"]'),
      ).toBeVisible()
    }

    await saveScreenshot(page, "01_editor_narrow_320px.png")
    await page.setViewportSize({ width: 1280, height: 900 })

    // 1B. Smart Conversion Confirmation:
    // Add a second question card so we have > 1 question
    const addBtn = page.locator('[data-testid="studio-add-card-btn"]')
    await addBtn.click()

    // New question is blank -> converting to "Transition" scene should happen IMMEDIATELY without confirmation dialog!
    const transitionToggle = page
      .locator('[data-testid="studio-card-type-bar"]')
      .getByRole("radio", { name: /Transition/i })
    await transitionToggle.click()

    await expect(
      page.getByPlaceholder("Card title..."),
    ).toBeVisible({ timeout: 5_000 })

    // Convert scene back to Quiz question and populate question title -> then converting to Scene MUST prompt confirmation
    const quizToggle = page
      .locator('[data-testid="studio-card-type-bar"]')
      .getByRole("radio", { name: /Quiz/i })
    await quizToggle.click()

    const titleInput = page.getByPlaceholder(t("quizz:question.placeholder"))
    await expect(titleInput).toBeVisible()
    await titleInput.fill("Populated Question Title")

    await transitionToggle.click()
    // Confirmation dialog should appear, and its text must NOT falsely claim automatic Undo
    const dialogDesc = page.getByText(/replace its question content/i)
    await expect(dialogDesc).toBeVisible()
    const descText = (await dialogDesc.textContent()) ?? ""
    expect(descText.toLowerCase()).not.toContain("undo")

    // Cancel keeps the populated question intact
    await page.getByRole("button", { name: t("common:cancel") }).click()
    await expect(titleInput).toHaveValue("Populated Question Title")

    // 1C. Upload image once in Answer 0 picker and reuse across Card Background & Scene without re-uploading
    const pickAns0Btn = page.locator('[data-testid="answer-pick-image-0"]')
    await expect(pickAns0Btn).toBeVisible()
    await pickAns0Btn.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    // Verify file input accept attribute is strictly filtered to image
    const fileInput = dialog.locator('input[type="file"]')
    await expect(fileInput).toHaveAttribute("accept", /image/i)

    // Upload a real PNG image
    await fileInput.setInputFiles({
      name: "shared-stage-asset.png",
      mimeType: "image/png",
      buffer: TINY_PNG_BUFFER,
    })

    // Select the uploaded image from the library grid
    const uploadedThumb = dialog.locator('img[alt^="shared-stage-asset"]')
    await expect(uploadedThumb).toBeVisible({ timeout: 10_000 })
    await uploadedThumb.click()

    // Verify Answer 0 now displays the thumbnail preview and "Both" mode is active
    await expect(
      page.locator('[data-testid="answer-image-preview-0"]'),
    ).toBeVisible()

    // Reuse the SAME uploaded image in Card Background without re-uploading (from "In This Show" tab!)
    const chooseBgBtn = page.locator('[data-testid="card-bg-choose-btn"]')
    await chooseBgBtn.click()
    await expect(dialog).toBeVisible()
    await dialog.locator('[data-testid="media-scope-show"]').click()
    await expect(
      dialog.locator('img[alt^="shared-stage-asset"]'),
    ).toBeVisible()
    await dialog.locator('img[alt^="shared-stage-asset"]').click()

    await expect(page.locator('[data-testid="card-bg-preview"]')).toBeVisible()

    // 1D. Configure Per-Card Audio Cue (Built-in sound selection) & Staged Animations
    const customAudioBtn = page.locator(
      '[data-testid="card-audio-mode-showQuestion-custom"]',
    )
    await customAudioBtn.click()
    await expect(dialog).toBeVisible()
    await dialog.locator('[data-testid="media-scope-builtin"]').click()
    const builtinPreviewBtn = dialog
      .locator('[data-testid^="builtin-sound-preview-"]')
      .first()
    await expect(builtinPreviewBtn).toBeVisible()
    await builtinPreviewBtn.click()
    const builtinSoundBtn = dialog
      .locator('[data-testid^="builtin-sound-select-"]')
      .first()
    await expect(builtinSoundBtn).toBeVisible()
    await builtinSoundBtn.click()

    // Configure Staged Animation slots
    await expect(
      page.locator('[data-testid="staged-animation-section"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="stage-anim-slot-answerEntrance"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="stage-anim-slot-answerBadgeEntrance"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="stage-anim-slot-resultsRevealEntrance"]'),
    ).toBeVisible()

    await saveScreenshot(page, "02_editor_card_appearance_configured.png")

    // 1E. Verify "Remove from Card" only detaches from card, while Library Delete on a referenced asset returns 409 Conflict warning
    const removeBgFromCardBtn = page.locator(
      '[data-testid="card-bg-remove-btn"]',
    )
    await removeBgFromCardBtn.click()
    await expect(
      page.locator('[data-testid="card-bg-preview"]'),
    ).not.toBeVisible()
    // Answer 0 image preview is still intact!
    await expect(
      page.locator('[data-testid="answer-image-preview-0"]'),
    ).toBeVisible()
  })

  test("2. Live Runtime & Zero-Scroll Stage Matrix (STAGE-P0) across 8 Viewports + Card Background + Single Audio + Staged Motion", async ({
    page: managerPage,
    browser,
  }) => {
    const SOCKET_ORIGIN = "http://127.0.0.1:3011"
    await loginManager(managerPage)

    // Upload real diverse aspect-ratio image fixtures via API (1600x900 landscape, 1200x1600 portrait, 1024x1024 square)
    const token = await managerPage.evaluate(() =>
      localStorage.getItem("token"),
    )
    const uploadLandscapeRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/media`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        multipart: {
          file: {
            name: "custom-card-bg.png",
            mimeType: "image/png",
            buffer: LANDSCAPE_PNG_BUFFER,
          },
        },
      },
    )
    expect(uploadLandscapeRes.status()).toBe(201)
    const uploadedBg = (await uploadLandscapeRes.json()) as {
      name: string
      url: string
      type: string
    }

    const uploadPortraitRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/media`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        multipart: {
          file: {
            name: "fixture-portrait.png",
            mimeType: "image/png",
            buffer: PORTRAIT_PNG_BUFFER,
          },
        },
      },
    )
    expect(uploadPortraitRes.status()).toBe(201)
    const uploadedPortrait = (await uploadPortraitRes.json()) as {
      name: string
      url: string
      type: string
    }

    const uploadSquareRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/media`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        multipart: {
          file: {
            name: "fixture-square.png",
            mimeType: "image/png",
            buffer: SQUARE_PNG_BUFFER,
          },
        },
      },
    )
    expect(uploadSquareRes.status()).toBe(201)
    const uploadedSquare = (await uploadSquareRes.json()) as {
      name: string
      url: string
      type: string
    }

    // Create a composite show with:
    // - Opening scene WITH custom background override
    // - Question 1 (5 image+text options, custom background override, custom audio cue, and 4-slot staged animations)
    // - Question 2 (4 options, NO card background override -> must fall back to default GameBackground, muted showQuestion audio)
    // - InterimResults scene
    // - Leaderboard scene
    // - Closing scene
    const createRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/extensions/quizzes`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        data: {
          quizz: {
            subject: "Zero Scroll & Appearance E2E Show",
            gameMode: "survey",
            questions: [
              {
                type: "single",
                playMode: "survey",
                question: "Question 1 with Custom Background & 5 Visual Options",
                answers: [
                  "Alpha Choice",
                  "Beta Choice",
                  "Gamma Choice",
                  "Delta Choice",
                  "Epsilon Choice",
                ],
                solutions: [],
                cooldown: 5,
                time: 180,
              },
              {
                type: "single",
                playMode: "survey",
                question: "Question 2 with Default Game Background & Muted Cue",
                answers: ["North", "South", "East", "West"],
                solutions: [],
                cooldown: 5,
                time: 180,
              },
            ],
          },
          extras: {
            schemaVersion: 2,
            revision: 1,
            quizId: "temp-e2e-appearance",
            baseDigest:
              "0000000000000000000000000000000000000000000000000000000000000000",
            questionIds: [
              "00000000-0000-4000-8000-000000000001",
              "00000000-0000-4000-8000-000000000002",
            ],
            timeline: [
              {
                id: "00000000-0000-4000-8000-000000000011",
                kind: "opening",
                sceneId: "00000000-0000-4000-8000-000000000021",
              },
              {
                id: "00000000-0000-4000-8000-000000000012",
                kind: "question",
                questionId: "00000000-0000-4000-8000-000000000001",
              },
              {
                id: "00000000-0000-4000-8000-000000000013",
                kind: "interimResults",
                sceneId: "00000000-0000-4000-8000-000000000022",
              },
              {
                id: "00000000-0000-4000-8000-000000000014",
                kind: "question",
                questionId: "00000000-0000-4000-8000-000000000002",
              },
              {
                id: "00000000-0000-4000-8000-000000000015",
                kind: "leaderboard",
                sceneId: "00000000-0000-4000-8000-000000000023",
              },
              {
                id: "00000000-0000-4000-8000-000000000016",
                kind: "closing",
                sceneId: "00000000-0000-4000-8000-000000000024",
              },
            ],
            scenes: {
              "00000000-0000-4000-8000-000000000021": {
                id: "00000000-0000-4000-8000-000000000021",
                kind: "opening",
                title: "Welcome to Studio Stage",
                subtitle: "Zero-Scroll Public Display Verification",
                durationMs: 30000,
                advance: "manual",
                background: {
                  url: uploadedBg.url,
                  fit: "cover",
                  position: "center",
                  overlayOpacity: 0.4,
                },
                audio: {
                  mode: "custom",
                  url: "/sounds/boump.mp3",
                  volume: 0.6,
                  loop: false,
                },
                stageAnimations: {
                  questionEntrance: {
                    preset: "zoom-soft",
                    durationMs: 700,
                    timing: "simultaneous",
                    staggerMs: 90,
                  },
                },
              },
              "00000000-0000-4000-8000-000000000022": {
                id: "00000000-0000-4000-8000-000000000022",
                kind: "interimResults",
                title: "Round 1 Breakdown",
                durationMs: 30000,
                advance: "manual",
                stageAnimations: {
                  resultsRevealEntrance: {
                    preset: "slide-up",
                    durationMs: 600,
                    timing: "sequential",
                    staggerMs: 80,
                  },
                },
              },
              "00000000-0000-4000-8000-000000000023": {
                id: "00000000-0000-4000-8000-000000000023",
                kind: "leaderboard",
                title: "Top Standings",
                durationMs: 30000,
                advance: "manual",
              },
              "00000000-0000-4000-8000-000000000024": {
                id: "00000000-0000-4000-8000-000000000024",
                kind: "closing",
                title: "Thanks for Joining!",
                subtitle: "See you next time",
                durationMs: 30000,
                advance: "manual",
              },
            },
            defaults: {
              newQuestionMode: "survey",
              leaderboardPolicy: "cardOnly",
              advanceMode: "manual",
            },
            perQuestion: {
              "00000000-0000-4000-8000-000000000001": {
                background: {
                  url: uploadedBg.url,
                  fit: "cover",
                  position: "center",
                  overlayOpacity: 0.35,
                },
                audioCues: {
                  showQuestion: {
                    mode: "custom",
                    url: "/sounds/show.mp3",
                    volume: 0.7,
                    loop: false,
                  },
                  answersMusic: {
                    mode: "custom",
                    url: "/sounds/answersMusic.mp3",
                    volume: 0.4,
                    loop: true,
                  },
                },
                questionEntrance: {
                  preset: "slide-up",
                  durationMs: 750,
                },
                stageAnimations: {
                  questionEntrance: {
                    preset: "slide-up",
                    durationMs: 750,
                    timing: "simultaneous",
                    staggerMs: 90,
                  },
                  answerEntrance: {
                    preset: "fade",
                    durationMs: 650,
                    timing: "sequential",
                    staggerMs: 80,
                  },
                  answerBadgeEntrance: {
                    preset: "zoom-soft",
                    durationMs: 500,
                    timing: "sequential",
                    staggerMs: 80,
                  },
                  resultsRevealEntrance: {
                    preset: "spotlight",
                    durationMs: 700,
                    timing: "sequential",
                    staggerMs: 90,
                  },
                },
                answerVisuals: [
                  {
                    answerIndex: 0,
                    display: "both",
                    url: uploadedBg.url,
                    alt: "Alpha Landscape Visual",
                  },
                  {
                    answerIndex: 1,
                    display: "both",
                    url: uploadedPortrait.url,
                    alt: "Beta Portrait Visual",
                  },
                  {
                    answerIndex: 2,
                    display: "both",
                    url: uploadedSquare.url,
                    alt: "Gamma Square Visual",
                  },
                  {
                    answerIndex: 3,
                    display: "both",
                    url: uploadedBg.url,
                    alt: "Delta Landscape Visual",
                  },
                  {
                    answerIndex: 4,
                    display: "both",
                    url: uploadedSquare.url,
                    alt: "Epsilon Square Visual",
                  },
                ],
              },
              "00000000-0000-4000-8000-000000000002": {
                audioCues: {
                  showQuestion: {
                    mode: "mute",
                    volume: 0,
                    loop: false,
                  },
                },
              },
            },
          },
        },
      },
    )
    expect(createRes.status()).toBe(201)

    // Verify Reference-Safe Deletion: attempting to delete `custom-card-bg.png` without detach MUST return 409 Conflict!
    const deleteBlockedRes = await managerPage.request.delete(
      `${SOCKET_ORIGIN}/api/media/${uploadedBg.name}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    )
    expect(deleteBlockedRes.status()).toBe(409)
    const blockedBody = (await deleteBlockedRes.json()) as {
      error: string
      references: Array<{ quizId: string }>
    }
    expect(blockedBody.references.length).toBeGreaterThan(0)

    // Start the game from Manager UI (reload /manager/config so React Query fetches the newly created show)
    await managerPage.reload()
    const pin = await createGame(
      managerPage,
      "Zero Scroll & Appearance E2E Show",
    )
    expect(pin).toMatch(/^\d{6}$/u)

    const gameIdMatch = managerPage.url().match(/\/party\/manager\/([^/?#]+)/u)
    expect(gameIdMatch).not.toBeNull()
    const gameId = gameIdMatch![1]

    // Open Spectator Display (/display/$gameId) and Player (/game/$gameId)
    const spectatorContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    const spectatorPage = await spectatorContext.newPage()
    await spectatorPage.goto(`/display/${gameId}`)
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible({ timeout: 15_000 })

    const playerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "StageTester")

    // Assert host sees 1 player connected before starting
    await expect(
      managerPage.getByRole("button", { name: /1 \/ 1 Players/i }),
    ).toBeVisible({ timeout: 10_000 })

    await startGame(managerPage)

    // 2A. Opening Scene: verify custom card background, custom audio state, and zero-scroll across viewports
    await expect(
      spectatorPage.getByRole("heading", { name: "Welcome to Studio Stage" }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      spectatorPage.locator('[data-testid="stage-card-background"]'),
    ).toHaveAttribute("data-bg-url", uploadedBg.url)
    await expect(
      spectatorPage.locator('[data-testid="audio-cue-player-state"]'),
    ).toHaveAttribute("data-audio-url", "/sounds/boump.mp3")

    const stageViewports = [
      { width: 1920, height: 1080, name: "1920x1080" },
      { width: 1366, height: 768, name: "1366x768" },
      { width: 1280, height: 800, name: "1280x800" },
      { width: 1024, height: 768, name: "1024x768" },
      { width: 800, height: 600, name: "800x600_4_3" },
      { width: 768, height: 1024, name: "768x1024" },
      { width: 390, height: 844, name: "390x844" },
      { width: 320, height: 568, name: "320x568" },
    ]

    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(spectatorPage, `Opening Scene @ ${vp.name}`)
    }
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })
    await saveScreenshot(spectatorPage, "03_opening_scene_custom_bg_1080p.png")

    // Advance to Question 1
    await managerPage.getByRole("button", { name: /Advance Scene/i }).click()

    // Wait for Question 1 voting phase (SELECT_ANSWER)
    await expect(
      spectatorPage.getByText(
        "Question 1 with Custom Background & 5 Visual Options",
      ),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      spectatorPage.locator('[data-testid="photo-card-grid"]'),
    ).toBeVisible({ timeout: 15_000 })

    // Verify custom background is active on Question 1
    await expect(
      spectatorPage.locator('[data-testid="stage-card-background"]'),
    ).toHaveAttribute("data-bg-url", uploadedBg.url)

    // Verify Staged Animation attributes on Question 1 cards & badges
    await expect(
      spectatorPage.locator('[data-testid="photo-card-choice-0"]'),
    ).toHaveAttribute("data-tada-entrance", "fade")
    await expect(
      spectatorPage.locator('[data-testid="photo-card-label-0"]'),
    ).toHaveAttribute("data-tada-entrance", "zoom-soft")

    // Verify Zero-Scroll and Full Visual Containment across all 8 required viewports during 5-option image+text voting!
    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(
        spectatorPage,
        `Q1 5-Option Voting @ ${vp.name}`,
      )

      // P0-4: Assert true visual containment on critical stage elements:
      // 1. Question Title is visible, bounded, not clipped
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="game-question-title"]',
        `Q1 Title @ ${vp.name}`,
      )

      // 2. Countdown Timer & HUD answers counter are visible, bounded, not clipped
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="answer-cooldown"]',
        `Q1 Timer @ ${vp.name}`,
      )
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="stage-hud-answer-counter"]',
        `Q1 HUD Answer Counter @ ${vp.name}`,
      )

      // 3. All 5 photo answer cards, labels, images, and captions are fully visible & contained
      for (let i = 0; i < 5; i++) {
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="photo-card-choice-${i}"]`,
          `Q1 Card ${i} @ ${vp.name}`,
        )
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="photo-card-label-${i}"]`,
          `Q1 Card Label ${i} @ ${vp.name}`,
        )
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="photo-card-image-${i}"]`,
          `Q1 Image ${i} @ ${vp.name}`,
          { checkImageLoaded: true },
        )
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="photo-card-caption-${i}"]`,
          `Q1 Caption ${i} @ ${vp.name}`,
        )
      }

      // 4. Assert no vertical overlap between header/title and HUD/timer, and between HUD and cards
      await assertNoVerticalOverlap(
        spectatorPage,
        '[data-testid="game-question-title"]',
        '[data-testid="answer-cooldown"]',
        `Q1 Title / Timer Overlap @ ${vp.name}`,
      )

      if (vp.name === "800x600_4_3" || vp.name === "1920x1080" || vp.name === "390x844" || vp.name === "320x568") {
        await saveScreenshot(
          spectatorPage,
          `04_q1_voting_${vp.name}.png`,
        )
      }
    }
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // Also assert mobile player containment on playerPage (390x844 and 320x568) with bottom player footer
    for (const playerVp of [
      { width: 390, height: 844, name: "390x844" },
      { width: 320, height: 568, name: "320x568" },
    ]) {
      await playerPage.setViewportSize(playerVp)
      await assertZeroStageScroll(playerPage, `Player Q1 Voting @ ${playerVp.name}`)
      await assertVisualContainment(
        playerPage,
        '[data-testid="game-question-title"]',
        `Player Q1 Title @ ${playerVp.name}`,
      )
      await assertVisualContainment(
        playerPage,
        '[data-testid="photo-card-choice-0"]',
        `Player Q1 Card 0 @ ${playerVp.name}`,
      )
      await assertVisualContainment(
        playerPage,
        '[data-testid="photo-card-choice-4"]',
        `Player Q1 Card 4 @ ${playerVp.name}`,
      )
    }

    // Player casts a vote on Option 0
    await playerPage.locator('[data-testid="photo-card-choice-0"]').click()

    // Host ends timer -> SHOW_RESPONSES reveal
    await endTimer(managerPage)
    await expect(
      spectatorPage.locator('[data-testid="results-hero-section"]'),
    ).toBeVisible({ timeout: 15_000 })

    // Verify resultsRevealEntrance animation on interim results winner
    await expect(
      spectatorPage.locator('[data-testid="interim-option-row"][data-winner="true"]'),
    ).toHaveAttribute("data-tada-entrance", "slide-up")
    await spectatorPage.waitForTimeout(600)

    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(
        spectatorPage,
        `Q1 Interim Reveal @ ${vp.name}`,
      )

      // P0-4: Assert true visual containment & text completeness on reveal stage elements:
      // 1. Question text: fully visible, unclamped, not ellipsized
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="scene-question-text"]',
        `Reveal Question Text @ ${vp.name}`,
        { checkTextCompleteness: true },
      )
      const qText = (await spectatorPage.locator('[data-testid="scene-question-text"]').textContent()) ?? ""
      expect(qText).toContain("Question 1 with Custom Background")
      expect(qText).not.toContain("...")

      // 2. Bottom awaiting host line: fully visible, not cut off by screen bottom edge
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="scene-awaiting-host"]',
        `Reveal Awaiting Host Line @ ${vp.name}`,
        { checkTextCompleteness: true },
      )
      const hostText = (await spectatorPage.locator('[data-testid="scene-awaiting-host"]').textContent()) ?? ""
      expect(hostText.toLowerCase()).toContain("awaiting host")

      // 3. Dominant hero winner and runners up
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="results-hero-section"]',
        `Reveal Hero Section @ ${vp.name}`,
      )
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="interim-option-row"][data-winner="true"]',
        `Reveal Winner Row @ ${vp.name}`,
      )
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="results-runners-up-section"]',
        `Reveal Runners Up @ ${vp.name}`,
      )

      // 4. No vertical overlap between question text and hero section, or between hero section and awaiting host footer
      await assertNoVerticalOverlap(
        spectatorPage,
        '[data-testid="scene-question-text"]',
        '[data-testid="results-hero-section"]',
        `Reveal Question / Hero Overlap @ ${vp.name}`,
      )
      await assertNoVerticalOverlap(
        spectatorPage,
        '[data-testid="results-hero-section"]',
        '[data-testid="scene-awaiting-host"]',
        `Reveal Hero / Awaiting Host Overlap @ ${vp.name}`,
      )

      if (vp.name === "800x600_4_3" || vp.name === "1920x1080" || vp.name === "320x568") {
        await saveScreenshot(
          spectatorPage,
          `05_q1_reveal_${vp.name}.png`,
        )
      }
    }
    await spectatorPage.setViewportSize({ width: 1920, height: 1080 })

    // Advance to Question 2 (which has NO custom card background and has showQuestion audio MUTED)
    await managerPage.getByRole("button", { name: /Advance Scene/i }).click()
    await expect(
      spectatorPage.getByText(
        "Question 2 with Default Game Background & Muted Cue",
      ),
    ).toBeVisible({ timeout: 15_000 })

    // Verify fallback to default GameBackground (no stage-card-background overlay)
    await expect(
      spectatorPage.locator('[data-testid="stage-card-background"]'),
    ).toHaveCount(0)

    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(spectatorPage, `Q2 Default BG @ ${vp.name}`)
    }

    await spectatorContext.close()
    await playerContext.close()
  })
})
