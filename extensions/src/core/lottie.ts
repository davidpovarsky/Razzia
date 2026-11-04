import { z } from "zod"

export const MAX_LOTTIE_JSON_BYTES = 32 * 1024 * 1024 // 32 MiB
export const SOFT_WARNING_LOTTIE_JSON_BYTES = 4 * 1024 * 1024 // 4 MiB
export const MAX_DOTLOTTIE_COMPRESSED_BYTES = 24 * 1024 * 1024 // 24 MiB
export const MAX_DOTLOTTIE_UNCOMPRESSED_BYTES = 80 * 1024 * 1024 // 80 MiB
export const MAX_DOTLOTTIE_ENTRIES = 256
export const MAX_LOTTIE_LAYERS = 500
export const MAX_ZIP_COMPRESSION_RATIO = 100

export const LOTTIE_ROLES = [
  "logoIntro",
  "questionUnderline",
  "cardEffect",
  "sceneAnimation",
] as const

export type LottieRole = (typeof LOTTIE_ROLES)[number]

export const LOTTIE_FIT_MODES = ["contain", "cover"] as const

export type LottieFitMode = (typeof LOTTIE_FIT_MODES)[number]

export const lottieMetaSchema = z.strictObject({
  fr: z.number().positive().max(240),
  ip: z.number().min(0),
  op: z.number().positive().max(36000),
  w: z.number().int().positive().max(8192),
  h: z.number().int().positive().max(8192),
  durationMs: z.number().int().nonnegative(),
  layerCount: z.number().int().positive().max(MAX_LOTTIE_LAYERS),
  nm: z.string().max(200).optional(),
  v: z.string().max(32).optional(),
  loop: z.boolean().default(true).optional(),
  playbackRate: z.number().min(0.25).max(3).default(1).optional(),
  fit: z.enum(LOTTIE_FIT_MODES).default("contain").optional(),
  role: z.enum(LOTTIE_ROLES).optional(),
  hasBakedBackground: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
})

export type LottieMeta = z.infer<typeof lottieMetaSchema>

export const lottiePlayerConfigSchema = z.strictObject({
  url: z.string().min(1),
  loop: z.boolean().default(true),
  playbackRate: z.number().min(0.25).max(3).default(1),
  fit: z.enum(LOTTIE_FIT_MODES).default("contain"),
  role: z.enum(LOTTIE_ROLES).optional(),
})

export type LottiePlayerConfig = z.infer<typeof lottiePlayerConfigSchema>

export type LottieValidationResult =
  | {
      ok: true
      valid: true
      meta: LottieMeta
      data: Record<string, unknown>
      sanitizedJson: string
    }
  | {
      ok: false
      valid: false
      error: string
      code?: string
      reason: string
    }

const UNSAFE_STRING_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /vbscript:/i,
  /data:\s*text\/html/i,
  /data:\s*application\/javascript/i,
  /data:\s*image\/svg\+xml/i,
  /<foreignobject\b/i,
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\bonload\s*=/i,
  /\bonerror\s*=/i,
]

const isSafeEmbeddedImageDataUri = (value: string): boolean =>
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(
    value.trim(),
  )

/**
 * Recursively scans a parsed Lottie JSON tree for:
 * - JavaScript expressions (`x` string property on Bodymovin animated properties)
 * - Script tags, event handlers, or dangerous URI schemes
 * - Excessive nesting depth (> 40)
 */
const scanLottieNodeSafety = (
  node: unknown,
  depth = 0,
): { safe: true } | { safe: false; reason: string } => {
  if (depth > 40) {
    return { safe: false, reason: "Excessive JSON nesting depth (> 40)" }
  }

  if (typeof node === "string") {
    for (const pattern of UNSAFE_STRING_PATTERNS) {
      if (pattern.test(node)) {
        return {
          safe: false,
          reason: `Forbidden script or unsafe URI pattern matched: ${pattern.source}`,
        }
      }
    }
    return { safe: true }
  }

  if (Array.isArray(node)) {
    if (node.length > 10000) {
      return {
        safe: false,
        reason: "Array length exceeds maximum allowed (10000)",
      }
    }
    for (const item of node) {
      const res = scanLottieNodeSafety(item, depth + 1)
      if (!res.safe) {
        return res
      }
    }
    return { safe: true }
  }

  if (typeof node === "object" && node !== null) {
    const record = node as Record<string, unknown>

    // Bodymovin expressions live in `"x"` on animated properties (which also have `"k"` or `"a"`).
    // Lottie expressions execute arbitrary JavaScript in some players and are strictly forbidden.
    if (
      typeof record.x === "string" &&
      record.x.trim().length > 0 &&
      ("k" in record || "a" in record)
    ) {
      return {
        safe: false,
        reason:
          "Executable Lottie expressions (property 'x') are forbidden for security",
      }
    }

    const keys = Object.keys(record)
    if (keys.length > 500) {
      return {
        safe: false,
        reason: "Object key count exceeds maximum allowed (500)",
      }
    }

    for (const key of keys) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return { safe: false, reason: `Forbidden prototype key: ${key}` }
      }
      const res = scanLottieNodeSafety(record[key], depth + 1)
      if (!res.safe) {
        return res
      }
    }
  }

  return { safe: true }
}

function detectBakedSolidBackground(
  layers: unknown[],
  w: number,
  h: number,
): boolean {
  if (layers.length === 0) {
    return false
  }
  const bottomLayer = layers[layers.length - 1]
  if (
    typeof bottomLayer !== "object" ||
    bottomLayer === null ||
    Array.isArray(bottomLayer)
  ) {
    return false
  }
  const rec = bottomLayer as Record<string, unknown>
  if (rec.ty === 1 && typeof rec.sw === "number" && typeof rec.sh === "number") {
    return rec.sw >= w * 0.95 && rec.sh >= h * 0.95 && typeof rec.sc === "string"
  }
  return false
}

/**
 * Strictly validates a user-supplied Lottie JSON payload.
 * Ensures valid Bodymovin structure (`fr`, `ip`, `op`, `w`, `h`, `layers`),
 * enforces size and dimension bounds, and rejects external network fetches,
 * scripts, and executable expressions.
 */
export const validateLottieJson = (
  rawInput: string | Uint8Array | unknown,
): LottieValidationResult => {
  const result = validateLottieJsonInternal(rawInput)
  if (result.ok) {
    return { ...result, valid: true }
  }
  return { ...result, valid: false, code: result.error }
}

interface InternalLottieValidateOptions {
  allowInternalArchiveAssets?: Set<string>
}

const validateLottieJsonInternal = (
  rawInput: string | Uint8Array | unknown,
  options?: InternalLottieValidateOptions,
):
  | {
      ok: true
      meta: LottieMeta
      data: Record<string, unknown>
      sanitizedJson: string
    }
  | {
      ok: false
      error: string
      reason: string
    } => {
  let rawString: string | undefined
  let parsed: unknown
  let byteLen = 0

  if (typeof rawInput === "string") {
    byteLen = new TextEncoder().encode(rawInput).byteLength
    if (byteLen > MAX_LOTTIE_JSON_BYTES) {
      return {
        ok: false,
        error: "errors:extensions.lottieTooLarge",
        reason: `Lottie JSON size (${byteLen} bytes) exceeds 32 MiB limit`,
      }
    }
    if (rawInput.trim().length === 0) {
      return {
        ok: false,
        error: "errors:extensions.invalidLottieJson",
        reason: "Empty input",
      }
    }
    rawString = rawInput
    try {
      parsed = JSON.parse(rawInput)
    } catch {
      return {
        ok: false,
        error: "errors:extensions.invalidLottieJson",
        reason: "Malformed JSON syntax",
      }
    }
  } else if (rawInput instanceof Uint8Array) {
    byteLen = rawInput.byteLength
    if (byteLen > MAX_LOTTIE_JSON_BYTES) {
      return {
        ok: false,
        error: "errors:extensions.lottieTooLarge",
        reason: `Lottie JSON size (${byteLen} bytes) exceeds 32 MiB limit`,
      }
    }
    try {
      rawString = new TextDecoder("utf-8", { fatal: true }).decode(rawInput)
      parsed = JSON.parse(rawString)
    } catch {
      return {
        ok: false,
        error: "errors:extensions.invalidLottieJson",
        reason: "Malformed UTF-8 or JSON syntax",
      }
    }
  } else if (
    typeof rawInput === "object" &&
    rawInput !== null &&
    !Array.isArray(rawInput)
  ) {
    try {
      rawString = JSON.stringify(rawInput)
    } catch {
      return {
        ok: false,
        error: "errors:extensions.invalidLottieJson",
        reason: "Unserializable object",
      }
    }
    byteLen = new TextEncoder().encode(rawString).byteLength
    if (byteLen > MAX_LOTTIE_JSON_BYTES) {
      return {
        ok: false,
        error: "errors:extensions.lottieTooLarge",
        reason: `Lottie JSON size (${byteLen} bytes) exceeds 32 MiB limit`,
      }
    }
    parsed = rawInput
  } else {
    return {
      ok: false,
      error: "errors:extensions.invalidLottieJson",
      reason: "Input must be a JSON string, Uint8Array, or plain object",
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "errors:extensions.invalidLottieSchema",
      reason: "Lottie root must be a JSON object",
    }
  }

  const obj = parsed as Record<string, unknown>

  const fr = obj.fr
  const ip = obj.ip
  const op = obj.op
  const w = obj.w
  const h = obj.h
  const layers = obj.layers

  if (
    typeof fr !== "number" ||
    !Number.isFinite(fr) ||
    fr <= 0 ||
    fr > 240
  ) {
    return {
      ok: false,
      error: "errors:extensions.invalidLottieSchema",
      reason: "Invalid or missing frame rate 'fr' (must be 1..240)",
    }
  }

  if (typeof ip !== "number" || !Number.isFinite(ip) || ip < 0) {
    return {
      ok: false,
      error: "errors:extensions.invalidLottieSchema",
      reason: "Invalid or missing in-point 'ip' (must be >= 0)",
    }
  }

  if (
    typeof op !== "number" ||
    !Number.isFinite(op) ||
    op <= ip ||
    op > 36000
  ) {
    return {
      ok: false,
      error: "errors:extensions.invalidLottieSchema",
      reason: "Invalid or missing out-point 'op' (must be > ip and <= 36000)",
    }
  }

  if (
    typeof w !== "number" ||
    !Number.isInteger(w) ||
    w < 1 ||
    w > 8192 ||
    typeof h !== "number" ||
    !Number.isInteger(h) ||
    h < 1 ||
    h > 8192
  ) {
    return {
      ok: false,
      error: "errors:extensions.invalidLottieSchema",
      reason:
        "Invalid or missing dimensions 'w'/'h' (must be integers 1..8192)",
    }
  }

  if (
    !Array.isArray(layers) ||
    layers.length === 0 ||
    layers.length > MAX_LOTTIE_LAYERS
  ) {
    return {
      ok: false,
      error: "errors:extensions.invalidLottieSchema",
      reason: `Lottie 'layers' must be a non-empty array (1..${MAX_LOTTIE_LAYERS} layers)`,
    }
  }

  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i]
    if (typeof layer !== "object" || layer === null || Array.isArray(layer)) {
      return {
        ok: false,
        error: "errors:extensions.invalidLottieSchema",
        reason: `Layer at index ${i} is not an object`,
      }
    }
  }

  // Validate assets array: strictly forbid external URLs or path traversal
  if (obj.assets !== undefined) {
    if (!Array.isArray(obj.assets) || obj.assets.length > 256) {
      return {
        ok: false,
        error: "errors:extensions.invalidLottieSchema",
        reason: "Invalid 'assets' array in Lottie JSON",
      }
    }
    for (let i = 0; i < obj.assets.length; i += 1) {
      const asset = obj.assets[i]
      if (typeof asset !== "object" || asset === null || Array.isArray(asset)) {
        return {
          ok: false,
          error: "errors:extensions.invalidLottieSchema",
          reason: `Asset at index ${i} is not an object`,
        }
      }
      const assetRec = asset as Record<string, unknown>
      const u = typeof assetRec.u === "string" ? assetRec.u.trim() : ""
      const p = typeof assetRec.p === "string" ? assetRec.p.trim() : ""

      if (p.length > 0) {
        if (
          /^(https?:|ftp:|file:|javascript:|vbscript:|\/\/)/i.test(p) ||
          p.includes("..") ||
          p.includes("\\") ||
          /%2e/i.test(p)
        ) {
          return {
            ok: false,
            error: "errors:extensions.unsafeLottieExternalAsset",
            reason: `External or unsafe asset path 'p' ("${p}") is forbidden in Lottie animations`,
          }
        }
        if (p.startsWith("data:")) {
          if (!isSafeEmbeddedImageDataUri(p)) {
            return {
              ok: false,
              error: "errors:extensions.unsafeLottieExternalAsset",
              reason:
                "Only safe base64 raster data URIs are allowed in embedded Lottie assets",
            }
          }
          if (u.length > 0) {
            return {
              ok: false,
              error: "errors:extensions.unsafeLottieExternalAsset",
              reason: `External asset directory 'u' ("${u}") is forbidden when using data URI`,
            }
          }
        } else if (options?.allowInternalArchiveAssets) {
          const cleanU = u.replace(/^\/+|\/+$/g, "")
          const cleanP = p.replace(/^\/+/g, "")
          const candidate1 = cleanU ? `${cleanU}/${cleanP}` : cleanP
          const candidate2 = `images/${cleanP}`
          const candidate3 = `i/${cleanP}`
          if (
            !options.allowInternalArchiveAssets.has(candidate1) &&
            !options.allowInternalArchiveAssets.has(candidate2) &&
            !options.allowInternalArchiveAssets.has(candidate3)
          ) {
            return {
              ok: false,
              error: "errors:extensions.unsafeLottieExternalAsset",
              reason: `Referenced archive asset "${candidate1}" is missing from .lottie bundle`,
            }
          }
        } else if (u.length > 0 || !p.startsWith("data:")) {
          return {
            ok: false,
            error: "errors:extensions.unsafeLottieExternalAsset",
            reason: `External asset reference (u="${u}", p="${p}") is forbidden in standalone Lottie JSON; embed base64 raster data URI or package as .lottie`,
          }
        }
      } else if (u.length > 0) {
        return {
          ok: false,
          error: "errors:extensions.unsafeLottieExternalAsset",
          reason: `External asset directory 'u' ("${u}") is forbidden in Lottie animations`,
        }
      }
    }
  }

  // Recursive safety scan for expressions and scripts
  const safety = scanLottieNodeSafety(obj)
  if (!safety.safe) {
    return {
      ok: false,
      error: "errors:extensions.unsafeLottieContent",
      reason: safety.reason,
    }
  }

  const durationMs = Math.max(0, Math.round(((op - ip) / fr) * 1000))
  const nm =
    typeof obj.nm === "string" && obj.nm.trim().length > 0
      ? obj.nm.trim().slice(0, 200)
      : undefined
  const v =
    typeof obj.v === "string" && obj.v.trim().length > 0
      ? obj.v.trim().slice(0, 32)
      : undefined

  const warnings: string[] = []
  if (byteLen > SOFT_WARNING_LOTTIE_JSON_BYTES) {
    warnings.push("warnings:extensions.largeLottieFile")
  }
  const hasBakedBackground = detectBakedSolidBackground(layers, w, h)
  if (hasBakedBackground) {
    warnings.push("warnings:extensions.lottieBakedBackground")
  }

  const meta: LottieMeta = {
    fr,
    ip,
    op,
    w,
    h,
    durationMs,
    layerCount: layers.length,
    ...(nm ? { nm } : {}),
    ...(v ? { v } : {}),
    ...(hasBakedBackground ? { hasBakedBackground: true } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  }

  return {
    ok: true,
    meta,
    data: obj,
    sanitizedJson: JSON.stringify(obj),
  }
}

// ── Pure TypeScript ZIP & Deflate Inspector for .lottie Containers ──────────

function readU16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8)
}

function readU32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  )
}

function writeU16LE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff
  buf[offset + 1] = (val >>> 8) & 0xff
}

function writeU32LE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff
  buf[offset + 1] = (val >>> 8) & 0xff
  buf[offset + 2] = (val >>> 16) & 0xff
  buf[offset + 3] = (val >>> 24) & 0xff
}

interface HuffmanTable {
  counts: Uint16Array
  symbols: Uint16Array
}

function buildHuffman(lengths: Uint8Array, maxSymbol: number): HuffmanTable {
  const counts = new Uint16Array(16)
  for (let i = 0; i < maxSymbol; i += 1) {
    const len = lengths[i]
    if (len > 0) {
      counts[len] += 1
    }
  }
  const offsets = new Uint16Array(16)
  let code = 0
  for (let bits = 1; bits <= 15; bits += 1) {
    offsets[bits] = code
    code += counts[bits]
  }
  const symbols = new Uint16Array(code)
  for (let i = 0; i < maxSymbol; i += 1) {
    const len = lengths[i]
    if (len > 0) {
      symbols[offsets[len]] = i
      offsets[len] += 1
    }
  }
  return { counts, symbols }
}

const FIXED_LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
]
const FIXED_LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
]
const FIXED_DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
  769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const FIXED_DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
]
const CLEN_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]

function inflateRawDeflate(
  src: Uint8Array,
  maxOutputLength: number,
): Uint8Array {
  let bytePos = 0
  let bitBuf = 0
  let bitCnt = 0

  const needBits = (n: number) => {
    while (bitCnt < n) {
      if (bytePos >= src.length) {
        throw new Error("errors:extensions.corruptDotLottieArchive")
      }
      bitBuf |= src[bytePos] << bitCnt
      bytePos += 1
      bitCnt += 8
    }
  }

  const readBits = (n: number): number => {
    needBits(n)
    const val = bitBuf & ((1 << n) - 1)
    bitBuf >>>= n
    bitCnt -= n
    return val
  }

  const decodeSymbol = (table: HuffmanTable): number => {
    let code = 0
    let first = 0
    let index = 0
    for (let len = 1; len <= 15; len += 1) {
      code |= readBits(1)
      const count = table.counts[len]
      if (code - count < first) {
        return table.symbols[index + (code - first)]
      }
      index += count
      first += count
      first <<= 1
      code <<= 1
    }
    throw new Error("errors:extensions.corruptDotLottieArchive")
  }

  const fixedLitLengths = new Uint8Array(288)
  for (let i = 0; i <= 143; i += 1) fixedLitLengths[i] = 8
  for (let i = 144; i <= 255; i += 1) fixedLitLengths[i] = 9
  for (let i = 256; i <= 279; i += 1) fixedLitLengths[i] = 7
  for (let i = 280; i <= 287; i += 1) fixedLitLengths[i] = 8
  const fixedDistLengths = new Uint8Array(32)
  fixedDistLengths.fill(5)

  const fixedLitTable = buildHuffman(fixedLitLengths, 288)
  const fixedDistTable = buildHuffman(fixedDistLengths, 32)

  let out = new Uint8Array(
    Math.min(maxOutputLength, Math.max(4096, src.length * 3)),
  )
  let outPos = 0

  const ensureOut = (extra: number) => {
    if (outPos + extra > maxOutputLength) {
      throw new Error("errors:extensions.dotLottieTooLarge")
    }
    if (outPos + extra > out.length) {
      let nextLen = out.length * 2
      while (nextLen < outPos + extra) {
        nextLen *= 2
      }
      const next = new Uint8Array(Math.min(maxOutputLength, nextLen))
      next.set(out.subarray(0, outPos))
      out = next
    }
  }

  let isFinal = 0
  while (!isFinal) {
    isFinal = readBits(1)
    const btype = readBits(2)

    if (btype === 0) {
      bitBuf = 0
      bitCnt = 0
      if (bytePos + 4 > src.length) {
        throw new Error("errors:extensions.corruptDotLottieArchive")
      }
      const len = src[bytePos] | (src[bytePos + 1] << 8)
      const nlen = src[bytePos + 2] | (src[bytePos + 3] << 8)
      bytePos += 4
      if ((len ^ 0xffff) !== nlen || bytePos + len > src.length) {
        throw new Error("errors:extensions.corruptDotLottieArchive")
      }
      ensureOut(len)
      out.set(src.subarray(bytePos, bytePos + len), outPos)
      bytePos += len
      outPos += len
    } else if (btype === 1 || btype === 2) {
      let litTable = fixedLitTable
      let distTable = fixedDistTable

      if (btype === 2) {
        const hlit = readBits(5) + 257
        const hdist = readBits(5) + 1
        const hclen = readBits(4) + 4
        const codeLengths = new Uint8Array(19)
        for (let i = 0; i < hclen; i += 1) {
          codeLengths[CLEN_ORDER[i]] = readBits(3)
        }
        const clenTable = buildHuffman(codeLengths, 19)
        const totalLengths = hlit + hdist
        const litDistLens = new Uint8Array(totalLengths)
        let curIdx = 0
        while (curIdx < totalLengths) {
          const sym = decodeSymbol(clenTable)
          if (sym < 16) {
            litDistLens[curIdx] = sym
            curIdx += 1
          } else if (sym === 16) {
            if (curIdx === 0) {
              throw new Error("errors:extensions.corruptDotLottieArchive")
            }
            const prev = litDistLens[curIdx - 1]
            const repeat = readBits(2) + 3
            litDistLens.fill(prev, curIdx, curIdx + repeat)
            curIdx += repeat
          } else if (sym === 17) {
            const repeat = readBits(3) + 3
            litDistLens.fill(0, curIdx, curIdx + repeat)
            curIdx += repeat
          } else if (sym === 18) {
            const repeat = readBits(7) + 11
            litDistLens.fill(0, curIdx, curIdx + repeat)
            curIdx += repeat
          }
        }
        litTable = buildHuffman(litDistLens.subarray(0, hlit), hlit)
        distTable = buildHuffman(litDistLens.subarray(hlit), hdist)
      }

      while (true) {
        const sym = decodeSymbol(litTable)
        if (sym < 256) {
          ensureOut(1)
          out[outPos] = sym
          outPos += 1
        } else if (sym === 256) {
          break
        } else {
          const lenIdx = sym - 257
          if (lenIdx < 0 || lenIdx >= FIXED_LEN_BASE.length) {
            throw new Error("errors:extensions.corruptDotLottieArchive")
          }
          const length =
            FIXED_LEN_BASE[lenIdx] + readBits(FIXED_LEN_EXTRA[lenIdx])
          const distSym = decodeSymbol(distTable)
          if (distSym < 0 || distSym >= FIXED_DIST_BASE.length) {
            throw new Error("errors:extensions.corruptDotLottieArchive")
          }
          const distance =
            FIXED_DIST_BASE[distSym] + readBits(FIXED_DIST_EXTRA[distSym])
          if (distance > outPos) {
            throw new Error("errors:extensions.corruptDotLottieArchive")
          }
          ensureOut(length)
          for (let i = 0; i < length; i += 1) {
            out[outPos] = out[outPos - distance]
            outPos += 1
          }
        }
      }
    } else {
      throw new Error("errors:extensions.corruptDotLottieArchive")
    }
  }

  return out.subarray(0, outPos)
}

function isSafeArchiveEntryPath(name: string): boolean {
  if (!name || name.length > 240) {
    return false
  }
  if (
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("..") ||
    name.includes(":") ||
    name.includes("\0") ||
    /%2e/i.test(name) ||
    /%2f/i.test(name) ||
    /%5c/i.test(name)
  ) {
    return false
  }
  return /^[A-Za-z0-9_./-]+$/u.test(name)
}

function isRasterImageBytes(name: string, bytes: Uint8Array): boolean {
  const lower = name.toLowerCase()
  if (lower.endsWith(".png")) {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    )
  }
  if (lower.endsWith(".webp")) {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    )
  }
  if (lower.endsWith(".gif")) {
    return (
      bytes.length >= 6 &&
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61
    )
  }
  return false
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Builds an uncompressed (STORE) ZIP archive for `.lottie` packaging or test fixtures.
 */
export function createDotLottieArchive(
  entries: Array<{ name: string; data: Uint8Array | string }>,
): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const contentBytes =
      typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data
    const crc = crc32(contentBytes)

    const localHeader = new Uint8Array(30 + nameBytes.length)
    writeU32LE(localHeader, 0, 0x04034b50)
    writeU16LE(localHeader, 4, 20)
    writeU16LE(localHeader, 6, 0)
    writeU16LE(localHeader, 8, 0) // method 0 = STORE
    writeU16LE(localHeader, 10, 0)
    writeU16LE(localHeader, 12, 0)
    writeU32LE(localHeader, 14, crc)
    writeU32LE(localHeader, 18, contentBytes.length)
    writeU32LE(localHeader, 22, contentBytes.length)
    writeU16LE(localHeader, 26, nameBytes.length)
    writeU16LE(localHeader, 28, 0)
    localHeader.set(nameBytes, 30)

    localParts.push(localHeader, contentBytes)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    writeU32LE(centralHeader, 0, 0x02014b50)
    writeU16LE(centralHeader, 4, 20)
    writeU16LE(centralHeader, 6, 20)
    writeU16LE(centralHeader, 8, 0)
    writeU16LE(centralHeader, 10, 0)
    writeU16LE(centralHeader, 12, 0)
    writeU16LE(centralHeader, 14, 0)
    writeU32LE(centralHeader, 16, crc)
    writeU32LE(centralHeader, 20, contentBytes.length)
    writeU32LE(centralHeader, 24, contentBytes.length)
    writeU16LE(centralHeader, 28, nameBytes.length)
    writeU16LE(centralHeader, 30, 0)
    writeU16LE(centralHeader, 32, 0)
    writeU16LE(centralHeader, 34, 0)
    writeU16LE(centralHeader, 36, 0)
    writeU32LE(centralHeader, 38, 0)
    writeU32LE(centralHeader, 42, localOffset)
    centralHeader.set(nameBytes, 46)

    centralParts.push(centralHeader)
    localOffset += localHeader.length + contentBytes.length
  }

  const centralSize = centralParts.reduce((acc, a) => acc + a.byteLength, 0)
  const eocd = new Uint8Array(22)
  writeU32LE(eocd, 0, 0x06054b50)
  writeU16LE(eocd, 4, 0)
  writeU16LE(eocd, 6, 0)
  writeU16LE(eocd, 8, entries.length)
  writeU16LE(eocd, 10, entries.length)
  writeU32LE(eocd, 12, centralSize)
  writeU32LE(eocd, 16, localOffset)
  writeU16LE(eocd, 20, 0)

  const allParts = [...localParts, ...centralParts, eocd]
  const totalBytes = allParts.reduce((acc, a) => acc + a.byteLength, 0)
  const out = new Uint8Array(totalBytes)
  let pos = 0
  for (const part of allParts) {
    out.set(part, pos)
    pos += part.byteLength
  }
  return out
}

export type DotLottieValidationResult =
  | {
      ok: true
      valid: true
      meta: LottieMeta
      animationIds: string[]
      convertedFromBodymovinZip: boolean
      archiveBytes: Uint8Array
    }
  | {
      ok: false
      valid: false
      error: string
      code: string
      reason: string
    }

/**
 * Strictly validates a `.lottie` binary ZIP container (or safely converts a clean
 * Bodymovin `data.json + images/` ZIP into a canonical `.lottie` container).
 * Rejects Zip Slip, symlinks, nested archives, zip bombs, scripts, and external URLs.
 */
export function validateDotLottieContainer(
  rawBytes: Uint8Array,
  options?: { allowBodymovinZipConversion?: boolean },
): DotLottieValidationResult {
  const fail = (error: string, reason: string): DotLottieValidationResult => ({
    ok: false,
    valid: false,
    error,
    code: error,
    reason,
  })

  if (rawBytes.byteLength < 22) {
    return fail(
      "errors:extensions.corruptDotLottieArchive",
      "Archive is smaller than minimum ZIP header (22 bytes)",
    )
  }

  if (rawBytes.byteLength > MAX_DOTLOTTIE_COMPRESSED_BYTES) {
    return fail(
      "errors:extensions.dotLottieTooLarge",
      `Compressed .lottie size (${rawBytes.byteLength} bytes) exceeds 24 MiB limit`,
    )
  }

  if (readU32LE(rawBytes, 0) !== 0x04034b50) {
    return fail(
      "errors:extensions.corruptDotLottieArchive",
      "Invalid ZIP magic bytes (expected PK\\x03\\x04)",
    )
  }

  // Locate End of Central Directory (EOCD)
  let eocdOffset = -1
  const minEocdSearch = Math.max(0, rawBytes.length - 65557)
  for (let i = rawBytes.length - 22; i >= minEocdSearch; i -= 1) {
    if (readU32LE(rawBytes, i) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) {
    return fail(
      "errors:extensions.corruptDotLottieArchive",
      "Missing ZIP End of Central Directory record",
    )
  }

  const totalEntries = readU16LE(rawBytes, eocdOffset + 10)
  const centralDirSize = readU32LE(rawBytes, eocdOffset + 12)
  const centralDirOffset = readU32LE(rawBytes, eocdOffset + 16)

  if (totalEntries < 1 || totalEntries > MAX_DOTLOTTIE_ENTRIES) {
    return fail(
      "errors:extensions.dotLottieTooManyEntries",
      `Archive entry count (${totalEntries}) must be between 1 and ${MAX_DOTLOTTIE_ENTRIES}`,
    )
  }

  if (
    centralDirOffset + centralDirSize > eocdOffset ||
    centralDirOffset >= rawBytes.length
  ) {
    return fail(
      "errors:extensions.corruptDotLottieArchive",
      "Central directory bounds exceed archive size",
    )
  }

  const decoder = new TextDecoder("utf-8", { fatal: true })
  const seenNamesLower = new Set<string>()
  const extractedEntries = new Map<string, Uint8Array>()
  let totalUncompressed = 0
  let ptr = centralDirOffset

  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (ptr + 46 > rawBytes.length || readU32LE(rawBytes, ptr) !== 0x02014b50) {
      return fail(
        "errors:extensions.corruptDotLottieArchive",
        "Malformed Central Directory File Header",
      )
    }

    const flags = readU16LE(rawBytes, ptr + 8)
    const method = readU16LE(rawBytes, ptr + 10)
    const compSize = readU32LE(rawBytes, ptr + 20)
    const uncompSize = readU32LE(rawBytes, ptr + 24)
    const nameLen = readU16LE(rawBytes, ptr + 28)
    const extraLen = readU16LE(rawBytes, ptr + 30)
    const commentLen = readU16LE(rawBytes, ptr + 32)
    const externalAttr = readU32LE(rawBytes, ptr + 38)
    const localHeaderOffset = readU32LE(rawBytes, ptr + 42)

    if ((flags & 0x01) !== 0) {
      return fail(
        "errors:extensions.unsafeDotLottieArchive",
        "Encrypted ZIP entries are forbidden",
      )
    }

    // Unix symlink mode check (S_IFLNK = 0o120000 = 0xa000)
    const unixFileType = (externalAttr >>> 16) & 0xf000
    if (unixFileType === 0xa000) {
      return fail(
        "errors:extensions.unsafeDotLottieArchive",
        "Symbolic links are forbidden inside .lottie archives",
      )
    }

    if (ptr + 46 + nameLen + extraLen + commentLen > rawBytes.length) {
      return fail(
        "errors:extensions.corruptDotLottieArchive",
        "Central directory entry extends past EOF",
      )
    }

    let entryName: string
    try {
      entryName = decoder.decode(rawBytes.subarray(ptr + 46, ptr + 46 + nameLen))
    } catch {
      return fail(
        "errors:extensions.unsafeDotLottieArchive",
        "Non-UTF8 entry filename in archive",
      )
    }
    ptr += 46 + nameLen + extraLen + commentLen

    // Skip pure directory entries if safe
    if (entryName.endsWith("/")) {
      const stripped = entryName.slice(0, -1)
      if (stripped && !isSafeArchiveEntryPath(stripped)) {
        return fail(
          "errors:extensions.unsafeDotLottieArchive",
          `Unsafe directory entry path: ${entryName}`,
        )
      }
      continue
    }

    if (!isSafeArchiveEntryPath(entryName)) {
      return fail(
        "errors:extensions.unsafeDotLottieArchive",
        `Unsafe or traversal entry path: ${entryName}`,
      )
    }

    const lowerName = entryName.toLowerCase()
    if (seenNamesLower.has(lowerName)) {
      return fail(
        "errors:extensions.unsafeDotLottieArchive",
        `Duplicate entry path in archive: ${entryName}`,
      )
    }
    seenNamesLower.add(lowerName)

    if (
      /\.(zip|lottie|tar|gz|7z|rar|js|mjs|cjs|html|htm|svg|xml|wasm|sh|bat|cmd|exe)$/i.test(
        lowerName,
      )
    ) {
      return fail(
        "errors:extensions.unsafeDotLottieArchive",
        `Forbidden file type in .lottie archive: ${entryName}`,
      )
    }

    if (
      compSize === 0xffffffff ||
      uncompSize === 0xffffffff ||
      totalUncompressed + uncompSize > MAX_DOTLOTTIE_UNCOMPRESSED_BYTES
    ) {
      return fail(
        "errors:extensions.dotLottieTooLarge",
        "Total uncompressed size exceeds 80 MiB limit",
      )
    }

    if (
      uncompSize > 1024 * 1024 &&
      (compSize === 0 || uncompSize / compSize > MAX_ZIP_COMPRESSION_RATIO)
    ) {
      return fail(
        "errors:extensions.dotLottieZipBomb",
        `Suspicious compression ratio on entry ${entryName}`,
      )
    }

    if (
      localHeaderOffset + 30 > rawBytes.length ||
      readU32LE(rawBytes, localHeaderOffset) !== 0x04034b50
    ) {
      return fail(
        "errors:extensions.corruptDotLottieArchive",
        `Invalid local header for entry ${entryName}`,
      )
    }

    const lNameLen = readU16LE(rawBytes, localHeaderOffset + 26)
    const lExtraLen = readU16LE(rawBytes, localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen
    const dataEnd = dataStart + compSize

    if (dataEnd > rawBytes.length) {
      return fail(
        "errors:extensions.corruptDotLottieArchive",
        `Truncated compressed data for entry ${entryName}`,
      )
    }

    const compSlice = rawBytes.subarray(dataStart, dataEnd)
    let entryBytes: Uint8Array
    try {
      if (method === 0) {
        if (compSize !== uncompSize) {
          return fail(
            "errors:extensions.corruptDotLottieArchive",
            `Store size mismatch on entry ${entryName}`,
          )
        }
        entryBytes = compSlice
      } else if (method === 8) {
        const remainingAllowance =
          MAX_DOTLOTTIE_UNCOMPRESSED_BYTES - totalUncompressed
        entryBytes = inflateRawDeflate(
          compSlice,
          Math.min(remainingAllowance, Math.max(uncompSize, 1024)),
        )
        if (entryBytes.byteLength !== uncompSize) {
          return fail(
            "errors:extensions.corruptDotLottieArchive",
            `Inflated size mismatch on entry ${entryName}`,
          )
        }
      } else {
        return fail(
          "errors:extensions.corruptDotLottieArchive",
          `Unsupported ZIP compression method (${method}) on entry ${entryName}`,
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "errors:extensions.corruptDotLottieArchive"
      return fail(
        msg.startsWith("errors:") ? msg : "errors:extensions.corruptDotLottieArchive",
        `Failed to decompress ${entryName}`,
      )
    }

    // Block nested ZIP magic inside any extracted file
    if (entryBytes.byteLength >= 4 && readU32LE(entryBytes, 0) === 0x04034b50) {
      return fail(
        "errors:extensions.unsafeDotLottieArchive",
        `Nested ZIP container detected inside entry ${entryName}`,
      )
    }

    totalUncompressed += entryBytes.byteLength
    extractedEntries.set(entryName, entryBytes)
  }

  // Classify allowed entries: images, animations, manifest
  const imagePaths = new Set<string>()
  for (const [entryPath, bytes] of extractedEntries.entries()) {
    if (/^(images|i)\/[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp|gif)$/i.test(entryPath)) {
      if (!isRasterImageBytes(entryPath, bytes)) {
        return fail(
          "errors:extensions.unsafeDotLottieArchive",
          `Invalid image magic bytes in ${entryPath}`,
        )
      }
      imagePaths.add(entryPath)
    }
  }

  const manifestBytes = extractedEntries.get("manifest.json")
  if (!manifestBytes) {
    // Check if raw Bodymovin ZIP conversion is permitted and applicable
    if (options?.allowBodymovinZipConversion !== false) {
      const rootJsonEntries = [...extractedEntries.entries()].filter(
        ([k]) =>
          /^[A-Za-z0-9_.-]+\.json$/i.test(k) &&
          k.toLowerCase() !== "manifest.json",
      )
      const allEntriesRecognized = [...extractedEntries.keys()].every(
        (k) =>
          imagePaths.has(k) ||
          (rootJsonEntries.length === 1 && k === rootJsonEntries[0][0]),
      )

      if (rootJsonEntries.length === 1 && allEntriesRecognized) {
        const [, animBytes] = rootJsonEntries[0]
        const animRes = validateLottieJsonInternal(animBytes, {
          allowInternalArchiveAssets: imagePaths,
        })
        if (!animRes.ok) {
          return fail(animRes.error, animRes.reason)
        }
        const manifestObj = {
          version: "1.0",
          generator: "tada-studio-safe-packager",
          animations: [{ id: "default", speed: 1, loop: true }],
        }
        const newEntries: Array<{ name: string; data: Uint8Array | string }> = [
          { name: "manifest.json", data: JSON.stringify(manifestObj) },
          { name: "animations/default.json", data: animRes.sanitizedJson },
        ]
        for (const imgPath of imagePaths) {
          const imgData = extractedEntries.get(imgPath)!
          const normalizedImgPath = imgPath.startsWith("i/")
            ? `images/${imgPath.slice(2)}`
            : imgPath
          newEntries.push({ name: normalizedImgPath, data: imgData })
        }
        const packagedArchive = createDotLottieArchive(newEntries)
        return {
          ok: true,
          valid: true,
          meta: animRes.meta,
          animationIds: ["default"],
          convertedFromBodymovinZip: true,
          archiveBytes: packagedArchive,
        }
      }
    }

    return fail(
      "errors:extensions.invalidDotLottieManifest",
      "Missing manifest.json in .lottie archive",
    )
  }

  // Validate manifest.json
  let manifestJson: unknown
  try {
    const manifestText = decoder.decode(manifestBytes)
    manifestJson = JSON.parse(manifestText)
  } catch {
    return fail(
      "errors:extensions.invalidDotLottieManifest",
      "Malformed JSON in manifest.json",
    )
  }

  const manifestSafety = scanLottieNodeSafety(manifestJson)
  if (!manifestSafety.safe) {
    return fail(
      "errors:extensions.unsafeDotLottieArchive",
      manifestSafety.reason,
    )
  }

  if (
    typeof manifestJson !== "object" ||
    manifestJson === null ||
    Array.isArray(manifestJson)
  ) {
    return fail(
      "errors:extensions.invalidDotLottieManifest",
      "manifest.json root must be an object",
    )
  }

  const rawAnimations = (manifestJson as Record<string, unknown>).animations
  if (
    !Array.isArray(rawAnimations) ||
    rawAnimations.length === 0 ||
    rawAnimations.length > 32
  ) {
    return fail(
      "errors:extensions.invalidDotLottieManifest",
      "manifest.json must declare 1..32 animations",
    )
  }

  const animationIds: string[] = []
  let primaryMeta: LottieMeta | undefined

  for (const item of rawAnimations) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return fail(
        "errors:extensions.invalidDotLottieManifest",
        "Invalid animation entry in manifest.json",
      )
    }
    const id = (item as Record<string, unknown>).id
    if (
      typeof id !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/u.test(id) ||
      animationIds.includes(id)
    ) {
      return fail(
        "errors:extensions.invalidDotLottieManifest",
        `Invalid or duplicate animation id in manifest.json: ${String(id)}`,
      )
    }
    animationIds.push(id)

    const animBytes =
      extractedEntries.get(`animations/${id}.json`) ??
      extractedEntries.get(`a/${id}.json`)
    if (!animBytes) {
      return fail(
        "errors:extensions.invalidDotLottieManifest",
        `Animation file for id "${id}" is missing from archive`,
      )
    }

    const validatedAnim = validateLottieJsonInternal(animBytes, {
      allowInternalArchiveAssets: imagePaths,
    })
    if (!validatedAnim.ok) {
      return fail(validatedAnim.error, validatedAnim.reason)
    }
    if (!primaryMeta) {
      primaryMeta = validatedAnim.meta
    }
  }

  // Ensure no unrecognized extra files exist in the archive
  for (const entryPath of extractedEntries.keys()) {
    if (entryPath === "manifest.json" || imagePaths.has(entryPath)) {
      continue
    }
    const animMatch = /^(?:animations|a)\/([A-Za-z0-9_-]+)\.json$/u.exec(
      entryPath,
    )
    if (animMatch && animationIds.includes(animMatch[1])) {
      continue
    }
    return fail(
      "errors:extensions.unsafeDotLottieArchive",
      `Unrecognized or unreferenced file in .lottie archive: ${entryPath}`,
    )
  }

  return {
    ok: true,
    valid: true,
    meta: primaryMeta!,
    animationIds,
    convertedFromBodymovinZip: false,
    archiveBytes: rawBytes,
  }
}
