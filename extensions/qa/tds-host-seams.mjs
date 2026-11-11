import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

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
  if (Array.isArray(value)) return value.map(clean)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !excluded.has(key))
      .map(([key, value]) => [key, clean(value)]),
  )
}
function prefix(source, name) {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  })
  let component
  function visit(value) {
    if (!value || typeof value !== "object") return
    if (value.type === "VariableDeclarator" && value.id?.name === name)
      component = value.init
    if (value.type === "FunctionDeclaration" && value.id?.name === name)
      component = value
    for (const [key, child] of Object.entries(value))
      if (!excluded.has(key)) {
        if (Array.isArray(child)) child.forEach(visit)
        else visit(child)
      }
  }
  visit(ast)
  if (!component || component.body?.type !== "BlockStatement")
    throw new Error(`Missing component ${name}`)
  // Only the final UI return is excluded. Includes original hooks, all action
  // closures, pending state, validators, calculations and conditional early returns.
  const statements = component.body.body
  if (statements.at(-1)?.type !== "ReturnStatement")
    throw new Error(`Unexpected component shape ${name}`)
  return JSON.stringify(clean(statements.slice(0, -1)))
}
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
  if (previous !== current)
    throw new Error(`Non-presentation component state/action change: ${path}`)
  return {
    path,
    component: name,
    nonUiAstSha256: createHash("sha256").update(current).digest("hex"),
    unchanged: true,
  }
})
console.log(
  JSON.stringify(
    {
      status: "PASS",
      base,
      scope:
        "Existing component state, hooks and action closures are identical; final UI composition is separately validated in actual browser tests",
      results,
    },
    null,
    2,
  ),
)
