import { z } from "zod"
import { showThemeDefinitionSchema } from "../show-themes/definition"
import { themeIdSchema } from "../show-themes/selection"
import { packageDigestSchema } from "../packages/manifest"

export const packagePreviewAssetSchema = z.strictObject({
  url: z
    .string()
    .max(2048)
    .regex(/^\/media\/[A-Za-z0-9_-]+\.[a-z0-9]+$/u),
  sha256: packageDigestSchema,
  bytes: z.number().int().positive().max(100_000_000),
})

const runtimeUrl = z
  .string()
  .max(4096)
  .refine((value) => {
    try {
      const url = new URL(value)
      return (
        (url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.pathname === "/render" &&
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(
          url.searchParams.get("ticket") ?? "",
        ) &&
        [...url.searchParams.keys()].length === 2 &&
        url.searchParams.getAll("ticket").length === 1 &&
        url.searchParams.getAll("theme").length === 1
      )
    } catch {
      return false
    }
  }, "Invalid isolated package runtime URL")

/** Authenticated server receipt, bound to one immutable build and account media set. */
export const applicationPackagePreviewSchema = z
  .strictObject({
    uploadId: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9_-]+$/u),
    revision: z.number().int().positive(),
    sourceDigest: packageDigestSchema,
    buildDigest: packageDigestSchema,
    definitions: z.array(showThemeDefinitionSchema).min(1).max(8),
    runtimeUrls: z.record(themeIdSchema, runtimeUrl),
    assets: z.array(packagePreviewAssetSchema).max(256),
  })
  .superRefine((value, ctx) => {
    const identities = new Set<string>()
    const assets = new Map(value.assets.map((asset) => [asset.url, asset]))
    const issue = (message: string) => ctx.addIssue({ code: "custom", message })
    if (
      assets.size !== value.assets.length ||
      value.assets.reduce((sum, item) => sum + item.bytes, 0) > 200_000_000
    ) {
      issue("Invalid package preview asset inventory")
    }
    for (const definition of value.definitions) {
      const key = `${definition.id}@${definition.version}`
      if (
        identities.has(key) ||
        !["declarative", "sandboxed-react"].includes(definition.kind)
      ) {
        issue("Invalid package preview theme")
      }
      identities.add(key)
      if (definition.kind === "sandboxed-react") {
        const pin = definition.runtime
        const url = value.runtimeUrls[definition.id]
        let urlTheme: string | null = null
        try {
          urlTheme = url ? new URL(url).searchParams.get("theme") : null
        } catch {
          /* Report the receipt mismatch below. */
        }
        if (
          !pin ||
          pin.sourceDigest !== value.sourceDigest ||
          pin.buildDigest !== value.buildDigest ||
          !url ||
          urlTheme !== definition.id
        ) {
          issue("Package runtime receipt does not match theme")
        }
      }
      for (const asset of definition.assets) {
        const admitted = assets.get(asset.url)
        if (
          !admitted ||
          admitted.sha256 !== asset.sha256 ||
          admitted.bytes !== asset.bytes
        ) {
          issue("Unbound package theme asset")
        }
      }
    }
    for (const id of Object.keys(value.runtimeUrls)) {
      if (
        !value.definitions.some(
          (definition) =>
            definition.id === id && definition.kind === "sandboxed-react",
        )
      ) {
        issue("Unbound package runtime URL")
      }
    }
  })

export type ApplicationPackagePreview = z.infer<
  typeof applicationPackagePreviewSchema
>
