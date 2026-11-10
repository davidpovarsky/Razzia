import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"

const root = fileURLToPath(new URL("../../", import.meta.url))
const roots = [
  "packages/web/src/components",
  "packages/web/src/features/game/components",
  "packages/web/src/features/manager/components/packages",
  "packages/web/src/features/quizz",
  "extensions/src/editor",
  "extensions/src/site",
  "extensions/src/presentation",
  "extensions/src/core/show-themes",
]
const paths = execFileSync("git", ["ls-files", "--", ...roots], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter((path) => /\.(?:tsx?|css|json)$/u.test(path))

function disposition(path) {
  if (/\/features\/quizz\/|extensions\/src\/editor\//u.test(path))
    return ["editor-protected", "existing-editor", "none; frozen"]
  if (/\.test\.ts$|\/tests?\//u.test(path))
    return [
      "not-in-scope",
      "existing-qa",
      "reuse regression coverage; do not rewrite historical assertions",
    ]
  if (/packages\/web\/src\/components\//u.test(path))
    return [
      "reuse-with-wrapper",
      "upstream-controls",
      "platform-only wrapper; upstream remains byte-identical",
    ]
  if (/packages\/web\/src\/features\/(?:game|manager)\//u.test(path))
    return [
      "replace-presentation-only",
      "existing-host-or-package",
      "extensions/src/platform-ui; exact owner-approved seam if unavoidable",
    ]
  if (/extensions\/src\/core\/show-themes\//u.test(path))
    return [
      "canonical",
      "show-theme-contract",
      "keep manifest/resolution and persisted IDs",
    ]
  if (/extensions\/src\/site\/web\/shared\//u.test(path))
    return [
      "reuse-with-wrapper",
      "site-shell",
      "extensions/src/platform-ui; retain route/account contracts",
    ]
  if (/extensions\/src\/site\//u.test(path))
    return [
      "canonical",
      "site-feature",
      "site presentation adopts canonical platform UI incrementally",
    ]
  if (/platform-controls|native-button-primitives/u.test(path))
    return [
      "legacy-compatibility-only",
      "shared-original-control-port",
      "leave existing editor consumers unchanged; new platform has a separate API",
    ]
  return [
    "not-in-scope",
    "show-presentation",
    "retain choreography/audio/WAAPI/Lottie; only documented boundary adapters may change",
  ]
}

const files = paths.sort().map((path) => {
  const text = readFileSync(resolve(root, path), "utf8")
  const [classification, owner, migration] = disposition(path)
  return {
    path,
    classification,
    owner,
    migration,
    sha256: createHash("sha256").update(text).digest("hex"),
    imports: [
      ...new Set(
        [
          ...text.matchAll(
            /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/gu,
          ),
        ].map((m) => m[1]),
      ),
    ].sort(),
    cssVariables: [
      ...new Set([...text.matchAll(/--[a-z][\w-]*/gu)].map((m) => m[0])),
    ].sort(),
    motionEvidence: text
      .split("\n")
      .flatMap((line, i) =>
        /\.animate\(|AnimatePresence|useSpring\(|\blayout(?:Id)?[=>\s]|@keyframes|animation:|dnd-kit/gu.test(
          line,
        )
          ? [{ line: i + 1, excerpt: line.trim().slice(0, 160) }]
          : [],
      ),
  }
})
const counts = files.reduce(
  (map, item) => ({
    ...map,
    [item.classification]: (map[item.classification] ?? 0) + 1,
  }),
  {},
)
const themes = ["classic", "razzia"].map((name) => {
  const path = `extensions/src/core/show-themes/${name}.manifest.json`
  const manifest = JSON.parse(readFileSync(resolve(root, path), "utf8"))
  return {
    path,
    id: manifest.id,
    rendererId: manifest.rendererId,
    adapterAssets: manifest.adapterAssets,
    assets: manifest.assets,
  }
})
const report = {
  schemaVersion: 1,
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  method:
    "Lexical source inventory, not a compiler-resolved dependency graph or proof of runtime animation playback. Historical tests classified separately; binary assets come from actual manifests.",
  roots,
  counts,
  themes,
  files,
}
writeFileSync(
  resolve(root, "docs/extensions/plans/tds-inventory.json"),
  JSON.stringify(report, null, 2) + "\n",
)
console.log(
  JSON.stringify(
    {
      files: files.length,
      counts,
      themes: themes.map((theme) => ({
        id: theme.id,
        rendererId: theme.rendererId,
        assets: theme.assets.length,
      })),
    },
    null,
    2,
  ),
)
