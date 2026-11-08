/* oxlint-disable eslint/no-plusplus -- Bounded binary parsers intentionally consume the current byte before advancing their cursor. */
/* oxlint-disable no-await-in-loop -- Sequential inspection bounds memory and checks symlinks before reading each asset. */
import { createHash } from "node:crypto"
import { lstat, readFile, readdir, realpath } from "node:fs/promises"
import { resolve, relative, extname, sep } from "node:path"
import {
  showThemeDefinitionSchema,
  type ShowThemeDefinition,
} from "../../core/show-themes/definition"

const LIMIT = 160_000_000
const JSON_LIMIT = 1_000_000
const allowedFiles = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".json",
])
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex")

function within(root: string, file: string) {
  const rel = relative(root, file)

  return (
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !resolve(file).startsWith("\\\\") &&
    !rel.includes(":")
  )
}

/** Validation only. Does not fetch URLs, unpack archives, execute code or publish. */
export async function validateThemePackage(
  input: unknown,
  publicRoot: string,
  options: { trustedRepository?: boolean } = {},
) {
  const definition = showThemeDefinitionSchema.parse(input)
  const root = await realpath(publicRoot)
  let total = 0
  for (const asset of definition.assets) {
    if (!options.trustedRepository && asset.rights === "repository-existing") {
      throw new Error(
        "Customer assets require licensed or owner-authorized rights",
      )
    }

    if (!asset.url.startsWith("/")) {
      throw new Error(
        "External assets must be imported and validated first; validation never downloads",
      )
    }

    const file = resolve(root, `.${asset.url}`)

    if (!within(root, file)) {
      throw new Error("Asset escapes package root")
    }
    // Resolve each component: a symlink anywhere in the chain is rejected.

    let current = root
    for (const segment of relative(root, file).split(sep)) {
      current = resolve(current, segment)

      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error("Symlink assets are forbidden")
      }
    }
    const stat = await lstat(file)

    if (
      !stat.isFile() ||
      stat.size !== asset.bytes ||
      stat.size > 100_000_000
    ) {
      throw new Error(`Asset size mismatch: ${asset.id}`)
    }

    total += stat.size

    if (total > LIMIT) {
      throw new Error("Package exceeds asset budget")
    }

    const extension = extname(file).toLowerCase()

    if (!allowedFiles.has(extension)) {
      throw new Error("Unsupported asset format")
    }

    const bytes = await readFile(file)

    if (digest(bytes) !== asset.sha256) {
      throw new Error(`Asset hash mismatch: ${asset.id}`)
    }

    validateThemeAssetBytes(asset, bytes)
  }

  return {
    definition,
    manifestSha256: digest(Buffer.from(JSON.stringify(definition))),
    assetCount: definition.assets.length,
    assetBytes: total,
  }
}

/** Shared upload/offline boundary: filename, size, digest and actual media bytes. */
export function validateThemeAssetBytes(
  asset: ShowThemeDefinition["assets"][number],
  bytes: Buffer,
  options: { embeddedResourcesOnly?: boolean } = {},
) {
  const extension = extname(
    new URL(asset.url, "https://theme.invalid").pathname,
  ).toLowerCase()

  if (
    !allowedFiles.has(extension) ||
    bytes.length !== asset.bytes ||
    digest(bytes) !== asset.sha256
  ) {
    throw new Error(`Invalid asset bytes: ${asset.id}`)
  }

  if (asset.kind === "lottie") {
    validateLottie(bytes, options.embeddedResourcesOnly)
  } else if (!matchesMediaSignature(bytes, extension)) {
    throw new Error(`Media signature mismatch: ${asset.id}`)
  } else if (asset.kind === "image" && options.embeddedResourcesOnly) {
    validateRasterBudget(bytes, extension)
  }
}

function validateRasterBudget(bytes: Buffer, extension: string) {
  if (bytes.length > 20_000_000) {throw new Error("Image exceeds encoded budget")}

  let width = 0,
    height = 0,
    frames = 1

  if (
    extension === ".png" &&
    bytes.length >= 24 &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  ) {
    width = bytes.readUInt32BE(16)
    height = bytes.readUInt32BE(20)
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset)

      if (offset + length + 12 > bytes.length)
        {throw new Error("Truncated PNG chunk")}

      if (
        bytes.toString("ascii", offset + 4, offset + 8) === "acTL" &&
        length >= 8
      )
        {frames = bytes.readUInt32BE(offset + 8)}

      offset += length + 12
    }
  } else if ([".jpg", ".jpeg"].includes(extension)) {
    let offset = 2

    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) {throw new Error("Invalid JPEG marker")}

      while (bytes[offset] === 255) {offset++}

      const marker = bytes[offset++]

      if (marker === 217 || marker === 218) {break}

      if (marker === 1 || (marker >= 208 && marker <= 215)) {continue}

      const length = bytes.readUInt16BE(offset)

      if (length < 2 || offset + length > bytes.length)
        {throw new Error("Truncated JPEG segment")}

      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 7
      ) {
        height = bytes.readUInt16BE(offset + 3)
        width = bytes.readUInt16BE(offset + 5)

        break
      }

      offset += length
    }
  } else if (extension === ".webp" && bytes.length >= 25) {
    const kind = bytes.toString("ascii", 12, 16)

    if (kind === "VP8X" && bytes.length >= 30) {
      width = bytes.readUIntLE(24, 3) + 1
      height = bytes.readUIntLE(27, 3) + 1
    } else if (kind === "VP8L" && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21)
      width = (bits & 16383) + 1
      height = ((bits >>> 14) & 16383) + 1
    } else if (
      kind === "VP8 " &&
      bytes.length >= 30 &&
      bytes.toString("hex", 23, 26) === "9d012a"
    ) {
      width = bytes.readUInt16LE(26) & 16383
      height = bytes.readUInt16LE(28) & 16383
    }

    let count = 0
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const size = bytes.readUInt32LE(offset + 4)

      if (offset + size + 8 > bytes.length)
        {throw new Error("Truncated WebP chunk")}

      if (bytes.toString("ascii", offset, offset + 4) === "ANMF") {count++}

      offset += size + 8 + (size & 1)
    }
    frames = Math.max(1, count)
  } else if (extension === ".gif" && bytes.length >= 13) {
    width = bytes.readUInt16LE(6)
    height = bytes.readUInt16LE(8)
    let offset = 13 + (bytes[10] & 128 ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0)
    let count = 0

    while (offset < bytes.length) {
      const type = bytes[offset++]

      if (type === 59) {break}

      if (type === 33) {offset++}
      else if (type === 44 && offset + 9 <= bytes.length) {
        const packed = bytes[offset + 8]
        offset += 9 + (packed & 128 ? 3 * 2 ** ((packed & 7) + 1) : 0) + 1
        count++
      } else {throw new Error("Invalid GIF block")}

      for (;;) {
        if (offset >= bytes.length) {throw new Error("Truncated GIF block")}

        const size = bytes[offset++]

        if (!size) {break}

        offset += size

        if (offset > bytes.length) {throw new Error("Truncated GIF data")}
      }

      if (count > 240) {throw new Error("Animation frame budget exceeded")}
    }

    frames = count
  }

  if (
    width <= 0 ||
    height <= 0 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 16_777_216 ||
    frames < 1 ||
    frames > 240 ||
    width * height * frames > 67_108_864
  ) {
    throw new Error("Image dimensions/animation exceed decoded budget")
  }

  return width * height * frames
}

function matchesMediaSignature(bytes: Buffer, extension: string): boolean {
  const ascii = (start: number, length: number) =>
    bytes.toString("ascii", start, start + length)

  if (extension === ".png") {
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }

  if ([".jpg", ".jpeg"].includes(extension)) {
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  }

  if (extension === ".webp") {
    return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP"
  }

  if (extension === ".gif") {
    return ["GIF87a", "GIF89a"].includes(ascii(0, 6))
  }

  if (extension === ".mp3") {
    return (
      ascii(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    )
  }

  if ([".mp4", ".m4a", ".avif"].includes(extension)) {
    return ascii(4, 4) === "ftyp"
  }

  if (extension === ".wav") {
    return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE"
  }

  if (extension === ".ogg") {
    return ascii(0, 4) === "OggS"
  }

  if (extension === ".webm") {
    return bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))
  }

  return false
}

function validateLottie(bytes: Buffer, embeddedResourcesOnly = false) {
  if (bytes.length > 8_000_000) {
    throw new Error("Lottie exceeds budget")
  }

  const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>

  if (
    !Array.isArray(value.layers) ||
    typeof value.fr !== "number" ||
    value.fr <= 0 ||
    value.fr > 120 ||
    typeof value.op !== "number" ||
    value.op > 72_000
  ) {
    throw new Error("Invalid Lottie timing/layers")
  }

  if (
    embeddedResourcesOnly &&
    (typeof value.w !== "number" ||
      typeof value.h !== "number" ||
      value.w <= 0 ||
      value.h <= 0 ||
      value.w > 4096 ||
      value.h > 4096 ||
      value.w * value.h > 8_388_608 ||
      typeof value.ip !== "number" ||
      value.op <= value.ip ||
      (value.op - value.ip) / value.fr > 180 ||
      value.layers.length > 256)
  )
    {throw new Error("Lottie render budget exceeded")}

  let nodes = 0
  let embeddedPixels = 0
  function visit(node: unknown, depth: number) {
    if ((nodes += 1) > 250_000 || depth > 64) {
      throw new Error("Lottie complexity budget exceeded")
    }

    if (!node || typeof node !== "object") {
      return
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === "x" && typeof child === "string") {
        throw new Error("Lottie expressions are forbidden")
      }

      if (
        ["p", "u", "fPath", "src", "href", "url"].includes(key) &&
        typeof child === "string"
      ) {
        const embedded =
          /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/u.exec(child)

        if (embedded) {
          const raster = Buffer.from(embedded[2], "base64")

          if (
            raster.length > 6_000_000 ||
            !matchesMediaSignature(raster, `.${embedded[1]}`)
          ) {
            throw new Error("Invalid embedded Lottie raster")
          }

          if (embeddedResourcesOnly) {
            embeddedPixels += validateRasterBudget(raster, `.${embedded[1]}`)

            if (embeddedPixels > 67_108_864)
              {throw new Error("Embedded Lottie image budget exceeded")}
          }
        } else if (
          (embeddedResourcesOnly && child !== "") ||
          /^(https?:|data:|javascript:|\/\/)/iu.test(child) ||
          child.includes("..")
        ) {
          throw new Error("External Lottie resources are forbidden")
        }
      }

      visit(child, depth + 1)
    }
  }
  visit(value, 0)
}

export async function readManifest(file: string): Promise<ShowThemeDefinition> {
  const stat = await lstat(file)

  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > JSON_LIMIT) {
    throw new Error("Manifest must be a bounded JSON file")
  }

  return showThemeDefinitionSchema.parse(
    JSON.parse(await readFile(file, "utf8")),
  )
}

/** For an untrusted extracted directory, reject executable/extra payloads before asset validation. ZIP extraction is deliberately not implemented. */
export async function inspectAuthoringDirectory(root: string): Promise<void> {
  let bytes = 0
  let count = 0
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name)
      const stat = await lstat(file)

      if (stat.isSymbolicLink()) {
        throw new Error("Symlinks are forbidden")
      }

      if ((count += 1) > 512) {
        throw new Error("Too many package entries")
      }

      if (stat.isDirectory()) {
        await visit(file)
      } else {
        bytes += stat.size

        if (
          !stat.isFile() ||
          !allowedFiles.has(extname(file).toLowerCase()) ||
          bytes > LIMIT
        ) {
          throw new Error("Unsafe or oversized package payload")
        }
      }
    }
  }
  await visit(await realpath(root))
}
