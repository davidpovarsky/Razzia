import {
  normalizeLegacyQuizz,
  quizzValidator,
  type QuizzValidated,
} from "@razzia/common/validators/quizz"
import { isSafeMediaUrl, validateBundleMedia } from "./media"
import { isEnhancedBundle, type EnhancedBundle } from "./bundle"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "./show-authoring-convert"
import { tadaShowV1Schema, type TadaShowV1 } from "./show-authoring-schema"
import { parseTadaShowWorkbook } from "./show-workbook"
import { resolveShowTheme } from "./show-themes/resolve"
import { isQuizExtrasV2 } from "./studio-migrate"
import { zipInventoryHasEntry } from "./packages/zip-detection"

export type ImportFormatType =
  "legacy-json" | "enhanced-bundle" | "tada-json" | "tada-xlsx"

export interface ShowImportIssue {
  severity: "error" | "warning"
  code: string
  messageKey: string
  path?: string
  sheet?: string
  row?: number
  column?: string
  cardKey?: string
}

export interface ShowTimelinePreviewItem {
  order: number
  key: string
  kind: string
  title?: string
  questionText?: string
  playMode?: "quiz" | "survey"
  advance?: string
  hasMedia: boolean
  answerCount?: number
  answerImageCount?: number
}

export interface ShowImportSummary {
  format: ImportFormatType
  title: string
  totalCards: number
  questionCount: number
  quizCount: number
  surveyCount: number
  sceneCount: number
  mediaCount: number
  answerImageCount: number
  timelinePreview: ShowTimelinePreviewItem[]
}

export interface ShowPreflightResult {
  ok: boolean
  format?: ImportFormatType
  summary?: ShowImportSummary
  issues: ShowImportIssue[]
  normalizedBundleDraft?: EnhancedBundle
  legacyQuizzDraft?: QuizzValidated
}

export function preflightShowImport(
  rawInput: string | ArrayBuffer | Uint8Array,
  filename = "upload",
): ShowPreflightResult {
  const result = inspectShowImport(rawInput, filename)
  const extras = result.normalizedBundleDraft?.extras

  if (extras && isQuizExtrasV2(extras) && extras.defaults.showTheme) {
    const theme = resolveShowTheme({
      selection: extras.defaults.showTheme,
      role: "manager",
    })
    for (const diagnostic of theme.diagnostics) {
      result.issues.push({
        severity: "warning",
        code: `THEME_${diagnostic.code}`,
        messageKey:
          diagnostic.code === "unknown-theme"
            ? "extensions:themes.unknownTheme"
            : "extensions:themes.invalidChoice",
        path: "defaults.showTheme",
      })
    }
  }

  return result
}

/**
 * Pure preflight function that detects format, parses and validates completely
 * without any disk writes, side effects, or remote network calls.
 */
function inspectShowImport(
  rawInput: string | ArrayBuffer | Uint8Array,
  filename = "upload",
): ShowPreflightResult {
  const issues: ShowImportIssue[] = []
  const lowerName = filename.toLowerCase()

  // 1. Check for XLSX (either filename ending with .xlsx or binary buffer beginning with PK zip signature)
  const isBinary =
    rawInput instanceof ArrayBuffer || rawInput instanceof Uint8Array
  let isZipBuffer = false

  let uint8Buf: Uint8Array | null = null
  if (isBinary) {
    uint8Buf =
      rawInput instanceof Uint8Array ? rawInput : new Uint8Array(rawInput)
    if (
      uint8Buf.length >= 4 &&
      uint8Buf[0] === 0x50 &&
      uint8Buf[1] === 0x4b &&
      uint8Buf[2] === 0x03 &&
      uint8Buf[3] === 0x04
    ) {
      isZipBuffer = true
    }
  }

  if (
    lowerName.endsWith(".tadazz") ||
    (isZipBuffer && uint8Buf && zipInventoryHasEntry(uint8Buf, "manifest.json"))
  ) {
    return {
      ok: false,
      issues: [{
        severity: "error",
        code: "PACKAGE_IMPORT_REQUIRED",
        messageKey: "extensions:packages.usePackageImport",
      }],
    }
  }

  // XLSX has an OOXML content-types inventory. An arbitrary ZIP is never XLSX.
  const workbookZip = isZipBuffer && uint8Buf &&
    zipInventoryHasEntry(uint8Buf, "[Content_Types].xml")

  if (isZipBuffer && !workbookZip && !lowerName.endsWith(".xlsx")) {
    return {
      ok: false,
      issues: [{
        severity: "error",
        code: "UNKNOWN_ARCHIVE",
        messageKey: "extensions:packages.unknownArchive",
      }],
    }
  }

  if (lowerName.endsWith(".xlsx") || workbookZip) {
    if (!uint8Buf) {
      issues.push({
        severity: "error",
        code: "INVALID_BINARY",
        messageKey: "errors:extensions.corruptXlsxFile",
      })

      return { ok: false, issues }
    }

    let parsedShow: TadaShowV1
    try {
      parsedShow = parseTadaShowWorkbook(uint8Buf)
    } catch (err: any) {
      const errMsg = err?.message || "errors:extensions.corruptXlsxFile"
      const coordMatch = /:([A-Za-z]+)!([A-Z]+)(\d+)/u.exec(errMsg)
      issues.push({
        severity: "error",
        code: "WORKBOOK_PARSE_ERROR",
        messageKey: errMsg,
        sheet: coordMatch ? coordMatch[1] : undefined,
        column: coordMatch ? coordMatch[2] : undefined,
        row: coordMatch ? Number.parseInt(coordMatch[3], 10) : undefined,
      })

      return { ok: false, format: "tada-xlsx", issues }
    }

    const draftResult = authoredShowToNativeBundleDraft(parsedShow)
    if (!draftResult.ok || !draftResult.bundleDraft) {
      for (const diag of draftResult.diagnostics) {
        issues.push({
          severity: diag.severity,
          code: "VALIDATION_ISSUE",
          messageKey: diag.message,
          path: diag.path.join("."),
        })
      }

      return { ok: false, format: "tada-xlsx", issues }
    }

    const { quizz, extras } = draftResult.bundleDraft
    const summary = buildSummaryFromAuthored("tada-xlsx", parsedShow)
    collectMediaWarnings(parsedShow, issues)

    const normalizedBundleDraft: EnhancedBundle = {
      bundleVersion: 1,
      quizz,
      extras,
    }

    return {
      ok: true,
      format: "tada-xlsx",
      summary,
      issues,
      normalizedBundleDraft,
    }
  }

  // 2. JSON handling (text or string)
  let text = ""
  if (typeof rawInput === "string") {
    text = rawInput
  } else if (uint8Buf) {
    try {
      text = new TextDecoder("utf-8").decode(uint8Buf)
    } catch {
      issues.push({
        severity: "error",
        code: "DECODE_ERROR",
        messageKey: "errors:common.invalidJson",
      })

      return { ok: false, issues }
    }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    issues.push({
      severity: "error",
      code: "JSON_SYNTAX_ERROR",
      messageKey: "errors:common.invalidJson",
    })

    return { ok: false, issues }
  }

  // Check 2A: Friendly Tada JSON (`format: "tada-show"`)
  if (
    typeof parsedJson === "object" &&
    parsedJson !== null &&
    ("format" in parsedJson || "cards" in parsedJson)
  ) {
    const showParse = tadaShowV1Schema.safeParse(parsedJson)
    if (showParse.success) {
      const show = showParse.data
      const draftResult = authoredShowToNativeBundleDraft(show)
      if (!draftResult.ok || !draftResult.bundleDraft) {
        for (const diag of draftResult.diagnostics) {
          issues.push({
            severity: diag.severity,
            code: "VALIDATION_ISSUE",
            messageKey: diag.message,
            path: diag.path.join("."),
          })
        }

        return { ok: false, format: "tada-json", issues }
      }

      const { quizz, extras } = draftResult.bundleDraft
      const summary = buildSummaryFromAuthored("tada-json", show)
      collectMediaWarnings(show, issues)

      const normalizedBundleDraft: EnhancedBundle = {
        bundleVersion: 1,
        quizz,
        extras,
      }

      return {
        ok: true,
        format: "tada-json",
        summary,
        issues,
        normalizedBundleDraft,
      }
    }
    // If it claims to be tada-show but has schema errors:
    if (
      (parsedJson as any).format === "tada-show" ||
      lowerName.endsWith(".tada.json")
    ) {
      for (const issue of showParse.error.issues) {
        issues.push({
          severity: "error",
          code: "TADA_SCHEMA_ERROR",
          messageKey: issue.message,
          path: issue.path.join("."),
        })
      }

      return { ok: false, format: "tada-json", issues }
    }
  }

  // Check 2B: Native Enhanced Bundle (`bundleVersion: 1`)
  if (isEnhancedBundle(parsedJson)) {
    const bundle = parsedJson as EnhancedBundle
    const mediaCheck = validateBundleMedia(bundle)
    if (!mediaCheck.ok) {
      issues.push({
        severity: "error",
        code: "UNSAFE_MEDIA_URL",
        messageKey: "errors:extensions.invalidMediaUrl",
        path: mediaCheck.path,
      })

      return { ok: false, format: "enhanced-bundle", issues }
    }

    const authored = nativeBundleToAuthoredShow(bundle)
    const summary = buildSummaryFromAuthored("enhanced-bundle", authored)
    collectMediaWarnings(authored, issues)

    return {
      ok: true,
      format: "enhanced-bundle",
      summary,
      issues,
      normalizedBundleDraft: bundle,
    }
  }

  // Check 2C: If payload has bundleVersion but failed isEnhancedBundle, it's a corrupt enhanced bundle
  if (
    typeof parsedJson === "object" &&
    parsedJson !== null &&
    "bundleVersion" in parsedJson
  ) {
    issues.push({
      severity: "error",
      code: "INVALID_ENHANCED_BUNDLE",
      messageKey: "errors:extensions.invalidEnhancedBundle",
    })

    return { ok: false, format: "enhanced-bundle", issues }
  }

  // Check 2D: Legacy Quizz (`questions` array, subject/title)
  const normalizedLegacy = normalizeLegacyQuizz(parsedJson)
  const legacyParse = quizzValidator.safeParse(normalizedLegacy)
  if (legacyParse.success) {
    const quizz = legacyParse.data
    const unsafeIssues: ShowImportIssue[] = []
    for (let qIdx = 0; qIdx < quizz.questions.length; qIdx += 1) {
      const q = quizz.questions[qIdx]
      if (q.media?.url && !isSafeMediaUrl(q.media.url)) {
        unsafeIssues.push({
          severity: "error",
          code: "UNSAFE_MEDIA_URL",
          messageKey: "errors:extensions.invalidMediaUrl",
          path: `questions.${qIdx}.media.url`,
        })
      }
    }
    if (unsafeIssues.length > 0) {
      issues.push(...unsafeIssues)

      return { ok: false, format: "legacy-json", issues }
    }

    const previewItems: ShowTimelinePreviewItem[] = quizz.questions.map(
      (q, idx) => ({
        order: idx + 1,
        key: `Q${idx + 1}`,
        kind: q.playMode ?? (quizz.gameMode === "survey" ? "survey" : "quiz"),
        questionText: q.question,
        playMode:
          q.playMode ?? (quizz.gameMode === "survey" ? "survey" : "quiz"),
        hasMedia: Boolean(q.media?.url),
        answerCount: q.answers.length,
        answerImageCount: 0,
      }),
    )

    const quizCount = previewItems.filter((i) => i.playMode === "quiz").length
    const surveyCount = previewItems.filter(
      (i) => i.playMode === "survey",
    ).length

    const summary: ShowImportSummary = {
      format: "legacy-json",
      title: quizz.subject,
      totalCards: quizz.questions.length,
      questionCount: quizz.questions.length,
      quizCount,
      surveyCount,
      sceneCount: 0,
      mediaCount: quizz.questions.filter((q) => q.media?.url).length,
      answerImageCount: 0,
      timelinePreview: previewItems,
    }

    return {
      ok: true,
      format: "legacy-json",
      summary,
      issues,
      legacyQuizzDraft: quizz,
    }
  }

  // If none matched, report error
  for (const issue of legacyParse.error.issues) {
    issues.push({
      severity: "error",
      code: "INVALID_QUIZ_FORMAT",
      messageKey: issue.message,
      path: issue.path.join("."),
    })
  }

  return { ok: false, issues }
}

function buildSummaryFromAuthored(
  format: ImportFormatType,
  show: TadaShowV1,
): ShowImportSummary {
  let quizCount = 0
  let surveyCount = 0
  let sceneCount = 0
  let mediaCount = 0
  let answerImageCount = 0

  const previewItems: ShowTimelinePreviewItem[] = []

  for (let idx = 0; idx < show.cards.length; idx += 1) {
    const card = show.cards[idx]
    const order = idx + 1

    if (card.kind === "quiz") {
      quizCount += 1
      const hasMedia = Boolean(card.media?.url || card.background?.url)
      if (hasMedia) {
        mediaCount += 1
      }
      const imgAnswers = card.answers.filter(
        (a) => a.display !== "text" && a.imageUrl,
      ).length
      answerImageCount += imgAnswers

      previewItems.push({
        order,
        key: card.key,
        kind: "quiz",
        questionText: card.question,
        playMode: "quiz",
        hasMedia,
        answerCount: card.answers.length,
        answerImageCount: imgAnswers,
      })
    } else if (card.kind === "survey") {
      surveyCount += 1
      const hasMedia = Boolean(card.media?.url || card.background?.url)
      if (hasMedia) {
        mediaCount += 1
      }
      const imgAnswers = card.answers.filter(
        (a) => a.display !== "text" && a.imageUrl,
      ).length
      answerImageCount += imgAnswers

      previewItems.push({
        order,
        key: card.key,
        kind: "survey",
        questionText: card.question,
        playMode: "survey",
        hasMedia,
        answerCount: card.answers.length,
        answerImageCount: imgAnswers,
      })
    } else {
      sceneCount += 1
      const hasMedia = Boolean(
        (card as any).mediaUrl ||
        (card as any).media?.url ||
        card.background?.url,
      )

      if (hasMedia) {
        mediaCount += 1
      }

      previewItems.push({
        order,
        key: card.key,
        kind: card.kind,
        title: (card as any).title,
        advance: (card as any).advance,
        hasMedia,
      })
    }
  }

  return {
    format,
    title: show.title,
    totalCards: show.cards.length,
    questionCount: quizCount + surveyCount,
    quizCount,
    surveyCount,
    sceneCount,
    mediaCount,
    answerImageCount,
    timelinePreview: previewItems,
  }
}

function collectMediaWarnings(
  show: TadaShowV1,
  issues: ShowImportIssue[],
): void {
  for (let idx = 0; idx < show.cards.length; idx += 1) {
    const card = show.cards[idx]

    if (card.background?.url && card.background.url.startsWith("https://")) {
      issues.push({
        severity: "warning",
        code: "REMOTE_MEDIA_URL",
        messageKey: "extensions:showImport.warningRemoteMedia",
        cardKey: card.key,
        path: `cards[${idx}].background.url`,
      })
    }

    if (card.kind === "quiz" || card.kind === "survey") {
      if (card.media?.url && card.media.url.startsWith("https://")) {
        issues.push({
          severity: "warning",
          code: "REMOTE_MEDIA_URL",
          messageKey: "extensions:showImport.warningRemoteMedia",
          cardKey: card.key,
          path: `cards[${idx}].media.url`,
        })
      }

      if (card.audioCues) {
        for (const cueKey of [
          "showQuestion",
          "answersMusic",
          "revealResults",
        ] as const) {
          const cue = card.audioCues[cueKey]

          if (cue?.url && cue.url.startsWith("https://")) {
            issues.push({
              severity: "warning",
              code: "REMOTE_MEDIA_URL",
              messageKey: "extensions:showImport.warningRemoteMedia",
              cardKey: card.key,
              path: `cards[${idx}].audioCues.${cueKey}.url`,
            })
          }
        }
      }

      for (let aIdx = 0; aIdx < card.answers.length; aIdx += 1) {
        const ans = card.answers[aIdx]
        if (ans.imageUrl && ans.imageUrl.startsWith("https://")) {
          issues.push({
            severity: "warning",
            code: "REMOTE_ANSWER_IMAGE",
            messageKey: "extensions:showImport.warningRemoteAnswerImage",
            cardKey: card.key,
            path: `cards[${idx}].answers[${aIdx}].imageUrl`,
          })
        }
      }
    } else {
      if (
        (card as any).mediaUrl &&
        (card as any).mediaUrl.startsWith("https://")
      ) {
        issues.push({
          severity: "warning",
          code: "REMOTE_MEDIA_URL",
          messageKey: "extensions:showImport.warningRemoteMedia",
          cardKey: card.key,
          path: `cards[${idx}].mediaUrl`,
        })
      }

      if (card.audio?.url && card.audio.url.startsWith("https://")) {
        issues.push({
          severity: "warning",
          code: "REMOTE_MEDIA_URL",
          messageKey: "extensions:showImport.warningRemoteMedia",
          cardKey: card.key,
          path: `cards[${idx}].audio.url`,
        })
      }
    }
  }
}
