import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
const walk = (directory) =>
  readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
const canonical = walk(resolve(root, "extensions/src/platform-ui")).filter(
  (path) => /\.(?:tsx?|css)$/u.test(path) && !path.endsWith(".test.ts"),
)
const files = [
  ...canonical,
  resolve(root, "extensions/src/site/web/shared/ReferenceCanvas.tsx"),
]
const errors = []
for (const path of files) {
  const text = readFileSync(path, "utf8")
  const name = relative(root, path).replaceAll("\\", "/")
  if (!name.endsWith("/tokens.ts") && /#[0-9a-f]{3,8}\b/iu.test(text))
    errors.push(`${name}: raw platform color outside token source`)
  if (/from\s+["'][^"']*(?:\/features\/quizz|\/editor)[^"']*["']/u.test(text))
    errors.push(`${name}: canonical UI must not import frozen editor`)
  if (/(?:^|[}"`])\s*(?:body|html|:root|\*)\s*\{/mu.test(text))
    errors.push(`${name}: unbounded CSS selector`)
}
if (errors.length) throw new Error(errors.join("\n"))
console.log(
  JSON.stringify(
    {
      status: "PASS",
      checked: files.map((path) => relative(root, path)),
      exceptions: [
        "tokens.ts is the source of primitive values",
        "immutable source artwork, legacy/site reference CSS, frozen editor/upstream, show-theme/cinematic runtime remain outside this incremental rule",
      ],
    },
    null,
    2,
  ),
)
