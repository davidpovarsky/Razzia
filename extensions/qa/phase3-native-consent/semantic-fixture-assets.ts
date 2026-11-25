import { createHash } from "node:crypto"
import { lstatSync, readFileSync, realpathSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  createBuiltinAssetResolver,
  type BuiltinPublicAssetPin,
} from "../../src/mcp-app/native-host/builtin-asset-policy.ts"
import { REVIEWED_BUILTIN_ASSETS } from "../../src/mcp-app/native-host/reviewed-builtin-assets.ts"
import type { AuthoringPolicy } from "../../src/mcp-app/server/dependencies.ts"

/** Synthetic consent QA uses the actual reviewed resolver and built bytes. */
export function createConsentAssetFixture(siteDistDir: string) {
  const root = realpathSync(siteDistDir)
  const manifestPath = resolve(
    import.meta.dirname,
    "../../src/mcp-app/widget/dist/full-show-artifact.json",
  )
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    publicAssets: BuiltinPublicAssetPin[]
  }
  const readPinned = (pin: BuiltinPublicAssetPin): Buffer | undefined => {
    try {
      const relative = pin.path.replace(/^packages\/web\/public\//u, "")

      if (
        relative === pin.path ||
        !/^[A-Za-z0-9_@./-]+$/u.test(relative) ||
        relative
          .split("/")
          .some((part) => !part || part === "." || part === "..")
      ) {
        return undefined
      }

      let current = root
      const parts = relative.split("/")
      for (const [index, part] of parts.entries()) {
        current = join(current, part)
        const info = lstatSync(current)

        if (
          info.isSymbolicLink() ||
          (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())
        ) {
          return undefined
        }
      }

      const body = readFileSync(current)

      return body.byteLength === pin.bytes &&
        createHash("sha256").update(body).digest("hex") === pin.sha256
        ? body
        : undefined
    } catch {
      return undefined
    }
  }
  const assets = createBuiltinAssetResolver({
    origin: "https://tadazz.com",
    publicAssets: manifest.publicAssets,
    verifyCurrentAsset: (pin) => readPinned(pin) !== undefined,
  })
  const authoring: AuthoringPolicy = {
    allowedPublicAssetUrls: new Set<string>(),
    semantic: { assets },
  }

  return {
    authoring,
    readBrowserAsset(url: string) {
      const entry = REVIEWED_BUILTIN_ASSETS.find(
        (asset) => url === `https://tadazz.com${asset.url}`,
      )

      if (!entry) {
        return undefined
      }

      const pin = manifest.publicAssets.find(
        (asset) =>
          asset.path === `packages/web/public${entry.url}` &&
          asset.sha256 === entry.sha256 &&
          asset.bytes === entry.bytes,
      )
      const body = pin ? readPinned(pin) : undefined

      return body ? { body, contentType: entry.mime } : undefined
    },
  }
}
