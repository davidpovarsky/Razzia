import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const base = "8a43c99c65d8923bd23d8c57ac3607e9a09b5764"
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
const changed = [...new Set([
  ...git("diff", "--name-only", base).split("\n"),
  ...git("ls-files", "--others", "--exclude-standard").split("\n"),
])].filter(Boolean)
const allowed = (file) => file.startsWith("extensions/src/server/storage/") ||
  file.startsWith("docs/extensions/qa-evidence/recovery-fresh-20261115/") ||
  ["extensions/src/server/media-library.ts", "extensions/src/server/media-library.test.ts", "extensions/src/server/media-library-recovery.test.ts"].includes(file)
if (changed.some((file) => !allowed(file))) throw new Error(`Unleased change: ${changed.filter((file) => !allowed(file))}`)
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replaceAll("\r\n", "\n")
const baseline = (file) => execFileSync("git", ["show", `${base}:${file}`], { cwd: root, encoding: "utf8" }).replaceAll("\r\n", "\n")
const mediaFile = "extensions/src/server/media-library.ts"
function outsideLeasedFunctions(source) {
  for (const [start, end] of [
    ["export function executeMediaDeleteTransaction(", "/**\n * Checks whether a media file"],
    ["export function recoverMediaDeleteJournals(", "export interface StartupRecoveryOptions"],
  ]) {
    const startIndex = source.indexOf(start)
    const endIndex = source.indexOf(end, startIndex)
    if (startIndex < 0 || endIndex < 0) throw new Error("Missing leased symbol boundary")
    source = source.slice(0, startIndex) + "/* leased symbol */\n" + source.slice(endIndex)
  }
  return source
}
if (outsideLeasedFunctions(read(mediaFile)) !== outsideLeasedFunctions(baseline(mediaFile))) throw new Error("Media change outside leased symbols")
const originalTest = "extensions/src/server/media-library.test.ts"
const normalizedTest = read(originalTest).replace("  computeCanonicalBaseDigest,\n", "").replace("baseDigest: computeCanonicalBaseDigest(baseQuiz),", 'baseDigest: "b".repeat(64),')
if (normalizedTest !== baseline(originalTest)) throw new Error("Original test changed beyond two approved fixture lines")
const protectedChanges = git("diff", "--name-only", base, "--", "packages", "extensions/src/editor", "pnpm-lock.yaml", "pnpm-workspace.yaml", "extensions/package.json")
if (protectedChanges) throw new Error(`Protected source/manifests changed: ${protectedChanges}`)
const hashes = Object.fromEntries(changed.filter((file) => /\.(ts|mjs|mts)$/.test(file)).map((file) => [file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")]))
console.log(JSON.stringify({ status: "PASS", base, node: process.version, root, applicationAliases: "current tree", dependencies: "read-only installed reference paths", changedPaths: changed, mediaOutsideLeaseUnchanged: true, originalTestOnlyApprovedFixture: true, protectedChanges: [], hashes }, null, 2))
