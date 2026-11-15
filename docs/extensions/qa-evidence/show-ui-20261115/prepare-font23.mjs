import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  realpathSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { rubikResourceEntries } from "./qa-rubik-resources.ts"
const root = "/tmp/native-font-fixture"
const retained = "/tmp/retained21"
const sha = (body) => createHash("sha256").update(body).digest("hex")
let checked = 0
for (const line of readFileSync(`${retained}/evidence-sha256.txt`, "utf8")
  .trim()
  .split("\n")) {
  const match = line.match(/^([a-f0-9]{64})\s+\/out\/(.+)$/u)
  if (!match || match[2].split("/").includes(".."))
    throw new Error("font:unsafe-retained-receipt")
  if (sha(readFileSync(`${retained}/${match[2]}`)) !== match[1])
    throw new Error(`font:retained-hash:${match[2]}`)
  checked++
}
if (checked !== 167) throw new Error("font:retained-receipt-count")
mkdirSync(root)
const inputs = []
function copy(source, name, expected, size) {
  const body = readFileSync(source)
  if (sha(body) !== expected || (size !== undefined && body.length !== size))
    throw new Error(`font:input-mismatch:${source}`)
  const target = `${root}/${name}`
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  chmodSync(target, 0o444)
  inputs.push({
    name,
    source,
    physicalPath: realpathSync(source),
    bytes: body.length,
    sha256: sha(body),
  })
}
const artifact = {
  js: "10b39d3e1a16b279f2b587a51fa777d7f5875ce2b88f88092f45acec29783340",
  css: "1aa026a06d84117e23d8a04ef038a5260691b982796e057c39906ff6d66259d9",
}
for (const extension of ["js", "css"])
  copy(
    `${retained}/native-v2-candidate/renderer-v2.${extension}`,
    `renderer.${extension}`,
    artifact[extension],
  )
const imageEntries = {
  "tadazz-show/motion/backdrop.webp":
    "a76a50432f43313d29e78f625302a256e7e7b71db322612c4b66ee3aef0cf37e",
  "tadazz-show/v4/question-bg.webp":
    "2f6912d851d8600e08d9a47d58e73dd40144fe30a908b82d10b3ba4036554321",
  "tadazz-show/v4/show-stage.webp":
    "9f3d1fe8d4458e98441303e728bba996b9a314295bbf5108f581c229f6db2d20",
  "tadazz-show/story/84acdb923677d591.webp":
    "84acdb923677d591d7641d8452eb185aad360b4b990d6e0879905ad0494dbdc6",
  "tadazz-show/v4/tadazz-brand-logo.png":
    "e50aaf5f62f60a83b5a84ea1d55a8068c2e754df5c917681da553771756ebabd",
  "tadazz-show/second-library/teaser-screen-source.jpg":
    "eaef71e6f2b59595eca49a5fb72df70e45f47a80351ea4d35e03d91f28851c17",
}
for (const [path, hash] of Object.entries(imageEntries))
  copy(`/fixture-base/${path}`, path, hash)
const require = createRequire("/work/extensions/package.json")
const packageRoot = dirname(
  require.resolve("@fontsource-variable/rubik/wght.css"),
)
for (const [url, [path, , expected, size]] of Object.entries(
  rubikResourceEntries,
)) {
  const source = resolve(
    packageRoot,
    url.endsWith(".css") ? "wght.css" : `files/${url.split("/").at(-1)}`,
  )
  copy(source, path, expected, size)
}
const browser =
  "/work/docs/extensions/qa-evidence/show-ui-20261115/qa-browser-v2.mjs"
copy(browser, "browser.mjs", sha(readFileSync(browser)))
writeFileSync("/out/font-artifact-index.json", JSON.stringify(artifact))
writeFileSync("/out/font-browser-sha.txt", sha(readFileSync(browser)))
writeFileSync(
  "/out/font-fixture-inputs.json",
  JSON.stringify(
    {
      retained21HashRowsVerified: checked,
      retainedRendererUnchanged: true,
      fontPackage: "@fontsource-variable/rubik@5.3.0",
      inputs,
    },
    null,
    2,
  ),
)
