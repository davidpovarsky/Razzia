import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import {
  normalizeLegacyQuizz,
  quizzValidator,
} from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  quizExtrasV1Schema,
  quizExtrasV2Schema,
  isQuizExtrasV2,
  upgradeLegacyExtrasToV2,
} from "../../core"
import { nativePreviewScopeIds } from "../../core/show-library/native-preview-scopes"
import { nativeBundleToAuthoredShow } from "../../core/show-authoring-convert"
import { sanitizeAuthoredShowForPreview } from "../../core/show-library/sanitized-authored-preview"
import { compileFullShowPreviewTimeline } from "../../core/show-library/full-show-preview-timeline"
import type { StorageInjections } from "../storage/sidecar"
import {
  readAccountPreviewBuiltinAssets,
  type AccountPreviewBuiltinAuthority,
} from "./account-preview-builtins"

const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex")
const uuid = (text: string) => {
  const h = hash(text)

  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

export class PreviewSourceError extends Error {
  readonly status: 404 | 409 | 422

  constructor(status: 404 | 409 | 422) {
    super("Preview source unavailable")
    this.status = status
  }
}

export type AccountPreviewInjections = Pick<StorageInjections, "getPath"> & {
  /** Same authenticated owner and installed-media boundary as native /media. */
  readInstalledMedia?: (name: string) => { bytes: Uint8Array } | null
}

function readFile(file: string, maxBytes: number): Buffer {
  const stat = fs.lstatSync(file)

  if (!stat.isFile() || stat.size > maxBytes) {
    throw new PreviewSourceError(422)
  }

  return fs.readFileSync(file)
}

export function listAccountPreviewSources(
  injections: Pick<StorageInjections, "getPath">,
) {
  const dir = injections.getPath("quizz")

  if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) {
    return []
  }

  return fs
    .readdirSync(dir)
    .slice(0, 1024)
    .flatMap((name) => {
      if (!name.endsWith(".json")) {
        return []
      }

      try {
        const value: unknown = JSON.parse(
          readFile(path.join(dir, name), 1_048_576).toString("utf8"),
        )

        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return []
        }

        const record = value as Record<string, unknown>

        return typeof record.id === "string" &&
          /^[A-Za-z0-9_-]{1,160}$/u.test(record.id) &&
          typeof record.subject === "string"
          ? [
              {
                id: record.id,
                title: record.subject.slice(0, 240),
              },
            ]
          : []
      } catch {
        return []
      }
    })
}

// Account scope comes exclusively from the existing authenticated host's getPath.
// In particular, do NOT call getQuizzById/readSidecar: their legacy reads can write.
//
export function projectAccountPreviewContent(
  injections: Pick<StorageInjections, "getPath">,
  id: string,
) {
  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(id)) {
    throw new PreviewSourceError(404)
  }

  const dir = injections.getPath("quizz")

  if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) {
    throw new PreviewSourceError(404)
  }

  let rawBase: Buffer | undefined = undefined
  let input: Record<string, unknown> | undefined = undefined
  for (const name of fs.readdirSync(dir).slice(0, 1024)) {
    if (!name.endsWith(".json")) {
      continue
    }

    try {
      const bytes = readFile(path.join(dir, name), 1_048_576)
      const value = JSON.parse(bytes.toString("utf8")) as Record<
        string,
        unknown
      >

      if (value.id === id) {
        if (rawBase) {
          throw new PreviewSourceError(409)
        }

        rawBase = bytes
        input = value
      }
    } catch (error) {
      if (error instanceof PreviewSourceError && error.status === 409) {
        throw error
      }
    }
  }

  if (!input || !rawBase) {
    throw new PreviewSourceError(404)
  }

  const quizz = quizzValidator.parse(normalizeLegacyQuizz(input))
  const baseDigest = computeCanonicalBaseDigest(quizz)
  const sidePath = injections.getPath(`extensions/quizzes/${id}.json`)
  const rawSide = fs.existsSync(sidePath) ? readFile(sidePath, 1_048_576) : null
  const extras = rawSide
    ? (() => {
        const value = JSON.parse(rawSide.toString("utf8")) as {
          schemaVersion?: unknown
        }

        return (
          value.schemaVersion === 2 ? quizExtrasV2Schema : quizExtrasV1Schema
        ).parse(value)
      })()
    : createDefaultQuizExtrasV2(
        id,
        quizz.questions.map((_, n) => uuid(`${id}:${baseDigest}:${n}`)),
        baseDigest,
      )

  // Stored sidecars historically hashed either the logical payload or the full
  // record including its storage ID. Match the storage reader's compatibility
  // contract without normalizing or rewriting any persisted bytes. Keep the
  // normalized form already admitted by preview for legacy default fields.
  const { id: _storageId, ...storedPayload } = input
  const matchesBaseDigest =
    extras.baseDigest === baseDigest ||
    extras.baseDigest === computeCanonicalBaseDigest(storedPayload) ||
    extras.baseDigest === computeCanonicalBaseDigest(input)

  if (extras.quizId !== id || !matchesBaseDigest) {
    throw new PreviewSourceError(409)
  }

  const show = sanitizeAuthoredShowForPreview(
    nativeBundleToAuthoredShow(
      { quizz, extras },
      { includePrivateRoster: false },
    ),
  )
  const native = isQuizExtrasV2(extras)
    ? extras
    : upgradeLegacyExtrasToV2(quizz, extras, { quizId: id, baseDigest })

  return {
    source: {
      kind: "account-owned" as const,
      quizId: id,
      immutableRevision: hash(
        Buffer.concat([rawBase, rawSide ?? Buffer.alloc(0)]),
      ),
    },
    show,
    scopeIds: nativePreviewScopeIds(show, native.timeline),
    chapters: compileFullShowPreviewTimeline(show),
    sampleData: true as const,
  }
}

// The HTTP reader additionally requires every referenced account media byte.
// Content projection alone never admits a renderer or grants media access.
//
export function readAccountPreviewSource(
  injections: AccountPreviewInjections,
  id: string,
  builtinAuthority?: AccountPreviewBuiltinAuthority,
) {
  const result = projectAccountPreviewContent(injections, id)
  const { show } = result
  const builtinAssets = readAccountPreviewBuiltinAssets(show, builtinAuthority)
  const admittedPublicUrls = new Set(builtinAssets.map((asset) => asset.url))
  const urls = new Set<string>()
  const visit = (value: unknown, key = "") => {
    if (
      typeof value === "string" &&
      /url$/iu.test(key) &&
      /^https?:/iu.test(value) &&
      !admittedPublicUrls.has(value)
    ) {
      throw new PreviewSourceError(422)
    }

    if (typeof value === "string" && value.startsWith("/media/")) {
      urls.add(value)
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        visit(item)
      })
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([name, item]) => {
        visit(item, name)
      })
    }
  }
  visit(show)

  const assets = [
    ...readAccountPreviewAssets(injections, [...urls]),
    ...builtinAssets,
  ]

  if (
    assets.length > 256 ||
    assets.reduce((total, asset) => total + asset.bytes, 0) > 200_000_000
  ) {
    throw new PreviewSourceError(422)
  }

  return { ...result, assets }
}

/** Existing tenant files and installed-media authorization only; no URL fetch. */
export function readAccountPreviewAssets(
  injections: AccountPreviewInjections,
  urls: readonly string[],
) {
  if (urls.length > 256 || new Set(urls).size !== urls.length) {
    throw new PreviewSourceError(422)
  }

  const assets: Array<{ url: string; sha256: string; bytes: number }> = []
  let total = 0
  for (const url of urls) {
    if (
      !/^\/media\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp|gif|mp4|webm|mp3|ogg|wav|m4a|json|lottie)$/u.test(
        url,
      )
    ) {
      throw new PreviewSourceError(422)
    }

    const name = url.slice(7)
    // Reserved virtual names must never fall back to a same-named upload. The
    // native reader checks tenant, installed/published state and content digest.
    const installed =
      /^(?:pkg_[a-f0-9]{24}|theme_[a-f0-9]{32})_[a-f0-9]{64}\./u.test(name)
    const bytes = installed
      ? injections.readInstalledMedia?.(name)?.bytes
      : readFile(injections.getPath(`media/${name}`), 100_000_000)

    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > 100_000_000) {
      throw new PreviewSourceError(422)
    }

    total += bytes.byteLength

    if (total > 200_000_000 || assets.length >= 256) {
      throw new PreviewSourceError(422)
    }

    assets.push({ url, sha256: hash(bytes), bytes: bytes.byteLength })
  }

  return assets
}
