import { z } from "zod"
import {
  compositionDocumentSchema,
  parseCompositionDocument,
} from "./composition-document"
import { canonicalJson, sha256 } from "./digest"
import { nativePresentationSettingsV1Schema } from "./native-presentation-settings"
import { assertBoundedJson, freeze } from "./primitives"

/** Explicit successor only. Existing V1 parser/digest remain strict and unchanged. */
export const compositionDocumentV2Schema = z
  .strictObject({
    ...compositionDocumentSchema.shape,
    schemaVersion: z.literal(2),
    nativePresentation: nativePresentationSettingsV1Schema,
  })
  .superRefine((document, ctx) => {
    const { nativePresentation: _settings, ...base } = document

    if (
      !compositionDocumentSchema.safeParse({ ...base, schemaVersion: 1 })
        .success
    ) {
      ctx.addIssue({
        code: "custom",
        message: "show-library:invalid-v1-composition-base",
      })
    }
  })

export type CompositionDocumentV2 = z.infer<typeof compositionDocumentV2Schema>

export function parseCompositionDocumentV2(
  input: unknown,
): Readonly<CompositionDocumentV2> {
  assertBoundedJson(input)
  const document = compositionDocumentV2Schema.parse(input)

  if (new TextEncoder().encode(canonicalJson(document)).length > 262144) {
    throw new Error("show-library:composition-byte-budget")
  }

  return freeze(document)
}

export function compositionDocumentV2Digest(input: unknown): string {
  return sha256(canonicalJson(parseCompositionDocumentV2(input)))
}

/** Explicit copy; never writes storage or silently upgrades saved content. */
export function withNativePresentationV2(
  v1Input: unknown,
  presentationInput: unknown,
): Readonly<CompositionDocumentV2> {
  return parseCompositionDocumentV2({
    ...parseCompositionDocument(v1Input),
    schemaVersion: 2,
    nativePresentation: presentationInput,
  })
}
