import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url)),
  modules = path.resolve(
    here,
    "../consent-boundary/local-overlay-01/extensions/src/mcp-app/node_modules",
  )
const label = process.argv[2]
if (!/^deps-(before|after)-\d{2}$/.test(label ?? ""))
  throw Error("Invalid label")
const rows = []
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) walk(full)
    else if (item.isFile()) {
      const bytes = fs.readFileSync(full)
      rows.push({
        file: path.relative(modules, full),
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      })
    } else throw Error("Unexpected dependency link")
  }
}
walk(modules)
rows.sort((a, b) => a.file.localeCompare(b.file))
fs.writeFileSync(
  path.join(here, label + ".json"),
  JSON.stringify(
    {
      root: modules,
      normalExistingNpmGraph: true,
      noInstall: true,
      files: rows,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
)
console.log(JSON.stringify({ label, files: rows.length }))
