import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"

/** Linux-only C1 primitives. File/namespace fences fail closed; no chmod repair.
 * Namespace checks require stable service-controlled parents and one cooperating
 * writer. They do not implement openat2 or isolation from arbitrary processes.
 */
export interface DurableIdentity {
  dev: string
  ino: string
  mode: number
}
export interface DurableImage extends DurableIdentity {
  raw: string
  sha256: string
  length: number
}
export const utf8Image = (raw: string) => ({
  raw,
  sha256: createHash("sha256").update(raw).digest("hex"),
  length: Buffer.byteLength(raw),
})
const identity = (stat: fs.BigIntStats): DurableIdentity => ({
  dev: String(stat.dev),
  ino: String(stat.ino),
  mode: Number(stat.mode & 0o777n),
})
export const sameDurableIdentity = (a: DurableIdentity, b: DurableIdentity) =>
  a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
export const sameDurableImage = (a: DurableImage, b: DurableImage) =>
  sameDurableIdentity(a, b) &&
  a.raw === b.raw &&
  a.sha256 === b.sha256 &&
  a.length === b.length
export function requireLinuxFences() {
  if (process.platform !== "linux")
    throw new Error(
      "C1 requires qualified Linux hard links and directory fsync",
    )
}
export function lstatOrMissing(file: string) {
  try {
    return fs.lstatSync(file, { bigint: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}
export function assertDirectoryChain(directory: string) {
  requireLinuxFences()
  if (path.resolve(directory) !== directory)
    throw new Error("Non-absolute durable directory")
  const parent = path.dirname(directory)
  if (parent !== directory) assertDirectoryChain(parent)
  const stat = fs.lstatSync(directory, { bigint: true })
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Linked or irregular durable directory")
  return identity(stat)
}
export function durablePath(root: string, relative: string) {
  if (
    !relative ||
    relative.includes("\\") ||
    relative.includes(":") ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Unsafe durable relative path")
  const file = path.join(root, ...relative.split("/"))
  assertDirectoryChain(path.dirname(file))
  return file
}
export function syncDirectory(directory: string) {
  const before = assertDirectoryChain(directory)
  const fd = fs.openSync(
    directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  )
  try {
    const opened = fs.fstatSync(fd, { bigint: true })
    if (!opened.isDirectory() || !sameDurableIdentity(before, identity(opened)))
      throw new Error("Directory identity changed before fence")
    fs.fsyncSync(fd)
    if (!sameDurableIdentity(before, assertDirectoryChain(directory)))
      throw new Error("Directory identity changed during fence")
  } finally {
    fs.closeSync(fd)
  }
}
/** Every newly created name and its directory are fenced before returning.
 * Existing directory modes are preserved; no recursive mkdir hides ancestors.
 */
export function ensureDurableDirectory(directory: string) {
  requireLinuxFences()
  const parent = path.dirname(directory)
  if (parent !== directory) ensureDurableDirectory(parent)
  const current = lstatOrMissing(directory)
  if (!current) fs.mkdirSync(directory, { mode: 0o700 })
  assertDirectoryChain(directory)
  syncDirectory(directory)
  if (parent !== directory) syncDirectory(parent)
}
export function readDurableFile(file: string): DurableImage | null {
  assertDirectoryChain(path.dirname(file))
  const before = lstatOrMissing(file)
  if (!before) return null
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink < 1n ||
    before.nlink > 2n
  )
    throw new Error("Irregular or multiply linked creation file")
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const opened = fs.fstatSync(fd, { bigint: true })
    if (!sameDurableIdentity(identity(before), identity(opened)))
      throw new Error("Creation file changed before open")
    const bytes = fs.readFileSync(fd)
    const after = fs.fstatSync(fd, { bigint: true })
    const named = fs.lstatSync(file, { bigint: true })
    if (
      !sameDurableIdentity(identity(opened), identity(named)) ||
      opened.nlink !== after.nlink ||
      after.nlink !== named.nlink ||
      opened.size !== after.size ||
      opened.mtimeNs !== after.mtimeNs ||
      opened.ctimeNs !== after.ctimeNs
    )
      throw new Error("Creation file changed during read")
    const raw = bytes.toString("utf8")
    if (!Buffer.from(raw).equals(bytes))
      throw new Error("Invalid exact UTF-8 image")
    return { ...utf8Image(raw), ...identity(opened) }
  } finally {
    fs.closeSync(fd)
  }
}
export function syncOwnedFile(file: string, expected: DurableImage) {
  const before = readDurableFile(file)
  if (!before || !sameDurableImage(before, expected))
    throw new Error("Cannot fence an unowned or changed creation file")
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    if (
      !sameDurableIdentity(
        identity(fs.fstatSync(fd, { bigint: true })),
        expected,
      )
    )
      throw new Error("Creation file changed before fence")
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  const after = readDurableFile(file)
  if (!after || !sameDurableImage(after, expected))
    throw new Error("Creation file changed during fence")
}
export function writeDurableExclusive(file: string, raw: string) {
  assertDirectoryChain(path.dirname(file))
  const fd = fs.openSync(
    file,
    fs.constants.O_RDWR |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW,
    0o600,
  )
  let created: DurableIdentity | undefined
  try {
    created = identity(fs.fstatSync(fd, { bigint: true }))
    const bytes = Buffer.from(raw)
    let offset = 0
    while (offset < bytes.length) {
      const count = fs.writeSync(fd, bytes, offset, bytes.length - offset)
      if (count <= 0) throw new Error("Incomplete creation write")
      offset += count
    }
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  const result = readDurableFile(file)
  if (
    !result ||
    !created ||
    !sameDurableIdentity(result, created) ||
    result.raw !== raw ||
    result.length !== Buffer.byteLength(raw)
  )
    throw new Error("Creation write verification failed")
  syncDirectory(path.dirname(file))
  const fenced = readDurableFile(file)
  if (!fenced || !sameDurableImage(fenced, result))
    throw new Error("Creation file changed during namespace fence")
  return fenced
}
/** Authorized replacement of an existing private intent, never public data.
 * A failed rename/directory fence leaves the old or visible new record intact.
 */
export function replaceDurablePrivateRecord(
  file: string,
  raw: string,
  previous: DurableImage,
) {
  const next = `${file}.${randomUUID()}.next`
  const staged = writeDurableExclusive(next, raw)
  const current = readDurableFile(file)
  if (!current || !sameDurableImage(current, previous))
    throw new Error("Private creation intent changed")
  fs.renameSync(next, file)
  syncDirectory(path.dirname(file))
  const published = readDurableFile(file)
  if (!published || !sameDurableImage(published, staged))
    throw new Error("Private intent changed during publication fence")
  return published
}
