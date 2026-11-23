import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
const root = fileURLToPath(new URL("../../../../../", import.meta.url))
const git = (...args) =>
  execFileSync("git", args, { cwd: root, maxBuffer: 8 * 1024 * 1024 })
const sha = String(
  git("rev-parse", (process.argv[2] ?? "HEAD") + "^{commit}"),
).trim()
if (!/^[0-9a-f]{40}$/u.test(sha)) throw Error("immutable SHA required")
const paths = [
  "extensions/src/server/phone-lifecycle-v2",
  "docs/extensions/qa-evidence/telephony-fresh-20261115/v2a",
]
const rows = String(git("ls-tree", "-r", sha, "--", ...paths))
  .trim()
  .split("\n")
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const files = rows.map((row) => {
  const [meta, path] = row.split("\t"),
    [mode, type, blob] = meta.split(" ")
  if (!["100644", "100755"].includes(mode) || type !== "blob")
    throw Error("regular source only")
  const bytes = git("cat-file", "blob", blob)
  return { path, mode, bytes: bytes.length, sha256: hash(bytes) }
})
const output = resolve(
  root,
  "docs/extensions/qa-evidence/telephony-fresh-20261115/delivery/phone-v2a-" +
    sha,
)
mkdirSync(output, { recursive: false })
const archive = resolve(output, "source.tar")
git("archive", "--format=tar", "--output=" + archive, sha, "--", ...paths)
const manifest =
  JSON.stringify(
    {
      schema: 1,
      review_sha: sha,
      base_sha: "003cf88b6cba19989388dca20efcfaa01cc8f9ad",
      scope: "small unmounted V2-A overlay; existing S02 source/deps read only",
      files,
    },
    null,
    2,
  ) + "\n"
writeFileSync(resolve(output, "source-manifest.json"), manifest, { flag: "wx" })
const extractor = git(
  "show",
  sha +
    ":docs/extensions/qa-evidence/telephony-fresh-20261115/v2a/safe-overlay.py",
)
writeFileSync(resolve(output, "safe-overlay.py"), extractor, { flag: "wx" })
const receipt = {
  review_sha: sha,
  files: files.length,
  archive_bytes: readFileSync(archive).length,
  archive_sha256: hash(readFileSync(archive)),
  manifest_sha256: hash(manifest),
  extractor_sha256: hash(extractor),
}
if (receipt.archive_bytes > 1024 * 1024)
  throw Error("bounded delta exceeded1MiB")
writeFileSync(
  resolve(output, "delivery.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  { flag: "wx" },
)
console.log(JSON.stringify({ output, ...receipt }))
