import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import * as native from "../../../../packages/socket/src/services/config"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  quizExtrasV2Schema,
} from "../../core/index"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { writeSidecar } from "./sidecar"

export const NATIVE_MEDIA = "r1-native.png"
export const NATIVE_QUESTION = "00000000-0000-4000-8000-000000000081"
const SCENE = "00000000-0000-4000-8000-000000000082"
export type NativeBindingScenario =
  | "media"
  | "quiz-base"
  | "quiz-sidecar"
  | "media-foreign"
  | "quiz-foreign"
  | "media-sidecar-only"

export const nativeInput = (subject = "Native R1") => ({
  gameMode: "quiz",
  subject,
  questions: [
    {
      type: "single",
      question: "Synthetic native question",
      answers: ["A", "B"],
      solutions: [0],
      cooldown: 3,
      time: 20,
      media: { type: "image", url: `/media/${NATIVE_MEDIA}` },
    },
  ],
})
export const byteHash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex")

export function knownNativePath(root: string, id: string) {
  // Fixture setup only, with the ID just returned by native.saveQuizz. Never a
  // recovery ownership inference, directory delta or cleanup algorithm.
  const matches = fs.readdirSync(path.join(root, "quizz")).filter((file) => {
    const filePath = path.join(root, "quizz", file)
    return (
      fs.lstatSync(filePath).isFile() &&
      JSON.parse(fs.readFileSync(filePath, "utf8")).id === id
    )
  })
  if (matches.length !== 1)
    throw new Error("Fixture native ID must have exactly one known file")
  return path.join(root, "quizz", matches[0])
}

export function richNativeExtras(
  id: string,
  input: unknown,
  referenced = false,
) {
  const extras = createDefaultQuizExtrasV2(
    id,
    [NATIVE_QUESTION],
    computeCanonicalBaseDigest(quizzValidator.parse(input)),
  )
  extras.authoring = { showNote: "R1 native full V2\nretained note" }
  extras.scenes[SCENE] = {
    id: SCENE,
    kind: "opening",
    title: "Native scene",
    durationMs: 2000,
    advance: "manual",
    background: {
      url: "/media/other-background.png",
      fit: "cover",
      position: "center",
      overlayOpacity: 0.2,
    },
    audio: {
      mode: "custom",
      url: "/media/other-audio.mp3",
      volume: 0.4,
      loop: false,
    },
  }
  extras.timeline.unshift({
    id: crypto.randomUUID(),
    kind: "opening",
    sceneId: SCENE,
  })
  extras.perQuestion[NATIVE_QUESTION] = {
    answerVisuals: [
      {
        answerIndex: 0,
        display: "both",
        url: "/media/other-answer.png",
        alt: "R1 answer",
      },
    ],
    background: {
      url: referenced
        ? `/media/${NATIVE_MEDIA}`
        : "/media/other-background.png",
      fit: "contain",
      position: "center",
      overlayOpacity: 0.3,
    },
    questionEntrance: { preset: "fade", durationMs: 800 },
  }
  extras.mediaCatalog = [
    {
      name: "other-audio.mp3",
      url: "/media/other-audio.mp3",
      type: "audio",
      addedAt: 1,
    },
  ]
  extras.audio.cues.start = {
    source: "media",
    url: "/media/other-audio.mp3",
    volume: 0.6,
    enabled: true,
    loop: false,
  }
  return quizExtrasV2Schema.parse(extras)
}

export function assertNativeFixture(root: string, token: string) {
  const resolved = fs.realpathSync(root)
  if (
    path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
    !path.basename(resolved).startsWith("tadazz-native-recovery-synthetic-")
  )
    throw new Error("Refusing non-synthetic native fixture")
  const descriptor = JSON.parse(
    fs.readFileSync(path.join(resolved, ".native-fixture.json"), "utf8"),
  ) as NativeFixtureDescriptor
  if (descriptor.token !== token || descriptor.kind !== "native-recovery-r1")
    throw new Error("Native fixture ownership mismatch")
  return descriptor
}

export interface NativeFixtureDescriptor {
  kind: "native-recovery-r1"
  token: string
  scenario: NativeBindingScenario
  quizId: string
  baseName: string
  sidecarName: string
  unrelatedName: string
  foreignName?: string
  sidecarOnlyId?: string
}

export function makeNativeFixture(scenario: NativeBindingScenario) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "tadazz-native-recovery-synthetic-"),
  )
  fs.mkdirSync(path.join(root, "quizz"))
  fs.mkdirSync(path.join(root, "media"))
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
  const input = nativeInput()
  const { id } = native.saveQuizz(input)
  const baseName = path.basename(knownNativePath(root, id))
  writeSidecar(native.getPath, id, richNativeExtras(id, input))
  const unrelated = native.saveQuizz(nativeInput("Unrelated R1"))
  const unrelatedName = path.basename(knownNativePath(root, unrelated.id))
  const unrelatedFile = path.join(root, "quizz", unrelatedName)
  const unrelatedData = JSON.parse(fs.readFileSync(unrelatedFile, "utf8"))
  delete unrelatedData.questions[0].media
  fs.writeFileSync(unrelatedFile, JSON.stringify(unrelatedData, null, 2))
  fs.writeFileSync(
    path.join(root, "media", NATIVE_MEDIA),
    Buffer.alloc(64 * 1024 + 3, 23),
  )
  const descriptor: NativeFixtureDescriptor = {
    kind: "native-recovery-r1",
    token: crypto.randomUUID(),
    scenario,
    quizId: id,
    baseName,
    sidecarName: `${id}.json`,
    unrelatedName,
  }
  if (scenario.endsWith("foreign")) {
    const foreign = native.saveQuizz(nativeInput("Foreign sentinel"))
    const original = knownNativePath(root, foreign.id)
    const foreignData = JSON.parse(fs.readFileSync(original, "utf8"))
    delete foreignData.questions[0].media
    fs.writeFileSync(original, JSON.stringify(foreignData, null, 2))
    descriptor.foreignName = `${id}.json`
    fs.renameSync(original, path.join(root, "quizz", descriptor.foreignName))
  }
  if (scenario === "media-sidecar-only") {
    const orphan = native.saveQuizz(nativeInput("Sidecar only"))
    fs.unlinkSync(knownNativePath(root, orphan.id)) // only this just-created fixture base
    writeSidecar(
      native.getPath,
      orphan.id,
      richNativeExtras(orphan.id, nativeInput("Sidecar only"), true),
    )
    descriptor.sidecarOnlyId = orphan.id
  }
  fs.writeFileSync(
    path.join(root, ".native-fixture.json"),
    JSON.stringify(descriptor),
  )
  return { root, descriptor, input }
}

export function nativeFixtureState(root: string) {
  const files: Record<
    string,
    { sha256: string; length: number; json?: unknown }
  > = {}
  for (const subPath of ["quizz", "extensions/quizzes", "media"]) {
    const directory = path.join(root, subPath)
    if (!fs.existsSync(directory)) continue
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name)
      const stat = fs.lstatSync(file)
      if (stat.isDirectory()) continue
      if (!stat.isFile())
        throw new Error("Unexpected non-regular fixture entry")
      const bytes = fs.readFileSync(file)
      files[`${subPath}/${name}`] = {
        sha256: byteHash(bytes),
        length: bytes.length,
        ...(name.endsWith(".json")
          ? { json: JSON.parse(bytes.toString("utf8")) }
          : {}),
      }
    }
  }
  const journalRoot = path.join(root, "extensions/quizzes/.journal")
  const journals: Array<{ path: string; sha256: string; entry: unknown }> = []
  const walk = (directory: string) => {
    if (!fs.existsSync(directory)) return
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name)
      const stat = fs.lstatSync(file)
      if (stat.isDirectory()) walk(file)
      else if (stat.isFile() && name.endsWith(".json"))
        journals.push({
          path: path.relative(root, file),
          sha256: byteHash(fs.readFileSync(file)),
          entry: JSON.parse(fs.readFileSync(file, "utf8")),
        })
    }
  }
  walk(journalRoot)
  return { files, journals }
}

export function removeNativeFixture(root: string, token: string) {
  assertNativeFixture(root, token)
  fs.rmSync(root, { recursive: true, force: true })
}
