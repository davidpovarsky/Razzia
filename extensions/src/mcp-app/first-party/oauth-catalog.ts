import { getNativeShowLibrary } from "../../core/show-library/native-library"
import { showThemeText } from "../../core/show-themes/definition"
import { z } from "zod"
import { canonicalJson, hashJson } from "../contracts/canonical.ts"
import { CONTRACT_VERSION, locale } from "../contracts/schemas.ts"
import { dataSchemas, inputs } from "../contracts/tools.ts"
import type { Catalog, VerifiedPrincipal } from "../server/dependencies.ts"
import { ToolError } from "../server/errors.ts"
import type { OAuthProtocol } from "./oauth-protocol.ts"

export interface FirstPartyCatalogOptions {
  /** One real owner-approved public authored example, not a theme or QA fixture. */
  template?: z.infer<typeof dataSchemas.list_game_templates>["items"][number]
  /** Existing account/profile language, never a model-supplied owner or locale. */
  locale(principal: VerifiedPrincipal): z.infer<typeof locale>
  /** Existing host i18next translator. D's own text resolver retains precedence. */
  translate(key: string, language: z.infer<typeof locale>): string
}

export interface CatalogAuthority {
  read<T>(principal: VerifiedPrincipal, action: () => T): T
  protocol: OAuthProtocol
}

// Real D bundled metadata only. Neither a registry entry, asset provenance nor
// a development candidate establishes executable preview or export permission.
//
export function createNativeCatalog(
  authority: CatalogAuthority,
  options: FirstPartyCatalogOptions,
): Catalog {
  const invalid = () => new ToolError("VALIDATION_FAILED")
  const unavailable = () => new ToolError("DEPENDENCY_UNAVAILABLE")

  return Object.freeze({
    // eslint-disable-next-line require-await -- The Catalog port reports synchronous denials as Promise rejections.
    async listTemplates(
      p: VerifiedPrincipal,
      page: { limit?: number; cursor?: string },
    ) {
      return authority.read(p, () => {
        if (
          !inputs.list_game_templates.safeParse({
            contractVersion: CONTRACT_VERSION,
            ...page,
          }).success
        ) {
          throw invalid()
        }
        if (!options.template) {
          throw unavailable()
        }

        if (page.cursor) {
          throw invalid()
        }

        return dataSchemas.list_game_templates.parse({
          items: [options.template],
        })
      })
    },
    // eslint-disable-next-line require-await -- Preserve the existing asynchronous Catalog contract.
    async listThemes(
      p: VerifiedPrincipal,
      page: { limit?: number; cursor?: string },
    ) {
      return authority.read(p, () => {
        const parsed = inputs.list_themes.safeParse({
          contractVersion: CONTRACT_VERSION,
          ...page,
        })

        if (!parsed.success) {
          throw invalid()
        }

        const language = locale.safeParse(options.locale(p))

        if (!language.success) {
          throw unavailable()
        }

        const catalog = getNativeShowLibrary()

        if (catalog.families.length > 128) {
          throw unavailable()
        }

        const entries = catalog.families.map((family) => {
          const title = showThemeText(
            family.definition,
            family.definition.nameKey,
            language.data,
            (key) => options.translate(key, language.data),
          )

          if (
            // eslint-disable-next-line typescript/prefer-optional-chain -- A host callback's runtime type must be checked before reading text.
            typeof title !== "string" ||
            !title.length ||
            title === family.definition.nameKey ||
            title === family.definition.nameKey.split(":").at(-1) ||
            title.length > 160
          ) {
            throw unavailable()
          }

          return {
            definitionSha256: family.definitionSha256,
            data: {
              themeId: family.ref.id,
              version: family.ref.version,
              title,
              previewAvailable: false,
              exportPermitted: false,
            },
          }
        })
        const snapshot = hashJson({
          catalog: { id: catalog.id, version: catalog.version },
          locale: language.data,
          entries,
        })
        const binding = (offset: number) => ({
          domain: "list_themes",
          issuer: p.issuer,
          audience: p.audience,
          owner: p.accountId,
          subject: p.subject,
          clientId: p.clientId,
          grantId: p.grantId,
          locale: language.data,
          snapshot,
          offset,
        })
        let offset = 0

        if (parsed.data.cursor) {
          const match =
            /^nc1\.([1-9][0-9]{0,2})\.([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/u.exec(
              parsed.data.cursor,
            )

          if (!match || match[2] !== snapshot) {
            throw invalid()
          }

          offset = Number(match[1])

          if (offset >= entries.length) {
            throw invalid()
          }

          try {
            authority.protocol.checkCatalogCursorProof(
              binding(offset),
              match[3],
            )
          } catch {
            throw invalid()
          }
        }

        const next = Math.min(
          entries.length,
          offset + (parsed.data.limit ?? 20),
        )
        const result = dataSchemas.list_themes.parse({
          items: entries.slice(offset, next).map((entry) => entry.data),
          ...(next < entries.length
            ? {
                nextCursor: `nc1.${next}.${snapshot}.${authority.protocol.catalogCursorProof(binding(next))}`,
              }
            : {}),
        })
        // Fail closed if a host callback produced non-finite/non-JSON metadata.
        canonicalJson(result)

        return result
      })
    },
  })
}
