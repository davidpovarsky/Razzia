import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs"
import { dirname } from "node:path"
import { createHash } from "node:crypto"
const root =
  process.env.TADAZZ_QA_FIXTURE_TMP === "1"
    ? "/tmp/native-fixture"
    : "/out/native-fixture"
mkdirSync(root)
const paths = [
  "tadazz-show/motion/backdrop.webp",
  "tadazz-show/v4/question-bg.webp",
  "tadazz-show/v4/show-stage.webp",
  "tadazz-show/story/84acdb923677d591.webp",
  "tadazz-show/v4/tadazz-brand-logo.png",
  "tadazz-show/second-library/teaser-screen-source.jpg",
]
const sha = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex")
for (const path of paths) {
  mkdirSync(dirname(`${root}/${path}`), { recursive: true })
  copyFileSync(`/fixture-base/${path}`, `${root}/${path}`)
  chmodSync(`${root}/${path}`, 0o444)
}
for (const name of ["renderer.js", "renderer.css"]) {
  copyFileSync(`/out/native-candidate/${name}`, `${root}/${name}`)
  chmodSync(`${root}/${name}`, 0o444)
}
copyFileSync(
  "/work/docs/extensions/qa-evidence/show-ui-20261115/qa-browser.mjs",
  `${root}/browser.mjs`,
)
chmodSync(`${root}/browser.mjs`, 0o444)
writeFileSync(
  "/out/native-artifact-index.json",
  JSON.stringify({
    js: sha(`${root}/renderer.js`),
    css: sha(`${root}/renderer.css`),
  }),
)
writeFileSync("/out/native-browser-sha.txt", sha(`${root}/browser.mjs`))
writeFileSync(
  "/out/native-fixture-inputs.json",
  JSON.stringify(
    [...paths, "renderer.js", "renderer.css", "browser.mjs"].map((path) => ({
      path,
      sha256: sha(`${root}/${path}`),
    })),
    null,
    2,
  ),
)
