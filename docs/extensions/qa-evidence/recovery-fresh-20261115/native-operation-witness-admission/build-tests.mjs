import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { build } from "../../../../../node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js"
const folder = path.dirname(fileURLToPath(import.meta.url))
const label = process.argv[2]
if (!label || !/^[a-z0-9-]+$/u.test(label))
  throw Error("Explicit fresh output label required")
const result = await build({
  entryPoints: [path.join(folder, "witness-tests.ts")],
  bundle: true,
  metafile: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node24",
  tsconfig: "tsconfig.json",
})
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const inputs = Object.keys(result.metafile.inputs).map((file) => {
  const bytes = fs.readFileSync(file)
  return { file, bytes: bytes.length, sha256: hash(bytes) }
})
fs.writeFileSync(
  path.join(folder, label + ".mjs"),
  result.outputFiles[0].contents,
  { flag: "wx" },
)
fs.writeFileSync(
  path.join(folder, label + ".inputs.json"),
  JSON.stringify(
    {
      compiler: "esbuild0.28.2",
      options: {
        platform: "node",
        format: "esm",
        target: "node24",
        bundle: true,
      },
      bundleSha256: hash(result.outputFiles[0].contents),
      inputs,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
)
process.stdout.write(
  JSON.stringify({
    label,
    bytes: result.outputFiles[0].contents.length,
    inputs: inputs.length,
  }),
)
