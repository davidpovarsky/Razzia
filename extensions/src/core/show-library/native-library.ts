import classic from "../show-themes/classic.manifest.json" with { type: "json" }
import razzia from "../show-themes/razzia.manifest.json" with { type: "json" }
import { showThemeDefinitionSchema } from "../show-themes/definition"
import { bundledOriginalThemes } from "../show-themes/original-themes"
import {
  SHOW_THEME_AUDIO_EVENTS,
  SHOW_THEME_SLOTS,
} from "../show-themes/selection"
import { canonicalJson, sha256 } from "./digest"
import { freeze } from "./primitives"
import { createNativeLibraryPager } from "./native-library-page"

/** Catalog metadata is not an executable preview pin or a media authorization. */
const families = [classic, razzia, ...bundledOriginalThemes].map((input) => {
  const definition = showThemeDefinitionSchema.parse(input)

  return {
    ref: { id: definition.id, version: definition.version },
    definitionSha256: sha256(canonicalJson(definition)),
    definition,
    visualSlots: SHOW_THEME_SLOTS.map((slot) => ({
      slot,
      ...definition.slots[slot],
    })),
    audioEvents: SHOW_THEME_AUDIO_EVENTS.map((event) => ({
      event,
      ...definition.audioEvents[event],
    })),
    motionPresets: definition.capabilities.animationPresets.map((id) => ({
      id,
      ownership: "native-template" as const,
      seek: "unproven" as const,
    })),
    runtimeOwner: "existing-stage-renderer" as const,
    audioOwner: "existing-audio-cue-player" as const,
    assetAuthorization: "requires-trusted-media-policy" as const,
    previewAcceptance: "unavailable-until-reviewed-renderer-pin" as const,
  }
})

const catalog = freeze({
  format: "tadazz-native-show-library" as const,
  schemaVersion: 1 as const,
  id: "tadazz-bundled-native-library",
  version: "1.0.0",
  families,
})

export type NativeShowLibrary = typeof catalog

export type NativeShowLibraryFamily = NativeShowLibrary["families"][number]

const readPage = createNativeLibraryPager(
  {
    format: catalog.format,
    schemaVersion: catalog.schemaVersion,
    id: catalog.id,
    version: catalog.version,
  },
  catalog.families.map((value) => ({ collection: "families" as const, value })),
)

// Complete in-process inventory, preserving all stored IDs and defaults.
// No caller definitions, code, URLs, clocks or audio players are registered here.
// Serialized consumers use getNativeShowLibraryPage to retain the JSON budget.
//
export function getNativeShowLibrary(): NativeShowLibrary {
  return catalog
}

/** Complete immutable metadata in bounded, snapshot-bound transfer pages. */
export function getNativeShowLibraryPage(input: unknown = {}) {
  return readPage(input)
}

export function findNativeShowLibraryFamily(ref: {
  id: string
  version: string
}): NativeShowLibraryFamily | undefined {
  return catalog.families.find(
    (family) => family.ref.id === ref.id && family.ref.version === ref.version,
  )
}
