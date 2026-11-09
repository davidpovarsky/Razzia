import { createHash } from "node:crypto"
import { crc32, inflateRawSync } from "node:zlib"
import { packagePath, packagePathKey } from "../../core/packages/paths"
import {
  PACKAGE_LIMITS as L,
  packageManifestSchema,
  type PackageManifest,
} from "../../core/packages/manifest"

export const packageSha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex")

export interface PortablePackage {
  manifest: PackageManifest
  files: Map<string, Buffer>
  sourceDigest: string
}

const fail = (): never => {
  throw new Error("PACKAGE_INVALID_ARCHIVE")
}
const decoder = new TextDecoder("utf-8", { fatal: true })

/** No disk extraction. Central inventory and every local range are checked first. */
export function unpackPackage(bytes: Buffer): PortablePackage {
  if (bytes.length < 22 || bytes.length > L.archiveBytes) {
    fail()
  }

  const end = bytes.length - 22

  // No comments, appended data, split/ZIP64 archives or executable prefix.
  if (
    bytes.readUInt32LE(end) !== 0x06054b50 ||
    bytes.readUInt16LE(end + 20) !== 0 ||
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6)
  ) {
    fail()
  }

  const count = bytes.readUInt16LE(end + 10)
  const directorySize = bytes.readUInt32LE(end + 12)
  const directory = bytes.readUInt32LE(end + 16)

  if (
    !count ||
    count > L.files ||
    count !== bytes.readUInt16LE(end + 8) ||
    directory + directorySize !== end
  ) {
    fail()
  }

  const entries: Array<{
    name: string
    method: number
    crc: number
    size: number
    compressed: number
    offset: number
    start: number
  }> = []
  const names = new Set<string>()
  let cursor = directory,
    expanded = 0,
    expectedOffset = 0
  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      fail()
    }

    const flags = bytes.readUInt16LE(cursor + 8)
    const method = bytes.readUInt16LE(cursor + 10)
    const crc = bytes.readUInt32LE(cursor + 16)
    const compressed = bytes.readUInt32LE(cursor + 20)
    const size = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const extraLength = bytes.readUInt16LE(cursor + 30)
    const commentLength = bytes.readUInt16LE(cursor + 32)
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16
    const offset = bytes.readUInt32LE(cursor + 42)

    if (
      flags & ~0x800 ||
      ![0, 8].includes(method) ||
      bytes.readUInt16LE(cursor + 34) ||
      extraLength ||
      commentLength ||
      !nameLength ||
      cursor + 46 + nameLength > end ||
      (mode & 0xf000 && (mode & 0xf000) !== 0x8000) ||
      offset !== expectedOffset ||
      size < 1 ||
      size > L.fileBytes ||
      compressed < 1 ||
      size > compressed * L.ratio
    ) {
      fail()
    }

    const name = packagePath(
      decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)),
    )

    if (
      names.has(packagePathKey(name)) ||
      /\.(?:zip|tadazz|xlsx|gz|tar|7z|rar|exe|dll|wasm|html|svg|sh|bat|cmd)$/iu.test(
        name,
      )
    ) {
      fail()
    }

    names.add(packagePathKey(name))
    expanded += size

    if (
      expanded > L.expandedBytes ||
      offset + 30 > directory ||
      bytes.readUInt32LE(offset) !== 0x04034b50 ||
      bytes.readUInt16LE(offset + 6) !== flags ||
      bytes.readUInt16LE(offset + 8) !== method ||
      bytes.readUInt32LE(offset + 14) !== crc ||
      bytes.readUInt32LE(offset + 18) !== compressed ||
      bytes.readUInt32LE(offset + 22) !== size ||
      bytes.readUInt16LE(offset + 26) !== nameLength ||
      bytes.readUInt16LE(offset + 28) !== 0
    ) {
      fail()
    }

    const start = offset + 30 + nameLength

    if (
      start + compressed > directory ||
      !bytes
        .subarray(offset + 30, start)
        .equals(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    ) {
      fail()
    }

    expectedOffset = start + compressed
    entries.push({ name, method, crc, size, compressed, offset, start })
    cursor += 46 + nameLength
  }

  if (cursor !== end || expectedOffset !== directory) {
    fail()
  }

  const files = new Map<string, Buffer>()
  for (const entry of entries) {
    const compressed = bytes.subarray(
      entry.start,
      entry.start + entry.compressed,
    )
    const output =
      entry.method === 8
        ? (inflateRawSync(compressed, {
            maxOutputLength: entry.size,
            info: true,
          }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } })
        : null
    const decoded = output ? output.buffer : Buffer.from(compressed)

    if (output && output.engine.bytesWritten !== compressed.length) {
      fail()
    }

    if (decoded.length !== entry.size || crc32(decoded) !== entry.crc) {
      fail()
    }

    files.set(entry.name, decoded)
  }
  const manifestBytes = files.get("manifest.json")

  if (!manifestBytes || manifestBytes.length > L.manifestBytes) {
    fail()
  }

  const manifest = packageManifestSchema.parse(
    JSON.parse(decoder.decode(manifestBytes)),
  )

  if (manifest.files.length + 1 !== files.size) {
    fail()
  }

  for (const item of manifest.files) {
    const content = files.get(item.path)

    if (
      !content ||
      content.length !== item.bytes ||
      packageSha(content) !== item.sha256
    ) {
      throw new Error(`PACKAGE_INVENTORY_MISMATCH:${item.path}`)
    }
  }

  return { manifest, files, sourceDigest: packageSha(bytes) }
}

/** Deterministic uncompressed ZIP. Real sizes/digests always come from bytes. */
export function packPackage(
  manifest: PackageManifest,
  files: ReadonlyMap<string, Buffer>,
): Buffer {
  const parsed = packageManifestSchema.parse(manifest)
  const inventory = new Map(files)
  inventory.delete("manifest.json")

  if (inventory.size !== parsed.files.length) {
    fail()
  }

  for (const f of parsed.files) {
    const b = inventory.get(f.path)

    if (!b || b.length !== f.bytes || packageSha(b) !== f.sha256) {
      fail()
    }
  }
  inventory.set("manifest.json", Buffer.from(JSON.stringify(parsed)))
  const local: Buffer[] = [],
    central: Buffer[] = []
  let offset = 0
  for (const [name, content] of [...inventory].sort(([a], [b]) => {
    if (a === b) {
      return 0
    }

    return a < b ? -1 : 1
  })) {
    const encoded = Buffer.from(packagePath(name))
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(0x800, 6)
    head.writeUInt32LE(crc32(content), 14)
    head.writeUInt32LE(content.length, 18)
    head.writeUInt32LE(content.length, 22)
    head.writeUInt16LE(encoded.length, 26)
    local.push(head, encoded, content)
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50)
    record.writeUInt16LE(0x314, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(0x800, 8)
    record.writeUInt32LE(crc32(content), 16)
    record.writeUInt32LE(content.length, 20)
    record.writeUInt32LE(content.length, 24)
    record.writeUInt16LE(encoded.length, 28)
    record.writeUInt32LE(0x81a40000, 38)
    record.writeUInt32LE(offset, 42)
    central.push(record, encoded)
    offset += head.length + encoded.length + content.length
  }
  const directory = Buffer.concat(central)
  const tail = Buffer.alloc(22)
  tail.writeUInt32LE(0x06054b50)
  tail.writeUInt16LE(inventory.size, 8)
  tail.writeUInt16LE(inventory.size, 10)
  tail.writeUInt32LE(directory.length, 12)
  tail.writeUInt32LE(offset, 16)
  const result = Buffer.concat([...local, directory, tail])
  unpackPackage(result)

  return result
}
