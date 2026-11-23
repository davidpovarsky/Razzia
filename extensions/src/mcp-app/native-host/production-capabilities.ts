/// <reference lib="esnext.collection" />

import { createInstance } from "i18next"
import { z } from "zod"
import publicExample from "../../core/show-library/approved-public-example.json" with { type: "json" }
import { getNativeShowLibrary } from "../../core/show-library/native-library.ts"
import { tadaShowV1Schema } from "../../core/show-authoring-schema.ts"
import { getExtensionResources } from "../../locales/index.ts"
import { freeze } from "../../core/show-library/primitives.ts"
import { canonicalJson } from "../contracts/canonical.ts"
import type { FirstPartyCatalogOptions } from "../first-party/oauth-catalog.ts"
import type { FirstPartyExportPolicy } from "../first-party/oauth-export.ts"
import { normalizeStoredDraft } from "../server/authoring.ts"
import { snapshotSemanticPolicy } from "../server/semantic-state.ts"
import type { SemanticAuthoringPolicy } from "../contracts/semantic-edit.ts"
import type { AuthoringPolicy } from "../server/dependencies.ts"

function immutableStrings(values: ReadonlySet<string>): ReadonlySet<string> {
  const snapshot = new Set(values)
  const facade: ReadonlySet<string> = Object.freeze<ReadonlySet<string>>({
    get size() {
      return snapshot.size
    },
    has: (value) => snapshot.has(value),
    entries: () => snapshot.entries(),
    keys: () => snapshot.keys(),
    values: () => snapshot.values(),
    forEach: (callback, thisArg) => {
      snapshot.forEach((value) => {
        callback.call(thisArg, value, value, facade)
      })
    },
    union: (other) => snapshot.union(other),
    intersection: (other) => snapshot.intersection(other),
    difference: (other) => snapshot.difference(other),
    symmetricDifference: (other) => snapshot.symmetricDifference(other),
    isSubsetOf: (other) => snapshot.isSubsetOf(other),
    isSupersetOf: (other) => snapshot.isSupersetOf(other),
    isDisjointFrom: (other) => snapshot.isDisjointFrom(other),
    [Symbol.iterator]: () => snapshot[Symbol.iterator](),
  })

  return facade
}

// These two formats serialize the account's JSON and explicitly approved public
// URL references; they do not copy theme packages or asset bytes. The issuer
// independently checks live ownership,
// grant, scopes and the exact immutable snapshot before and after this policy.
export function createTextDraftExportPolicy(
  authoring: AuthoringPolicy,
  clientIds: ReadonlySet<string>,
): FirstPartyExportPolicy {
  const stableAuthoring: AuthoringPolicy = Object.freeze({
    allowedPublicAssetUrls: immutableStrings(authoring.allowedPublicAssetUrls),
    ...(authoring.semantic
      ? { semantic: snapshotSemanticPolicy(authoring.semantic) }
      : {}),
    ...(authoring.trustedDefaults === undefined
      ? {}
      : {
          trustedDefaults: freeze<unknown>(
            JSON.parse(canonicalJson(authoring.trustedDefaults)),
          ),
        }),
  })
  const allowedClients = new Set(clientIds)
  const supportedFormats = new Set<string>(["tada-json", "enhanced-bundle"])
  const themes = new Set(
    getNativeShowLibrary().families.map(
      (family) => `${family.ref.id}@${family.ref.version}`,
    ),
  )
  const ownerId = z.uuid()

  return Object.freeze<FirstPartyExportPolicy>({
    authoring: stableAuthoring,
    canExport(context, draft, format) {
      try {
        if (
          !ownerId.safeParse(context.accountId).success ||
          !context.grantId ||
          !allowedClients.has(context.clientId) ||
          !supportedFormats.has(format)
        ) {
          return false
        }

        const normalized = normalizeStoredDraft(
          draft.authoredShowJson,
          stableAuthoring,
          "json-reference-export",
        )

        return (
          normalized.authoredShowJson === draft.authoredShowJson &&
          canonicalJson(normalized.summary) === canonicalJson(draft.summary) &&
          themes.has(
            `${normalized.summary.themeId}@${normalized.summary.themeVersion}`,
          )
        )
      } catch {
        return false
      }
    },
  })
}

export async function createProductionMcpCapabilities(options: {
  readonly clientIds: ReadonlySet<string>
  readonly semantic?: SemanticAuthoringPolicy
}) {
  // The existing authoring validator denies arbitrary media/URLs/settings. A
  // preview's built-in assets do not grant arbitrary raw URL or binary export rights.
  const authoring: AuthoringPolicy = Object.freeze({
    allowedPublicAssetUrls: immutableStrings(new Set<string>()),
    ...(options.semantic
      ? { semantic: snapshotSemanticPolicy(options.semantic) }
      : {}),
  })
  const translator = createInstance()
  await translator.init({
    lng: "en",
    fallbackLng: "en",
    ns: ["extensions"],
    defaultNS: "extensions",
    resources: getExtensionResources(),
    interpolation: { escapeValue: false },
  })
  const approved = tadaShowV1Schema.parse(publicExample.show)
  const questionCount = approved.cards.filter(
    (card) => card.kind === "quiz" || card.kind === "survey",
  ).length
  const catalog: FirstPartyCatalogOptions = {
    // The native account profile has no persisted language field. Use the
    // application's English fallback for metadata; draft/preview locale is
    // separately validated and does not change account authority.
    locale: () => "en",
    translate: (key, language) => translator.t(key, { lng: language }),
    template: {
      templateId: `tadazz-approved-public-${publicExample.catalogueId}`,
      version: "1.0.0",
      title: approved.title,
      questionCount,
    },
  }

  return {
    authoring,
    catalog,
    exportPolicy: createTextDraftExportPolicy(authoring, options.clientIds),
  }
}
