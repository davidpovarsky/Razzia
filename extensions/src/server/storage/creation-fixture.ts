import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import * as native from "../../../../packages/socket/src/services/config"
import {
  accountsEnabled,
  activeAccount,
} from "../../../../packages/socket/src/services/account-scope"
import {
  createNativeCreationPort,
  type CreationIntent,
} from "./creation-reservation"
import { CompositeStorageService } from "./service"
import { nativeInput, richNativeExtras } from "./native-binding-fixture"
import { creationFixtureParent } from "./creation-fixture-root"

export const creationInput = () => nativeInput("C1 native frozen source")
export const creationExtras = () =>
  richNativeExtras("source-id", creationInput())
export function nativeCreationComposition(root: string) {
  const port = createNativeCreationPort({
    configuredRoot: () => root,
    accountsEnabled,
    activeOwner: activeAccount,
    getPath: native.getPath,
    prepare: native.prepareNativeQuizCreation,
  })
  const service = new CompositeStorageService({
    ...native,
    creation: port,
    saveQuizz: () => {
      throw new Error("C1 must never call opaque saveQuizz")
    },
  })
  return { port, service }
}
export function creationTree(root: string) {
  const result: Record<string, unknown> = {}
  const walk = (relative: string) => {
    const file = path.join(root, relative)
    let stat: fs.BigIntStats
    try {
      stat = fs.lstatSync(file, { bigint: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort())
        walk(`${relative}/${name}`)
      return
    }
    const bytes = stat.isSymbolicLink()
      ? Buffer.from(fs.readlinkSync(file))
      : fs.readFileSync(file)
    result[relative] = {
      dev: String(stat.dev),
      ino: String(stat.ino),
      mode: Number(stat.mode & 0o777n),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      hex: bytes.toString("hex"),
      bytes: bytes.length,
      kind: stat.isSymbolicLink() ? "symlink" : "file",
    }
  }
  for (const relative of [
    "quizz",
    "extensions",
    "tenants",
    ".tadazz-creation-v1",
  ])
    walk(relative)
  return result
}
export function createCreationFixture() {
  const root = fs.mkdtempSync(
    path.join(creationFixtureParent(), "tadazz-c1-native-synthetic-"),
  )
  const token = crypto.randomUUID()
  fs.writeFileSync(
    path.join(root, ".c1-fixture.json"),
    JSON.stringify({ kind: "c1-synthetic", token }),
  )
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
  return { root, token, ...nativeCreationComposition(root) }
}
export function assertCreationFixture(root: string, token: string) {
  if (
    path.dirname(fs.realpathSync(root)) !== creationFixtureParent() ||
    !path.basename(root).startsWith("tadazz-c1-native-synthetic-")
  )
    throw new Error("Refusing non-synthetic C1 root")
  const descriptor = JSON.parse(
    fs.readFileSync(path.join(root, ".c1-fixture.json"), "utf8"),
  )
  if (descriptor.kind !== "c1-synthetic" || descriptor.token !== token)
    throw new Error("Wrong C1 synthetic ownership")
}
export function removeCreationFixture(root: string, token: string) {
  assertCreationFixture(root, token)
  fs.rmSync(root, { recursive: true, force: true })
}
export function creationIntents(root: string) {
  const result: Array<{ file: string; entry: CreationIntent }> = []
  const walk = (directory: string) => {
    if (!fs.existsSync(directory)) return
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name)
      if (fs.lstatSync(file).isDirectory()) walk(file)
      else if (name === "intent.json")
        result.push({ file, entry: JSON.parse(fs.readFileSync(file, "utf8")) })
    }
  }
  walk(path.join(root, ".tadazz-creation-v1"))
  return result
}
