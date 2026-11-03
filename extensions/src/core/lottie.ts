import { z } from "zod"

export const MAX_LOTTIE_JSON_BYTES = 2 * 1024 * 1024 // 2 MB

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
  layerCount: z.number().int().positive().max(500),
  nm: z.string().max(200).optional(),
  v: z.string().max(32).optional(),
  loop: z.boolean().default(true).optional(),
  playbackRate: z.number().min(0.25).max(3).default(1).optional(),
  fit: z.enum(LOTTIE_FIT_MODES).default("contain").optional(),
  role: z.enum(LOTTIE_ROLES).optional(),
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
 * - Excessive nesting depth (> 32)
 */
const scanLottieNodeSafety = (
  node: unknown,
  depth = 0,
): { safe: true } | { safe: false; reason: string } => {
  if (depth > 32) {
    return { safe: false, reason: "Excessive JSON nesting depth (> 32)" }
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
    if (node.length > 5000) {
      return { safe: false, reason: "Array length exceeds maximum allowed (5000)" }
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
        reason: "Executable Lottie expressions (property 'x') are forbidden for security",
      }
    }

    const keys = Object.keys(record)
    if (keys.length > 500) {
      return { safe: false, reason: "Object key count exceeds maximum allowed (500)" }
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

const validateLottieJsonInternal = (
  rawInput: string | Uint8Array | unknown,
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

  if (typeof rawInput === "string") {
    const byteLen = new TextEncoder().encode(rawInput).byteLength
    if (byteLen > MAX_LOTTIE_JSON_BYTES) {
      return {
        ok: false,
        error: "errors:extensions.lottieTooLarge",
        reason: `Lottie JSON size (${byteLen} bytes) exceeds 2MB limit`,
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
    if (rawInput.byteLength > MAX_LOTTIE_JSON_BYTES) {
      return {
        ok: false,
        error: "errors:extensions.lottieTooLarge",
        reason: `Lottie JSON size (${rawInput.byteLength} bytes) exceeds 2MB limit`,
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
  } else if (typeof rawInput === "object" && rawInput !== null && !Array.isArray(rawInput)) {
    try {
      rawString = JSON.stringify(rawInput)
    } catch {
      return {
        ok: false,
        error: "errors:extensions.invalidLottieJson",
        reason: "Unserializable object",
      }
    }
    const byteLen = new TextEncoder().encode(rawString).byteLength
    if (byteLen > MAX_LOTTIE_JSON_BYTES) {
      return {
        ok: false,
        error: "errors:extensions.lottieTooLarge",
        reason: `Lottie JSON size (${byteLen} bytes) exceeds 2MB limit`,
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

  if (
    typeof ip !== "number" ||
    !Number.isFinite(ip) ||
    ip < 0
  ) {
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
      reason: "Invalid or missing dimensions 'w'/'h' (must be integers 1..8192)",
    }
  }

  if (!Array.isArray(layers) || layers.length === 0 || layers.length > 500) {
    return {
      ok: false,
      error: "errors:extensions.invalidLottieSchema",
      reason: "Lottie 'layers' must be a non-empty array (1..500 layers)",
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
    if (!Array.isArray(obj.assets) || obj.assets.length > 200) {
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

      if (u.length > 0) {
        return {
          ok: false,
          error: "errors:extensions.unsafeLottieExternalAsset",
          reason: `External asset directory 'u' ("${u}") is forbidden in Lottie animations`,
        }
      }

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
        if (p.startsWith("data:") && !isSafeEmbeddedImageDataUri(p)) {
          return {
            ok: false,
            error: "errors:extensions.unsafeLottieExternalAsset",
            reason: "Only safe base64 raster data URIs are allowed in embedded Lottie assets",
          }
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
  }

  return {
    ok: true,
    meta,
    data: obj,
    sanitizedJson: JSON.stringify(obj),
  }
}
