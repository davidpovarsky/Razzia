import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

const root = fileURLToPath(new URL("../../", import.meta.url))
const expected = {
  "extensions/src/presentation/tadazz-v4/motion.ts":
    "fcbca66b2200abae03cda5eef3aeebbbc0ef0027f9b1ba08d780a8823290257f",
  "extensions/src/presentation/tadazz-show/motion-engine.ts":
    "e45bc640bba10e8acfac6bbf9059b3e7a247b8d4d5cb23a16f1e5f8bb005da24",
  "extensions/src/presentation/audio-cue-player.tsx":
    "4f8d964123a494c688ddf45947b0224e4efb3a1e8367f415bbab57198f681d9a",
  "extensions/src/presentation/tadazz-v4/TadazzV4Stage.tsx":
    "5c3879c93825f6fa948d93500a5abbe370a0180777735d5229f0eb02f0cbe05d",
}

const files = Object.entries(expected).map(([path, hash]) => {
  const actual = createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex")

  if (actual !== hash) {
    throw new Error(`Cinematic owner changed: ${path}`)
  }

  return { path, sha256: actual, unchanged: true }
})

console.log(
  JSON.stringify(
    {
      status: "PASS",
      scope:
        "Cinematic stage, WAAPI engine, show motion bridge and audio cue owner remain byte-identical to TDS-10 start",
      files,
    },
    null,
    2,
  ),
)
