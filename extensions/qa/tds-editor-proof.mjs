import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { resolve, dirname } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const testRequire = createRequire(require.resolve("@playwright/test"))
const playwrightRequire = createRequire(testRequire.resolve("playwright"))
const coreIndex = playwrightRequire.resolve("playwright-core")
const { PNG } = require(resolve(dirname(coreIndex), "lib/utilsBundle.js"))

const phase = process.argv[2] ?? "phase-03"

if (!/^(?:phase-\d{2}|editor-control-repeat)$/u.test(phase)) {
  throw new Error("Invalid phase")
}

const root = fileURLToPath(
  new URL(
    "../../docs/extensions/qa-evidence/design-system-20261110/",
    import.meta.url,
  ),
)
const pairs = [
  "editor-question",
  "editor-media",
  "editor-scene-timeline",
  "editor-theme-settings",
].map((name) => {
  const control = readFileSync(resolve(root, "editor-control", `${name}.png`))
  const candidate = readFileSync(resolve(root, phase, `${name}.png`))
  const a = PNG.sync.read(control),
    b = PNG.sync.read(candidate)

  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("Editor capture dimensions changed")
  }

  const changes = []
  for (let offset = 0; offset < a.data.length; offset += 4) {
    if (
      !a.data
        .subarray(offset, offset + 4)
        .equals(b.data.subarray(offset, offset + 4))
    ) {
      changes.push({
        x: (offset / 4) % a.width,
        y: Math.floor(offset / 4 / a.width),
        delta: Math.max(
          ...Array.from({ length: 4 }, (_, i) =>
            Math.abs(a.data[offset + i] - b.data[offset + i]),
          ),
        ),
      })
    }
  }

  return {
    name,
    byteIdentical: control.equals(candidate),
    changedRgbaPixels: changes.length,
    samples: changes.slice(0, 20),
    control: createHash("sha256").update(control).digest("hex"),
    candidate: createHash("sha256").update(candidate).digest("hex"),
  }
})
const proof = {
  phase,
  sourceControl:
    "cb29c8c9010ebe26e22f8d8d1a22c101ec0a3a9475efd1aed4a1d5fa39bb8b2a",
  pairs,
}
writeFileSync(
  resolve(root, `${phase}-editor-proof.json`),
  `${JSON.stringify(proof, null, 2)}\n`,
)
console.log(JSON.stringify(proof, null, 2))
