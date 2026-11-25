import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
const root = process.argv[2]
if (
  path.dirname(root ?? "") !==
    "/home/david/tadazz-f-native-save-evidence-20261115" ||
  !/^tadazz-m3a-synthetic-[A-Za-z0-9]+$/.test(path.basename(root ?? ""))
)
  throw Error("Refusing foreign root")
const marker = fs.readFileSync(path.join(root, ".f-native-save-fixture.json"))
if (JSON.parse(marker).kind !== "F-native-save-cross-seam")
  throw Error("Wrong fixture marker")
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
const receipts = fs
  .readdirSync(root)
  .filter((n) => /\.(verified|checkpoint|reply)\.json$/.test(n))
  .map((name) => ({
    name,
    sha256: sha(fs.readFileSync(path.join(root, name))),
    data: JSON.parse(fs.readFileSync(path.join(root, name), "utf8")),
  }))
const files = []
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) walk(full)
    else if (item.isFile())
      files.push({
        path: path.relative(root, full),
        bytes: fs.statSync(full).size,
        sha256: sha(fs.readFileSync(full)),
      })
  }
}
for (const owner of fs.readdirSync(path.join(root, "tenants"))) {
  for (const suffix of [
    "native-sentinels",
    "quizz",
    "extensions/quizzes",
    ".tadazz-creation-operations-v1",
  ]) {
    const dir = path.join(root, "tenants", owner, suffix)
    if (fs.existsSync(dir)) walk(dir)
  }
  const dir = path.join(root, "tenants", owner, "extensions/mcp-oauth")
  if (fs.existsSync(dir)) {
    for (const name of ["grants.sqlite", "grants.sqlite-journal"]) {
      const full = path.join(dir, name)
      if (fs.existsSync(full))
        files.push({
          path: path.relative(root, full),
          bytes: fs.statSync(full).size,
          sha256: sha(fs.readFileSync(full)),
        })
    }
  }
}
walk(path.join(root, "native-sentinels"))
walk(path.join(root, ".tadazz-creation-operations-v1"))
console.log(
  JSON.stringify(
    {
      root,
      retained: true,
      runtime: process.version,
      platform: process.platform,
      kernel: os.release(),
      filesystemMagic: fs.statfsSync(root).type,
      markerSha256: sha(marker),
      globalNativeQuizzExists: fs.existsSync(path.join(root, "quizz")),
      receipts,
      files,
      privateActorDescriptorsAndSecretsExcluded: true,
    },
    null,
    2,
  ),
)
