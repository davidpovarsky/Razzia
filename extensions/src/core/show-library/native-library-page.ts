import { z } from "zod"
import { canonicalJson, sha256 } from "./digest"
import { assertBoundedJson, freeze } from "./primitives"

export const NATIVE_LIBRARY_PAGE_MAX_ITEMS = 128

export const NATIVE_LIBRARY_PAGE_MAX_BYTES = 262144

const cursorPattern = /^nlp1\.([1-9][0-9]{0,9})\.([a-f0-9]{64})$/u
const pageRequestSchema = z.strictObject({
  limit: z.number().int().min(1).max(NATIVE_LIBRARY_PAGE_MAX_ITEMS).default(20),
  cursor: z.string().max(96).regex(cursorPattern).optional(),
})

export interface NativeLibraryPageRecord {
  readonly collection: string
  readonly value: unknown
}

/** A bounded transfer page; metadata alone never grants execution or media rights. */
export interface NativeLibraryPage<
  Catalog extends Record<string, unknown> = Record<string, unknown>,
  Entry extends NativeLibraryPageRecord = NativeLibraryPageRecord,
> {
  readonly format: "tadazz-native-library-page"
  readonly schemaVersion: 1
  readonly catalog: Catalog
  readonly snapshotSha256: string
  readonly offset: number
  readonly total: number
  readonly items: readonly Entry[]
  readonly nextCursor?: string
}

function fitsPageBudget(value: unknown): boolean {
  try {
    // Retain the exact authoring JSON depth/node checks. Only the transport
    // representation is paged; callers cannot choose a larger validation budget.
    const text = canonicalJson(value)

    return (
      new TextEncoder().encode(text).length <= NATIVE_LIBRARY_PAGE_MAX_BYTES
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "show-library:json-budget"
    ) {
      return false
    }

    throw error
  }
}

/** Internal factory for finite source-controlled inventories, not caller catalogs. */
export function createNativeLibraryPager<
  Catalog extends Record<string, unknown>,
  Entry extends NativeLibraryPageRecord,
>(catalog: Catalog, source: readonly Entry[]) {
  const metadata = freeze({ ...catalog })
  const records = freeze([...source])
  // Hash each bounded record separately. Hashing an aggregate JSON document
  // would reintroduce the limit that this wire representation deliberately avoids.
  // The domain, metadata, length and ordered digests bind every cursor to one
  // exact compiled inventory, including records that are on later pages.
  const snapshotSha256 = sha256(
    [
      "tadazz-native-library-page@1",
      sha256(canonicalJson(metadata)),
      String(records.length),
      ...records.map((record) => sha256(canonicalJson(record))),
    ].join("\n"),
  )
  // This checksum prevents stale/mixed pagination requests; it is not an
  // authorization proof. Existing authenticated MCP cursors retain their owner binding.
  const cursorFor = (offset: number) =>
    `nlp1.${offset}.${sha256(`tadazz-native-library-cursor@1\n${snapshotSha256}\n${offset}`)}`
  const makePage = (
    items: Entry[],
    offset: number,
  ): NativeLibraryPage<Catalog, Entry> => {
    const next = offset + items.length

    return {
      format: "tadazz-native-library-page",
      schemaVersion: 1,
      catalog: metadata,
      snapshotSha256,
      offset,
      total: records.length,
      items,
      ...(next < records.length ? { nextCursor: cursorFor(next) } : {}),
    }
  }

  return function readPage(
    input: unknown = {},
  ): NativeLibraryPage<Catalog, Entry> {
    assertBoundedJson(input)
    const request = pageRequestSchema.parse(input)
    let offset = 0

    if (request.cursor !== undefined) {
      const match = cursorPattern.exec(request.cursor)

      if (!match) {
        throw new Error("show-library:native-catalog-cursor")
      }

      offset = Number(match[1])

      if (
        !Number.isSafeInteger(offset) ||
        offset <= 0 ||
        offset >= records.length ||
        request.cursor !== cursorFor(offset)
      ) {
        throw new Error("show-library:native-catalog-cursor")
      }
    }

    let items: Entry[] = []
    const end = Math.min(records.length, offset + request.limit)

    for (let index = offset; index < end; index += 1) {
      const candidate = [...items, records[index]]

      if (!fitsPageBudget(makePage(candidate, offset))) {
        if (items.length === 0) {
          throw new Error("show-library:native-catalog-entry-budget")
        }

        break
      }

      items = candidate
    }

    const page = makePage(items, offset)

    if (!fitsPageBudget(page)) {
      throw new Error("show-library:native-catalog-page-budget")
    }

    return freeze(page)
  }
}
