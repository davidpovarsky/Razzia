import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trimEnd()
const original = "5161eb7022144ee26d46a5f94cdbc714ec8b560d"
const starting = "46a1e0049a23816b32d5061592bd373f0e636b9e"
const outputDir = process.argv[2] ?? "docs/extensions/qa-evidence/upstream-cleanup-20261108"
const originalFiles = git("ls-tree", "-r", "--name-only", original).split("\n")
const originalSet = new Set(originalFiles)
const numstat = target => git("diff", "--no-renames", "--numstat", original, ...target).split("\n").filter(Boolean).map(line => {
  const [added, removed, file] = line.split("\t")
  return { file, added: added === "-" ? null : Number(added), removed: removed === "-" ? null : Number(removed) }
})
const summarize = rows => {
  const changed = rows.filter(row => originalSet.has(row.file))
  const added = rows.filter(row => !originalSet.has(row.file))
  return {
    originalFiles: originalFiles.length,
    modifiedOriginals: changed.length,
    unchangedOriginals: originalFiles.length - changed.length,
    unchangedPercent: Number(((originalFiles.length - changed.length) / originalFiles.length * 100).toFixed(1)),
    addedTrackedFiles: added.length,
    originalInsertions: changed.reduce((n,r) => n + (r.added ?? 0), 0),
    originalDeletions: changed.reduce((n,r) => n + (r.removed ?? 0), 0),
    newFileLines: added.reduce((n,r) => n + (r.added ?? 0), 0),
  }
}
const startingRows = numstat([starting])
const currentRows = numstat([])
const upstreamFiles = new Set(git("diff", "--name-only", original, "upstream/main").split("\n"))
const upstreamHead = git("rev-parse", "upstream/main")
const changes = currentRows.filter(r => originalSet.has(r.file))
const classify = file => {
  if (/test|packages\/e2e/.test(file)) return { purpose: "Regression coverage / test harness integration", decision: "Retain test adaptation; update assertions against current UI/protocol rather than reverting tests.", risk: "low" }
  if (file.startsWith("packages/common")) return { purpose: "Shared protocol: mixed play modes, pause/host controls, presence and validation", decision: "Retain wire/schema additions: server and client must validate the same public messages. No feature implementation belongs here.", risk: "high" }
  if (/game\/index.ts$/.test(file)) return { purpose: "Game lifecycle + authenticated extension/session/player composition", decision: "Extracted roster and read-only show projections. Retain join, identity rebind, room authorization and game lifecycle seams; further split requires targeted integration proof.", risk: "high" }
  if (/round-manager.ts$/.test(file)) return { purpose: "Authoritative round control, pause, replay and score ledger integration", decision: "Extracted cinematic distribution. Retain authoritative clock, score/replay lifecycle and extension callbacks; do not relocate the upstream round engine.", risk: "high" }
  if (/api\/routes\/games.ts$/.test(file)) return { purpose: "Authenticated roster / spectator / pilot routes and existing game creation", decision: "Retain auth and registry-bound route composition. Future route factory extraction must preserve Hono RPC types and tenant context.", risk: "high" }
  if (/account|auth|middleware|config.ts|media.ts|app.ts|socket\/src\/index.ts/.test(file)) return { purpose: "Account isolation, authenticated storage/media or API composition", decision: "Retain security and persistence integration; bypassing these seams would risk cross-account data exposure. Review upstream auth/storage updates semantically.", risk: "high" }
  if (/locales|i18n.ts/.test(file)) return { purpose: "Translations and extension resource registration", decision: "Retain localized errors/labels and single resource registration hook; preserve upstream namespace keys on upgrade.", risk: "low" }
  if (/index.css$/.test(file)) return { purpose: "Extension CSS loading and fifth-answer token", decision: "Moved all appended downstream keyframes to extension CSS; retain one import, Tailwind source directive and shared fifth-answer token.", risk: "low" }
  if (/GameWrapper/.test(file)) return { purpose: "Host/player view composition, media readiness and extension stage seam", decision: "Extracted extension scene/interlude rendering and labels. Retain role contexts, subscriptions and existing host chrome; keep Classic early return before legacy mounts.", risk: "high" }
  if (/MediaLibrary\/index.tsx$/.test(file)) return { purpose: "Reusable media browser with show catalog and protected deletion", decision: "Extracted sidecar cleanup and used-media projection. Retain authenticated requests, upload and existing modal components.", risk: "medium" }
  if (/QuizzEditorHeader/.test(file)) return { purpose: "Editor save/conflict handling and Studio navigation", decision: "Extracted timeline-kind catalogue. Keep form/cache/routing integration and atomic composite save semantics; do not reintroduce legacy-only save.", risk: "medium" }
  if (/QuizzEditorSidebar/.test(file)) return { purpose: "Stable question IDs and mixed timeline drag/drop composition", decision: "Extracted scene-card presentation. Retain form/DnD integration; preserve stable metadata bindings during reorder/duplicate/delete.", risk: "medium" }
  if (/packages\/web\/src/.test(file)) return { purpose: "UI integration for rich answers, current show rendering, editing or account routes", decision: "Retain integration at the existing React/router/store boundary; rendering-only changes must preserve disabled/legacy behavior and theme precedence.", risk: /states|context|questions/.test(file) ? "high" : "medium" }
  return { purpose: "Workspace/build/runtime configuration", decision: "Retain additive workspace dependencies, aliases and runtime composition; review overlaps individually when adopting upstream dependencies.", risk: "medium" }
}
const ledger = changes.map(row => {
  const diff = git("diff", "--no-renames", "--unified=0", original, "--", row.file)
  const anchors = diff.split("\n").filter(line => line.startsWith("@@")).map(line => line.replace(/^@@.*?@@\s*/, "")).filter(Boolean)
  return { ...row, ...classify(row.file), upstreamAlsoChanged: upstreamFiles.has(row.file), anchors: [...new Set(anchors)].slice(0, 6) }
})
const report = {
  generatedAt: new Date().toISOString(), baseline: original, starting, head: git("rev-parse", "HEAD"), upstreamHead,
  methodology: "Only files present in the original Git tree count as modified originals. New tracked files are separate. Current tracked working-tree edits are included; untracked additions are not included in the totals until staged. Git line counts are quantitative, not proof that a retained change is minimal.",
  initial: summarize(startingRows), current: summarize(currentRows),
  perArea: Object.fromEntries(["packages/web", "packages/socket", "packages/common", "packages/e2e", "root"].map(area => {
    const rows = changes.filter(r => area === "root" ? !r.file.startsWith("packages/") : r.file.startsWith(area + "/"))
    return [area, { originals: rows.length, added: rows.reduce((n,r) => n+(r.added??0),0), removed: rows.reduce((n,r) => n+(r.removed??0),0) }]
  })), ledger,
}
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(path.join(outputDir, "source-audit.json"), JSON.stringify(report,null,2)+"\n")
const escape = value => String(value).replaceAll("|", "\\|").replaceAll("\n", " ")
const table = ledger.map(r => `| \`${r.file}\` | +${r.added ?? "binary"}/−${r.removed ?? "binary"} | ${r.risk} | ${r.upstreamAlsoChanged ? "yes" : "no"} | ${escape(r.purpose)} | ${escape(r.decision)} |`).join("\n")
fs.writeFileSync(path.join(outputDir, "SOURCE_LEDGER.md"), `# Original-file change ledger\n\nBaseline \`${original}\`; starting \`${starting}\`; upstream \`${upstreamHead}\`.\n\nGenerated by \`node scripts/audit-upstream.mjs\`. File-by-file inventory and maintenance decisions; not a claim of independent runtime acceptance for every row. Machine-readable hunk anchors are in source-audit.json.\n\n| Original file | Lines | Merge risk | Upstream overlap | Purpose | Maintenance decision |\n| --- | --- | --- | --- | --- | --- |\n${table}\n`)
console.log(JSON.stringify({ initial: report.initial, current: report.current, perArea: report.perArea, upstreamOverlap: ledger.filter(r=>r.upstreamAlsoChanged).map(r=>r.file) },null,2))
