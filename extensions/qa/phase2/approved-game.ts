// Server QA only. The owner's authorization is limited to existing Goldy games.
// Read-only source mount; sanitized projections stay in the isolated QA evidence.
import { readFileSync, writeFileSync, lstatSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"
import {
  readAccountPreviewSource,
  projectAccountPreviewContent,
} from "../../src/server/api/account-preview-source"

if (process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error("Tadazz server QA only")
}

const root = "/approved-inputs/goldy"
const hashes = new Map<string, string>()
const getPath = (file = "") => {
  const path = join(root, file)

  if (lstatSync(path, { throwIfNoEntry: false })?.isFile()) {
    hashes.set(
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    )
  }

  return path
}
const receipt = []
for (const id of [
  "9156e4ee-7300-49ab-8a27-c883828362a2",
  "0KTcUgc0uvF_vGWYHrpTJ",
  "TwGGo21j0nTD9XoSZAFzZ",
]) {
  try {
    const content = projectAccountPreviewContent({ getPath }, id)
    // This projection is NOT runnable admission. A browser QA copy must upload
    // every exact source media byte through its own authenticated account first.
    writeFileSync(
      `/evidence/approved-content-${id}.json`,
      JSON.stringify(content),
    )
    const source = readAccountPreviewSource({ getPath }, id)
    writeFileSync(
      `/evidence/approved-source-${id}.json`,
      JSON.stringify(source),
    )
    receipt.push({
      id,
      status: "projected",
      chapters: source.chapters.length,
      assets: source.assets.length,
      theme: source.show.defaults?.showTheme?.id ?? "default",
      revision: source.source.immutableRevision,
    })
  } catch (error) {
    receipt.push({
      id,
      status: "unavailable",
      error:
        error instanceof Error ? error.message.slice(0, 120) : "unavailable",
    })
  }
}
for (const [path, hash] of hashes) {
  if (createHash("sha256").update(readFileSync(path)).digest("hex") !== hash) {
    throw new Error("Read-only source changed during projection")
  }
}
writeFileSync(
  "/evidence/approved-source-receipt.json",
  JSON.stringify({ readOnly: true, sources: receipt }, null, 2),
)
console.log(JSON.stringify(receipt))
