// Host only: accept one exact built widget and the public assets packed beside it.
import { createHash } from "node:crypto"
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  type Stats,
} from "node:fs"
import { isAbsolute, join, parse, resolve, sep } from "node:path"
import { z } from "zod"
import { getNativeShowLibrary } from "../../core/show-library/native-library.ts"
import { freeze } from "../../core/show-library/primitives.ts"
import { canonicalJson } from "../contracts/canonical.ts"
import { ToolError } from "../server/errors.ts"
import { createBuiltinAssetResolver } from "./builtin-asset-policy.ts"
import type { SemanticAssetResolver } from "../contracts/semantic-edit.ts"
import type { FullShowRuntimePolicyV3 } from "../server/full-show-frame.ts"
import type { PreviewUiResource } from "../server/preview-resource.ts"

const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex")
const rejected = () => new Error("MCP production preview artifact rejected")
const safeRelative = (path: string) =>
  path.length <= 1024 &&
  !path.includes("\\") &&
  !Array.from(path).some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  ) &&
  path
    .split("/")
    .every((part) => part.length > 0 && part !== "." && part !== "..")
const fileSchema = z.strictObject({
  path: z.string().refine(safeRelative),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z.number().int().min(0).max(104857600),
})
const manifestSchema = z.strictObject({
  resourceUri: z.literal("ui://tadazz/full-show/v3.html"),
  mimeType: z.literal("text/html;profile=mcp-app"),
  rendererBuildId: z.string().regex(/^[a-f0-9]{64}$/u),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z.number().int().min(1).max(4000000),
  origin: z.string().max(2048),
  csp: z.strictObject({
    connectDomains: z.array(z.string()).max(1),
    resourceDomains: z.array(z.string()).max(1),
    frameDomains: z.array(z.string()).max(0),
    baseUriDomains: z.array(z.string()).max(1),
  }),
  physicalSources: z.array(fileSchema).min(1).max(10000),
  publicAssets: z.array(fileSchema).min(1).max(10000),
  acceptance: z.literal("requires-native-browser-and-host-qualification"),
})
interface FilePin {
  path: string
  identity: string
}
function identity(stat: Stats) {
  return [
    stat.dev,
    stat.ino,
    stat.size,
    stat.mtimeMs,
    stat.ctimeMs,
    stat.mode,
    stat.nlink,
  ].join(":")
}
function assertParents(path: string) {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw rejected()
  }

  let current = parse(path).root
  const parts = path.slice(current.length).split(sep).filter(Boolean)
  for (const part of parts.slice(0, -1)) {
    current = join(current, part)
    const stat = lstatSync(current)

    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw rejected()
    }
  }
}
function readPinned(path: string, maxBytes: number, pins: FilePin[]) {
  assertParents(path)
  const before = lstatSync(path)

  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size > maxBytes
  ) {
    throw rejected()
  }

  const noFollowValue: unknown = Reflect.get(constants, "O_NOFOLLOW")
  const fd = openSync(
    path,
    constants.O_RDONLY |
      (typeof noFollowValue === "number" ? noFollowValue : 0),
  )

  try {
    const opened = fstatSync(fd)

    if (identity(opened) !== identity(before)) {
      throw rejected()
    }

    const buffer = Buffer.alloc(maxBytes + 1)
    let total = 0

    while (total < buffer.byteLength) {
      const count = readSync(fd, buffer, total, buffer.byteLength - total, null)

      if (count === 0) {
        break
      }

      total += count
    }

    if (
      total !== before.size ||
      total > maxBytes ||
      identity(fstatSync(fd)) !== identity(before)
    ) {
      throw rejected()
    }

    pins.push({ path, identity: identity(before) })

    return buffer.subarray(0, total)
  } finally {
    closeSync(fd)
  }
}

export function readProductionFullShowArtifacts(options: {
  artifactDirectory: string
  publicDirectory: string
  origin: string
  manifestSha256: string
}): {
  rendererBuildId: string
  resource: PreviewUiResource
  assertAssets: FullShowRuntimePolicyV3["assertAssets"]
  builtinAssets: SemanticAssetResolver
} {
  try {
    const url = new URL(options.origin)

    if (
      url.protocol !== "https:" ||
      url.origin !== options.origin ||
      url.hostname.includes("*")
    ) {
      throw rejected()
    }

    const pins: FilePin[] = []
    const manifestBytes = readPinned(
      join(options.artifactDirectory, "full-show-artifact.json"),
      2097152,
      pins,
    )

    if (
      !/^[a-f0-9]{64}$/u.test(options.manifestSha256) ||
      sha(manifestBytes) !== options.manifestSha256
    ) {
      throw rejected()
    }

    const manifest = manifestSchema.parse(
      JSON.parse(manifestBytes.toString("utf8")),
    )
    const expectedCsp = {
      connectDomains: [options.origin],
      resourceDomains: [options.origin],
      frameDomains: [],
      baseUriDomains: [options.origin],
    }

    if (
      manifest.origin !== options.origin ||
      canonicalJson(manifest.csp) !== canonicalJson(expectedCsp) ||
      sha(JSON.stringify(manifest.physicalSources)) !==
        manifest.rendererBuildId ||
      new Set(manifest.physicalSources.map((file) => file.path)).size !==
        manifest.physicalSources.length ||
      new Set(manifest.publicAssets.map((file) => file.path)).size !==
        manifest.publicAssets.length
    ) {
      throw rejected()
    }

    const htmlBytes = readPinned(
      join(options.artifactDirectory, "full-show.html"),
      manifest.bytes,
      pins,
    )

    if (
      htmlBytes.byteLength !== manifest.bytes ||
      sha(htmlBytes) !== manifest.sha256
    ) {
      throw rejected()
    }

    for (const asset of manifest.publicAssets) {
      const prefix = "packages/web/public/"

      if (!asset.path.startsWith(prefix)) {
        throw rejected()
      }

      const relativePath = asset.path.slice(prefix.length)

      if (!safeRelative(relativePath)) {
        throw rejected()
      }

      const bytes = readPinned(
        join(options.publicDirectory, ...relativePath.split("/")),
        asset.bytes,
        pins,
      )

      if (bytes.byteLength !== asset.bytes || sha(bytes) !== asset.sha256) {
        throw rejected()
      }
    }
    const canServe = () => {
      try {
        return pins.every((pin) => {
          assertParents(pin.path)
          const stat = lstatSync(pin.path)

          return (
            stat.isFile() &&
            !stat.isSymbolicLink() &&
            stat.nlink === 1 &&
            identity(stat) === pin.identity
          )
        })
      } catch {
        return false
      }
    }
    const publicPins = new Map(
      manifest.publicAssets.map((asset) => [asset.path, asset]),
    )
    const builtinAssets = createBuiltinAssetResolver({
      origin: options.origin,
      publicAssets: manifest.publicAssets,
      verifyCurrentAsset(asset) {
        const pin = publicPins.get(asset.path)
        return (
          pin?.sha256 === asset.sha256 &&
          pin.bytes === asset.bytes &&
          canServe()
        )
      },
    })
    const families = new Set(
      getNativeShowLibrary().families.map(
        (family) => `${family.ref.id}@${family.ref.version}`,
      ),
    )
    const assertAssets: FullShowRuntimePolicyV3["assertAssets"] = (
      principal,
      theme,
      urls,
    ) => {
      if (
        !canServe() ||
        !principal.active ||
        !principal.accountsEnabled ||
        principal.expiresAt <= Date.now() ||
        !families.has(`${theme.id}@${theme.version}`) ||
        urls.length > 64 ||
        urls.some(
          (url) =>
            !(["background", "answer-image", "audio"] as const).some(
              (purpose) =>
                builtinAssets.resolveStoredUrl(url, {
                  theme,
                  purpose,
                  operation: "preview",
                }),
            ),
        )
      ) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      return Promise.resolve()
    }

    return {
      rendererBuildId: manifest.rendererBuildId,
      resource: {
        html: htmlBytes.toString("utf8"),
        sha256: manifest.sha256,
        csp: freeze(expectedCsp),
        canServe,
      },
      assertAssets,
      builtinAssets,
    }
  } catch {
    throw rejected()
  }
}
