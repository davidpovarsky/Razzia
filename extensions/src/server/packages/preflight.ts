import { showThemeDefinitionSchema } from "../../core/show-themes/definition"
import { showThemeRegistry } from "../../core/show-themes/registry"
import { sandboxDefinitionSchema } from "../../core/packages/protocol"
import { preflightShowImport } from "../../core/show-import-preflight"
import { validateDotLottieContainer } from "../../core/lottie"
import { validateThemeAssetBytes } from "../show-themes/validate-package"
import { normalizePackageDocument, packageMediaName } from "./references"
import { unpackPackage, type PortablePackage } from "./archive"

export function inspectPackage(bytes: Buffer) {
  const pkg = unpackPackage(bytes)
  const code = pkg.manifest.contents.some(
    (c) => c.kind === "sandboxed-react-theme",
  )
  for (const file of pkg.manifest.files) {
    const value = pkg.files.get(file.path)

    if (!value) {
      throw new Error("PACKAGE_INVENTORY_MISMATCH")
    }

    const ext = file.path.split(".").at(-1)?.toLowerCase() ?? ""

    if (["source", "style"].includes(file.kind)) {
      if (
        !code ||
        file.bytes > 1_000_000 ||
        !(file.kind === "style"
          ? ext === "css"
          : ["tsx", "ts", "jsx", "js"].includes(ext))
      ) {
        throw new Error("PACKAGE_UNAPPROVED_SOURCE")
      }
    } else if (file.kind === "descriptor") {
      if (ext !== "json" || file.bytes > 2_000_000) {
        throw new Error("PACKAGE_DESCRIPTOR_BUDGET")
      }

      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value))
    } else if (file.kind === "font") {
      if (
        ext !== "woff2" ||
        value.toString("ascii", 0, 4) !== "wOF2" ||
        value.length < 48 ||
        value.readUInt32BE(8) !== value.length ||
        value.readUInt32BE(16) > 10_000_000
      ) {
        throw new Error("PACKAGE_FONT")
      }
    } else if (file.kind === "lottie" && ext === "lottie") {
      if (
        !validateDotLottieContainer(value, {
          allowBodymovinZipConversion: false,
        }).valid
      ) {
        throw new Error("PACKAGE_DOTLOTTIE_INVALID")
      }
    } else {
      validateThemeAssetBytes(
        {
          id: file.path,
          url: `/assets/${file.path}`,
          kind: file.kind as "image" | "audio" | "video" | "lottie",
          sha256: file.sha256,
          bytes: file.bytes,
          rights: file.rights,
          provenance: file.provenance,
          preload: "slot",
        },
        value,
        { embeddedResourcesOnly: true },
      )
    }
  }
  const games = [],
    themes = []
  for (const content of pkg.manifest.contents) {
    const normalized = normalizePackageDocument(pkg, content.path)

    if (content.kind === "game") {
      const check = preflightShowImport(
        JSON.stringify(normalized),
        content.path,
      )

      if (!check.ok) {
        throw new Error(
          `PACKAGE_GAME_INVALID:${content.id}:${JSON.stringify(check.issues)}`,
        )
      }

      games.push({
        id: content.id,
        demo: content.demo,
        themeRef: content.themeRef,
        summary: check.summary,
      })
    } else {
      const definition = showThemeDefinitionSchema.parse(normalized)

      if (!definition.localizations) {
        throw new Error("PACKAGE_THEME_LOCALES")
      }

      if (showThemeRegistry.list().some((d) => d.id === definition.id)) {
        throw new Error("PACKAGE_RESERVED_THEME_ID")
      }

      if (definition.runtime) {
        throw new Error("PACKAGE_RUNTIME_PIN_SERVER_OWNED")
      }

      for (const asset of definition.assets) {
        const file = pkg.manifest.files.find(
          (f) =>
            !["descriptor", "source", "style"].includes(f.kind) &&
            asset.url === `/media/${packageMediaName(pkg, f.path)}`,
        )

        if (
          !file ||
          asset.sha256 !== file.sha256 ||
          asset.bytes !== file.bytes ||
          asset.kind !== file.kind ||
          asset.rights !== file.rights
        ) {
          throw new Error("PACKAGE_THEME_INVENTORY")
        }
      }

      if (
        definition.id !== content.id ||
        definition.version !== pkg.manifest.version
      ) {
        throw new Error("PACKAGE_THEME_IDENTITY")
      }

      if (content.kind === "sandboxed-react-theme") {
        const source = sandboxDefinitionSchema.parse(definition.sandbox)

        if (
          !pkg.files.has(source.entry) ||
          pkg.manifest.files.find((f) => f.path === source.entry)?.kind !==
            "source"
        ) {
          throw new Error("PACKAGE_ENTRY_MISSING")
        }

        if (
          definition.kind !== "sandboxed-react" ||
          definition.rendererId !== "tadazz-sandbox-stage"
        ) {
          throw new Error("PACKAGE_SANDBOX_REQUIRED")
        }
      } else if (definition.kind !== "declarative") {
        throw new Error("PACKAGE_DECLARATIVE_REQUIRED")
      }

      themes.push({
        id: content.id,
        kind: content.kind,
        version: definition.version,
      })
    }
  }

  let type: "game" | "theme" | "complete" = "game"

  if (themes.length) {
    type = games.length ? "complete" : "theme"
  }

  return {
    pkg,
    report: {
      manifest: pkg.manifest,
      sourceDigest: pkg.sourceDigest,
      type,
      code,
      games,
      themes,
      assetCount: pkg.manifest.files.filter(
        (f) => !["source", "style", "descriptor"].includes(f.kind),
      ).length,
      totalBytes: pkg.manifest.files.reduce((n, f) => n + f.bytes, 0),
      requiresIndependentReview: code || themes.length > 0,
      status: "validated",
    },
  }
}

export function packageThemeDefinitions(pkg: PortablePackage) {
  return pkg.manifest.contents
    .filter((c) => c.kind !== "game")
    .map((c) =>
      showThemeDefinitionSchema.parse(normalizePackageDocument(pkg, c.path)),
    )
}
