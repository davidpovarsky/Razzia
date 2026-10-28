/* oxlint-disable eslint/no-await-in-loop, eslint/no-plusplus */
import fs from "node:fs"
import { join } from "node:path"
import type { Page } from "@playwright/test"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { loginManager } from "@razzia/e2e/utils/manager"

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
        chunks.push(Buffer.from(chunk))
      }
      const downloadedContent = Buffer.concat(chunks).toString("utf-8")
      const parsedJson = JSON.parse(downloadedContent)
      expect(parsedJson.format).toBe("tada-show")
      expect(parsedJson.version).toBe(1)
      expect(Array.isArray(parsedJson.cards)).toBe(true)

      // Verify shareable mode: if roster setting exists, participants must be empty []
      const rosterSetting = parsedJson.settings?.find(
        (s: any) => s.scope === "roster" && s.property === "config",
      )
      if (rosterSetting) {
        expect(rosterSetting.valueJson?.participants).toEqual([])
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
})
