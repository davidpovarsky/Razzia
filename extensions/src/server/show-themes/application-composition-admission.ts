import { z } from "zod"
import { getApplicationPreviewManifest } from "../../core/show-library/application-preview-resolve"
import { resolveApplicationTemplate } from "../../core/show-library/application-library"
import { resolveShowTheme } from "../../core/show-themes/resolve"
import { showThemeRegistry } from "../../core/show-themes/registry"
import build from "../../core/show-library/application-preview-build.json" with { type: "json" }
import {
  parseBuilderDocument,
  type BuilderDocument,
} from "../../components/theme-builder/document"
import { readApplicationPreviewRuntime } from "../api/application-preview-runtime"
import { readAccountPreviewAssets } from "../api/account-preview-source"
import type { StorageInjections } from "../storage/sidecar"

const digest = z.string().regex(/^[a-f0-9]{64}$/u)

export const builderPublicationAdmissionSchema = z.strictObject({
  kind: z.literal("first-party-composition"),
  rendererBuildSha256: digest,
  assets: z
    .array(
      z.strictObject({
        url: z.string().max(160),
        sha256: digest,
        bytes: z.number().int().positive().max(100_000_000),
      }),
    )
    .max(256),
})

export type BuilderPublicationAdmission = z.infer<
  typeof builderPublicationAdmissionSchema
>

// Bounded configuration for existing application components only. This cannot
// approve portable code, extend a renderer registry or publish an executable.
export function admitApplicationComposition(
  input: BuilderDocument,
  injections: Pick<StorageInjections, "getPath">,
): BuilderPublicationAdmission {
  const document = parseBuilderDocument(input)
  const pin = getApplicationPreviewManifest().pins.find(
    (candidate) =>
      candidate.renderer.id ===
      resolveShowTheme({
        selection: document.content.selection,
        role: "spectator",
      }).definition.rendererId,
  )

  if (
    !build.available ||
    !pin ||
    (build.files as Array<{ sha256: string; name: string }>).some(
      (file) => !readApplicationPreviewRuntime(file.sha256, file.name),
    )
  ) {
    throw new Error("theme-builder:runtime-unavailable")
  }

  const appearance = { registry: document.registry, document: document.content }
  resolveApplicationTemplate(appearance, "spectator", "question")
  for (const role of ["manager", "player", "spectator"] as const) {
    const theme = resolveShowTheme({
      selection: document.content.selection,
      role,
    })

    if (
      theme.diagnostics.length ||
      !["tadazz-classic-stage", "razzia-native-stage"].includes(
        theme.definition.rendererId,
      )
    ) {
      throw new Error("theme-builder:unsupported-family")
    }

    for (const scope of document.content.scopes) {
      if (
        resolveShowTheme({
          selection: document.content.selection,
          scope: scope.selection,
          role,
        }).diagnostics.length
      ) {
        throw new Error("theme-builder:unsupported-scope")
      }
    }
  }
  const builtins = new Set(
    showThemeRegistry
      .list()
      .flatMap((theme) => theme.assets.map((asset) => asset.url)),
  )
  const urls = new Set<string>()
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string" && /url$/iu.test(key) && value) {
      if (value.startsWith("/media/")) {
        urls.add(value)
      } else if (!builtins.has(value)) {
        throw new Error("theme-builder:unbound-asset")
      }
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        visit(item)
      })
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([name, item]) => {
        visit(item, name)
      })
    }
  }
  visit(document.content)

  return builderPublicationAdmissionSchema.parse({
    kind: "first-party-composition",
    rendererBuildSha256: pin.rendererBuildSha256,
    assets: readAccountPreviewAssets(injections, [...urls].sort()),
  })
}
