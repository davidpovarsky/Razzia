import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"

type GetPath = (subPath?: string) => string
export type RecordKind = "base" | "sidecar"
interface Image {
  raw: string
  sha256: string
  length: number
}
interface Identity {
  dev: string
  ino: string
  mode: number
}
interface Prepared extends Image, Identity {
  relativePath: string
}
export interface PhysicalBinding {
  version: 1
  root: string
  relativePath: string
  quizId: string
  kind: RecordKind
  original: (Image & Identity) | null
  targets: Image[]
  preparedTarget: Prepared
  preparedBackup: Prepared | null
}
const image = (raw: string): Image => ({
  raw,
  sha256: createHash("sha256").update(raw).digest("hex"),
  length: Buffer.byteLength(raw),
})
const identity = (stat: fs.BigIntStats): Identity => ({
  dev: String(stat.dev),
  ino: String(stat.ino),
  mode: Number(stat.mode & 0o777n),
})
const sameIdentity = (a: Identity, b: Identity) =>
  a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
const sameImage = (a: Image, b: Image) =>
  a.raw === b.raw && a.sha256 === b.sha256 && a.length === b.length
function checkImage(value: Image) {
  if (
    !value ||
    typeof value.raw !== "string" ||
    !sameImage(value, image(value.raw))
  )
    throw new Error("Invalid recorded byte image")
}
function safePath(getPath: GetPath, relative: string) {
  if (
    typeof relative !== "string" ||
    relative.includes("\\") ||
    relative.includes(":") ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Unsafe physical binding path")
  const root = path.resolve(getPath())
  if (fs.realpathSync(root) !== root)
    throw new Error("Linked configuration root")
  const parts = relative.split("/")
  let parent = root
  for (const part of parts.slice(0, -1)) {
    parent = path.join(parent, part)
    const stat = fs.lstatSync(parent)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Linked or invalid binding parent")
  }
  return path.join(parent, parts.at(-1)!)
}
export function readPhysicalFile(getPath: GetPath, relative: string) {
  const file = safePath(getPath, relative)
  try {
    const before = fs.lstatSync(file, { bigint: true })
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n)
      throw new Error("Binding target is not a private regular file")
    const fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    )
    try {
      const opened = fs.fstatSync(fd, { bigint: true })
      if (!sameIdentity(identity(before), identity(opened)))
        throw new Error("Binding target changed while opening")
      const bytes = fs.readFileSync(fd)
      const after = fs.fstatSync(fd, { bigint: true })
      if (
        opened.size !== after.size ||
        opened.mtimeNs !== after.mtimeNs ||
        opened.ctimeNs !== after.ctimeNs
      )
        throw new Error("Binding target changed while reading")
      const raw = bytes.toString("utf8")
      if (!Buffer.from(raw).equals(bytes))
        throw new Error("Binding target is not exact UTF-8")
      return { ...image(raw), ...identity(opened) }
    } finally {
      fs.closeSync(fd)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}
function validateKind(
  raw: string,
  kind: RecordKind,
  id: string,
  relative: string,
) {
  const record = JSON.parse(raw) as Record<string, unknown>
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error("Invalid bound JSON record")
  if (kind === "sidecar") {
    if (
      record.quizId !== id ||
      (record.schemaVersion !== 1 && record.schemaVersion !== 2)
    )
      throw new Error("Bound sidecar identity mismatch")
  } else {
    if ("schemaVersion" in record || !Array.isArray(record.questions))
      throw new Error("Sidecar or invalid data used as base")
    if ("id" in record ? record.id !== id : relative !== `quizz/${id}.json`)
      throw new Error("Bound base identity mismatch")
  }
}
/** Read-only lookup: filenames never override an explicit foreign embedded ID. */
export function resolvePhysicalBase(
  getPath: GetPath,
  id: string,
): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid quiz identity")
  const root = path.resolve(getPath())
  const directory = path.join(root, "quizz")
  if (!fs.existsSync(directory)) return null
  safePath(getPath, "quizz/.binding-check")
  const matches: string[] = []
  for (const name of fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))) {
    const relative = `quizz/${name}`
    const stat = fs.lstatSync(path.join(directory, name))
    if (!stat.isFile() || stat.isSymbolicLink()) {
      if (name === `${id}.json`) throw new Error("Unsafe ID-named candidate")
      continue
    }
    let record: Record<string, unknown>
    try {
      record = JSON.parse(readPhysicalFile(getPath, relative)!.raw)
    } catch (error) {
      if (name === `${id}.json`) throw error
      continue
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      if (name === `${id}.json`) throw new Error("Invalid ID-named candidate")
      continue
    }
    if (
      record &&
      (record.id === id ||
        (typeof record.id !== "string" && name === `${id}.json`))
    ) {
      validateKind(JSON.stringify(record), "base", id, relative)
      matches.push(relative)
    }
  }
  if (matches.length > 1) throw new Error("Ambiguous physical quiz identity")
  return matches[0] ?? null
}
export function preparePhysicalBinding(
  getPath: GetPath,
  quizId: string,
  kind: RecordKind,
  relativePath: string,
  target: unknown,
): PhysicalBinding {
  const prefix = kind === "base" ? "quizz/" : "extensions/quizzes/"
  if (
    !relativePath.startsWith(prefix) ||
    relativePath.slice(prefix.length).includes("/") ||
    (kind === "sidecar" && relativePath !== `${prefix}${quizId}.json`)
  )
    throw new Error("Physical kind/path mismatch")
  const original = readPhysicalFile(getPath, relativePath)
  if (original) validateKind(original.raw, kind, quizId, relativePath)
  let physicalTarget = target
  if (kind === "base" && original) {
    const previous = JSON.parse(original.raw) as Record<string, unknown>
    if (
      "id" in previous &&
      target &&
      typeof target === "object" &&
      !("id" in target)
    )
      physicalTarget = { id: quizId, ...target }
  }
  const rawTargets =
    physicalTarget === null ? [] : [JSON.stringify(physicalTarget, null, 2)]
  if (kind === "base" && rawTargets.length !== 1)
    throw new Error("Missing exact base publication plan")
  for (const raw of rawTargets) validateKind(raw, kind, quizId, relativePath)
  const privateDir = getPath("extensions/quizzes/.journal/.bindings")
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 })
  const prepare = (raw: string): Prepared => {
    const relative = `extensions/quizzes/.journal/.bindings/${randomUUID()}.record`
    const file = safePath(getPath, relative)
    fs.writeFileSync(file, raw, {
      encoding: "utf8",
      flag: "wx",
      mode: original?.mode ?? 0o600,
    })
    return { ...readPhysicalFile(getPath, relative)!, relativePath: relative }
  }
  return {
    version: 1,
    root: path.resolve(getPath()),
    relativePath,
    quizId,
    kind,
    original,
    targets: rawTargets.map(image),
    preparedTarget: prepare(rawTargets.at(-1) ?? "null"),
    preparedBackup: original ? prepare(original.raw) : null,
  }
}
export function assertPhysicalBinding(
  getPath: GetPath,
  binding: PhysicalBinding,
) {
  if (
    !binding ||
    !Array.isArray(binding.targets) ||
    binding.targets.length > 1 ||
    (binding.kind === "base" && binding.targets.length !== 1)
  )
    throw new Error("Ambiguous physical byte publication plan")
  if (
    !binding ||
    binding.version !== 1 ||
    binding.root !== path.resolve(getPath()) ||
    !/^[A-Za-z0-9_-]+$/.test(binding.quizId)
  )
    throw new Error("Missing, foreign-scope or incompatible physical binding")
  const prefix =
    binding.kind === "base"
      ? "quizz/"
      : binding.kind === "sidecar"
        ? "extensions/quizzes/"
        : ""
  if (
    !prefix ||
    !binding.relativePath.startsWith(prefix) ||
    binding.relativePath.slice(prefix.length).includes("/") ||
    (binding.kind === "sidecar" &&
      binding.relativePath !== `${prefix}${binding.quizId}.json`)
  )
    throw new Error("Physical binding kind mismatch")
  for (const expected of [
    ...binding.targets,
    ...(binding.original ? [binding.original] : []),
    binding.preparedTarget,
    ...(binding.preparedBackup ? [binding.preparedBackup] : []),
  ])
    checkImage(expected)
  if (binding.original)
    validateKind(
      binding.original.raw,
      binding.kind,
      binding.quizId,
      binding.relativePath,
    )
  for (const target of binding.targets)
    validateKind(target.raw, binding.kind, binding.quizId, binding.relativePath)
  if (
    binding.preparedBackup &&
    (!binding.original || !sameImage(binding.preparedBackup, binding.original))
  )
    throw new Error("Prepared backup differs from original bytes")
  if (
    binding.targets.length &&
    !binding.targets.some((target) => sameImage(target, binding.preparedTarget))
  )
    throw new Error("Prepared target differs from declared bytes")
  const current = readPhysicalFile(getPath, binding.relativePath)
  if (!current) {
    if (binding.original) throw new Error("Recorded target disappeared")
    return null
  }
  validateKind(current.raw, binding.kind, binding.quizId, binding.relativePath)
  const identities = [
    binding.original,
    binding.preparedTarget,
    binding.preparedBackup,
  ].filter((value): value is Image & Identity => value !== null)
  if (!identities.some((value) => sameIdentity(value, current)))
    throw new Error("Recorded target inode changed")
  const originalForms = binding.original ? [binding.original] : []
  if (
    ![...binding.targets, ...originalForms].some((value) =>
      sameImage(value, current),
    )
  )
    throw new Error("Recorded target content changed")
  if (
    binding.kind === "base" &&
    resolvePhysicalBase(getPath, binding.quizId) !== binding.relativePath
  )
    throw new Error("Recorded base is no longer unambiguous")
  return current
}
export function assertPhysicalGroup(
  getPath: GetPath,
  bindings: PhysicalBinding[],
) {
  for (const binding of bindings) assertPhysicalBinding(getPath, binding)
}
/** Check every private image still needed before restoring any public sibling.
 * A sibling already restored to authenticated original bytes needs no image.
 */
export function assertPhysicalRestoreGroup(
  getPath: GetPath,
  bindings: PhysicalBinding[],
) {
  for (const binding of bindings) {
    const current = assertPhysicalBinding(getPath, binding)
    if (!binding.original || (current && sameImage(current, binding.original)))
      continue
    if (!binding.preparedBackup)
      throw new Error("Missing original byte snapshot")
    preparedPath(getPath, binding.preparedBackup)
  }
}
function preparedPath(getPath: GetPath, prepared: Prepared) {
  if (
    !/^extensions\/quizzes\/\.journal\/\.bindings\/[a-f0-9-]+\.record$/.test(
      prepared.relativePath,
    )
  )
    throw new Error("Invalid private prepared record")
  const snapshot = readPhysicalFile(getPath, prepared.relativePath)
  if (
    !snapshot ||
    !sameIdentity(snapshot, prepared) ||
    !sameImage(snapshot, prepared)
  )
    throw new Error("Prepared record changed")
  return safePath(getPath, prepared.relativePath)
}
/** Atomic base publication preserves the identity recorded BEFORE the rename. */
export function publishPhysicalTarget(
  getPath: GetPath,
  binding: PhysicalBinding,
) {
  assertPhysicalBinding(getPath, binding)
  if (binding.targets.length !== 1)
    throw new Error("No exact target bytes to publish")
  const prepared = preparedPath(getPath, binding.preparedTarget)
  const target = safePath(getPath, binding.relativePath)
  fs.renameSync(prepared, target)
  assertPhysicalBinding(getPath, binding)
}
export function restorePhysicalBinding(
  getPath: GetPath,
  binding: PhysicalBinding,
) {
  const current = assertPhysicalBinding(getPath, binding)
  if (!binding.original) {
    if (current) fs.unlinkSync(safePath(getPath, binding.relativePath))
    return
  }
  if (current && sameImage(current, binding.original)) return
  if (!binding.preparedBackup) throw new Error("Missing original byte snapshot")
  const backup = preparedPath(getPath, binding.preparedBackup)
  fs.renameSync(backup, safePath(getPath, binding.relativePath))
  const restored = assertPhysicalBinding(getPath, binding)
  if (!restored || !sameImage(restored, binding.original))
    throw new Error("Original bytes not restored")
}
export function cleanupPhysicalBindings(
  getPath: GetPath,
  bindings: PhysicalBinding[],
) {
  for (const binding of bindings)
    for (const prepared of [binding.preparedTarget, binding.preparedBackup]) {
      if (prepared && readPhysicalFile(getPath, prepared.relativePath))
        fs.unlinkSync(preparedPath(getPath, prepared))
    }
}

export function binaryFingerprint(getPath: GetPath, relative: string) {
  const file = safePath(getPath, relative)
  const stat = fs.lstatSync(file, { bigint: true })
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("Unsafe binary target")
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  )
  try {
    const opened = fs.fstatSync(fd, { bigint: true })
    if (!sameIdentity(identity(stat), identity(opened)))
      throw new Error("Binary changed while opening")
    const hash = createHash("sha256")
    const buffer = Buffer.alloc(64 * 1024)
    let length = 0
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (!count) break
      hash.update(buffer.subarray(0, count))
      length += count
    }
    const after = fs.fstatSync(fd, { bigint: true })
    if (
      opened.size !== after.size ||
      opened.mtimeNs !== after.mtimeNs ||
      opened.ctimeNs !== after.ctimeNs
    )
      throw new Error("Binary changed while reading")
    return { sha256: hash.digest("hex"), length, ...identity(opened) }
  } finally {
    fs.closeSync(fd)
  }
}

export function binaryFingerprintOrMissing(getPath: GetPath, relative: string) {
  try {
    return binaryFingerprint(getPath, relative)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}
