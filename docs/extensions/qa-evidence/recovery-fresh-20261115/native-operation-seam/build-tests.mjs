import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { build } from "../../../../../node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js"
const folder = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/u, "$1"))
const mode = process.argv[2]
const label = process.argv[3] ?? mode
if (!["baseline", "candidate"].includes(mode)) throw Error("Explicit source mode required")
const entry = path.join(folder, "operation-tests.ts")
const result = await build({ entryPoints: [entry], bundle: true, metafile: true, write: false, platform: "node", format: "esm", target: "node24", tsconfig: "tsconfig.json",
  plugins: mode === "baseline" ? [{ name: "frozen-c1-baseline", setup(build) {
    build.onLoad({ filter: /[/\\]creation-reservation\.ts$/ }, args => ({ contents: execFileSync("git", ["show", "f11b29db79d8fe3faa9abc5004a639f8b042eeee:extensions/src/server/storage/creation-reservation.ts"], { encoding: "utf8" }), loader: "ts", resolveDir: path.dirname(args.path) }))
  }}] : [],
})
fs.writeFileSync(path.join(folder, label + ".mjs"), result.outputFiles[0].contents, { flag: "wx" })
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const inputs = Object.keys(result.metafile.inputs).map(file => {
 const bytes = mode === "baseline" && file.endsWith("/creation-reservation.ts")
  ? execFileSync("git", ["show", "f11b29db79d8fe3faa9abc5004a639f8b042eeee:extensions/src/server/storage/creation-reservation.ts"])
  : fs.readFileSync(file)
 return { file, bytes: bytes.length, sha256: hash(bytes) }
})
fs.writeFileSync(path.join(folder, label + ".inputs.json"), JSON.stringify({ mode, compiler:"esbuild0.28.2", options:{platform:"node",format:"esm",target:"node24",bundle:true}, bundleSha256: hash(result.outputFiles[0].contents),inputs },null,2)+"\n", {flag:"wx"})
process.stdout.write(JSON.stringify({ mode, bytes: result.outputFiles[0].contents.length, inputs: inputs.length }))
