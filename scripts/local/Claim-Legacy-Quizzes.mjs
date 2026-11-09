/**
 * One-time, explicitly scoped legacy-game ownership migration.
 * Never auto-claims data on first registration. Dry-run unless --apply is present.
 * Keeps the original shared files untouched as rollback; does not create accounts.
 */
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

const args = process.argv.slice(2)
const getFlag = (key) => args[args.indexOf(key) + 1]
const owner = getFlag("--account")
const root = getFlag("--config")
const apply = args.includes("--apply")

if (!owner || !root || !/^[a-f0-9-]{36}$/iu.test(owner)) {
  console.error(
    "Usage: node Claim-Legacy-Quizzes.mjs --config /app/config --account <verified-id> [--apply]",
  )
  process.exit(2)
}

const config = path.resolve(root)
const dbPath = path.join(config, "tadazz-accounts.sqlite")

if (!fs.existsSync(dbPath)) {
  throw new Error("Account database not initialized")
}

const db = new DatabaseSync(dbPath, { readOnly: true })

try {
  const row = db
    .prepare("SELECT verified_at,disabled FROM accounts WHERE id=?")
    .get(owner)

  if (!row?.verified_at || row.disabled) {
    throw new Error("Account must be verified and active")
  }
} finally {
  db.close()
}

const dir = path.join(config, "tenants", owner)
const categories = ["quizz", "media", "results", "extensions/quizzes"]
const sourceFiles = []
function collect(directory, prefix) {
  if (!fs.existsSync(directory)) {
    return
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name)

    if (entry.isSymbolicLink()) {
      throw new Error("Refusing symbolic link in legacy data")
    }

    if (entry.isDirectory()) {
      collect(path.join(directory, entry.name), relative)
    } else if (entry.isFile()) {
      const file = path.join(config, relative)
      sourceFiles.push({
        relative: relative.split(path.sep).join("/"),
        size: fs.statSync(file).size,
        sha256: createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex"),
      })
    } else {
      throw new Error("Unsupported legacy entry")
    }
  }
}
for (const category of categories) {
  collect(path.join(config, category), category)
}
sourceFiles.sort((a, b) => a.relative.localeCompare(b.relative))
const existing = categories.flatMap((cat) => {
  const d = path.join(dir, cat)

  if (!fs.existsSync(d)) {
    return []
  }

  const stack = [d],
    found = []

  while (stack.length) {
    const s = stack.pop()
    for (const item of fs.readdirSync(s, { withFileTypes: true })) {
      const p = path.join(s, item.name)

      if (item.isDirectory()) {
        stack.push(p)
      } else {
        found.push(p)
      }
    }
  }

  return found
})

if (
  existing.length ||
  fs.existsSync(path.join(dir, "legacy-migration-manifest.json"))
) {
  throw new Error("Target tenant already has data; refusing overwrite")
}

console.log(
  JSON.stringify({
    mode: apply ? "copy-only" : "dry-run",
    verifiedOwnerId: owner,
    files: sourceFiles.length,
    totalBytes: sourceFiles.reduce((s, x) => s + x.size, 0),
    legacySourcesRetained: true,
  }),
)

if (!apply) {
  process.exit(0)
}

fs.mkdirSync(dir, { recursive: true })
const copied = []

try {
  for (const file of sourceFiles) {
    const dest = path.join(dir, file.relative)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(
      path.join(config, file.relative),
      dest,
      fs.constants.COPYFILE_EXCL,
    )
    copied.push(dest)
    const got = createHash("sha256").update(fs.readFileSync(dest)).digest("hex")

    if (got !== file.sha256) {
      throw new Error("Copied file checksum mismatch")
    }
  }
  fs.writeFileSync(
    path.join(dir, "legacy-migration-manifest.json"),
    JSON.stringify(
      {
        version: 1,
        owner,
        migratedAt: new Date().toISOString(),
        files: sourceFiles,
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  )
  console.log(
    `COPY_VERIFIED: ${copied.length} legacy files; originals remain intact`,
  )
} catch (err) {
  for (const p of copied.reverse()) {
    try {
      fs.unlinkSync(p)
    } catch {
      // A concurrently removed temporary file needs no further cleanup.
    }
  }
  throw err
}
