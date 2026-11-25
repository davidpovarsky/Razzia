import fs from "fs"
import path from "path"
import crypto from "crypto"
import { saveMedia } from "@razzia/socket/services/media"
import { getPath } from "@razzia/socket/services/config"
import {
  tadaShowV1Schema,
  type TadaShowV1,
} from "../src/core/show-authoring-schema"
import {
  exportTadaShowWorkbook,
  parseTadaShowWorkbook,
} from "../src/core/show-workbook"
import { preflightShowImport } from "../src/core/show-import-preflight"
interface ManifestItem {
  source: string
  sourceSet: string
  category: string
  choiceNumber: number
  label: string
  file: string
  fullPanel: string
  localUrl: string
  width: number
  height: number
  sha256: string
}
interface Manifest {
  schema: string
  uniqueImages: number
  questions: number
  choicesPerQuestion: number
  images: ManifestItem[]
}
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export async function intakeTzilaMedia(fixturesDir?: string) {
  const baseDir =
    fixturesDir ?? path.resolve(process.cwd(), "extensions/fixtures/tzila-show")
  const manifestPath = path.join(baseDir, "MEDIA_MANIFEST.json")

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`)
  }

  const manifest: Manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8"),
  ) as Manifest
  const mediaDir = getPath("media")

  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, {
      recursive: true,
    })
  }

  // Pre-index existing media by SHA-256 to remain idempotent
  const existingByHash = new Map<string, string>()

  if (fs.existsSync(mediaDir)) {
    for (const fileName of fs.readdirSync(mediaDir)) {
      const fullPath = path.join(mediaDir, fileName)

      try {
        if (fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath)
          const hash = crypto.createHash("sha256").update(content).digest("hex")
          existingByHash.set(hash, `/media/${fileName}`)
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  console.log(`[Intake] Existing media items found: ${existingByHash.size}`)
  const urlMap: Record<string, string> = {}
  const uploadedDetails: Array<{
    originalUrl: string
    newUrl: string
    sha256: string
    file: string
  }> = []

  // Upload each of the 40 distinct images
  for (const item of manifest.images) {
    const filePath = path.join(baseDir, item.file)

    if (!fs.existsSync(filePath)) {
      throw new Error(`Source asset missing: ${filePath}`)
    }

    const fileBuf = fs.readFileSync(filePath)
    const fileHash = crypto.createHash("sha256").update(fileBuf).digest("hex")

    if (fileHash !== item.sha256) {
      throw new Error(
        `SHA256 mismatch for ${item.file}: expected ${item.sha256}, got ${fileHash}`,
      )
    }

    let actualUrl = existingByHash.get(fileHash)

    if (!actualUrl) {
      // Use existing saveMedia service
      const fileName = path.basename(item.file)
      const fileBlob = new File([fileBuf], fileName, {
        type: "image/png",
      })
      const uploaded = await saveMedia(fileBlob)
      actualUrl = uploaded.url
      existingByHash.set(fileHash, actualUrl)
      console.log(`[Intake] Uploaded ${item.file} -> ${actualUrl}`)
    } else {
      console.log(`[Intake] Reused existing matching media -> ${actualUrl}`)
    }

    urlMap[item.localUrl] = actualUrl
    uploadedDetails.push({
      originalUrl: item.localUrl,
      newUrl: actualUrl,
      sha256: fileHash,
      file: item.file,
    })
  }
  console.log(`[Intake] Total mapped assets: ${Object.keys(urlMap).length}`)

  // Verify all 40 mapped URLs are served as valid PNGs
  for (const detail of uploadedDetails) {
    const fileName = detail.newUrl.replace(/^\/media\//, "")
    const targetPath = path.join(mediaDir, fileName)

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Uploaded file not found on disk: ${targetPath}`)
    }

    const buf = fs.readFileSync(targetPath)

    if (buf.length === 0) {
      throw new Error(`Empty file on disk: ${targetPath}`)
    }

    if (buf.subarray(0, 8).compare(PNG_HEADER) !== 0) {
      throw new Error(`Corrupted PNG header on disk: ${targetPath}`)
    }
  }

  // 1. Rewrite TZILA_STORY_SHOW.tada.json
  const tadaJsonPath = path.join(baseDir, "TZILA_STORY_SHOW.tada.json")
  const originalJsonText = fs.readFileSync(tadaJsonPath, "utf-8")
  const tadaShow = JSON.parse(originalJsonText) as TadaShowV1
  let rewrittenAnswersCount = 0
  for (const card of tadaShow.cards) {
    if (card.kind === "quiz" || card.kind === "survey") {
      for (const ans of card.answers) {
        if (ans.imageUrl && urlMap[ans.imageUrl]) {
          ans.imageUrl = urlMap[ans.imageUrl]
          rewrittenAnswersCount += 1
        }
      }
    }
  }
  console.log(
    `[Intake] Rewrote ${rewrittenAnswersCount} answer image URLs in Tada JSON`,
  )

  // Validate rewritten show against schema
  const parsedShow = tadaShowV1Schema.parse(tadaShow)
  fs.writeFileSync(tadaJsonPath, JSON.stringify(parsedShow, null, 2), "utf-8")

  // 2. Export updated show to TZILA_STORY_SHOW.xlsx
  const xlsxBuf = exportTadaShowWorkbook(parsedShow)
  const xlsxPath = path.join(baseDir, "TZILA_STORY_SHOW.xlsx")
  fs.writeFileSync(xlsxPath, Buffer.from(xlsxBuf))
  console.log(`[Intake] Successfully exported updated workbook to ${xlsxPath}`)

  // 3. Round-trip verify XLSX back to TadaShowV1
  const reParsedShow = parseTadaShowWorkbook(xlsxBuf)

  if (reParsedShow.cards.length !== parsedShow.cards.length) {
    throw new Error(
      `Card count mismatch after Excel round-trip: expected ${parsedShow.cards.length}, got ${reParsedShow.cards.length}`,
    )
  }

  // 4. Preflight the rewritten JSON and XLSX
  const jsonPreflight = preflightShowImport(
    JSON.stringify(parsedShow),
    "TZILA_STORY_SHOW.tada.json",
  )

  if (!jsonPreflight.ok || jsonPreflight.issues.length > 0) {
    throw new Error(
      `JSON preflight failed with issues: ${JSON.stringify(jsonPreflight.issues)}`,
    )
  }

  const xlsxPreflight = preflightShowImport(xlsxBuf, "TZILA_STORY_SHOW.xlsx")

  if (!xlsxPreflight.ok || xlsxPreflight.issues.length > 0) {
    throw new Error(
      `XLSX preflight failed with issues: ${JSON.stringify(xlsxPreflight.issues)}`,
    )
  }

  // Save the mapping for report generation
  const mapPath = path.join(baseDir, "MEDIA_URL_MAP.json")
  fs.writeFileSync(mapPath, JSON.stringify(uploadedDetails, null, 2), "utf-8")
  console.log(`[Intake] Saved media URL map to ${mapPath}`)

  return {
    uploadedCount: uploadedDetails.length,
    rewrittenAnswersCount,
    urlMap,
    uploadedDetails,
    jsonSummary: jsonPreflight.summary,
    xlsxSummary: xlsxPreflight.summary,
  }
}

if (process.argv[1]?.endsWith("intake-tzila-media.ts")) {
  intakeTzilaMedia()
    .then((res) => {
      console.log("[Intake] SUCCESS:", res)
      process.exit(0)
    })
    .catch((err: unknown) => {
      console.error("[Intake] FAILED:", err)
      process.exit(1)
    })
}
