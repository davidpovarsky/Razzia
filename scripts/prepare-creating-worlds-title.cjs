const fs = require("node:fs")
const crypto = require("node:crypto")
const path = require("node:path")
const root = path.resolve(__dirname, "..", "work")
const inputBase = path.join(root, "live-tzila-base-current-20261107.json")
const inputExtras = path.join(root, "live-tzila-current-20261107.json")
const destBase = path.join(
  root,
  "creating-worlds-base-rev7-release-20261107.json",
)
const destExtras = path.join(
  root,
  "creating-worlds-extras-rev7-release-20261107.json",
)
const dialNumber = "+44 330 613 1984"
const base = JSON.parse(fs.readFileSync(inputBase, "utf8"))
const extras = JSON.parse(fs.readFileSync(inputExtras, "utf8"))
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value))
    return (
      "[" +
      value.map((v) => (v === undefined ? "null" : canonical(v))).join(",") +
      "]"
    )
  return (
    "{" +
    Object.keys(value)
      .sort()
      .filter(
        (k) =>
          value[k] !== undefined &&
          typeof value[k] !== "function" &&
          typeof value[k] !== "symbol",
      )
      .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
      .join(",") +
    "}"
  )
}
const sha = (v) =>
  crypto.createHash("sha256").update(canonical(v)).digest("hex")
const oldDigest = sha(base)
if (oldDigest !== extras.baseDigest)
  throw new Error(
    "Base digest does NOT match live sidecar. Refusing title update. New digest " +
      oldDigest.slice(0, 10) +
      " sidecar digest " +
      extras.baseDigest.slice(0, 10),
  )
if (
  base.id !== extras.quizId ||
  base.questions.length !== 10 ||
  extras.questionIds.length !== 10 ||
  extras.roster.participants.length !== 40 ||
  extras.timeline.length !== 51 ||
  extras.revision !== 6
)
  throw new Error("Quiz shape unexpected")
const nextBase = { ...base, subject: "Creating Worlds" }
const nextExtras = structuredClone(extras)
nextExtras.baseDigest = sha(nextBase)
nextExtras.revision = extras.revision + 1
const directoryScenes = Object.values(nextExtras.scenes).filter(
  (scene) =>
    scene.kind === "animation" &&
    scene.preset === "representative-directory" &&
    scene.groupPage === undefined,
)
if (directoryScenes.length !== 1)
  throw new Error("Expected one settings-only representative directory")
directoryScenes[0].dialNumber = dialNumber
if (!/^[0-9a-f]{64}$/.test(nextExtras.baseDigest))
  throw new Error("New digest not SHA256")
for (const k of Object.keys(base))
  if (
    k !== "subject" &&
    JSON.stringify(base[k]) !== JSON.stringify(nextBase[k])
  )
    throw new Error("Base changed: " + k)
for (const k of Object.keys(extras))
  if (
    !["baseDigest", "revision", "scenes"].includes(k) &&
    JSON.stringify(extras[k]) !== JSON.stringify(nextExtras[k])
  )
    throw new Error("Extras changed: " + k)
const changedSceneIds = Object.keys(extras.scenes).filter(
  (id) =>
    JSON.stringify(extras.scenes[id]) !== JSON.stringify(nextExtras.scenes[id]),
)
if (changedSceneIds.length !== 1)
  throw new Error("Expected exactly one directory scene change")
const oldDirectory = extras.scenes[changedSceneIds[0]]
const newDirectory = nextExtras.scenes[changedSceneIds[0]]
for (const key of new Set([
  ...Object.keys(oldDirectory),
  ...Object.keys(newDirectory),
])) {
  if (
    key !== "dialNumber" &&
    JSON.stringify(oldDirectory[key]) !== JSON.stringify(newDirectory[key])
  )
    throw new Error("Directory scene changed: " + key)
}
for (const [dest, obj] of [
  [destBase, nextBase],
  [destExtras, nextExtras],
])
  fs.writeFileSync(dest, JSON.stringify(obj, null, 2) + "\n", { flag: "wx" })
console.log(
  JSON.stringify(
    {
      oldDigest,
      newDigest: nextExtras.baseDigest,
      oldSubject: base.subject,
      subject: nextBase.subject,
      oldRevision: extras.revision,
      revision: nextExtras.revision,
      questionCount: base.questions.length,
      rosterCount: extras.roster.participants.length,
      steps: extras.timeline.length,
      baseOutput: destBase,
      extrasOutput: destExtras,
    },
    null,
    2,
  ),
)
