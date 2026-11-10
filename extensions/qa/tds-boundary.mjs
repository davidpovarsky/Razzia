import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve, relative } from "node:path"

const root = fileURLToPath(new URL("../../", import.meta.url))
const manifestPath = resolve(root, "docs/extensions/plans/tds-freeze.json")
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
const digest = (path) =>
  createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex")
const base = "fb6c7631999f33c8fb47638a99920e450f326fbf"
const approval = JSON.parse(
  readFileSync(
    resolve(root, "docs/extensions/plans/tds-approved-seams.json"),
    "utf8",
  ),
)
const approved = new Set(Object.keys(approval.files))
if (
  [...approved].some(
    (path) => !path.startsWith("packages/web/src/features/game/components/"),
  )
)
  throw new Error("Approval cannot include editor or non-host paths")
const protectedPath = (path) =>
  /^(?:packages\/|extensions\/src\/editor\/)/u.test(path)
const allow =
  /^(?:AGENTS\.md$|GEMINI\.md$|pnpm-lock\.yaml$|\.github\/workflows\/tadazz-platform-ui\.yml$|docs\/extensions\/|extensions\/(?:src\/(?:platform-ui|site)\/|src\/presentation\/platform-controls\.test\.ts$|qa\/tds[^/]*|tds[^/]*|package\.json$))/u

if (process.argv.includes("--record")) {
  if (git("rev-parse", "HEAD") !== base)
    throw new Error("Freeze must be recorded at the inspected baseline")
  const files = git("ls-files")
    .split("\n")
    .filter(
      (path) => protectedPath(path) || /^extensions\/site-assets\//u.test(path),
    )
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        base,
        files: Object.fromEntries(files.map((path) => [path, digest(path)])),
      },
      null,
      2,
    ) + "\n",
  )
  console.log(`Recorded ${files.length} protected files`)
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const changed = process.argv.includes("--files-only")
    ? []
    : [
        ...new Set([
          ...git("diff", "--name-only", manifest.base, "--").split("\n"),
          ...git("ls-files", "--others", "--exclude-standard").split("\n"),
        ]),
      ].filter(Boolean)
  const denied = changed.filter(
    (path) => !approved.has(path) && (protectedPath(path) || !allow.test(path)),
  )
  const hashChanges = Object.entries(manifest.files)
    .filter(([path, hash]) => digest(path) !== hash)
    .map(([path]) => path)
  const mismatches = hashChanges.filter((path) => !approved.has(path))
  if (denied.length || mismatches.length)
    throw new Error(JSON.stringify({ denied, mismatches }))
  const upstreamChanges = process.argv.includes("--files-only")
    ? []
    : git("diff", "--numstat", manifest.base, "--", ...approved)
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [added, removed, path] = line.split("\t")
          const changedLines = Number(added) + Number(removed)
          if (
            !Number.isFinite(changedLines) ||
            changedLines > approval.files[path]
          )
            throw new Error(
              `Approved seam exceeds review bound: ${path} (${changedLines} > ${approval.files[path]})`,
            )
          return { path, changedLines, limit: approval.files[path] }
        })
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        base: manifest.base,
        protectedFiles: Object.keys(manifest.files).length,
        unchangedHashes:
          Object.keys(manifest.files).length - hashChanges.length,
        approvedModifiedHashes: hashChanges.filter((path) =>
          approved.has(path),
        ),
        approvedSeams: upstreamChanges,
        changedPaths: changed,
        manifest: relative(root, manifestPath),
      },
      null,
      2,
    ),
  )
}
