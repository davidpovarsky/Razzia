import fs from "node:fs"
import path from "node:path"
import cp from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = cp.execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
const pin = "8efd26a52de41928a7ac1fadafb3315770858127"
const overlay = path.join(here, "local-overlay-03")
if (fs.existsSync(overlay)) throw new Error("Preserve previous immutable overlay")
fs.mkdirSync(overlay)
const rows = [], seen = new Set()
const paths = new Set(cp.execFileSync("git", ["ls-tree", "-r", "--name-only", pin,
  "extensions/src/core", "packages/common/src"], { encoding: "utf8", cwd: root }).trim().split("\n"))
function resolveSource(name) {
  const base = name.replace(/\.(js|ts)$/, "")
  for (const candidate of [name, base + ".ts", base + ".d.ts", base + "/index.ts"])
    if (paths.has(candidate)) return candidate
  throw new Error(`Missing exact Git source ${name}`)
}
const sha = bytes => createHash("sha256").update(bytes).digest("hex")
function copy(name, bytes, source) {
  const target = path.join(overlay, name)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, bytes)
  rows.push({ path: name, bytes: bytes.length, sha256: sha(bytes), source })
}
function visit(name) {
  name = resolveSource(name)
  if (seen.has(name)) return
  const bytes = cp.execFileSync("git", ["show", `${pin}:${name}`], { cwd: root })
  seen.add(name)
  copy(name, bytes, `git:${pin}`)
  for (const match of bytes.toString("utf8").matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
    const spec = match[1]
    if (spec.startsWith(".")) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(name), spec)))
    } else if (spec.startsWith("@razzia/common/")) {
      visit("packages/common/src/" + spec.slice("@razzia/common/".length) + ".ts")
    } else if (!["zod", "uuid"].includes(spec) && !name.endsWith(".d.ts")) throw new Error(`Unexpected external ${spec}`)
  }
}
for (const file of ["composition-preview-v2", "composition-document-v2", "preview-fixtures"])
  visit(`extensions/src/core/show-library/${file}.ts`)
visit("extensions/src/core/digest.ts")
for (const file of ["contracts/canonical.ts", "server/composition-preview-v2.ts",
  "tests/server/canonical-v2.nodecheck.ts", "tests/server/composition-preview-v2.nodecheck.ts"])
  copy("extensions/src/mcp-app/" + file, fs.readFileSync(path.join(root, "extensions/src/mcp-app", file)), "F candidate worktree")
fs.writeFileSync(path.join(overlay, "package.json"), JSON.stringify({
  name: "tadazz-f-composition-v2-local-evidence", version: "0.0.0", private: true,
  type: "module", dependencies: { zod: "4.6.6", uuid: "14.0.3" },
}, null, 2) + "\n")
fs.writeFileSync(path.join(overlay, "loader.mjs"), `import fs from "node:fs";
import path from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
const root=path.dirname(fileURLToPath(import.meta.url));
export async function resolve(spec,context,next){
 if(spec.endsWith(".json")) return {...await next(spec,context),importAttributes:{type:"json"}};
 if(spec.startsWith("@razzia/common/")) return {url:pathToFileURL(path.join(root,"packages/common/src",spec.slice(15)+".ts")).href,shortCircuit:true};
 if(spec.startsWith(".") && context.parentURL?.startsWith("file:")){
  const url=new URL(spec,context.parentURL), name=fileURLToPath(url);
  if(!fs.existsSync(name)) for(const candidate of [name+".ts",name.replace(/\\.js$/,".ts")])
   if(fs.existsSync(candidate)) return {url:pathToFileURL(candidate).href,shortCircuit:true};
 }
 return next(spec,context);
}
`)
fs.writeFileSync(path.join(here, "input-manifest.json"), JSON.stringify({
  DPin: pin, node: process.version, kind: "IMMUTABLE_EXACT_GIT_D_AND_F_CANDIDATE_LOCAL_OVERLAY",
  aliasesOnly: true, noSchemaShim: true, noOracleJob: true, files: rows,
}, null, 2) + "\n")
console.log(JSON.stringify({ files: rows.length, overlay, DPin: pin }))
