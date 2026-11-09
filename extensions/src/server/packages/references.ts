/* oxlint-disable typescript/no-non-null-assertion -- A valid inventoried filename has a checked extension before name generation. */
import {
  relativePackagePath,
  portableRelativePath,
} from "../../core/packages/paths"
import type { PortablePackage } from "./archive"

const mediaKeys = new Set([
  "url",
  "imageUrl",
  "mediaUrl",
  "lottieUrl",
  "questionImage",
  "backgroundUrl",
  "posterUrl",
  "src",
])

/** Walk structured media fields, not human text which may contain './'. */
export function rewritePackageReferences(
  input: unknown,
  declaringFile: string,
  resolve: (path: string) => string,
): unknown {
  if (Array.isArray(input)) {
    return input.map((v) => rewritePackageReferences(v, declaringFile, resolve))
  }

  if (!input || typeof input !== "object") {
    return input
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (mediaKeys.has(key) && typeof value === "string" && value) {
        return [key, resolve(relativePackagePath(declaringFile, value))]
      }

      return [key, rewritePackageReferences(value, declaringFile, resolve)]
    }),
  )
}

export function packageMediaName(pkg: PortablePackage, path: string): string {
  const file = pkg.manifest.files.find((f) => f.path === path)

  if (!file || ["descriptor", "source", "style"].includes(file.kind)) {
    throw new Error(`PACKAGE_MISSING_ASSET:${path}`)
  }

  const extension = path.split(".").at(-1)!.toLowerCase()

  return `pkg_${pkg.sourceDigest.slice(0, 24)}_${file.sha256}.${extension}`
}

export function normalizePackageDocument(pkg: PortablePackage, path: string) {
  const bytes = pkg.files.get(path)

  if (!bytes || bytes.length > 2_000_000) {
    throw new Error("PACKAGE_DESCRIPTOR_BUDGET")
  }

  return rewritePackageReferences(
    JSON.parse(bytes.toString("utf8")),
    path,
    (asset) => `/media/${packageMediaName(pkg, asset)}`,
  )
}

/** Export only owned bytes; do not fetch arbitrary remote URLs or private rosters. */
export function relativizeDocument(
  input: unknown,
  documentPath: string,
  urls: Map<string, string>,
): unknown {
  if (Array.isArray(input)) {
    return input.map((v) => relativizeDocument(v, documentPath, urls))
  }

  if (!input || typeof input !== "object") {
    return input
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (mediaKeys.has(key) && typeof value === "string" && value) {
        const path = urls.get(value)

        if (!path) {
          throw new Error(`PACKAGE_EXPORT_UNOWNED_ASSET:${value}`)
        }

        return [key, portableRelativePath(documentPath, path)]
      }

      return [key, relativizeDocument(value, documentPath, urls)]
    }),
  )
}
