import { z } from "zod"
import { themeIdSchema, themeVersionSchema } from "../show-themes/selection"
import { packagePath, packagePathKey } from "./paths"

export const packageDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u)

export const packagePathSchema = z.string().refine((p) => {
  try {
    return packagePath(p) === p
  } catch {
    return false
  }
}, "Invalid portable path")

export const PACKAGE_LIMITS = Object.freeze({
  archiveBytes: 180_000_000,
  expandedBytes: 250_000_000,
  fileBytes: 100_000_000,
  sourceBytes: 1_000_000,
  files: 2048,
  ratio: 100,
  manifestBytes: 500_000,
  games: 32,
  themes: 8,
})

export const packageContentSchema = z.strictObject({
  kind: z.enum(["declarative-theme", "sandboxed-react-theme", "game"]),
  id: themeIdSchema,
  path: packagePathSchema,
  themeRef: z
    .string()
    .max(160)
    .regex(/^[a-z0-9][a-z0-9-]*@\d+\.\d+\.\d+$/u)
    .optional(),
  demo: z.boolean().default(false),
})

export const packageFileSchema = z.strictObject({
  path: packagePathSchema,
  kind: z.enum([
    "descriptor",
    "source",
    "style",
    "image",
    "video",
    "audio",
    "lottie",
    "font",
  ]),
  bytes: z.number().int().positive().max(PACKAGE_LIMITS.fileBytes),
  sha256: packageDigestSchema,
  rights: z.enum(["licensed", "owner-authorized"]),
  provenance: z.string().trim().min(1).max(1000),
  exportable: z.boolean(),
})

export const packageManifestSchema = z
  .strictObject({
    format: z.literal("tadazz-package"),
    formatVersion: z.literal(1),
    id: themeIdSchema,
    version: themeVersionSchema.max(32),
    displayName: z.string().trim().min(1).max(120),
    author: z.string().trim().min(1).max(160),
    requires: z.strictObject({
      packageApi: z.literal(1),
      runtimeApi: z.literal(1),
    }),
    contents: z.array(packageContentSchema).min(1).max(40),
    files: z
      .array(packageFileSchema)
      .min(1)
      .max(PACKAGE_LIMITS.files - 1),
  })
  .superRefine((value, ctx) => {
    const files = new Map(value.files.map((f) => [packagePathKey(f.path), f]))
    const identities = new Set<string>()
    const issue = (message: string) => ctx.addIssue({ code: "custom", message })

    if (files.size !== value.files.length || files.has("manifest.json")) {
      issue("Duplicate inventory path")
    }

    if (
      value.files.reduce((n, f) => n + f.bytes, 0) >
      PACKAGE_LIMITS.expandedBytes
    ) {
      issue("Expanded budget")
    }

    for (const content of value.contents) {
      if (identities.has(content.id)) {
        issue("Duplicate content identity")
      }

      identities.add(content.id)

      if (files.get(packagePathKey(content.path))?.kind !== "descriptor") {
        issue("Missing content descriptor")
      }

      if (content.kind !== "game" && content.themeRef) {
        issue("Only games reference themes")
      }

      if (
        content.themeRef &&
        !value.contents.some(
          (c) =>
            c.kind !== "game" &&
            `${c.id}@${value.version}` === content.themeRef,
        )
      ) {
        issue("Unresolved bundled theme dependency")
      }
    }

    if (
      value.contents.filter((c) => c.kind === "game").length >
        PACKAGE_LIMITS.games ||
      value.contents.filter((c) => c.kind !== "game").length >
        PACKAGE_LIMITS.themes
    ) {
      issue("Content budget")
    }
  })

export type PackageManifest = z.infer<typeof packageManifestSchema>

export type PackageFile = z.infer<typeof packageFileSchema>

export type PackageContent = z.infer<typeof packageContentSchema>
