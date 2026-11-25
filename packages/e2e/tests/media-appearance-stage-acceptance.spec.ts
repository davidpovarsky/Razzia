import fs from "node:fs"
import { join } from "node:path"
import zlib from "node:zlib"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import {
  createGame,
  loginManager,
  next,
  startGame,
} from "@razzia/e2e/utils/manager"
import { EVENTS } from "@razzia/common/constants"
import {
  endRecordedVote,
  latestState,
  observeLiveFlow,
  setManualProgression,
  waitForRecordedVoting,
} from "@razzia/e2e/utils/extension-manager"
import { joinGame } from "@razzia/e2e/utils/player"
import type { Page } from "@playwright/test"
const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../test-results/screenshots/media-appearance-stage",
)
const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, {
    recursive: true,
  })
  await page.screenshot({
    path: join(SCREENSHOT_DIR, filename),
    fullPage: false,
  })
}

async function openStudioPanel(
  page: Page,
  id: "edit" | "preview" | "settings",
) {
  const drawer = page.locator("[data-editor-drawer-close]:visible")
  const count = await drawer.count()
  expect(count).toBeLessThanOrEqual(1)

  if (count === 1) {
    await drawer.click()
  }

  const panel = page.getByTestId(`editor-panel-${id}`)

  if (!(await panel.isVisible())) {
    await page.getByTestId(`editor-panel-toggle-${id}`).click()
  }

  await expect(panel).toBeVisible()

  return panel
}

async function advanceAuthoredScene(manager: Page) {
  await expect(manager.getByTestId("host-end-timer-btn")).toHaveCount(0)
  const advance = manager.getByTestId("host-next-screen-btn")
  await expect(advance).toHaveCount(1)
  await expect(advance).toBeEnabled()
  await advance.click()
}

interface NativeMotionObservation {
  questionKey: string
  scene: string
  question: boolean
  card: number | null
  duration: number
  delay: number
  hasOpacity: boolean
  hasTransform: boolean
  finished: boolean
}

async function observeNativeMotion(page: Page) {
  await page.addInitScript(() => {
    const target = window as unknown as {
      qaNativeMotion: NativeMotionObservation[]
    }
    target.qaNativeMotion = []
    const descriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "animate",
    )

    if (!descriptor || typeof descriptor.value !== "function") {
      throw new Error("The native stage requires the real Web Animations API")
    }

    const original = descriptor.value as Element["animate"]
    Element.prototype.animate = function observeStageAnimation(
      ...args: Parameters<Element["animate"]>
    ) {
      const animation = original.apply(this, args)
      const stage = this.closest('[data-testid="tadazz-stage"]')
      const isQuestion = this.matches(".q-frame, .q-text")
      const card = this.matches(".choice-slot")
        ? Number(this.getAttribute("data-v4-choice"))
        : null

      if (stage && (isQuestion || card !== null)) {
        const { effect } = animation
        const frames =
          effect instanceof KeyframeEffect ? effect.getKeyframes() : []
        const timing = effect?.getTiming()
        const row: NativeMotionObservation = {
          questionKey: stage.getAttribute("data-question-key") ?? "",
          scene: stage.getAttribute("data-v4-scene") ?? "",
          question: isQuestion,
          card,
          duration: typeof timing?.duration === "number" ? timing.duration : 0,
          delay: timing?.delay ?? 0,
          hasOpacity: frames.some((frame) => frame.opacity !== undefined),
          hasTransform: frames.some((frame) => frame.transform !== undefined),
          finished: false,
        }
        target.qaNativeMotion.push(row)
        void animation.finished
          .then(() => {
            row.finished = true
          })
          .catch(() => {
            row.finished = false
          })
      }

      return animation
    }
  })
}

async function assertNativeQuestionMotion(page: Page, cardCount: number) {
  const stage = page.getByTestId("tadazz-stage")
  const questionKey = await stage.getAttribute("data-question-key")
  expect(questionKey).toBeTruthy()
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, count }) => {
          const rows = (
            window as unknown as { qaNativeMotion: NativeMotionObservation[] }
          ).qaNativeMotion.filter(
            (row) =>
              row.questionKey === key &&
              row.duration > 0 &&
              row.hasOpacity &&
              row.hasTransform,
          )
          const cards = Array.from({ length: count }, (_, index) =>
            rows.find((row) => row.card === index && row.finished),
          )

          return {
            question: rows.some((row) => row.question && row.finished),
            cards: cards.every(Boolean),
            staggered: cards.every(
              (row, index) =>
                index === 0 ||
                (row !== undefined &&
                  row.delay > (cards[index - 1]?.delay ?? Infinity)),
            ),
          }
        },
        { key: questionKey, count: cardCount },
      ),
    )
    .toEqual({ question: true, cards: true, staggered: true })
}

// 1x1 transparent PNG buffer for real upload testing
const TINY_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

// Dynamic multi-aspect ratio PNG generator for varied, realistic image fixtures
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[n] = c
}
function crc32(buf: Buffer): number {
  let crc = -1
  for (const _entry of buf) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ _entry) & 0xff]
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
  color = {
    r: 59,
    g: 130,
    b: 246,
  },
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
  for (let y = 0; y < height; y += 1) {
    const offset = y * scanlineLength
    raw[offset] = 0
    for (let x = 0; x < width; x += 1) {
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
const LANDSCAPE_PNG_BUFFER = createPngBuffer(1600, 900, {
  r: 234,
  g: 88,
  b: 12,
})
const PORTRAIT_PNG_BUFFER = createPngBuffer(1200, 1600, {
  r: 16,
  g: 185,
  b: 129,
})
const SQUARE_PNG_BUFFER = createPngBuffer(1024, 1024, {
  r: 139,
  g: 92,
  b: 246,
})
const assertZeroStageScroll = async (page: Page, label: string) => {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement
    const { body } = document
    const stage =
      document.querySelector('[data-testid="tadazz-show"]') ??
      document.querySelector('[data-testid="audience-display"] section') ??
      document.querySelector("section") ??
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
/* oxlint-disable max-params -- Preserve the existing positional protocol/animation API; changing callers is outside this lint repair. */
const assertVisualContainment = async (
  page: Page,
  selector: string,
  label: string,
  options?: {
    checkImageLoaded?: boolean
    checkTextCompleteness?: boolean
  },
) => {
  await expect(async () => {
    const result = await page.evaluate(
      ({ sel, checkImg, checkText }) => {
        const el = document.querySelector(sel)

        if (!el) {
          return {
            ok: false,
            error: `Element not found in DOM: ${sel}`,
          }
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
        if (checkText) {
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
  }).toPass({
    timeout: 5000,
    intervals: [100, 250, 500],
  })
}

/**
 * P0-4: Asserts that an upper stage element does not vertically overlap a lower element.
 * Fail-closed: missing required selectors FAIL the test unless explicitly marked optional.
 */
/* oxlint-enable max-params */
/* oxlint-disable max-params -- Preserve the existing positional protocol/animation API; changing callers is outside this lint repair. */
const assertNoVerticalOverlap = async (
  page: Page,
  topSelector: string,
  bottomSelector: string,
  label: string,
  options?: {
    optional?: boolean
  },
) => {
  const result = await page.evaluate(
    ({ topSel, bottomSel, isOptional }) => {
      const topEl = document.querySelector(topSel)
      const bottomEl = document.querySelector(bottomSel)

      if (!topEl || !bottomEl) {
        if (isOptional) {
          return {
            ok: true,
          }
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
/* oxlint-enable max-params */
test.describe("Tada Studio Complete: Media Library Reuse, Card Backgrounds, Audio, Staged Motion & Zero-Scroll Stage", () => {
  test("1. Studio Editor: Responsive Zero-Overflow (1280..320), Smart Convert Question->Scene, Per-Answer Visuals, Shared Media Library & Reference-Safe Delete", async ({
    page,
  }) => {
    await loginManager(page)
    await page.goto("/manager/quizz")
    const headerKinds = page.locator(
      '[data-testid="studio-card-type-bar"][data-embedded="false"]',
    )
    await expect(headerKinds).toBeVisible({ timeout: 15_000 })

    const editorWidths = [1280, 1024, 844, 768, 390, 320]
    for (const width of editorWidths) {
      await page.setViewportSize({ width, height: 800 })
      let kinds = headerKinds

      if (width < 1100) {
        await expect(headerKinds).toBeHidden()
        const editPanel = await openStudioPanel(page, "edit")
        kinds = editPanel.locator(
          '[data-testid="studio-card-type-bar"][data-embedded="true"]',
        )
      }

      await expect(kinds).toHaveCount(1)
      await expect(kinds).toBeVisible()
      await expect(kinds.getByRole("radio")).toHaveCount(2)
      await expect(kinds.getByRole("radio", { name: /Quiz/i })).toBeVisible()
      await expect(kinds.getByRole("radio", { name: /Survey/i })).toBeVisible()
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        overflow.scrollWidth,
        `Editor horizontal overflow at width ${width}px`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1)
    }
    await saveScreenshot(page, "01_editor_narrow_320px.png")
    const drawerClose = page.locator("[data-editor-drawer-close]:visible")
    await expect(drawerClose).toHaveCount(1)
    await drawerClose.click()
    await page.setViewportSize({ width: 1280, height: 900 })

    // Transition and Answer Recap belong to the explicit Advanced card chooser.
    await page.getByTestId("editor-mode-advanced").click()
    await page.getByTestId("studio-add-card-btn").click()
    const transitionToggle = headerKinds.getByRole("radio", {
      name: /Transition/i,
    })
    await transitionToggle.click()
    await openStudioPanel(page, "edit")
    await expect(page.getByTestId("scene-title-input")).toBeVisible({
      timeout: 5_000,
    })
    await headerKinds.getByRole("radio", { name: /Quiz/i }).click()
    const edit = await openStudioPanel(page, "edit")
    const titleInput = edit.getByPlaceholder(t("quizz:question.placeholder"))
    await expect(titleInput).toHaveCount(1)
    await titleInput.fill("Populated Question Title")
    await transitionToggle.click()
    const dialogDesc = page.getByText(/replace its question content/i)
    await expect(dialogDesc).toBeVisible()
    expect(
      ((await dialogDesc.textContent()) ?? "").toLowerCase(),
    ).not.toContain("undo")
    await page
      .getByRole("button", { name: t("common:cancel"), exact: true })
      .click()
    await expect(titleInput).toHaveValue("Populated Question Title")

    const answerVisualMode = edit.getByTestId("answer-mode-0-both")
    await answerVisualMode.click()
    await expect(answerVisualMode).toHaveAttribute("aria-checked", "true")
    await expect(edit.getByTestId("answer-pick-image-0")).toBeVisible()
    await edit.getByTestId("answer-pick-image-0").click()
    const dialog = page.getByRole("dialog", {
      name: t("quizz:media.library"),
      exact: true,
    })
    await expect(dialog).toBeVisible()
    const fileInput = dialog.locator('input[type="file"]')
    await expect(fileInput).toHaveAttribute("accept", /image/i)
    await fileInput.setInputFiles({
      name: "shared-stage-asset.png",
      mimeType: "image/png",
      buffer: TINY_PNG_BUFFER,
    })
    const uploadedThumb = dialog.locator('img[alt^="shared-stage-asset"]')
    await expect(uploadedThumb).toHaveCount(1)
    await expect(uploadedThumb).toBeVisible({ timeout: 10_000 })
    const sharedUrl = await uploadedThumb.getAttribute("src")
    expect(sharedUrl).toBeTruthy()
    await uploadedThumb.click()
    await expect(edit.getByTestId("answer-image-preview-0")).toBeVisible()

    // Native theme sections own background/audio/motion; legacy controls are rollback-only.
    const settings = await openStudioPanel(page, "settings")
    const advanced = settings.getByTestId("question-advanced-settings-toggle")

    if ((await advanced.getAttribute("aria-expanded")) === "false") {
      await advanced.click()
    }

    const background = settings
      .getByRole("heading", {
        name: t("extensions:themes.sections.background"),
        exact: true,
      })
      .locator("..")
    await background
      .getByRole("button", {
        name: t("extensions:themes.customMedia"),
        exact: true,
      })
      .click()
    await expect(dialog).toBeVisible()
    await dialog.getByTestId("media-scope-show").click()
    const reused = dialog.locator('img[alt^="shared-stage-asset"]')
    await expect(reused).toHaveCount(1)
    await expect(reused).toHaveAttribute("src", sharedUrl ?? "")
    await reused.click()
    await expect(background.locator("img")).toHaveAttribute(
      "src",
      sharedUrl ?? "",
    )

    const showQuestionAudio = settings.getByTestId("theme-audio-showQuestion")
    await showQuestionAudio
      .getByRole("button", {
        name: t("extensions:themes.customMedia"),
        exact: true,
      })
      .click()
    await expect(dialog).toBeVisible()
    await dialog.getByTestId("media-scope-builtin").click()
    const preview = dialog.getByTestId(
      "builtin-sound-preview-classic-transition",
    )
    await expect(preview).toBeVisible()
    await preview.click()
    const select = dialog.getByTestId("builtin-sound-select-classic-transition")
    await expect(select).toBeVisible()
    await select.click()
    await expect(showQuestionAudio.getByRole("combobox")).toHaveAttribute(
      "data-state",
      "closed",
    )
    await expect(showQuestionAudio.getByRole("combobox")).toHaveText(
      t("extensions:themes.default"),
    )

    const motion = settings
      .getByRole("heading", {
        name: t("extensions:themes.sections.motion"),
        exact: true,
      })
      .locator("..")
    await expect(
      motion.getByText(t("extensions:themes.motionOwned"), { exact: true }),
    ).toBeVisible()
    await expect(settings.getByTestId("staged-animation-section")).toHaveCount(
      0,
    )
    await expect(
      settings.getByTestId("question-decoration-preset"),
    ).toHaveCount(0)
    await expect(
      headerKinds.getByRole("radio", { name: /Answer Recap/i }),
    ).toBeVisible()
    await saveScreenshot(page, "02_editor_card_appearance_configured.png")

    // Reset only the local background; the same library asset remains an answer visual.
    await background
      .getByRole("button", {
        name: t("extensions:themes.sectionReset"),
        exact: true,
      })
      .click()
    await expect(background.locator("img")).toHaveCount(0)
    await openStudioPanel(page, "edit")
    await expect(edit.getByTestId("answer-image-preview-0")).toBeVisible()
    await expect(edit.getByTestId("answer-image-preview-0")).toHaveAttribute(
      "src",
      sharedUrl ?? "",
    )
  })
  test("2. Live Runtime & Zero-Scroll Stage Matrix (STAGE-P0) across 8 Viewports + Card Background + Single Audio + Staged Motion", async ({
    page: managerPage,
    browser,
  }) => {
    const SOCKET_ORIGIN = "http://127.0.0.1:3011"
    const observations = observeLiveFlow(managerPage)
    await loginManager(managerPage)

    // Upload real diverse aspect-ratio image fixtures via API (1600x900 landscape, 1200x1600 portrait, 1024x1024 square)
    const token = await managerPage.evaluate(() =>
      localStorage.getItem("token"),
    )
    const uploadLandscapeRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/media`,
      {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
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
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
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
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
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

    // Register the same real sound bytes as authored media. The theme's built-in
    // start-effect URL is not an admitted custom lobby soundtrack.
    const openingSoundResponse = await managerPage.request.get(
      new URL("/sounds/boump.mp3", managerPage.url()).href,
    )
    expect(openingSoundResponse.ok()).toBe(true)
    expect(openingSoundResponse.headers()["content-type"]).toMatch(/audio\//u)
    const openingSoundBytes = await openingSoundResponse.body()
    expect(openingSoundBytes.length).toBeGreaterThan(0)
    const uploadOpeningSound = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/media`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        multipart: {
          file: {
            name: "authored-opening-sound.mp3",
            mimeType: "audio/mpeg",
            buffer: openingSoundBytes,
          },
        },
      },
    )
    expect(uploadOpeningSound.status()).toBe(201)
    const uploadedOpeningSound = (await uploadOpeningSound.json()) as {
      url: string
      type: string
    }
    expect(uploadedOpeningSound.url).toMatch(/^\/media\//u)
    expect(uploadedOpeningSound.type).toBe("audio")

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
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        data: {
          quizz: {
            subject: "Zero Scroll & Appearance E2E Show",
            gameMode: "survey",
            questions: [
              {
                type: "single",
                playMode: "survey",
                question:
                  "Question 1 with Custom Background & 5 Visual Options",
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
                  url: uploadedOpeningSound.url,
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
    const { quizId } = (await createRes.json()) as { quizId: string }
    const savedResponse = await managerPage.request.get(
      `${SOCKET_ORIGIN}/api/extensions/quizzes/${quizId}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    )
    expect(savedResponse.ok()).toBe(true)
    const saved = (await savedResponse.json()) as {
      extras: {
        scenes: Record<string, { title?: string; subtitle?: string }>
        perQuestion: Record<string, { stageAnimations?: unknown }>
      }
    }
    expect(
      saved.extras.scenes["00000000-0000-4000-8000-000000000021"].title,
    ).toBe("Welcome to Studio Stage")
    expect(
      saved.extras.scenes["00000000-0000-4000-8000-000000000021"].subtitle,
    ).toBe("Zero-Scroll Public Display Verification")
    expect(
      saved.extras.perQuestion["00000000-0000-4000-8000-000000000001"]
        .stageAnimations,
    ).toMatchObject({
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
    })

    // Verify Reference-Safe Deletion: attempting to delete `custom-card-bg.png` without detach MUST return 409 Conflict!
    const deleteBlockedRes = await managerPage.request.delete(
      `${SOCKET_ORIGIN}/api/media/${uploadedBg.name}`,
      {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      },
    )
    expect(deleteBlockedRes.status()).toBe(409)
    const blockedBody = (await deleteBlockedRes.json()) as {
      error: string
      references: Array<{
        quizId: string
      }>
    }
    expect(blockedBody.references.length).toBeGreaterThan(0)

    // Start the game from Manager UI (reload /manager/config so React Query fetches the newly created show)
    await managerPage.reload()
    const pin = await createGame(
      managerPage,
      "Zero Scroll & Appearance E2E Show",
    )
    expect(pin).toMatch(/^\d{6}$/u)
    await setManualProgression(managerPage)
    const gameIdMatch = /\/party\/manager\/([^/?#]+)/u.exec(managerPage.url())
    expect(gameIdMatch).not.toBeNull()
    const { 1: gameId } = gameIdMatch!

    // Open Spectator Display (/display/$gameId) and Player (/game/$gameId)
    const spectatorContext = await browser.newContext({
      viewport: {
        width: 1920,
        height: 1080,
      },
    })
    const spectatorPage = await spectatorContext.newPage()
    await observeNativeMotion(spectatorPage)
    await spectatorPage.goto(`/display/${gameId}`)
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible({
      timeout: 15_000,
    })
    const playerContext = await browser.newContext({
      viewport: {
        width: 390,
        height: 844,
      },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "StageTester")

    // Assert host sees 1 player connected before starting
    await expect(
      managerPage
        .getByTestId("host-bottom-players-btn")
        .getByTestId("host-connected-counter"),
    ).toHaveText(/^1(?:\s*\/\s*1)?$/u)
    await startGame(managerPage)

    // 2A. Opening Scene: verify custom card background, custom audio state, and zero-scroll across viewports
    // Plain Classic bookends expose a Card name; the native preset owns its title.
    await expect(spectatorPage.getByTestId("tadazz-intro-screen")).toHaveClass(
      /is-visible/u,
      { timeout: 15_000 },
    )
    await expect(
      spectatorPage
        .getByTestId("tadazz-intro-screen")
        .locator(".tz-intro-logo"),
    ).toBeVisible()
    await expect(
      playerPage.getByRole("heading", {
        name: "Welcome to Studio Stage",
        exact: true,
      }),
    ).toBeVisible()
    await expect(spectatorPage.getByTestId("tadazz-backdrop")).toHaveCSS(
      "background-image",
      new RegExp(uploadedBg.url.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")),
    )
    await expect(
      spectatorPage.getByTestId("audio-cue-player-state"),
    ).toHaveCount(1)
    await expect(
      spectatorPage.getByTestId("audio-cue-player-state"),
    ).toHaveAttribute("data-audio-url", uploadedOpeningSound.url)
    const stageViewports = [
      {
        width: 1920,
        height: 1080,
        name: "1920x1080",
      },
      {
        width: 1366,
        height: 768,
        name: "1366x768",
      },
      {
        width: 1280,
        height: 800,
        name: "1280x800",
      },
      {
        width: 1024,
        height: 768,
        name: "1024x768",
      },
      {
        width: 800,
        height: 600,
        name: "800x600_4_3",
      },
      {
        width: 768,
        height: 1024,
        name: "768x1024",
      },
      {
        width: 390,
        height: 844,
        name: "390x844",
      },
      {
        width: 320,
        height: 568,
        name: "320x568",
      },
    ]
    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(spectatorPage, `Opening Scene @ ${vp.name}`)
    }
    await spectatorPage.setViewportSize({
      width: 1920,
      height: 1080,
    })
    await saveScreenshot(spectatorPage, "03_opening_scene_custom_bg_1080p.png")

    // Advance to Question 1
    await advanceAuthoredScene(managerPage)

    // Wait for Question 1 voting phase (SELECT_ANSWER)
    await expect(
      spectatorPage.getByText(
        "Question 1 with Custom Background & 5 Visual Options",
      ),
    ).toBeVisible({
      timeout: 15_000,
    })
    await waitForRecordedVoting(
      observations,
      "00000000-0000-4000-8000-000000000001",
    )
    await expect(spectatorPage.getByTestId(/^tadazz-card-[0-4]$/u)).toHaveCount(
      5,
    )
    await assertNativeQuestionMotion(spectatorPage, 5)

    // Verify custom background is active on Question 1
    await expect(spectatorPage.getByTestId("tadazz-backdrop")).toHaveCSS(
      "background-image",
      new RegExp(uploadedBg.url.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")),
    )

    // Verify Staged Animation attributes on Question 1 cards & badges
    await expect(
      playerPage.locator('[data-testid="photo-card-choice-0"]'),
    ).toHaveAttribute("data-tada-entrance", "fade")
    await expect(
      playerPage.locator('[data-testid="photo-card-label-0"]'),
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
        '[data-testid="tadazz-question-panel"] .q-text',
        `Q1 Title @ ${vp.name}`,
      )

      // 2. Countdown Timer & HUD answers counter are visible, bounded, not clipped
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="tadazz-timer"]',
        `Q1 Timer @ ${vp.name}`,
      )
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="tadazz-live-answered"]',
        `Q1 HUD Answer Counter @ ${vp.name}`,
      )

      // 3. All 5 photo answer cards, labels, images, and captions are fully visible & contained
      for (let i = 0; i < 5; i += 1) {
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="tadazz-card-${i}"]`,
          `Q1 Card ${i} @ ${vp.name}`,
        )
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="tadazz-card-${i}"] .answer-index`,
          `Q1 Card Label ${i} @ ${vp.name}`,
        )
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="tadazz-card-${i}"] .tz-photo-frame img`,
          `Q1 Image ${i} @ ${vp.name}`,
          {
            checkImageLoaded: true,
          },
        )
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="tadazz-card-${i}"] .answer-title`,
          `Q1 Caption ${i} @ ${vp.name}`,
        )
      }

      // 4. Native title and timer sit side by side; their visible boxes must not intersect.
      const questionTitle = spectatorPage
        .getByTestId("tadazz-question-panel")
        .locator(".q-text")
      const questionTimer = spectatorPage.getByTestId("tadazz-timer")
      await expect(questionTitle).toBeVisible()
      await expect(questionTimer).toBeVisible()
      const [titleBox, timerBox] = await Promise.all([
        questionTitle.boundingBox(),
        questionTimer.boundingBox(),
      ])

      if (!titleBox || !timerBox) {
        throw new Error(`Q1 Title / Timer bounds missing @ ${vp.name}`)
      }

      for (const bounds of [titleBox, timerBox]) {
        expect(bounds.width, `Q1 positive width @ ${vp.name}`).toBeGreaterThan(
          0,
        )
        expect(
          bounds.height,
          `Q1 positive height @ ${vp.name}`,
        ).toBeGreaterThan(0)
      }

      expect(
        titleBox.x + titleBox.width <= timerBox.x ||
          timerBox.x + timerBox.width <= titleBox.x ||
          titleBox.y + titleBox.height <= timerBox.y ||
          timerBox.y + timerBox.height <= titleBox.y,
        `Q1 Title / Timer overlap @ ${vp.name}: ${JSON.stringify({ titleBox, timerBox })}`,
      ).toBe(true)

      if (
        vp.name === "800x600_4_3" ||
        vp.name === "1920x1080" ||
        vp.name === "390x844" ||
        vp.name === "320x568"
      ) {
        await saveScreenshot(spectatorPage, `04_q1_voting_${vp.name}.png`)
      }
    }
    await spectatorPage.setViewportSize({
      width: 1920,
      height: 1080,
    })

    // Also assert mobile player containment on playerPage (390x844 and 320x568) with bottom player footer
    for (const playerVp of [
      {
        width: 390,
        height: 844,
        name: "390x844",
      },
      {
        width: 320,
        height: 568,
        name: "320x568",
      },
    ]) {
      await playerPage.setViewportSize(playerVp)
      await assertZeroStageScroll(
        playerPage,
        `Player Q1 Voting @ ${playerVp.name}`,
      )
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

    // The authored interim-results card owns this reveal, so wait for its actual state.
    const voting = await waitForRecordedVoting(
      observations,
      "00000000-0000-4000-8000-000000000001",
    )
    await expect
      .poll(() =>
        observations
          .slice(observations.indexOf(voting) + 1)
          .some(
            (row) =>
              row.name === EVENTS.GAME.PLAYER_ANSWER && row.data.count === 1,
          ),
      )
      .toBe(true)
    await managerPage.getByTestId("host-end-timer-btn").click()
    await expect.poll(() => latestState(observations)?.phase).toBe("scene")
    await expect(managerPage.getByTestId("host-end-timer-btn")).toHaveCount(0)
    await expect(managerPage.getByTestId("host-next-screen-btn")).toBeEnabled()
    await expect(
      spectatorPage.getByTestId("tadazz-question-panel").locator(".eyebrow"),
    ).toHaveText("Round 1 Breakdown")
    for (let index = 0; index < 5; index += 1) {
      const card = spectatorPage.getByTestId(`tadazz-card-${index}`)
      await expect(card.locator(".tz-result-number")).toHaveText(
        index === 0 ? "100%" : "0%",
      )

      if (index === 0) {
        await expect(card).toHaveClass(/is-favourite/u)
      } else {
        await expect(card).not.toHaveClass(/is-favourite/u)
      }
    }
    // The responsive player retains the authored hero/runner presentation and reveal entrance.
    await expect(playerPage.getByTestId("results-hero-section")).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      playerPage.locator(
        '[data-testid="interim-option-row"][data-winner="true"]',
      ),
    ).toHaveAttribute("data-tada-entrance", "slide-up")
    await spectatorPage.waitForTimeout(600)
    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await playerPage.setViewportSize({ width: vp.width, height: vp.height })
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="tadazz-question-panel"] .q-text',
        `Native Reveal Question @ ${vp.name}`,
      )
      await assertVisualContainment(
        spectatorPage,
        '[data-testid="tadazz-question-panel"] .eyebrow',
        `Authored Reveal Title @ ${vp.name}`,
      )
      for (let index = 0; index < 5; index += 1) {
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="tadazz-card-${index}"]`,
          `Native Reveal Card ${index} @ ${vp.name}`,
        )
        await assertVisualContainment(
          spectatorPage,
          `[data-testid="tadazz-card-${index}"] .tz-result-number`,
          `Native Reveal Percentage ${index} @ ${vp.name}`,
        )
      }
      await assertZeroStageScroll(
        playerPage,
        `Player Interim Reveal @ ${vp.name}`,
      )
      await assertZeroStageScroll(
        spectatorPage,
        `Q1 Interim Reveal @ ${vp.name}`,
      )

      // P0-4: Assert true visual containment & text completeness on reveal stage elements:
      // 1. Question text: fully visible, unclamped, not ellipsized
      await assertVisualContainment(
        playerPage,
        '[data-testid="scene-question-text"]',
        `Reveal Question Text @ ${vp.name}`,
        {
          checkTextCompleteness: true,
        },
      )
      const qText =
        (await playerPage
          .locator('[data-testid="scene-question-text"]')
          .textContent()) ?? ""
      expect(qText).toContain("Question 1 with Custom Background")
      expect(qText).not.toContain("...")

      // 2. Bottom awaiting host line: fully visible, not cut off by screen bottom edge
      await assertVisualContainment(
        playerPage,
        '[data-testid="scene-awaiting-host"]',
        `Reveal Awaiting Host Line @ ${vp.name}`,
        {
          checkTextCompleteness: true,
        },
      )
      const hostText =
        (await playerPage
          .locator('[data-testid="scene-awaiting-host"]')
          .textContent()) ?? ""
      expect(hostText.toLowerCase()).toContain("awaiting host")

      // 3. Dominant hero winner and runners up
      await assertVisualContainment(
        playerPage,
        '[data-testid="results-hero-section"]',
        `Reveal Hero Section @ ${vp.name}`,
      )
      await assertVisualContainment(
        playerPage,
        '[data-testid="interim-option-row"][data-winner="true"]',
        `Reveal Winner Row @ ${vp.name}`,
      )
      await assertVisualContainment(
        playerPage,
        '[data-testid="results-runners-up-section"]',
        `Reveal Runners Up @ ${vp.name}`,
      )

      // 4. No vertical overlap between question text and hero section, or between hero section and awaiting host footer
      await assertNoVerticalOverlap(
        playerPage,
        '[data-testid="scene-question-text"]',
        '[data-testid="results-hero-section"]',
        `Reveal Question / Hero Overlap @ ${vp.name}`,
      )
      await assertNoVerticalOverlap(
        playerPage,
        '[data-testid="results-hero-section"]',
        '[data-testid="scene-awaiting-host"]',
        `Reveal Hero / Awaiting Host Overlap @ ${vp.name}`,
      )

      if (
        vp.name === "800x600_4_3" ||
        vp.name === "1920x1080" ||
        vp.name === "320x568"
      ) {
        await saveScreenshot(spectatorPage, `05_q1_reveal_${vp.name}.png`)
      }
    }
    await spectatorPage.setViewportSize({
      width: 1920,
      height: 1080,
    })

    // Advance to Question 2 (which has NO custom card background and has showQuestion audio MUTED)
    await advanceAuthoredScene(managerPage)
    await expect(
      spectatorPage.getByText(
        "Question 2 with Default Game Background & Muted Cue",
      ),
    ).toBeVisible({
      timeout: 15_000,
    })

    // The same native backdrop owner now resolves the default rather than Q1's uploaded image.
    await waitForRecordedVoting(
      observations,
      "00000000-0000-4000-8000-000000000002",
    )
    await expect(spectatorPage.getByTestId("tadazz-backdrop")).not.toHaveCSS(
      "background-image",
      new RegExp(uploadedBg.url.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")),
    )
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
  test("3. Wave 2 Complete: Cinema Opening, Media Audio, Standalone Animation + Lottie Fixture, Question Decoration, and Cumulative Answer Recap across 8 Viewports", async ({
    page: managerPage,
    browser,
  }) => {
    const SOCKET_ORIGIN = "http://127.0.0.1:3011"
    const observations = observeLiveFlow(managerPage)
    await loginManager(managerPage)
    const token = await managerPage.evaluate(() =>
      localStorage.getItem("token"),
    )

    // 3A. Verify Lottie upload validator rejects malicious/external script payloads and accepts harmless engineering fixture
    const badLottieRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        data: {
          name: "malicious.json",
          content: JSON.stringify({
            v: "5.7.4",
            fr: 30,
            ip: 0,
            op: 60,
            w: 200,
            h: 200,
            layers: [
              {
                nm: "<script>alert(1)</script>",
              },
            ],
          }),
        },
      },
    )
    expect(badLottieRes.status()).toBe(400)
    const validLottieFixture = JSON.stringify({
      v: "5.7.4",
      fr: 30,
      ip: 0,
      op: 60,
      w: 240,
      h: 240,
      nm: "test-lottie-fixture",
      layers: [
        {
          ty: 4,
          nm: "shape-layer",
          ip: 0,
          op: 60,
          st: 0,
        },
      ],
    })
    const goodLottieRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/extensions/lottie`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        data: {
          name: "engineering-fixture.json",
          content: validLottieFixture,
        },
      },
    )
    expect(goodLottieRes.status()).toBe(201)
    const uploadedLottie = (await goodLottieRes.json()) as {
      name: string
      url: string
      type: string
    }
    expect(uploadedLottie.type).toBe("lottie")

    // Upload image fixture for cinema opening
    const uploadOpeningRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/media`,
      {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
        multipart: {
          file: {
            name: "cinema-opening.png",
            mimeType: "image/png",
            buffer: LANDSCAPE_PNG_BUFFER,
          },
        },
      },
    )
    expect(uploadOpeningRes.status()).toBe(201)
    const openingAsset = (await uploadOpeningRes.json()) as {
      name: string
      url: string
    }

    // 3B. Create a Wave 2 show covering:
    // - Cinema Opening (index 0 -> skips legacy 6s countdown)
    // - Q1 (Survey, pop-bounce + cascade + glow-bar question underline decoration)
    // - Media Audio card (audio scene with controls, no image broken tag)
    // - Standalone Animation card (confetti preset + harmless Lottie engineering fixture)
    // - Q2 (Quiz with correct answer index 1, pulse-line question decoration)
    // - Cumulative Answer Recap card (startQuestionId = Q1, dynamically recapping Q1..Q2)
    const createRes = await managerPage.request.post(
      `${SOCKET_ORIGIN}/api/extensions/quizzes`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        data: {
          quizz: {
            subject: "Wave 2 Cinema, Audio, Motion & Answer Recap Show",
            gameMode: "quiz",
            questions: [
              {
                type: "single",
                playMode: "survey",
                question: "Wave 2 Survey Q1: Which visual theme do you prefer?",
                answers: ["Solar Flare", "Ocean Deep", "Forest Canopy"],
                solutions: [],
                cooldown: 4,
                time: 180,
              },
              {
                type: "single",
                playMode: "quiz",
                question:
                  "Wave 2 Quiz Q2: Which planet is known as the Red Planet?",
                answers: ["Venus", "Mars", "Jupiter"],
                solutions: [1],
                cooldown: 4,
                time: 180,
              },
            ],
          },
          extras: {
            schemaVersion: 2,
            revision: 1,
            quizId: "temp-e2e-wave2",
            baseDigest:
              "0000000000000000000000000000000000000000000000000000000000000000",
            questionIds: [
              "00000000-0000-4000-8000-000000000101",
              "00000000-0000-4000-8000-000000000102",
            ],
            timeline: [
              {
                id: "00000000-0000-4000-8000-000000000201",
                kind: "opening",
                sceneId: "00000000-0000-4000-8000-000000000301",
              },
              {
                id: "00000000-0000-4000-8000-000000000202",
                kind: "question",
                questionId: "00000000-0000-4000-8000-000000000101",
              },
              {
                id: "00000000-0000-4000-8000-000000000203",
                kind: "media",
                sceneId: "00000000-0000-4000-8000-000000000302",
              },
              {
                id: "00000000-0000-4000-8000-000000000204",
                kind: "animation",
                sceneId: "00000000-0000-4000-8000-000000000303",
              },
              {
                id: "00000000-0000-4000-8000-000000000205",
                kind: "question",
                questionId: "00000000-0000-4000-8000-000000000102",
              },
              {
                id: "00000000-0000-4000-8000-000000000206",
                kind: "answerRecap",
                sceneId: "00000000-0000-4000-8000-000000000304",
              },
            ],
            scenes: {
              "00000000-0000-4000-8000-000000000301": {
                id: "00000000-0000-4000-8000-000000000301",
                kind: "opening",
                title: "Cinema Premiere Opening",
                subtitle: "Full-Stage Coverage Without Legacy Countdown",
                mediaUrl: openingAsset.url,
                mediaType: "image",
                stageLayout: "cinema",
                mediaFit: "cover",
                logoPosition: "top",
                textOverlay: true,
                endBehavior: "holdFrame",
                durationMs: 30000,
                advance: "manual",
              },
              "00000000-0000-4000-8000-000000000302": {
                id: "00000000-0000-4000-8000-000000000302",
                kind: "media",
                title: "Musical Intermission Audio Scene",
                mediaUrl: "/sounds/answersMusic.mp3",
                mediaType: "audio",
                showControls: true,
                volume: 0.7,
                loop: false,
                durationMs: 30000,
                advance: "manual",
              },
              "00000000-0000-4000-8000-000000000303": {
                id: "00000000-0000-4000-8000-000000000303",
                kind: "animation",
                title: "Celebration Stage Effect",
                preset: "confetti",
                lottieUrl: uploadedLottie.url,
                lottieLoop: true,
                durationMs: 30000,
                advance: "manual",
              },
              "00000000-0000-4000-8000-000000000304": {
                id: "00000000-0000-4000-8000-000000000304",
                kind: "answerRecap",
                title: "Cumulative Show Answer Recap",
                subtitle: "Survey and quiz highlights",
                startQuestionId: "00000000-0000-4000-8000-000000000101",
                mode: "correctAnswer",
                durationMs: 30000,
                advance: "manual",
              },
            },
            defaults: {
              newQuestionMode: "quiz",
              leaderboardPolicy: "cardOnly",
              advanceMode: "manual",
              stageAnimations: {
                questionEntrance: {
                  preset: "pop-bounce",
                  durationMs: 700,
                  timing: "simultaneous",
                  staggerMs: 90,
                },
                answerEntrance: {
                  preset: "cascade",
                  durationMs: 650,
                  timing: "sequential",
                  staggerMs: 80,
                },
                answerBadgeEntrance: {
                  preset: "fan-flip",
                  durationMs: 550,
                  timing: "sequential",
                  staggerMs: 80,
                },
                resultsRevealEntrance: {
                  preset: "wipe-ripple",
                  durationMs: 700,
                  timing: "sequential",
                  staggerMs: 90,
                },
              },
            },
            perQuestion: {
              "00000000-0000-4000-8000-000000000101": {
                questionDecoration: {
                  preset: "glow-sweep",
                  enabled: true,
                },
              },
              "00000000-0000-4000-8000-000000000102": {
                questionDecoration: {
                  preset: "pulse-bar",
                  enabled: true,
                },
              },
            },
          },
        },
      },
    )
    expect(createRes.status()).toBe(201)
    const { quizId } = (await createRes.json()) as { quizId: string }
    await managerPage.goto(`/manager/quizz/${quizId}`)
    await managerPage.getByTestId("editor-mode-advanced").click()
    const recapCard = managerPage
      .getByTestId("editor-timeline")
      .getByTestId("editor-scene-card")
      .filter({
        has: managerPage.getByRole("button", {
          name: "Cumulative Show Answer Recap",
          exact: true,
        }),
      })
    await expect(recapCard).toHaveCount(1)
    await recapCard.getByTestId("editor-scene-select").click()
    const editorStage = managerPage.getByTestId("studio-scene-preview-stage")
    const editorRecap = editorStage.getByTestId("tadazz-screen-recap")
    await expect(editorRecap).toBeVisible()
    await expect(
      editorRecap.getByText("Cumulative Show Answer Recap", { exact: true }),
    ).toBeVisible()
    // Editor samples carry no responses: a survey retains its question text,
    // while a quiz can show its authored correct answer without invented votes.
    await expect(editorRecap.locator(".answer-title")).toHaveText([
      "Wave 2 Survey Q1: Which visual theme do you prefer?",
      "Mars",
    ])
    await expect(
      editorStage.locator("[data-editor-preview-fallback]"),
    ).toHaveCount(0)
    const stableRecap = await editorRecap.elementHandle()
    // Aspect controls live in the preview panel, separate from the visible stage.
    const previewPanel = await openStudioPanel(managerPage, "preview")
    // Layout changes allocate equivalent scene data without replaying the scene.
    for (const aspect of ["4-3", "16-9"]) {
      const control = previewPanel.getByTestId(
        `studio-preview-aspect-${aspect}`,
      )
      await control.click()
      await expect(control).toHaveAttribute("aria-pressed", "true")
      await expect(editorStage).toHaveAttribute(
        "data-preview-aspect",
        aspect.replace("-", ":"),
      )
      await managerPage.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          }),
      )
      expect(await stableRecap.evaluate((element) => element.isConnected)).toBe(
        true,
      )
    }
    await stableRecap.dispose()
    await saveScreenshot(managerPage, "wave2_editor_native_recap.png")
    await managerPage.goto("/manager/config")
    const pin = await createGame(
      managerPage,
      "Wave 2 Cinema, Audio, Motion & Answer Recap Show",
    )
    expect(pin).toMatch(/^\d{6}$/u)
    await setManualProgression(managerPage)
    const gameIdMatch = /\/party\/manager\/([^/?#]+)/u.exec(managerPage.url())
    expect(gameIdMatch).not.toBeNull()
    const { 1: gameId } = gameIdMatch!
    const spectatorContext = await browser.newContext({
      viewport: {
        width: 1920,
        height: 1080,
      },
    })
    const spectatorPage = await spectatorContext.newPage()
    await observeNativeMotion(spectatorPage)
    await spectatorPage.goto(`/display/${gameId}`)
    await expect(
      spectatorPage.locator('[data-testid="audience-display"]'),
    ).toBeVisible({
      timeout: 15_000,
    })
    const playerContext = await browser.newContext({
      viewport: {
        width: 390,
        height: 844,
      },
    })
    const playerPage = await playerContext.newPage()
    await joinGame(playerPage, pin, "RecapTester")
    await expect(
      managerPage
        .getByTestId("host-bottom-players-btn")
        .getByTestId("host-connected-counter"),
    ).toHaveText(/^1(?:\s*\/\s*1)?$/u)
    await startGame(managerPage)

    // 1. Cinema Opening Scene renders immediately without legacy 6s countdown
    await expect(
      spectatorPage.locator('[data-testid="scene-cinema-backdrop"]'),
    ).toBeVisible({
      timeout: 8_000,
    })
    await expect(
      spectatorPage
        .getByTestId("tadazz-screen-message")
        .getByText("Cinema Premiere Opening", { exact: true }),
    ).toBeVisible()
    await expect(
      spectatorPage
        .getByTestId("tadazz-screen-message")
        .getByText("Full-Stage Coverage Without Legacy Countdown", {
          exact: true,
        }),
    ).toBeVisible()
    await spectatorPage.waitForTimeout(800)
    await assertZeroStageScroll(spectatorPage, "Cinema Opening @ 1920x1080")
    await saveScreenshot(spectatorPage, "06_wave2_cinema_opening_1080p.png")

    // 2. The responsive player retains the authored underline; the native stage owns its choreography.
    await advanceAuthoredScene(managerPage)
    await expect(
      playerPage.locator('[data-testid="question-decoration-underline"]'),
    ).toHaveAttribute("data-tada-underline", "glow-sweep", {
      timeout: 10_000,
    })

    // Wait for SELECT_ANSWER on Q1 and let 700ms entrance animation settle
    await expect(
      spectatorPage.getByTestId("tadazz-card-0").locator(".answer-title"),
    ).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      spectatorPage.getByTestId("tadazz-card-0").locator(".answer-title"),
    ).toHaveText("Solar Flare")
    await waitForRecordedVoting(
      observations,
      "00000000-0000-4000-8000-000000000101",
    )
    await assertNativeQuestionMotion(spectatorPage, 3)
    await spectatorPage.waitForTimeout(850)
    await saveScreenshot(spectatorPage, "07_wave2_q1_decoration_and_motion.png")

    // Player selects Option 0 ("Solar Flare") on Survey Q1
    await playerPage
      .getByRole("button", {
        name: /Solar Flare/i,
      })
      .click()
    await endRecordedVote(managerPage, observations, {
      questionId: "00000000-0000-4000-8000-000000000101",
      count: 1,
    })

    // Advance from Q1 SHOW_RESPONSES to Media Audio Scene
    await next(managerPage)
    await expect(
      spectatorPage.locator('[data-testid="scene-audio-container"]'),
    ).toBeVisible({
      timeout: 15_000,
    })
    const nativeAudio = spectatorPage.getByTestId("scene-audio")
    await expect(nativeAudio).toHaveCount(1)
    await expect(nativeAudio).toBeVisible()
    await expect(nativeAudio).toHaveAttribute("src", "/sounds/answersMusic.mp3")
    await expect(nativeAudio).toHaveJSProperty("volume", 0.7)
    await expect(nativeAudio).toHaveJSProperty("loop", false)
    await expect(
      spectatorPage.getByTestId("tadazz-cinematic-scene"),
    ).toHaveCount(0)
    await assertZeroStageScroll(spectatorPage, "Media Audio Scene @ 1920x1080")
    await saveScreenshot(spectatorPage, "08_wave2_media_audio_scene.png")

    // Advance from Media Audio Scene to Standalone Animation + Lottie Fixture Scene
    await advanceAuthoredScene(managerPage)
    await expect(
      spectatorPage.locator('[data-testid="scene-animation-preset-confetti"]'),
    ).toBeVisible({
      timeout: 15_000,
    })
    await expect(nativeAudio).toHaveCount(0)
    await expect(spectatorPage.getByTestId("scene-lottie-player")).toHaveCount(
      1,
    )
    await expect(spectatorPage.getByTestId("scene-lottie-player")).toBeVisible()
    await expect(
      spectatorPage.getByTestId("tadazz-cinematic-scene"),
    ).toHaveCount(0)
    await assertZeroStageScroll(
      spectatorPage,
      "Animation + Lottie Fixture Scene @ 1920x1080",
    )
    await saveScreenshot(spectatorPage, "09_wave2_animation_lottie_scene.png")

    // Advance to Quiz Q2
    await advanceAuthoredScene(managerPage)
    await expect(
      spectatorPage.getByTestId("tadazz-card-1").locator(".answer-title"),
    ).toBeVisible({
      timeout: 15_000,
    })

    await expect(
      spectatorPage.getByTestId("tadazz-card-1").locator(".answer-title"),
    ).toHaveText("Mars")
    await waitForRecordedVoting(
      observations,
      "00000000-0000-4000-8000-000000000102",
    )
    // Player votes for Option 1 ("Mars", the correct answer)
    await playerPage
      .getByRole("button", {
        name: /Mars/i,
      })
      .click()
    await endRecordedVote(managerPage, observations, {
      questionId: "00000000-0000-4000-8000-000000000102",
      count: 1,
    })

    // Advance from Q2 SHOW_RESPONSES to Cumulative Answer Recap Scene!
    await next(managerPage)
    const recap = spectatorPage.getByTestId("tadazz-screen-recap")
    await expect(recap).toBeVisible({
      timeout: 15_000,
    })
    await expect(recap.locator(".choice-slot")).toHaveCount(2)
    for (const [index, answer] of ["Solar Flare", "Mars"].entries()) {
      const card = recap.getByTestId(`tadazz-card-${index}`)
      await expect(card).toBeVisible()
      await expect(card).toBeDisabled()
      await expect(card.locator(".answer-title")).toHaveText(answer)
    }

    await expect(
      recap.getByRole("heading", {
        name: "Cumulative Show Answer Recap",
        exact: true,
      }),
    ).toBeVisible()
    await expect(recap.getByTestId("tadazz-recap-subtitle")).toHaveText(
      "Survey and quiz highlights",
    )
    await expect(recap.getByTestId("tadazz-recap-subtitle")).toBeVisible()
    await expect(managerPage.getByTestId("host-next-screen-btn")).toBeEnabled()
    await expect(playerPage.getByTestId("scene-awaiting-host")).toBeVisible()

    // Verify Q1 (survey) and Q2 (quiz) answers appear in the cumulative recap without exposing player names/phones
    const recapText =
      (await spectatorPage
        .locator('[data-testid="tadazz-screen-recap"]')
        .textContent()) ?? ""
    expect(recapText).toContain("Solar Flare")
    expect(recapText).toContain("Mars")
    expect(recapText).not.toContain("RecapTester")
    const stageViewports = [
      {
        width: 1920,
        height: 1080,
        name: "1920x1080",
      },
      {
        width: 1366,
        height: 768,
        name: "1366x768",
      },
      {
        width: 1280,
        height: 800,
        name: "1280x800",
      },
      {
        width: 1024,
        height: 768,
        name: "1024x768",
      },
      {
        width: 800,
        height: 600,
        name: "800x600_4_3",
      },
      {
        width: 768,
        height: 1024,
        name: "768x1024",
      },
      {
        width: 390,
        height: 844,
        name: "390x844",
      },
      {
        width: 320,
        height: 568,
        name: "320x568",
      },
    ]
    for (const vp of stageViewports) {
      await spectatorPage.setViewportSize({
        width: vp.width,
        height: vp.height,
      })
      await assertZeroStageScroll(
        spectatorPage,
        `Cumulative Answer Recap @ ${vp.name}`,
      )
      await Promise.all([
        assertVisualContainment(
          spectatorPage,
          '[data-testid="tadazz-screen-recap"]',
          `Answer Recap Container @ ${vp.name}`,
          { checkTextCompleteness: false },
        ),
        assertVisualContainment(
          spectatorPage,
          '[data-testid="tadazz-screen-recap"] [data-testid="tadazz-recap-title"]',
          `Answer Recap Title @ ${vp.name}`,
        ),
        assertVisualContainment(
          spectatorPage,
          '[data-testid="tadazz-screen-recap"] [data-testid="tadazz-recap-subtitle"]',
          `Answer Recap Subtitle @ ${vp.name}`,
        ),
        ...[0, 1].flatMap((index) => [
          assertVisualContainment(
            spectatorPage,
            `[data-testid="tadazz-screen-recap"] [data-testid="tadazz-card-${index}"]`,
            `Answer Recap Card ${index + 1} @ ${vp.name}`,
            { checkTextCompleteness: false },
          ),
          assertVisualContainment(
            spectatorPage,
            `[data-testid="tadazz-screen-recap"] [data-testid="tadazz-card-${index}"] .answer-title`,
            `Answer Recap Answer ${index + 1} @ ${vp.name}`,
          ),
        ]),
      ])
      await assertNoVerticalOverlap(
        spectatorPage,
        '[data-testid="tadazz-screen-recap"] .answers',
        '[data-testid="tadazz-screen-recap"] .story-finale',
        `Answer Recap Cards and Authored Text @ ${vp.name}`,
      )

      if (
        vp.name === "1920x1080" ||
        vp.name === "800x600_4_3" ||
        vp.name === "390x844" ||
        vp.name === "320x568"
      ) {
        await saveScreenshot(
          spectatorPage,
          `10_wave2_answer_recap_${vp.name}.png`,
        )
      }
    }
    await spectatorContext.close()
    await playerContext.close()
  })
})
