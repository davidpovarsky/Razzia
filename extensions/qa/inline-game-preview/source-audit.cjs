const fs = require("node:fs")
const crypto = require("node:crypto")
const cp = require("node:child_process")
const path = require("node:path")
const base = "470804357c7e65b3ebe1d60cc6850ab164d8147a"
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex")
const git = (...args) =>
  cp.execFileSync("git", args, { encoding: "utf8" }).trim()
const changed = [
  ...new Set([
    ...git("diff", "--name-only", base, "--").split("\n"),
    ...git("ls-files", "--others", "--exclude-standard").split("\n"),
  ]),
].filter(Boolean)
const allowed =
  /^(?:extensions\/src\/site\/components\/game-preview\/|extensions\/src\/site\/server\/game-preview\/|extensions\/qa\/inline-game-preview\/|docs\/extensions\/qa-evidence\/inline-game-preview-20261115\/|extensions\/src\/site\/tests\/(?:browser\/)?inline-game-preview[^/]*$|extensions\/src\/site\/web\/marketing\/(?:Catalogue|MarketingSite)\.tsx$|extensions\/src\/site\/web\/studio\/(?:GameCard|MyGames)\.tsx$|extensions\/src\/site\/components\/HoverDevTiltCard\.tsx$|extensions\/site-assets\/(?:marketing|studio)\.css$)/
const denied = changed.filter((name) => !allowed.test(name))

if (denied.length) {
  throw Error(`Outside A task lease: ${denied.join(", ")}`)
}

const sourceFiles = changed.filter(
  (name) => /\.(?:ts|tsx|cjs|json)$/.test(name) && !name.startsWith("docs/"),
)
const files = Object.fromEntries(
  sourceFiles.map((name) => {
    const data = fs.readFileSync(name)

    return [name, { bytes: data.length, sha256: sha(data) }]
  }),
)
const inheritedNames = [
  "packages/socket/src/api/extensions/game-routes.ts",
  "packages/socket/src/api/extensions/theme-routes.ts",
  "packages/socket/src/api/index.ts",
  "packages/socket/src/api/routes/games.ts",
  "packages/socket/src/index.ts",
  "packages/socket/src/services/account-db.ts",
  "packages/socket/src/services/config.ts",
  "packages/socket/src/services/game/index.ts",
  "packages/socket/src/services/game/player-manager.ts",
  "packages/web/index.html",
  "packages/web/src/features/game/components/AnswerButton.tsx",
  "packages/web/src/features/quizz/components/studio/show-theme-settings.tsx",
]
const freeze = JSON.parse(
  fs.readFileSync("docs/extensions/plans/tds-freeze.json", "utf8"),
)
const inherited = inheritedNames.map((name) => {
  const current = sha(fs.readFileSync(name))
  const baseline = sha(cp.execFileSync("git", ["show", `${base}:${name}`]))

  if (current !== baseline) {
    throw Error(`Protected base modified: ${name}`)
  }

  return {
    path: name,
    currentSha256: current,
    baseSha256: baseline,
    historicalFreezeSha256: freeze.files[name],
  }
})
const result = {
  base,
  head: git("rev-parse", "HEAD"),
  taskLeaseDelta: "PASS",
  denied,
  changedPaths: changed,
  files,
  inheritedProtectedDifferences: inherited,
  historicalTdsGuard:
    "FAIL on supplied base; not replaced, reset or claimed green by this task-only audit",
}
const destination = path.resolve(
  "docs/extensions/qa-evidence/inline-game-preview-20261115/g1-pure-contracts/source-audit.json",
)
fs.writeFileSync(destination, JSON.stringify(result, null, 2))
console.log(
  JSON.stringify({
    taskLeaseDelta: "PASS",
    sourceFiles: sourceFiles.length,
    inheritedUnchanged: inherited.length,
    historicalTdsGuard: "FAIL",
  }),
)
