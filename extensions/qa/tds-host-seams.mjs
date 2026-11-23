import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
const require = createRequire(new URL("../package.json", import.meta.url))
const { parse } = require("@babel/parser")
const base = "2dd112613ffbace71420242f4e302afe13d2067b"
const files = [
  ["ManagerControlToolbar.tsx", "ManagerControlToolbar"],
  ["GameWrapper.tsx", "GameWrapperView"],
  ["HostPlayersModal.tsx", "HostPlayersModal"],
  ["HistoryDialog.tsx", "HistoryDialog"],
  ["HostShortcutsDialog.tsx", "HostShortcutsDialog"],
  ["GameSettingsModal/index.tsx", "GameSettingsModal"],
  ["states/Room.tsx", "Room"],
  ["tadazz-show/TadazzScreens.tsx", "TadazzLobbyScreen"],
]
const excluded = new Set([
  "start",
  "end",
  "loc",
  "extra",
  "leadingComments",
  "trailingComments",
  "innerComments",
])
function clean(value) {
  if (Array.isArray(value)) {
    return value.map(clean)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !excluded.has(key))
      .map(([key, child]) => [key, clean(child)]),
  )
}
function prefix(source, name) {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  })
  let component = undefined
  function visit(value) {
    if (!value || typeof value !== "object") {
      return
    }

    if (value.type === "VariableDeclarator" && value.id?.name === name) {
      component = value.init
    }

    if (value.type === "FunctionDeclaration" && value.id?.name === name) {
      component = value
    }

    for (const [key, child] of Object.entries(value)) {
      if (!excluded.has(key)) {
        if (Array.isArray(child)) {
          child.forEach(visit)
        } else {
          visit(child)
        }
      }
    }
  }
  visit(ast)

  if (!component || component.body?.type !== "BlockStatement") {
    throw new Error(`Missing component ${name}`)
  }

  // Only the final UI return is excluded. Includes original hooks, all action
  // closures, pending state, validators, calculations and conditional early returns.
  const statements = component.body.body

  if (statements.at(-1)?.type !== "ReturnStatement") {
    throw new Error(`Unexpected component shape ${name}`)
  }

  return JSON.stringify(clean(statements.slice(0, -1)))
}
const approvedTds09NonUiAst = new Map([
  [
    "packages/web/src/features/game/components/HostPlayersModal.tsx",
    "911e8a2099bc623dde59cad15c0c673fab758864b3d3766fc5f7b33d126f61f2",
  ],
  [
    "packages/web/src/features/game/components/GameSettingsModal/index.tsx",
    "2d2de7b76eb7776d95c2fa71ddda3309c9b529e81a1709b5cf2440abb16867e7",
  ],
])
const results = files.map(([file, name]) => {
  const path = `packages/web/src/features/game/components/${file}`
  const previous = prefix(
    execFileSync("git", ["show", `${base}:${path}`], {
      cwd: root,
      encoding: "utf8",
    }),
    name,
  )
  const current = prefix(readFileSync(resolve(root, path), "utf8"), name)
  const currentHash = createHash("sha256").update(current).digest("hex")
  const expectedHash = approvedTds09NonUiAst.get(path)

  return {
    path,
    component: name,
    nonUiAstSha256: currentHash,
    guardedAgainst: expectedHash ? "TDS-09 approved seam" : base,
    unchanged: expectedHash
      ? currentHash === expectedHash
      : previous === current,
  }
})
const unexpected = results.filter((result) => !result.unchanged)

if (unexpected.length) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        reason: "Non-presentation component state/action change",
        unexpected,
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      base,
      scope:
        "Unapproved host state/actions remain AST-identical to TDS-07; the two owner-approved TDS-09 policy/error seams are pinned to exact reviewed AST hashes; final UI composition is validated in browsers",
      results,
    },
    null,
    2,
  ),
)
