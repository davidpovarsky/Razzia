import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"

export const PROCESS_MEDIA_NAME = "synthetic.png"
export const PROCESS_BOUNDARIES = [
  "quarantine-copy",
  "staged-journal",
  "first-base-write",
  "last-sidecar-write",
  "binary-delete",
  "committed-journal",
  "quarantine-cleanup",
  "journal-cleanup",
  "quiz-base-write",
  "quiz-sidecar-write",
] as const
export type ProcessBoundary = (typeof PROCESS_BOUNDARIES)[number]

export function assertProcessFixture(root: string, token: string) {
  const resolved = fs.realpathSync(root)
  if (
    path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
    !path.basename(resolved).startsWith("tadazz-recovery-synthetic-")
  )
    throw new Error("Refusing non-synthetic process fixture")
  const marker = JSON.parse(
    fs.readFileSync(path.join(resolved, ".process-fixture.json"), "utf8"),
  )
  if (marker.token !== token || marker.kind !== "recovery-process-test")
    throw new Error("Process fixture ownership token mismatch")
  return resolved
}

export function processFixtureState(root: string) {
  const digest = (file: string) =>
    createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  const shows = Object.fromEntries(
    ["show-a", "show-b", "unrelated"].map((id) => {
      const base = path.join(root, "quizz", `${id}.json`)
      const sidecar = path.join(root, "extensions/quizzes", `${id}.json`)
      return [
        id,
        {
          base: JSON.parse(fs.readFileSync(base, "utf8")),
          extras: JSON.parse(fs.readFileSync(sidecar, "utf8")),
          baseSha256: digest(base),
          sidecarSha256: digest(sidecar),
        },
      ]
    }),
  )
  const journalRoot = path.join(root, "extensions/quizzes/.journal")
  const mediaJournalRoot = path.join(journalRoot, "media-delete")
  const quarantineRoot = path.join(mediaJournalRoot, "quarantine")
  const list = (directory: string, suffix: string) =>
    fs.existsSync(directory)
      ? fs
          .readdirSync(directory)
          .filter((file) => file.endsWith(suffix))
          .sort()
      : []
  const journals = [
    ...list(journalRoot, ".journal.json").map((file) =>
      path.join(journalRoot, file),
    ),
    ...list(mediaJournalRoot, ".media-journal.json").map((file) =>
      path.join(mediaJournalRoot, file),
    ),
  ].map((file) => ({
    path: path.relative(root, file),
    sha256: digest(file),
    entry: JSON.parse(fs.readFileSync(file, "utf8")),
  }))
  const media = path.join(root, "media", PROCESS_MEDIA_NAME)
  return {
    shows,
    mediaSha256: fs.existsSync(media) ? digest(media) : null,
    unrelatedMediaSha256: digest(path.join(root, "media/unrelated.bin")),
    journals,
    quarantine: list(quarantineRoot, PROCESS_MEDIA_NAME).map((file) => ({
      name: file,
      sha256: digest(path.join(quarantineRoot, file)),
    })),
  }
}
export type ProcessFixtureState = ReturnType<typeof processFixtureState>
