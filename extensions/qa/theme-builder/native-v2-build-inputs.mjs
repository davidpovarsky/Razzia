// Host build step only. No producer/catalog/digest import enters the payload.
import { getNativeShowLibrary } from "/work/extensions/src/core/show-library/native-library.ts"
import { writeFileSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
const entries = getNativeShowLibrary().families.map((family) => ({
  id: family.ref.id,
  version: family.ref.version,
  rendererId: family.definition.rendererId,
  definitionSha256: family.definitionSha256,
}))
const sources = ["classic", "razzia"].map((name) => {
  const path = `/work/extensions/src/core/show-themes/${name}.manifest.json`
  const data = readFileSync(path)
  return {
    path,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  }
})
writeFileSync(
  "/out/native-v2-built-definitions.json",
  JSON.stringify(entries, null, 2),
)
writeFileSync(
  "/out/native-v2-definition-inputs.json",
  JSON.stringify({ entries, sources }, null, 2),
)
