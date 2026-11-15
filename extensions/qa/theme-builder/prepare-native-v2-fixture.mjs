// New private V2 fixture; no mutation of the retained dd3/six-image fixture.
import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs"
import { dirname } from "node:path"
import { createHash } from "node:crypto"
const root = "/tmp/native-v2-fixture"
mkdirSync(root)
const paths = [
  "tadazz-show/motion/backdrop.webp",
  "tadazz-show/v4/question-bg.webp",
  "tadazz-show/v4/show-stage.webp",
  "tadazz-show/story/84acdb923677d591.webp",
  "tadazz-show/v4/tadazz-brand-logo.png",
  "tadazz-show/second-library/teaser-screen-source.jpg",
]
for (const path of paths) {
  mkdirSync(dirname(`${root}/${path}`), { recursive: true })
  copyFileSync(`/fixture-base/${path}`, `${root}/${path}`)
  chmodSync(`${root}/${path}`, 0o444)
}
for (const extension of ["js", "css"]) {
  copyFileSync(
    `/out/native-v2-candidate/renderer-v2.${extension}`,
    `${root}/renderer.${extension}`,
  )
  chmodSync(`${root}/renderer.${extension}`, 0o444)
}
copyFileSync(
  "/work/docs/extensions/qa-evidence/show-ui-20261115/qa-browser-v2.mjs",
  `${root}/browser.mjs`,
)
chmodSync(`${root}/browser.mjs`, 0o444)
const sha = (path) =>
  createHash("sha256")
    .update(readFileSync(`${root}/${path}`))
    .digest("hex")
writeFileSync(
  "/out/native-v2-artifact-index.json",
  JSON.stringify({ js: sha("renderer.js"), css: sha("renderer.css") }),
)
writeFileSync("/out/native-v2-browser-sha.txt", sha("browser.mjs"))
writeFileSync(
  "/out/native-v2-fixture-inputs.json",
  JSON.stringify(
    [...paths, "renderer.js", "renderer.css", "browser.mjs"].map((path) => ({
      path,
      sha256: sha(path),
    })),
    null,
    2,
  ),
)
