import { z } from "zod"
import { RUNTIME_PHASES } from "../packages/protocol"
import { SHOW_THEME_ROLES, themeVersionSchema } from "../show-themes/selection"

export {
  SHOW_PREVIEW_PORT_VERSION,
  SHOW_PREVIEW_IDENTITY_RULE_VERSION,
} from "./identity-rule"
export const previewPhaseSchema = z.enum(RUNTIME_PHASES)
export const previewRoleSchema = z.enum(SHOW_THEME_ROLES)
export type PreviewPhase = z.infer<typeof previewPhaseSchema>
export type PreviewRole = z.infer<typeof previewRoleSchema>
export const identifierSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9._-]+$/u)
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u)
export const exactRefSchema = z.strictObject({
  id: identifierSchema,
  version: themeVersionSchema,
})
export type ExactRef = z.infer<typeof exactRefSchema>
export const localizedKeySchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_.:-]+$/u)
export const plainTextSchema = z.string().max(1000)
export const PORTS = [
  "stage-root",
  "backdrop",
  "branding",
  "join",
  "question",
  "choices",
  "vote-status",
  "clock",
  "results",
  "leaderboard",
  "recap",
  "story",
  "interlude",
  "closing",
  "personal-result",
  "decoration",
  "overlay",
  "transition",
] as const
export const portSchema = z.enum(PORTS)
export const diagnosticSchema = z.strictObject({
  code: identifierSchema,
  messageKey: localizedKeySchema,
  path: z.string().max(240),
  severity: z.enum(["warning", "error"]),
})
export type PreviewDiagnostic = z.infer<typeof diagnosticSchema>
export const diagnostic = (code: string, path = ""): PreviewDiagnostic => ({
  code,
  path,
  messageKey: ["adapter-unimplemented", "unknown-theme"].includes(code)
    ? "errors:api.notFound"
    : "errors:invalidRequest",
  severity: "error",
})

/** Reject executable/prototype/cyclic data before any recursive validator runs. */
export function assertBoundedJson(
  value: unknown,
  maxDepth = 24,
  maxNodes = 10000,
): void {
  const active = new Set<object>()
  let nodes = 0
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > maxNodes || depth > maxDepth)
      throw new Error("show-library:json-budget")
    if (item === null || typeof item === "boolean") return
    if (typeof item === "string") {
      if (item.length > 262144) throw new Error("show-library:string-budget")
      return
    }
    if (typeof item === "number" && Number.isFinite(item)) return
    if (typeof item !== "object") throw new Error("show-library:non-json-value")
    if (active.has(item)) throw new Error("show-library:cycle")
    const proto: unknown = Object.getPrototypeOf(item)
    if (Array.isArray(item) && proto !== Array.prototype)
      throw new Error("show-library:array-prototype")
    if (!Array.isArray(item) && proto !== Object.prototype && proto !== null)
      throw new Error("show-library:prototype")
    active.add(item)
    for (const key of Reflect.ownKeys(item)) {
      if (
        typeof key !== "string" ||
        ["__proto__", "prototype", "constructor"].includes(key)
      )
        throw new Error("show-library:prototype-key")
      const descriptor = Object.getOwnPropertyDescriptor(item, key)
      if (!descriptor || descriptor.get || descriptor.set)
        throw new Error("show-library:accessor")
      if (Array.isArray(item) && key === "length") continue
      visit(descriptor.value, depth + 1)
    }
    active.delete(item)
  }
  visit(value, 0)
}

export function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
