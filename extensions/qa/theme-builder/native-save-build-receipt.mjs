import {
  readFileSync,
  writeFileSync,
  statSync,
  realpathSync,
  existsSync,
  readdirSync,
} from "node:fs"
import { createHash } from "node:crypto"
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const graph = JSON.parse(
  readFileSync("/out/native-save-browser-closure.json", "utf8"),
)
if (graph.forbidden.length)
  throw new Error("Forbidden Native Save browser dependency")
const mounts = JSON.parse(
  readFileSync("/out/physical-mounts.json", "utf8"),
).sort((a, b) => b.destination.length - a.destination.length)
const inputs = []
for (const id of graph.modules) {
  const path = id.split("?")[0]
  if (!path.startsWith("/") || !existsSync(path) || !statSync(path).isFile())
    continue
  const observedRealpath = realpathSync(path),
    bytes = readFileSync(observedRealpath)
  const mount = mounts.find(
    (m) =>
      observedRealpath === m.destination ||
      observedRealpath.startsWith(m.destination + "/"),
  )
  if (!mount) throw new Error(`Unmapped physical dependency: ${id}`)
  inputs.push({
    id,
    observedRealpath,
    physicalSource:
      mount.source + observedRealpath.slice(mount.destination.length),
    bytes: bytes.length,
    sha256: hash(bytes),
  })
}
const foreign = JSON.parse(readFileSync("/out/foreign-inputs.json", "utf8"))
for (const input of foreign.inputs) {
  const observed = inputs.find((value) => value.id === "/work/" + input.path)
  if (!observed || observed.sha256 !== input.sha256)
    throw new Error(`F DTO source mismatch: ${input.path}`)
}
const outputs = []
function visit(root, prefix = "") {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = prefix + entry.name,
      absolute = root + "/" + entry.name
    if (entry.isDirectory()) visit(absolute, path + "/")
    else {
      const bytes = readFileSync(absolute)
      outputs.push({ path, bytes: bytes.length, sha256: hash(bytes) })
    }
  }
}
visit("/out/native-save-ui")
writeFileSync(
  "/out/native-save-build-receipt.json",
  JSON.stringify(
    {
      node: process.version,
      arch: process.arch,
      producerCommit: foreign.producerCommit,
      inputs,
      outputs,
      forbidden: graph.forbidden,
    },
    null,
    2,
  ),
)
