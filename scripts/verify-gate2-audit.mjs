/* eslint-disable */
// @ts-nocheck
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dirname, "..")
const INTEGRATION_MD_PATH = resolve(
  REPO_ROOT,
  "docs/extensions/orchestration/handoffs/tomer/INTEGRATION.md",
)

function getActualGitFiles() {
  const output = execSync(
    'git diff --name-only "a11f870^" a11f870 -- extensions/src/editor extensions/src/media extensions/src/presentation extensions/src/telephony packages/web/src',
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  )
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseDocumentedAuditFiles() {
  const content = readFileSync(INTEGRATION_MD_PATH, "utf8")
  const lines = content.split(/\r?\n/)

  const paths = []
  let inAuditTable = false
  let pathColIndex = -1

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect header of Gate 2 audit table
    if (trimmed.startsWith("|") && trimmed.includes("Exact Git path")) {
      inAuditTable = true
      const columns = trimmed
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim())
      pathColIndex = columns.findIndex((c) => c === "Exact Git path")
      continue
    }

    if (inAuditTable) {
      if (!trimmed.startsWith("|")) {
        // Table ended
        inAuditTable = false
        continue
      }

      // Skip separator row (e.g. | :- | :--- |)
      if (trimmed.includes("---") || trimmed.includes(":-")) {
        continue
      }

      const columns = trimmed
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim())
      if (pathColIndex >= 0 && pathColIndex < columns.length) {
        const rawPath = columns[pathColIndex]
        const cleanPath = rawPath.replace(/`/g, "").trim()
        if (cleanPath) {
          paths.push(cleanPath)
        }
      }
    }
  }

  return paths
}

function main() {
  const actualGitFiles = getActualGitFiles()
  const documentedAuditFiles = parseDocumentedAuditFiles()

  const actualSet = new Set(actualGitFiles)
  const documentedSet = new Set(documentedAuditFiles)

  const missingPaths = actualGitFiles.filter((file) => !documentedSet.has(file))
  const extraPaths = documentedAuditFiles.filter((file) => !actualSet.has(file))

  const seen = new Set()
  let duplicateCount = 0
  for (const path of documentedAuditFiles) {
    if (seen.has(path)) {
      duplicateCount += 1
    } else {
      seen.add(path)
    }
  }

  const isExactMatch =
    actualGitFiles.length === 23 &&
    documentedAuditFiles.length === 23 &&
    missingPaths.length === 0 &&
    extraPaths.length === 0 &&
    duplicateCount === 0

  console.log(`ACTUAL_GIT_FILES: ${actualGitFiles.length}`)
  console.log(`DOCUMENTED_AUDIT_FILES: ${documentedAuditFiles.length}`)
  console.log(`MISSING_PATHS: ${missingPaths.length}`)
  console.log(`EXTRA_PATHS: ${extraPaths.length}`)
  console.log(`DUPLICATE_PATHS: ${duplicateCount}`)
  console.log(`EXACT_SET_MATCH: ${isExactMatch ? "PASS" : "FAIL"}`)

  if (!isExactMatch) {
    if (missingPaths.length > 0) {
      console.error("\nMissing paths (in git diff, not in audit table):")
      for (const p of missingPaths) {
        console.error(`  - ${p}`)
      }
    }
    if (extraPaths.length > 0) {
      console.error("\nExtra paths (in audit table, not in git diff):")
      for (const p of extraPaths) {
        console.error(`  - ${p}`)
      }
    }
    process.exit(1)
  }

  process.exit(0)
}

main()
