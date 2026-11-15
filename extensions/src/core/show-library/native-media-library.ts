import { CUE_THEME_EVENTS, SOUNDTRACK_THEME_EVENTS } from "../show-themes/audio"
import { SHOW_THEME_AUDIO_EVENTS } from "../show-themes/selection"
import { getNativeShowLibrary } from "./native-library"
import { assertBoundedJson, freeze, type ExactRef } from "./primitives"
import { assetReferenceSchema } from "./schemas"

type Family = ReturnType<typeof getNativeShowLibrary>["families"][number]
type Asset = Family["definition"]["assets"][number]
interface Declaration {
  theme: ExactRef
  definitionSha256: string
  asset: Asset
  manifestReferences: string[]
}
interface NativeAssetEntry {
  ref: { assetId: string; sha256: string }
  kind: Asset["kind"]
  bytes: number
  declarations: Declaration[]
  executionOrExportAuthorized: false
}
const { families } = getNativeShowLibrary()
const assets = new Map<string, NativeAssetEntry>()
for (const family of families) {
  const { definition } = family
  for (const [index, asset] of definition.assets.entries()) {
    const references = [`/assets/${index}`]

    if (definition.posterAssetId === asset.id) {
      references.push("/posterAssetId")
    }

    for (const [name, id] of Object.entries(definition.adapterAssets)) {
      if (id === asset.id) {
        references.push(`/adapterAssets/${name}`)
      }
    }
    for (const [slot, specification] of Object.entries(definition.slots)) {
      for (const [variantIndex, variant] of specification.variants.entries()) {
        for (const field of [
          "backgroundAssetId",
          "logoAssetId",
          "mediaAssetId",
          "overlayAssetId",
        ] as const) {
          if (variant[field] === asset.id) {
            references.push(`/slots/${slot}/variants/${variantIndex}/${field}`)
          }
        }
      }
    }
    for (const [event, specification] of Object.entries(
      definition.audioEvents,
    )) {
      for (const [variantIndex, variant] of specification.variants.entries()) {
        if (variant.assetId === asset.id) {
          references.push(
            `/audioEvents/${event}/variants/${variantIndex}/assetId`,
          )
        }
      }
    }
    const key = `${asset.id}/${asset.sha256}`
    const previous = assets.get(key)

    if (
      previous &&
      (previous.bytes !== asset.bytes || previous.kind !== asset.kind)
    ) {
      throw new Error("show-library:native-asset-identity-conflict")
    }

    const entry: NativeAssetEntry = previous ?? {
      ref: { assetId: asset.id, sha256: asset.sha256 },
      kind: asset.kind,
      bytes: asset.bytes,
      declarations: [],
      executionOrExportAuthorized: false as const,
    }
    entry.declarations.push({
      theme: family.ref,
      definitionSha256: family.definitionSha256,
      asset,
      manifestReferences: references.sort(),
    })
    assets.set(key, entry)
  }
}
const compare = (a: string, b: string) => {
  if (a === b) {
    return 0
  }

  return a < b ? -1 : 1
}
const entries = [...assets.values()].sort(
  (a, b) =>
    compare(a.ref.assetId, b.ref.assetId) ||
    compare(a.ref.sha256, b.ref.sha256),
)
const byContent = new Map<string, string[]>()
for (const entry of entries) {
  byContent.set(entry.ref.sha256, [
    ...(byContent.get(entry.ref.sha256) ?? []),
    entry.ref.assetId,
  ])
}

const assetLibrary = freeze({
  format: "tadazz-native-asset-library" as const,
  schemaVersion: 1 as const,
  version: "1.0.0",
  entries,
  // Preserve different historical IDs even where their declared content matches.
  contentAliases: [...byContent]
    .filter(([, ids]) => ids.length > 1)
    .map(([sha256, assetIds]) => ({ sha256, assetIds })),
  referenceMeaning: "manifest-references-not-live-storage-refcounts" as const,
})

const audioLibrary = freeze({
  format: "tadazz-native-audio-library" as const,
  schemaVersion: 1 as const,
  version: "1.0.0",
  playbackOwner: "existing-audio-cue-player" as const,
  events: SHOW_THEME_AUDIO_EVENTS.map((event) => ({
    event,
    cueIds: Object.entries(CUE_THEME_EVENTS)
      .filter(([, target]) => target === event)
      .map(([cue]) => cue),
    soundtrackSlots: Object.entries(SOUNDTRACK_THEME_EVENTS)
      .filter(([, target]) => target === event)
      .map(([slot]) => slot),
    families: families.map((family) => ({
      theme: family.ref,
      definitionSha256: family.definitionSha256,
      ...family.definition.audioEvents[event],
      choreography: Object.entries(family.definition.choreographyCues)
        .filter(([, cue]) => cue.event === event)
        .map(([milestone, cue]) => ({ milestone, variantId: cue.variantId })),
    })),
    executionOrExportAuthorized: false as const,
  })),
})

/** Actual native metadata only; no network/media resolver, rights or delete grant. */
export function getNativeAssetLibrary(): typeof assetLibrary {
  return assetLibrary
}

/** Asset ID alone is ambiguous across bundled families; require the exact hash. */
export function findNativeAssetLibraryEntry(
  input: unknown,
): NativeAssetEntry | undefined {
  assertBoundedJson(input)
  const ref = assetReferenceSchema.parse(input)

  return assets.get(`${ref.assetId}/${ref.sha256}`)
}

/** Reuses the actual existing cue/soundtrack/event mappings; never starts playback. */
export function getNativeAudioLibrary(): typeof audioLibrary {
  return audioLibrary
}
