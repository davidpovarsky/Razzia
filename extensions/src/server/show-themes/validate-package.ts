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

    if (asset.kind === "lottie") {
      validateLottie(bytes)
    } else if (!matchesMediaSignature(bytes, extension)) {
      throw new Error(`Media signature mismatch: ${asset.id}`)
    }
  }

  return {
    definition,
    manifestSha256: digest(Buffer.from(JSON.stringify(definition))),
    assetCount: definition.assets.length,
    assetBytes: total,
  }
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

function validateLottie(bytes: Buffer) {
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

  let nodes = 0
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

      if (["p", "u"].includes(key) && typeof child === "string") {
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
        } else if (
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
