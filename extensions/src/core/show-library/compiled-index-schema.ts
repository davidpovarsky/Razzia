// Host diagnostic leaf. No payload/barrel imports or executable registration.
import { z } from "zod"
import { canonicalJson } from "./digest"
import {
  assertBoundedJson,
  digestSchema,
  exactRefSchema,
  freeze,
  identifierSchema,
} from "./primitives"

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const bytes = positive.max(100_000_000)
const gitHash = z.string().regex(/^[a-f0-9]{40}$/u)
const sha512 = z.string().regex(/^[a-f0-9]{128}$/u)
const sri512 = z.string().regex(/^sha512-[A-Za-z0-9+/]{85}[AQgw]==$/u)
const version = z
  .string()
  .max(160)
  .regex(
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u,
  )
const packageName = z
  .string()
  .max(214)
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u)
const text = z
  .string()
  .min(1)
  .max(1000)
  // oxlint-disable-next-line eslint/no-control-regex -- Reject C0/DEL controls and unpaired surrogates in compiled display text.
  .refine((s) => !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(s))
const relativePath = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (s) =>
      !s.startsWith("/") &&
      // oxlint-disable-next-line eslint/no-control-regex -- Reject control characters and whitespace in untrusted compiled relative paths.
      !/[\\:%?#\u0000-\u0020\u007f\ud800-\udfff]/u.test(s) &&
      s
        .split("/")
        .every(
          (segment) => segment !== "" && segment !== "." && segment !== "..",
        ),
  )
const artifactPath = relativePath.refine((s) => /^[A-Za-z0-9._/-]+$/u.test(s))
const requestPath = z
  .string()
  .min(2)
  .max(241)
  .refine(
    (s) => s.startsWith("/") && artifactPath.safeParse(s.slice(1)).success,
  )

export const compiledArtifactPathSchema = bounded(artifactPath)

const mode = z.number().int().min(0).max(0o7777)
const exportName = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/u)
  .refine(
    (name) =>
      !["__proto__", "prototype", "constructor", "default"].includes(name),
  )

/** Guard hostile JS before Zod reads fields. Shape parsing is never authority. */
function bounded<T extends z.ZodType>(schema: T) {
  return z
    .unknown()
    .superRefine((value, ctx) => {
      try {
        assertBoundedJson(value)
        // Also rejects sparse/extended arrays.

        canonicalJson(value)
        const enumerable = (item: unknown): void => {
          if (!item || typeof item !== "object") {
            return
          }

          for (const key of Object.getOwnPropertyNames(item)) {
            if (Array.isArray(item) && key === "length") {
              continue
            }

            const d = Object.getOwnPropertyDescriptor(item, key)

            if (!d?.enumerable) {
              throw new Error("hidden-field")
            }

            enumerable(d.value)
          }
        }
        enumerable(value)
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "show-library:index-non-json-or-budget",
        })
      }
    })
    .pipe(schema)
    .transform((value) => freeze(value))
}

function compare(a: string, b: string): number {
  const encoder = new TextEncoder(),
    x = encoder.encode(a),
    y = encoder.encode(b)
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) {
      return x[i] - y[i]
    }
  }

  return x.length - y.length
}
function ordered<T>(
  items: readonly T[],
  key: (item: T) => string,
  ctx: z.RefinementCtx,
): void {
  if (
    items.some((item, i) => i > 0 && compare(key(items[i - 1]), key(item)) >= 0)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "show-library:index-order-or-duplicate",
    })
  }
}
function noFilePathCollision(
  paths: readonly string[],
  ctx: z.RefinementCtx,
): void {
  const folded = paths.map((path) => path.toLowerCase()),
    seen = new Set(folded)

  if (seen.size !== paths.length) {
    ctx.addIssue({
      code: "custom",
      message: "show-library:index-case-collision",
    })
  }

  for (const path of seen) {
    for (
      let slash = path.indexOf("/");
      slash >= 0;
      slash = path.indexOf("/", slash + 1)
    ) {
      if (seen.has(path.slice(0, slash))) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:index-file-ancestor-collision",
        })

        return
      }
    }
  }
}

const gitSource = z.strictObject({
  kind: z.literal("git-tracked"),
  gitCommit: gitHash,
  path: relativePath,
  gitBlob: gitHash,
  sha256: digestSchema,
})
const packageSource = z
  .strictObject({
    kind: z.literal("pnpm-package-file"),
    packageName,
    packageVersion: version,
    lockfilePath: z.literal("pnpm-lock.yaml"),
    lockfileSha256: digestSchema,
    snapshotKey: text,
    resolutionIntegrity: sri512,
    packagePath: relativePath,
    bytes,
    sha256: digestSchema,
  })
  .refine(
    (s) => s.snapshotKey === `${s.packageName}@${s.packageVersion}`,
    "show-library:package-key",
  )
const source = z.discriminatedUnion("kind", [gitSource, packageSource])

export const gitTrackedSourceSchema = bounded(gitSource)

export const pnpmPackageFileSourceSchema = bounded(packageSource)

export const compiledSourceRecordSchema = bounded(source)

export type CompiledSourceRecord = z.infer<typeof compiledSourceRecordSchema>

export type PnpmPackageFileSource = z.infer<typeof pnpmPackageFileSourceSchema>

const receiptRef = z.strictObject({
  id: identifierSchema,
  sha256: digestSchema,
})
const rights = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("unknown"),
    provenance: z.literal("repository-existing"),
    reviewReceipt: z.null(),
  }),
  z.strictObject({
    status: z.literal("reviewed"),
    provenance: z.enum(["repository-existing", "licensed", "owner-authorized"]),
    reviewReceipt: receiptRef,
  }),
])

export const diagnosticRightsAssessmentSchema = bounded(rights)

const licenseRef = z.strictObject({ artifactPath, sha256: digestSchema })
const licenses = z
  .array(licenseRef)
  .max(32)
  .superRefine((a, ctx) => {
    ordered(a, (v) => v.artifactPath, ctx)
    noFilePathCollision(
      a.map((v) => v.artifactPath),
      ctx,
    )
  })
const imageMime = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
])
const dimensions = z
  .strictObject({
    width: positive.max(32768),
    height: positive.max(32768),
    decodedPixels: positive.max(1_073_741_824),
  })
  .refine((d) => d.width * d.height === d.decodedPixels)
const commonResource = {
  artifactPath,
  requestPath,
  bytes,
  sha256: digestSchema,
  source,
  catalogRef: z
    .strictObject({ assetId: identifierSchema, sha256: digestSchema })
    .nullable(),
  licenses,
  rights,
}
const resource = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...commonResource,
      kind: z.literal("image"),
      usage: z.enum(["stage-fixed", "product-logo"]),
      mime: imageMime,
      dimensions,
    }),
    z.strictObject({
      ...commonResource,
      kind: z.literal("font"),
      usage: z.literal("stage-font"),
      mime: z.enum(["font/woff", "font/woff2"]),
    }),
  ])
  .superRefine((r, ctx) => {
    if (r.catalogRef && r.catalogRef.sha256 !== r.sha256) {
      ctx.addIssue({ code: "custom", message: "show-library:catalog-digest" })
    }

    if (
      r.source.kind === "pnpm-package-file" &&
      (r.source.sha256 !== r.sha256 || r.source.bytes !== r.bytes)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "show-library:package-resource-bytes",
      })
    }
  })

export const nativeResourceIndexV2Schema = bounded(
  z
    .strictObject({
      format: z.literal("tadazz-native-resource-index"),
      schemaVersion: z.literal(2),
      scope: z.literal("intrinsic-source-only"),
      resources: z.array(resource).max(128),
    })
    .superRefine((v, ctx) => {
      ordered(v.resources, (r) => `${r.artifactPath}\0${r.requestPath}`, ctx)
      noFilePathCollision(
        v.resources.map((r) => r.artifactPath),
        ctx,
      )
      noFilePathCollision(
        v.resources.map((r) => r.requestPath),
        ctx,
      )
    }),
)

export type NativeResourceIndexV2 = z.infer<typeof nativeResourceIndexV2Schema>

const file = z
  .strictObject({
    path: artifactPath,
    kind: z.enum(["module", "style", "font", "image", "license", "metadata"]),
    mime: z.enum([
      "text/javascript",
      "text/css",
      "font/woff2",
      "font/woff",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
      "application/json",
      "text/plain",
    ]),
    bytes,
    sha256: digestSchema,
  })
  .superRefine((f, ctx) => {
    const allowed: Record<string, readonly string[]> = {
      module: ["text/javascript"],
      style: ["text/css"],
      font: ["font/woff2", "font/woff"],
      image: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
      license: ["text/plain"],
      metadata: ["application/json"],
    }

    if (!allowed[f.kind].includes(f.mime)) {
      ctx.addIssue({ code: "custom", message: "show-library:file-kind-mime" })
    }
  })
function sourceKey(s: CompiledSourceRecord): string {
  return s.kind === "git-tracked"
    ? `${s.kind}\0${s.path}\0${s.gitCommit}`
    : `${s.kind}\0${s.packageName}\0${s.packageVersion}\0${s.packagePath}\0${s.lockfileSha256}`
}

export const rendererArtifactIndexV2Schema = bounded(
  z
    .strictObject({
      format: z.literal("tadazz-preview-artifact-index"),
      schemaVersion: z.literal(2),
      portVersion: z.literal(3),
      identityRuleVersion: z.literal(2),
      renderer: exactRefSchema,
      abi: z.literal("native-stage-mount-v1"),
      entryModule: artifactPath,
      entryExport: exportName,
      resourceIndexPath: z.literal("resource-index.json"),
      files: z.array(file).min(1).max(256),
      source: z.strictObject({
        gitCommit: gitHash,
        lockfileSha256: digestSchema,
        files: z.array(source).min(1).max(256),
      }),
      toolchain: z.strictObject({
        node: text,
        pnpm: text,
        bundler: text,
        platform: text,
        arch: text,
        buildRecipe: gitSource,
      }),
    })
    .superRefine((v, ctx) => {
      ordered(v.files, (f) => f.path, ctx)
      noFilePathCollision(
        v.files.map((f) => f.path),
        ctx,
      )

      if (v.files.reduce((sum, f) => sum + f.bytes, 0) > 100_000_000) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:diagnostic-byte-budget",
        })
      }

      ordered(v.source.files, sourceKey, ctx)
      const tracked = v.source.files.filter((f) => f.kind === "git-tracked")
      noFilePathCollision(
        tracked.map((f) => f.path),
        ctx,
      )

      if (
        tracked.some((f) => f.gitCommit !== v.source.gitCommit) ||
        v.toolchain.buildRecipe.gitCommit !== v.source.gitCommit
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:index-source-commit",
        })
      }

      if (
        !tracked.some(
          (f) => canonicalJson(f) === canonicalJson(v.toolchain.buildRecipe),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:index-recipe-membership",
        })
      }

      const packages = new Map<string, { paths: string[]; integrity: string }>()
      for (const f of v.source.files) {
        if (f.kind === "pnpm-package-file") {
          const key = `${f.packageName}\0${f.packageVersion}\0${f.lockfileSha256}`
          const group = packages.get(key)

          if (group) {
            group.paths.push(f.packagePath)

            if (group.integrity !== f.resolutionIntegrity) {
              ctx.addIssue({
                code: "custom",
                message: "show-library:index-package-integrity-conflict",
              })
            }
          } else {
            packages.set(key, {
              paths: [f.packagePath],
              integrity: f.resolutionIntegrity,
            })
          }
        }
      }
      for (const group of packages.values()) {
        noFilePathCollision(group.paths, ctx)
      }

      if (
        !v.files.some((f) => f.path === v.entryModule && f.kind === "module") ||
        !v.files.some(
          (f) => f.path === v.resourceIndexPath && f.kind === "metadata",
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:index-entry-or-resource-index",
        })
      }

      if (
        v.files.some((f) =>
          [
            "artifact-index.json",
            "registry.json",
            "accepted-pin.json",
          ].includes(f.path.split("/")[0].toLowerCase()),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:index-hash-cycle",
        })
      }

      if (
        v.source.files.some(
          (s) =>
            s.kind === "pnpm-package-file" &&
            s.lockfileSha256 !== v.source.lockfileSha256,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:index-lock-mismatch",
        })
      }
    }),
)

export type RendererArtifactIndexV2 = z.infer<
  typeof rendererArtifactIndexV2Schema
>

const operation = z.enum([
  "private-internal-qa",
  "executable-preview",
  "customer-package-export",
  "public-distribution",
])
const scope = z.strictObject({
  renderer: exactRefSchema,
  sourceTheme: exactRefSchema,
})

export const rightsReviewReceiptV2Schema = bounded(
  z
    .strictObject({
      format: z.literal("tadazz-rights-review-receipt"),
      schemaVersion: z.literal(2),
      id: identifierSchema,
      scope,
      operation,
      resources: z
        .array(
          z.strictObject({
            sha256: digestSchema,
            licenses,
            obligations: z.array(text).min(1).max(32),
          }),
        )
        .min(1)
        .max(128),
    })
    .superRefine((v, ctx) => ordered(v.resources, (r) => r.sha256, ctx)),
)

export type RightsReviewReceiptV2 = z.infer<typeof rightsReviewReceiptV2Schema>

const cafsInput = z.strictObject({
  kind: z.enum(["pnpm-index", "cafs-content"]),
  path: artifactPath,
  sha256: digestSchema,
})
const membership = z
  .strictObject({
    packagePath: relativePath,
    originalIndexRow: z.strictObject({
      indexInputSha256: digestSchema,
      indexRowSha256: digestSchema,
      rowKey: relativePath,
      alias: relativePath.nullable(),
      bytes,
      sha512,
      integrity: sri512,
      mode,
    }),
    observed: z.strictObject({
      bytes,
      sha512,
      sha256: digestSchema,
      mode,
      contentInputSha256: digestSchema,
    }),
  })
  .superRefine((f, ctx) => {
    if (
      f.originalIndexRow.bytes !== f.observed.bytes ||
      f.originalIndexRow.sha512 !== f.observed.sha512 ||
      f.originalIndexRow.mode !== f.observed.mode ||
      f.observed.sha256 !== f.observed.contentInputSha256 ||
      (f.originalIndexRow.alias ?? f.originalIndexRow.rowKey) !== f.packagePath
    ) {
      ctx.addIssue({
        code: "custom",
        message: "show-library:store-membership-mismatch",
      })
    }
  })

export const pnpmStoreMembershipReceiptV2Schema = bounded(
  z
    .strictObject({
      format: z.literal("tadazz-pnpm-store-membership-receipt"),
      schemaVersion: z.literal(2),
      id: identifierSchema,
      proofKind: z.literal("reviewed-immutable-pnpm-cafs-membership"),
      lock: gitSource.refine((s) => s.path === "pnpm-lock.yaml"),
      packageName,
      packageVersion: version,
      snapshotKey: text,
      resolutionIntegrity: sri512,
      inputs: z.array(cafsInput).min(2).max(256),
      files: z.array(membership).min(1).max(128),
    })
    .superRefine((v, ctx) => {
      if (v.snapshotKey !== `${v.packageName}@${v.packageVersion}`) {
        ctx.addIssue({ code: "custom", message: "show-library:package-key" })
      }

      ordered(v.inputs, (f) => f.path, ctx)
      noFilePathCollision(
        v.inputs.map((f) => f.path),
        ctx,
      )
      ordered(v.files, (f) => f.packagePath, ctx)
      noFilePathCollision(
        v.files.map((f) => f.packagePath),
        ctx,
      )
      for (const f of v.files) {
        if (
          !v.inputs.some(
            (i) =>
              i.kind === "pnpm-index" &&
              i.sha256 === f.originalIndexRow.indexInputSha256,
          ) ||
          !v.inputs.some(
            (i) =>
              i.kind === "cafs-content" &&
              i.sha256 === f.observed.contentInputSha256,
          )
        ) {
          ctx.addIssue({
            code: "custom",
            message: "show-library:store-input-missing",
          })
        }
      }
    }),
)

export type PnpmStoreMembershipReceiptV2 = z.infer<
  typeof pnpmStoreMembershipReceiptV2Schema
>

export const dependencyProvenanceV2Schema = bounded(
  z
    .strictObject({
      format: z.literal("tadazz-dependency-provenance"),
      schemaVersion: z.literal(2),
      lock: gitSource.refine((s) => s.path === "pnpm-lock.yaml"),
      packageName,
      packageVersion: version,
      snapshotKey: text,
      resolutionIntegrity: sri512,
      licenseDeclaration: text,
      importers: z
        .array(
          z.strictObject({
            path: relativePath,
            specifier: text,
            resolvedVersion: version,
          }),
        )
        .min(1)
        .max(32),
      files: z.array(packageSource).min(1).max(128),
      membershipReceipt: receiptRef.nullable(),
    })
    .superRefine((v, ctx) => {
      if (v.snapshotKey !== `${v.packageName}@${v.packageVersion}`) {
        ctx.addIssue({ code: "custom", message: "show-library:package-key" })
      }

      ordered(v.importers, (f) => f.path, ctx)
      ordered(v.files, (f) => f.packagePath, ctx)
      noFilePathCollision(
        v.files.map((f) => f.packagePath),
        ctx,
      )

      if (
        v.importers.some((f) => f.resolvedVersion !== v.packageVersion) ||
        v.files.some(
          (f) =>
            f.packageName !== v.packageName ||
            f.packageVersion !== v.packageVersion ||
            f.snapshotKey !== v.snapshotKey ||
            f.resolutionIntegrity !== v.resolutionIntegrity ||
            f.lockfileSha256 !== v.lock.sha256,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:dependency-identity-mismatch",
        })
      }
    }),
)

/** Separate environment receipt: never an invented, byte-hashed system font. */
export const previewTypographyEnvironmentV2Schema = bounded(
  z
    .strictObject({
      format: z.literal("tadazz-preview-typography-environment"),
      schemaVersion: z.literal(2),
      scope: z.literal("native-stage-environment"),
      typographyPolicy: z.literal("preserve-selected-theme-system-stack"),
      pixelQualification: z.literal("environment-specific-non-hermetic"),
      os: text,
      browser: text,
      deviceScale: z.number().min(0.25).max(8),
      viewport: z.strictObject({
        width: positive.max(32768),
        height: positive.max(32768),
      }),
      observations: z
        .array(
          z.strictObject({
            locale: z.enum([
              "en",
              "fr",
              "de",
              "es",
              "it",
              "ja",
              "tr",
              "vi",
              "he",
            ]),
            computedFamily: text,
            glyphEvidence: licenseRef.nullable(),
            japaneseFallback: z.enum([
              "unverified",
              "observed-in-this-environment",
            ]),
          }),
        )
        .min(1)
        .max(8),
    })
    .superRefine((v, ctx) => {
      ordered(v.observations, (o) => o.locale, ctx)

      if (
        v.observations.some(
          (o) =>
            o.japaneseFallback !== "unverified" &&
            (o.locale !== "ja" || !o.glyphEvidence),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:glyph-evidence-required",
        })
      }
    }),
)

export const platformTypographyDependencyV2Schema = bounded(
  z
    .strictObject({
      format: z.literal("tadazz-platform-typography-dependency"),
      schemaVersion: z.literal(2),
      scope: z.literal("platform-chrome-only"),
      family: z.literal("Rubik Variable"),
      css: packageSource.refine(
        (s) =>
          s.packageName === "@fontsource-variable/rubik" &&
          s.packagePath === "wght.css",
      ),
      license: packageSource.refine(
        (s) =>
          s.packageName === "@fontsource-variable/rubik" &&
          s.packagePath === "LICENSE",
      ),
      files: z.array(packageSource).min(1).max(32),
    })
    .superRefine((v, ctx) => {
      ordered(v.files, (f) => f.packagePath, ctx)
      noFilePathCollision(
        v.files.map((f) => f.packagePath),
        ctx,
      )
      noFilePathCollision(
        [v.css, v.license, ...v.files].map((f) => f.packagePath),
        ctx,
      )

      if (
        [v.license, ...v.files].some(
          (f) =>
            f.packageName !== v.css.packageName ||
            f.packageVersion !== v.css.packageVersion ||
            f.lockfileSha256 !== v.css.lockfileSha256 ||
            f.resolutionIntegrity !== v.css.resolutionIntegrity,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:platform-package-mismatch",
        })
      }
    }),
)

/** A complete registry descriptor is still untrusted diagnostic data. */
export const diagnosticCompiledRegistryV2Schema = bounded(
  z
    .strictObject({
      format: z.literal("tadazz-executable-preview-registry"),
      schemaVersion: z.literal(2),
      portVersion: z.literal(3),
      identityRuleVersion: z.literal(2),
      registry: exactRefSchema,
      renderer: exactRefSchema,
      sourceTheme: exactRefSchema,
      rendererBuildSha256: digestSchema,
      resourceIndexSha256: digestSchema,
      capabilities: z.strictObject({
        roles: z.tuple([z.literal("manager"), z.literal("spectator")]),
        phases: z.tuple([
          z.literal("question"),
          z.literal("answerCards"),
          z.literal("voting"),
          z.literal("voteLocked"),
          z.literal("results"),
        ]),
        questionTypes: z.tuple([z.literal("single"), z.literal("multi")]),
        playModes: z.tuple([z.literal("quiz"), z.literal("survey")]),
        minAnswers: z.literal(2),
        maxAnswers: z.literal(5),
        localSelection: z.literal(false),
        callerMedia: z.literal("denied"),
        audio: z.literal("silent"),
        seek: z.literal("unavailable"),
      }),
      budgets: z.strictObject({
        maxArtifactBytes: bytes,
        maxResourceBytes: bytes,
        maxImageBytes: bytes,
        maxDecodedImagePixels: positive.max(1_073_741_824),
        maxFontBytes: bytes,
      }),
    })
    .superRefine((v, ctx) => {
      if (
        v.budgets.maxResourceBytes > v.budgets.maxArtifactBytes ||
        v.budgets.maxImageBytes > v.budgets.maxResourceBytes ||
        v.budgets.maxFontBytes > v.budgets.maxResourceBytes
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:registry-budget-order",
        })
      }
    }),
)
