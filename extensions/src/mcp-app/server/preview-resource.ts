import { z } from "zod"
import { hashJson, utf8Bytes } from "../contracts/canonical.ts"
import { sha256Hex } from "../../core/digest.ts"
import { ToolError } from "./errors.ts"

const origin = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value)

      return (
        url.protocol === "https:" &&
        url.origin === value &&
        !url.hostname.includes("*")
      )
    } catch {
      return false
    }
  })
const cspSchema = z.strictObject({
  connectDomains: z.array(origin).max(16),
  resourceDomains: z.array(origin).max(16),
  frameDomains: z.array(origin).max(16),
  baseUriDomains: z.array(origin).max(16).optional(),
})

export const PREVIEW_UI_RESPONSE_LIMIT = 4_194_304

export interface PreviewUiResource {
  /** Exact reviewed static G artifact, never a per-user/model template. */
  html: string
  sha256: string
  csp: z.infer<typeof cspSchema>
  /** Deployment's actual artifact/runtime/media permission, checked per read. */
  canServe(): boolean
}

export function preparePreviewUiResource(input: PreviewUiResource) {
  const html = z.string().min(1).parse(input.html)

  if (
    utf8Bytes(html) > 4_194_304 ||
    !/^[a-f0-9]{64}$/u.test(input.sha256) ||
    sha256Hex(html) !== input.sha256 ||
    typeof input.canServe !== "function"
  ) {
    throw new Error("Reviewed static preview artifact required")
  }

  const csp = cspSchema.parse(input.csp)

  if (
    utf8Bytes(JSON.stringify(html)) + 2 * utf8Bytes(JSON.stringify(csp)) >
    PREVIEW_UI_RESPONSE_LIMIT - 8192
  ) {
    throw new Error("Static preview resource response limit exceeded")
  }

  const descriptor = hashJson(csp)

  return Object.freeze({
    csp,
    read() {
      try {
        const permitted: unknown = input.canServe()

        if (permitted !== true || hashJson(csp) !== descriptor) {
          throw new ToolError("PREVIEW_UNAVAILABLE")
        }

        return html
      } catch {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }
    },
  })
}
