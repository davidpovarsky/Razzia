import { z } from "zod"
import {
  scopedThemeOverridesSchema,
  showThemeSelectionSchema,
} from "../show-themes/selection"
import { canonicalJson, sha256 } from "./digest"
import { assertBoundedJson, freeze, identifierSchema } from "./primitives"
import { themeCompositionSchema } from "./schemas"

/** A separate sidecar; no fields are added to strict v1 show/theme/package data. */
export const compositionDocumentSchema = z
  .strictObject({
    format: z.literal("tadazz-show-composition"),
    schemaVersion: z.literal(1),
    selection: showThemeSelectionSchema,
    composition: themeCompositionSchema,
    scopes: z
      .array(
        z.strictObject({
          scopeId: identifierSchema,
          selection: scopedThemeOverridesSchema,
        }),
      )
      .max(128),
  })
  .superRefine((document, ctx) => {
    if (
      document.selection.id !== document.composition.baseTheme.id ||
      document.selection.version !== document.composition.baseTheme.version
    )
      ctx.addIssue({
        code: "custom",
        message: "show-library:base-theme-mismatch",
      })
    if (
      new Set(document.scopes.map((scope) => scope.scopeId)).size !==
      document.scopes.length
    )
      ctx.addIssue({
        code: "custom",
        message: "show-library:duplicate-document-scope",
      })
  })

export type CompositionDocument = z.infer<typeof compositionDocumentSchema>

export function parseCompositionDocument(
  input: unknown,
): Readonly<CompositionDocument> {
  assertBoundedJson(input)
  const document = compositionDocumentSchema.parse(input)
  const json = canonicalJson(document)
  if (new TextEncoder().encode(json).length > 262144)
    throw new Error("show-library:composition-byte-budget")
  return freeze(document)
}

export function compositionDocumentDigest(input: unknown): string {
  return sha256(canonicalJson(parseCompositionDocument(input)))
}
