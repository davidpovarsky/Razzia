import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { dirname, resolve, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")
const git = (...args) =>
  execFileSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })
const sha = String(
  git("rev-parse", (process.argv[2] || "HEAD") + "^{commit}"),
).trim()
if (!/^[0-9a-f]{40}$/u.test(sha))
  throw new Error("Full immutable review SHA required")
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const selections = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "packages/*/package.json",
  "packages/*/tsconfig*.json",
  "packages/common/src",
  "packages/socket/src",
  "extensions/src",
  "extensions/package.json",
  "extensions/tsconfig.json",
  "docs/extensions/qa-evidence/telephony-fresh-20261115/NEXT_API_READINESS.md",
  "docs/extensions/qa-evidence/telephony-fresh-20261115/BACKEND_SEAM_REQUEST.md",
  "docs/extensions/qa-evidence/telephony-fresh-20261115/UPSTREAM_TOUCHES.md",
  "docs/extensions/qa-evidence/telephony-fresh-20261115/S01_SOURCE_AUDIT.json",
  "docs/extensions/qa-evidence/telephony-fresh-20261115/S02_SOURCE_AUDIT.json",
]
const selected = (path) =>
  selections.includes(path) ||
  /^LICEN[CS]E(?:\.[^/]+)?$/iu.test(path) ||
  /^packages\/[^/]+\/(?:package\.json|tsconfig[^/]*\.json)$/u.test(path) ||
  /^(?:packages\/(?:common|socket)\/src|extensions\/src)\//u.test(path)
const rows = String(git("ls-tree", "-r", "-z", sha))
  .split("\0")
  .filter(Boolean)
  .filter((row) => selected(row.split("\t")[1]))
const objects = execFileSync("git", ["cat-file", "--batch"], {
  cwd: root,
  input: rows.map((row) => row.split("\t")[0].split(" ")[2]).join("\n") + "\n",
  maxBuffer: 128 * 1024 * 1024,
})
let offset = 0
const entries = rows.map((row) => {
  const [header, path] = row.split("\t")
  const [mode, type, blob] = header.split(" ")
  if (type !== "blob" || !["100644", "100755"].includes(mode))
    throw new Error("Reject non-regular source: " + path)
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes(":") ||
    path.split("/").some((p) => ["..", ".", ""].includes(p))
  )
    throw new Error("Unsafe source path")
  if (
    /(?:^|\/)(?:\.env(?:\..*)?|config|node_modules|\.git|credentials|secrets)(?:\/|$)/iu.test(
      path,
    )
  )
    throw new Error("Prohibited data/config path: " + path)
  const end = objects.indexOf(10, offset)
  const [actualBlob, actualType, length] = objects
    .subarray(offset, end)
    .toString()
    .split(" ")
  if (actualBlob !== blob || actualType !== "blob")
    throw new Error("Invalid Git object stream")
  const bytes = Number(length)
  const content = objects.subarray(end + 1, end + 1 + bytes)
  offset = end + 1 + bytes + 1
  return { path, mode, bytes, sha256: sha256(content) }
})
for (const required of [
  "packages/socket/src/app.ts",
  "packages/socket/src/api/extensions/game-routes.ts",
  "extensions/src/server/game/phone-controller.ts",
  "extensions/src/core/phone-roster.ts",
  "extensions/src/telephony/pilot-runtime/phone-real-backend.node.ts",
  "extensions/src/telephony/pilot-runtime/phone-gateway-qa-child.cjs",
  "extensions/src/telephony/pilot-runtime/run-phone-api-qa.sh",
  "extensions/src/telephony/pilot-runtime/phone-route-typecheck.mjs",
])
  if (!entries.some((e) => e.path === required))
    throw new Error("Missing delivered dependency: " + required)
const manifest = {
  schema: 1,
  review_sha: sha,
  scope:
    "Synthetic actual-backend API preparation; execution pending runner lease",
  selections,
  files: entries,
}
if (process.argv.includes("--plan")) {
  console.log(
    JSON.stringify({
      review_sha: sha,
      files: entries.length,
      source_bytes: entries.reduce((n, e) => n + e.bytes, 0),
      mode: "plan-only",
    }),
  )
} else {
  const base = resolve(
    root,
    "docs/extensions/qa-evidence/telephony-fresh-20261115/delivery",
  )
  mkdirSync(base, { recursive: true })
  const out = resolve(base, "phone-" + sha)
  if (!out.startsWith(base + sep))
    throw new Error("Delivery escapes exclusive evidence root")
  mkdirSync(out, { recursive: false })
  const archive = resolve(out, "source.tar")
  const archivePaths = selections.filter((path) => !path.includes("*"))
  archivePaths.push(
    ...entries
      .filter((e) =>
        /^packages\/[^/]+\/(?:package\.json|tsconfig[^/]*\.json)$/u.test(
          e.path,
        ),
      )
      .map((e) => e.path),
  )
  archivePaths.push(
    ...entries
      .filter((e) => /^LICEN[CS]E(?:\.[^/]+)?$/iu.test(e.path))
      .map((e) => e.path),
  )
  git(
    "archive",
    "--format=tar",
    "--output=" + archive,
    sha,
    "--",
    ...new Set(archivePaths),
  )
  const archiveBytes = readFileSync(archive)
  writeFileSync(
    resolve(out, "source-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" },
  )
  writeFileSync(
    resolve(out, "delivery.json"),
    JSON.stringify(
      {
        review_sha: sha,
        archive_sha256: sha256(archiveBytes),
        archive_bytes: statSync(archive).size,
        manifest_sha256: sha256(
          readFileSync(resolve(out, "source-manifest.json")),
        ),
        files: entries.length,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  )
  const extractor =
    "extensions/src/telephony/pilot-runtime/phone-safe-extract.py"
  const extractorBytes = git("show", sha + ":" + extractor)
  writeFileSync(resolve(out, "phone-safe-extract.py"), extractorBytes, {
    flag: "wx",
  })
  const delivery = JSON.parse(
    readFileSync(resolve(out, "delivery.json"), "utf8"),
  )
  delivery.extractor_sha256 = sha256(extractorBytes)
  writeFileSync(
    resolve(out, "delivery.json"),
    JSON.stringify(delivery, null, 2) + "\n",
  )
  console.log(
    JSON.stringify({
      delivery: relative(root, out),
      ...JSON.parse(readFileSync(resolve(out, "delivery.json"), "utf8")),
    }),
  )
}
