import fs from "node:fs"
import {
  normalizePhoneE164,
  quizExtrasV2Schema,
  rosterExtrasSchema,
} from "../extensions/src/core/index"

// Inputs and output live outside Git: they contain the private contact book.
const [sidecarPath, rosterPath, outputPath] = process.argv.slice(2)

if (!sidecarPath || !rosterPath || !outputPath) {
  throw new Error("Expected sidecar, validated roster, output paths")
}

const old = quizExtrasV2Schema.parse(
  JSON.parse(fs.readFileSync(sidecarPath, "utf8")),
)
const rawRoster: unknown = JSON.parse(fs.readFileSync(rosterPath, "utf8"))

if (
  !rawRoster ||
  typeof rawRoster !== "object" ||
  !("participants" in rawRoster)
) {
  throw new Error("Missing validated roster")
}

const source = rosterExtrasSchema.parse({
  phoneInviteOnly: true,
  participants: rawRoster.participants,
})
const removedPresets = new Set([
  "story-progress",
  "story-assembly",
  "story-live",
  "interlude",
])
const removed = old.timeline.filter(
  (item) =>
    item.kind === "animation" &&
    removedPresets.has((old.scenes[item.sceneId] as { preset: string }).preset),
)

if (old.revision !== 7 || old.timeline.length !== 51 || removed.length !== 15) {
  throw new Error(
    "Unexpected current revision/timeline; reconcile instead of overwriting",
  )
}

if (
  source.participants.length !== 37 ||
  source.participants.some((person) => person.tableNumber === undefined) ||
  new Set(source.participants.map((person) => person.tableNumber)).size !== 31
) {
  throw new Error("Roster counts differ")
}

for (const person of source.participants) {
  if (normalizePhoneE164(person.phoneE164) !== person.phoneE164) {
    throw new Error("Phone normalization mismatch")
  }
}

const output = structuredClone(old)
output.revision += 1
output.roster = { phoneInviteOnly: true, participants: source.participants }
const removedIds = new Set(removed.map((item) => item.id))
output.timeline = output.timeline.filter((item) => !removedIds.has(item.id))

for (const item of output.timeline) {
  if (item.kind !== "animation") {
    continue
  }

  const scene = output.scenes[item.sceneId]

  if (scene.kind === "animation" && scene.preset === "z-wipe") {
    scene.advance = "auto"
    scene.durationMs = 1800
  }
}

const parsed = quizExtrasV2Schema.parse(output)
fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`)
console.log(
  JSON.stringify({
    revision: parsed.revision,
    participants: parsed.roster.participants.length,
    tables: 31,
    removed: removed.length,
    timeline: parsed.timeline.length,
    topPicks: parsed.timeline.filter(
      (item) =>
        item.kind === "animation" &&
        (parsed.scenes[item.sceneId] as { preset: string }).preset ===
          "top-pick",
    ).length,
  }),
)
