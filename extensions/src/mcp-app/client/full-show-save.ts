import { z } from "zod"
import { dataSchemas, inputs, outputs } from "../contracts/tools.ts"

export type FullShowSaveInput = z.infer<typeof inputs.save_game>

export type FullShowSaveOutcome =
  | { kind: "consent"; url: string }
  | { kind: "saved"; url: string; quizId: string; savedRevision: number }
  | { kind: "denied"; code: string; retryable: boolean }

const envelope = z.object({
  structuredContent: z.unknown(),
  isError: z.boolean().optional(),
})

/** The base is embedded in the hash-pinned resource, not supplied by a tool result. */
export function firstPartyOriginFromBase(baseHref: string): string {
  const parsed = new URL(baseHref)

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    baseHref !== `${parsed.origin}/`
  ) {
    throw new Error("save:untrusted-base")
  }

  return parsed.origin
}

export function parseFullShowSaveOutcome(
  request: FullShowSaveInput,
  raw: unknown,
  baseHref: string,
): FullShowSaveOutcome {
  const expected = inputs.save_game.parse(request)
  const origin = firstPartyOriginFromBase(baseHref)
  const result = envelope.parse(raw)
  const body = outputs.save_game.parse(result.structuredContent)

  if (!body.ok) {
    const { error } = body

    if (error.code !== "CONSENT_REQUIRED") {
      return { kind: "denied", code: error.code, retryable: error.retryable }
    }

    const { consentRequestId, consentUrl } = error

    if (
      !consentRequestId ||
      !/^[A-Za-z0-9_-]{54}$/u.test(consentRequestId) ||
      consentUrl !== `${origin}/studio/native-save-consent/${consentRequestId}`
    ) {
      throw new Error("save:untrusted-consent-link")
    }

    return { kind: "consent", url: consentUrl }
  }

  const data = dataSchemas.save_game.parse(body.data)

  if (
    result.isError ||
    data.draftId !== expected.draftId ||
    data.revision !== expected.expectedRevision ||
    !/^[A-Za-z0-9_-]{21}$/u.test(data.quizId) ||
    data.studioUrl !== `${origin}/manager/quizz/${data.quizId}`
  ) {
    throw new Error("save:unexpected-acknowledgement")
  }

  return {
    kind: "saved",
    url: data.studioUrl,
    quizId: data.quizId,
    savedRevision: data.savedRevision,
  }
}
