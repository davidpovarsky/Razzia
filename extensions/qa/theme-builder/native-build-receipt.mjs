import {
  readFileSync,
  statSync,
  realpathSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { createHash } from "node:crypto"
const version2 = process.env.TADAZZ_NATIVE_ARTIFACT_VERSION === "2"
const prefix = version2 ? "/out/native-v2" : "/out/native"
const graph = JSON.parse(readFileSync(`${prefix}-module-receipt.json`, "utf8"))
const mounts = JSON.parse(
  readFileSync("/out/physical-mounts.json", "utf8"),
).sort((a, b) => b.destination.length - a.destination.length)
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
const inputs = graph.modules.map(({ id }) => {
  const [path] = id.split("?")

  if (!path.startsWith("/work/")) {
    return { id, observation: "virtual-module" }
  }

  try {
    const real = realpathSync(path),
      bytes = readFileSync(real),
      mount = mounts.find(
        (m) => real === m.destination || real.startsWith(m.destination + "/"),
      )

    return {
      id,
      observedRealpath: real,
      physicalSource: mount
        ? mount.source + real.slice(mount.destination.length)
        : null,
      sha256: sha(bytes),
      bytes: bytes.length,
    }
  } catch (error) {
    return { id, observation: "not-a-readable-file", code: error.code }
  }
})
const outputs = readdirSync(`${prefix}-candidate`)
  .filter((name) => statSync(`${prefix}-candidate/${name}`).isFile())
  .map((name) => {
    const bytes = readFileSync(`${prefix}-candidate/${name}`)

    return { path: name, bytes: bytes.length, sha256: sha(bytes) }
  })
const forbidden = graph.modules.filter(
  ({ id }) =>
    /\/core\/show-library\//u.test(id) &&
    !/\/(native-preview-frame-schema|stage-metadata-schema)\.ts$/u.test(id) &&
    !(version2 && /\/native-preview-renderer-v2-schema\.ts$/u.test(id)),
)
writeFileSync(
  `${prefix}-build-receipt.json`,
  JSON.stringify(
    {
      node: process.version,
      arch: process.arch,
      platform: process.platform,
      inputs,
      outputs,
      forbiddenPayloadModules: forbidden,
    },
    null,
    2,
  ),
)

if (
  forbidden.length ||
  inputs.some((entry) => entry.observation === "not-a-readable-file")
) {
  process.exitCode = 1
}
