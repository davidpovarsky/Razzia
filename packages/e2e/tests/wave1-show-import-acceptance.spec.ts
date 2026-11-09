// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import type {
  TadaShowV1,
  AuthoredQuizCard,
  AuthoredSurveyCard,
} from "../../../extensions/src/core/show-authoring-schema"
/* oxlint-disable eslint/no-await-in-loop, eslint/no-plusplus */
import fs from "node:fs"
import { join } from "node:path"
import type { Page } from "@playwright/test"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { loginManager } from "@razzia/e2e/utils/manager"
import {
  createZipArchive,
  exportTadaShowWorkbook,
  extractZipEntries,
  parseTadaShowWorkbook,
} from "@razzia/extensions/core"

const SCREENSHOT_DIR = join(
  import.meta.dirname,
  "../test-results/show-import-acceptance",
)

const saveScreenshot = async (page: Page, filename: string) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filepath = join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath, fullPage: true })
}

interface TelemetryCollector {
  assertClean: () => void
  pageErrors: string[]
  consoleErrors: string[]
  failedRequests: string[]
}

const setupTelemetry = (page: Page): TelemetryCollector => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const failedRequests: string[] = []

  page.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message)
  })

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text())
    }
  })

  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText

    if (
      failure &&
      !failure.includes("ERR_ABORTED") &&
      !req.url().includes("example.com")
    ) {
      failedRequests.push(`${req.method()} ${req.url()} - ${failure}`)
    }
  })

  page.on("response", (res) => {
    if (res.status() >= 500) {
      failedRequests.push(
        `HTTP ${res.status()} ${res.request().method()} ${res.url()}`,
      )
    }
  })

  return {
    assertClean: () => {
      expect(
        pageErrors,
        `Browser page errors encountered:\n${pageErrors.join("\n")}`,
      ).toEqual([])

      const fatalErrors = consoleErrors.filter(
        (err) =>
          err.includes("reading 'answers'") ||
          err.includes("Cannot read properties of undefined") ||
          err.includes("TypeError") ||
          err.includes("Uncaught"),
      )
      expect(
        fatalErrors,
        `Fatal browser console errors encountered:\n${fatalErrors.join("\n")}`,
      ).toEqual([])

      expect(
        failedRequests,
        `Failed network requests encountered:\n${failedRequests.join("\n")}`,
      ).toEqual([])
    },
    pageErrors,
    consoleErrors,
    failedRequests,
  }
}

const openManageQuizzTab = async (page: Page) => {
  await loginManager(page)
  await page
    .getByRole("button", { name: t("manager:tabs.quizz"), exact: true })
    .click()
  await expect(page.getByTestId("import-show-button")).toBeVisible()
}

test.describe("TADA Studio Show Import/Export Acceptance (JSON + Excel)", () => {
  test("IMPORT01: Manager import area renders original design tokens, template download, and export affordances at 1024 & 1280 viewports", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)

    // Viewport 1280
    await page.setViewportSize({ width: 1280, height: 800 })
    await openManageQuizzTab(page)
    await expect(page.getByTestId("import-show-button")).toBeVisible()
    await expect(page.getByTestId("download-template-xlsx")).toBeVisible()
    await saveScreenshot(page, "01_manager_manage_quizz_1280.png")

    // Viewport 1024
    await page.setViewportSize({ width: 1024, height: 768 })
    await saveScreenshot(page, "02_manager_manage_quizz_1024.png")

    // Template download verification
    const downloadPromise = page.waitForEvent("download")
    await page.getByTestId("download-template-xlsx").click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe("TADA_Show_Template_v1.xlsx")

    telemetry.assertClean()
  })

  test("IMPORT02: Import friendly .tada.json with preflight preview, warnings, and editor opening with ordered cards & media", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openManageQuizzTab(page)

    const sampleJsonPath = join(
      import.meta.dirname,
      "../../../docs/extensions/show-import/SAMPLE.tada.json",
    )

    // Trigger file input
    const fileInput = page.getByTestId("import-file-input")
    await fileInput.setInputFiles(sampleJsonPath)

    // Verify Preflight Modal opens
    const dialog = page.getByTestId("show-import-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText("Tada Interactive Studio Showcase")
    await expect(dialog).toContainText("Tada Show JSON (.tada.json)")

    // Verify warning for remote HTTPS media
    await expect(page.getByTestId("show-import-warnings")).toBeVisible()

    // Capture dialog screenshots at 1024 and 1280
    await saveScreenshot(page, "03_preflight_dialog_1280.png")
    await page.setViewportSize({ width: 1024, height: 768 })
    await saveScreenshot(page, "04_preflight_dialog_1024.png")

    // Commit Import
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.getByTestId("show-import-commit").click()

    // Expect navigation to imported studio editor
    await expect(page).toHaveURL(/\/manager\/quizz\/[a-zA-Z0-9_-]+$/u)

    // Verify Studio Shell and Header Rows
    await expect(page.getByTestId("studio-tab-questions")).toBeVisible()
    await expect(page.getByTestId("editor-save-btn")).toBeVisible()
    await expect(page.getByTestId("editor-exit-btn")).toBeVisible()

    // Verify cards loaded in Question Studio
    await page.waitForTimeout(500)
    await saveScreenshot(page, "05_imported_show_editor_1280.png")

    telemetry.assertClean()
  })

  test("IMPORT03: Import multi-sheet Excel (.xlsx), export as Tada Excel (.xlsx), and verify zero writes on cancel", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openManageQuizzTab(page)

    const sampleXlsxPath = join(
      import.meta.dirname,
      "../../../docs/extensions/show-import/SAMPLE.xlsx",
    )

    // Select XLSX
    const fileInput = page.getByTestId("import-file-input")
    await fileInput.setInputFiles(sampleXlsxPath)

    // Verify Dialog for XLSX
    const dialog = page.getByTestId("show-import-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText("Tada Multi-Sheet Excel (.xlsx)")

    // Test Cancel Safety: Zero writes
    await page.getByTestId("show-import-cancel").click()
    await expect(dialog).not.toBeVisible()

    // Select again and commit
    await fileInput.setInputFiles(sampleXlsxPath)
    await expect(dialog).toBeVisible()
    await page.getByTestId("show-import-commit").click()

    // Verify newly imported quiz
    await expect(page).toHaveURL(/\/manager\/quizz\/[a-zA-Z0-9_-]+$/u)
    await saveScreenshot(page, "06_imported_xlsx_editor_1280.png")

    // Return to manage and test Export as Tada Excel
    await page.goto("/manager/config")
    await page
      .getByRole("button", { name: t("manager:tabs.quizz"), exact: true })
      .click()
    const exportXlsxBtn = page.locator("[data-testid^='export-xlsx-']").first()
    await expect(exportXlsxBtn).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await exportXlsxBtn.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/)

    telemetry.assertClean()
  })

  test("IMPORT04: Export as Friendly Tada JSON (.tada.json) and verify unsafe URL error blocking", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openManageQuizzTab(page)

    // Test Export as Tada JSON
    const exportTadaJsonBtn = page
      .locator("[data-testid^='export-tada-json-']")
      .first()
    await expect(exportTadaJsonBtn).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await exportTadaJsonBtn.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.tada\.json$/)

    const downloadStream = await download.createReadStream()

    if (downloadStream) {
      const chunks: Buffer[] = []
      for await (const chunk of downloadStream) {
        chunks.push(Buffer.from(chunk as Uint8Array))
      }
      const downloadedContent = Buffer.concat(chunks).toString("utf-8")
      const parsedJson = JSON.parse(downloadedContent) as TadaShowV1
      expect(parsedJson.format).toBe("tada-show")
      expect(parsedJson.version).toBe(1)
      expect(Array.isArray(parsedJson.cards)).toBe(true)

      // Verify shareable mode: if roster setting exists, participants must be empty []
      const rosterSetting = parsedJson.settings?.find(
        (s: NonNullable<TadaShowV1["settings"]>[number]) =>
          s.scope === "roster" && s.property === "config",
      )

      if (rosterSetting) {
        expect(rosterSetting.valueJson).toMatchObject({ participants: [] })
      }
    }

    // Test Unsafe URL error blocking:
    const unsafeJson = {
      format: "tada-show",
      version: 1,
      title: "Malicious Show",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Payload question?",
          media: {
            type: "image",
            url: "javascript:alert(document.cookie)",
          },
          answers: [{ text: "A" }, { text: "B" }],
          correctAnswers: [1],
        },
      ],
      settings: [],
    }

    const tmpUnsafeFile = join(SCREENSHOT_DIR, "temp_unsafe.tada.json")
    fs.writeFileSync(tmpUnsafeFile, JSON.stringify(unsafeJson, null, 2))

    const fileInput = page.getByTestId("import-file-input")
    await fileInput.setInputFiles(tmpUnsafeFile)

    // Dialog must show error banner and commit must be disabled
    const dialog = page.getByTestId("show-import-dialog")
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId("show-import-errors")).toBeVisible()
    await expect(page.getByTestId("show-import-commit")).toBeDisabled()

    await saveScreenshot(page, "07_unsafe_media_rejection_dialog.png")

    // Cancel safely
    await page.getByTestId("show-import-cancel").click()
    await expect(dialog).not.toBeVisible()

    fs.rmSync(tmpUnsafeFile, { force: true })

    telemetry.assertClean()
  })

  test("IMPORT05: Import valid show with Hebrew note and per-question interlude, save in editor, reload, export .tada.json and .xlsx, verify byte content", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openManageQuizzTab(page)

    const hebrewNote =
      'שעשועון הדגמה חי בעברית - הערת הפקה סודית 🌟\nשורה שנייה עם הנחיות למנחה: "נא להמתין לצליל!"'
    const quizInterlude = {
      kind: "title" as const,
      title: "מעברון שאלת בונוס",
      durationMs: 4000,
      advance: "auto" as const,
    }
    const surveyInterlude = {
      kind: "video" as const,
      title: "קליפ סקר קהל",
      url: "https://example.com/media/survey-clip.mp4",
      durationMs: 7000,
      advance: "manual" as const,
    }

    const syntheticShow: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "מופע טריוויה וסקר חי בעברית",
      note: hebrewNote,
      baseGameMode: "quiz",
      defaults: {
        newQuestionMode: "quiz",
        leaderboardPolicy: "cardOnly",
        advanceMode: "auto",
      },
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "מהו ההר הגבוה ביותר בעולם?",
          category: "גאוגרפיה",
          timeSeconds: 20,
          cooldownSeconds: 3,
          maxPoints: 1000,
          penalty: 0,
          answers: [
            { text: "אוורסט", display: "text" },
            { text: "קילימנג'רו", display: "text" },
          ],
          correctAnswers: [1],
          interlude: quizInterlude,
        },
        {
          key: "POLL01",
          kind: "survey",
          questionType: "single",
          question: "איזה סגנון מוזיקה מועדף עליכם?",
          category: "מוזיקה",
          timeSeconds: 15,
          cooldownSeconds: 3,
          maxPoints: 0,
          penalty: 0,
          answers: [{ text: "פופ" }, { text: "רוק" }],
          interlude: surveyInterlude,
        },
      ],
      settings: [
        {
          scope: "leaderboard",
          targetKey: "show",
          property: "mode",
          valueJson: "selected",
        },
      ],
    }

    const tmpJsonFile = join(SCREENSHOT_DIR, "temp_import05.tada.json")
    fs.writeFileSync(
      tmpJsonFile,
      JSON.stringify(syntheticShow, null, 2),
      "utf-8",
    )

    // 1. Upload valid .tada.json
    const fileInput = page.getByTestId("import-file-input")
    await fileInput.setInputFiles(tmpJsonFile)

    const dialog = page.getByTestId("show-import-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText("מופע טריוויה וסקר חי בעברית")

    // 2. Commit Import
    await page.getByTestId("show-import-commit").click()

    // 3. Navigate to editor
    await expect(page).toHaveURL(/\/manager\/quizz\/[a-zA-Z0-9_-]+$/u)
    await expect(page.getByTestId("editor-save-btn")).toBeVisible()
    await saveScreenshot(page, "08_import05_show_editor_1280.png")

    // 4. Save harmless change in editor
    await page.getByTestId("editor-save-btn").click()
    await expect(page).toHaveURL(/\/manager\/config$/u)
    await page
      .getByRole("button", { name: t("manager:tabs.quizz"), exact: true })
      .click()

    // 5. Export as .tada.json and verify byte content
    const exportTadaJsonBtn = page
      .locator("[data-testid^='export-tada-json-']")
      .first()
    await expect(exportTadaJsonBtn).toBeVisible()

    const jsonDownloadPromise = page.waitForEvent("download")
    await exportTadaJsonBtn.click()
    const jsonDownload = await jsonDownloadPromise

    const jsonStream = await jsonDownload.createReadStream()
    const jsonChunks: Buffer[] = []

    if (jsonStream) {
      for await (const chunk of jsonStream) {
        jsonChunks.push(Buffer.from(chunk as Uint8Array))
      }
    }

    const downloadedJson = JSON.parse(
      Buffer.concat(jsonChunks).toString("utf-8"),
    ) as Omit<TadaShowV1, "cards"> & {
      cards: [AuthoredQuizCard, AuthoredSurveyCard]
    }
    expect(downloadedJson.format).toBe("tada-show")
    expect(downloadedJson.title).toBe("מופע טריוויה וסקר חי בעברית")
    expect(downloadedJson.note).toBe(hebrewNote)
    expect(downloadedJson.cards).toHaveLength(2)

    const { 0: downloadedQ1 } = downloadedJson.cards
    expect(downloadedQ1.interlude).toEqual(quizInterlude)

    const { 1: downloadedSurvey } = downloadedJson.cards
    expect(downloadedSurvey.interlude).toEqual(surveyInterlude)

    // 6. Export as .xlsx and verify byte content
    const exportXlsxBtn = page.locator("[data-testid^='export-xlsx-']").first()
    await expect(exportXlsxBtn).toBeVisible()

    const xlsxDownloadPromise = page.waitForEvent("download")
    await exportXlsxBtn.click()
    const xlsxDownload = await xlsxDownloadPromise

    const xlsxStream = await xlsxDownload.createReadStream()
    const xlsxChunks: Buffer[] = []

    if (xlsxStream) {
      for await (const chunk of xlsxStream) {
        xlsxChunks.push(Buffer.from(chunk as Uint8Array))
      }
    }

    const xlsxBytes = new Uint8Array(Buffer.concat(xlsxChunks))
    const parsedXlsx = parseTadaShowWorkbook(xlsxBytes)

    expect(parsedXlsx.title).toBe("מופע טריוויה וסקר חי בעברית")
    expect(parsedXlsx.note).toBe(hebrewNote)
    expect(parsedXlsx.cards).toHaveLength(2)
    expect((parsedXlsx.cards[0] as AuthoredQuizCard).interlude).toEqual(
      quizInterlude,
    )
    expect((parsedXlsx.cards[1] as AuthoredSurveyCard).interlude).toEqual(
      surveyInterlude,
    )

    fs.rmSync(tmpJsonFile, { force: true })
    telemetry.assertClean()
  })

  test("IMPORT06: Reject invalid targetKey in JSON/XLSX and malformed interludeJson with zero server writes", async ({
    page,
  }) => {
    const telemetry = setupTelemetry(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openManageQuizzTab(page)

    const initialQuizzesCount = await page
      .locator("[data-testid^='export-tada-json-']")
      .count()

    // 1. Invalid targetKey in JSON
    const invalidTargetJson = {
      format: "tada-show",
      version: 1,
      title: "Invalid Target Key Show",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Question?",
          answers: [{ text: "A" }, { text: "B" }],
          correctAnswers: [1],
        },
      ],
      settings: [
        {
          scope: "audio",
          targetKey: "NOT_THE_SHOW",
          property: "cues",
          valueJson: {},
        },
      ],
    }

    const tmpInvalidJson = join(
      SCREENSHOT_DIR,
      "temp_import06_invalid_target.tada.json",
    )
    fs.writeFileSync(
      tmpInvalidJson,
      JSON.stringify(invalidTargetJson, null, 2),
      "utf-8",
    )

    const fileInput = page.getByTestId("import-file-input")
    await fileInput.setInputFiles(tmpInvalidJson)

    const dialog = page.getByTestId("show-import-dialog")
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId("show-import-errors")).toBeVisible()
    await expect(page.getByTestId("show-import-errors")).toContainText(
      "settings.0.targetKey",
    )
    await expect(page.getByTestId("show-import-commit")).toBeDisabled()

    await saveScreenshot(page, "09_import06_invalid_target_error.png")

    // Cancel safely
    await page.getByTestId("show-import-cancel").click()
    await expect(dialog).not.toBeVisible()

    // Assert zero writes
    const countAfterJsonCancel = await page
      .locator("[data-testid^='export-tada-json-']")
      .count()
    expect(countAfterJsonCancel).toBe(initialQuizzesCount)

    // 2. Malformed interludeJson in XLSX Column T
    const validBaseShow: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "Malformed Column T Show",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Question?",
          answers: [{ text: "A" }, { text: "B" }],
          correctAnswers: [1],
        },
      ],
      settings: [],
    }

    const validXlsxBuffer = exportTadaShowWorkbook(validBaseShow)
    const entries = extractZipEntries(validXlsxBuffer)
    const sheet3Bytes = entries.get("xl/worksheets/sheet3.xml")!
    const sheet3Xml = new TextDecoder("utf-8").decode(sheet3Bytes)

    // Inject malformed JSON into Questions!T2
    const corruptedXml = sheet3Xml.replace(
      /<c r="T2"[^>]*>[\s\S]*?<\/c>/u,
      '<c r="T2" t="inlineStr"><is><t>{badJson:notClosed</t></is></c>',
    )
    entries.set(
      "xl/worksheets/sheet3.xml",
      new TextEncoder().encode(corruptedXml),
    )

    const files: Array<{ name: string; data: Uint8Array }> = []
    for (const [name, data] of entries.entries()) {
      files.push({ name, data })
    }
    const corruptedXlsxBuffer = createZipArchive(files)

    const tmpMalformedXlsx = join(
      SCREENSHOT_DIR,
      "temp_import06_malformed_t.xlsx",
    )
    fs.writeFileSync(tmpMalformedXlsx, corruptedXlsxBuffer)

    await fileInput.setInputFiles(tmpMalformedXlsx)

    await expect(dialog).toBeVisible()
    await expect(page.getByTestId("show-import-errors")).toBeVisible()
    await expect(page.getByTestId("show-import-errors")).toContainText(
      "Questions!T2",
    )
    await expect(page.getByTestId("show-import-commit")).toBeDisabled()

    await saveScreenshot(page, "10_import06_malformed_interlude_error.png")

    // Cancel safely
    await page.getByTestId("show-import-cancel").click()
    await expect(dialog).not.toBeVisible()

    // Assert zero writes
    const countAfterXlsxCancel = await page
      .locator("[data-testid^='export-tada-json-']")
      .count()
    expect(countAfterXlsxCancel).toBe(initialQuizzesCount)

    fs.rmSync(tmpInvalidJson, { force: true })
    fs.rmSync(tmpMalformedXlsx, { force: true })

    telemetry.assertClean()
  })
})
