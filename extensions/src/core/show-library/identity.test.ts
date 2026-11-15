import { encodeIdentityKey, identityPreimage } from "./identity-rule"
import vectors from "./identity-rule2-vectors.json"
import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { tadaShowV1Schema } from "../show-authoring-schema"
import { MAX_ANSWERS } from "@razzia/common/constants"
import { authoredFixture, previewInputFixture } from "./preview-fixtures"
import { canonicalJson, sha256 } from "./digest"
import {
  derivePreviewIdentityMap,
  getPreviewIdentityId,
  normalizePreviewDraft,
} from "./identity"
import {
  previewIdentityMapSchema,
  previewDraftInputSchema,
} from "./preview-schemas"

describe("canonical preview identities without native wire migration", () => {
  it.each(["", "abc", "éclair 日本語", "a".repeat(1000)])(
    "matches independent Node SHA256 for %s",
    (value) => {
      expect(sha256(value)).toBe(
        createHash("sha256").update(value, "utf8").digest("hex"),
      )
    },
  )
  it("canonicalizes keys and negative zero without changing arrays or text", () => {
    expect(canonicalJson({ z: -0, a: { y: 2, x: 1 }, s: "e\u0301" })).toBe(
      '{"a":{"x":1,"y":2},"s":"é","z":0}',
    )
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]))
  })
  it.each([
    NaN,
    Infinity,
    () => 1,
    new Date(),
    { x: undefined },
    JSON.parse('{"__proto__":{}}'),
  ])("rejects non JSON/prototype input %#", (value) => {
    expect(() => canonicalJson(value)).toThrow()
  })
  it("rejects cycles, sparse arrays and accessors without invoking getters", () => {
    const cycle: { self?: unknown } = {}
    cycle.self = cycle
    expect(() => canonicalJson(cycle)).toThrow()
    expect(() => canonicalJson(Array(1))).toThrow()
    let called = false
    const value = Object.defineProperty({}, "x", {
      enumerable: true,
      get() {
        called = true
        return 1
      },
    })
    expect(() => canonicalJson(value)).toThrow()
    expect(called).toBe(false)
  })
  it("retains stable IDs on reorder, Q3 edit and equivalent property order", () => {
    const show = authoredFixture(),
      before = derivePreviewIdentityMap(JSON.stringify(show))
    show.cards[2].question = "Revised Q3"
    show.cards.reverse()
    expect(derivePreviewIdentityMap(JSON.stringify(show))).toEqual(before)
    expect(getPreviewIdentityId(before, "questions", "question-1")).toBe(
      `preview-question-${createHash("sha256").update(identityPreimage("question", "question-1")).digest("hex")}`,
    )
  })
  it("retains exact non-ASCII authored key bytes", () => {
    const show = authoredFixture()
    show.cards[0].key = "é-物語"
    expect(
      getPreviewIdentityId(
        derivePreviewIdentityMap(JSON.stringify(show)),
        "cards",
        "é-物語",
      ),
    ).toBe(`preview-card-${sha256(identityPreimage("card", "é-物語"))}`)
  })
  it("uses real duplicate-key validator and rejects absent keys", () => {
    const show = authoredFixture()
    show.cards[1].key = show.cards[0].key
    expect(() => derivePreviewIdentityMap(JSON.stringify(show))).toThrow()
    expect(() =>
      derivePreviewIdentityMap(
        JSON.stringify({ ...show, cards: [{ kind: "quiz" }] }),
      ),
    ).toThrow()
  })
  it.each([0, 1, 6, 64])(
    "does not bypass actual authored answer cardinality %i",
    (count) => {
      expect(MAX_ANSWERS).toBe(5)
      const show = authoredFixture(count)
      expect(tadaShowV1Schema.safeParse(show).success).toBe(false)
      expect(() => derivePreviewIdentityMap(JSON.stringify(show))).toThrow()
    },
  )
  it.each([2, 5])(
    "normalizes valid authored %i answers without format mutation",
    (count) => {
      const draft = normalizePreviewDraft(
        previewInputFixture(authoredFixture(count)),
      )
      expect(draft.show.format).toBe("tada-show")
      expect(draft.show.version).toBe(1)
      expect(Object.isFrozen(draft.show.cards)).toBe(true)
    },
  )
  it("rejects forged identity map, settings, undeclared media and unknown envelope fields", () => {
    const input = previewInputFixture()
    expect(() =>
      normalizePreviewDraft({
        ...input,
        identityMap: { ...input.identityMap, cards: [] },
      }),
    ).toThrow()
    expect(() =>
      normalizePreviewDraft({ ...input, roomId: "not-a-room" }),
    ).toThrow()
    const show = authoredFixture()
    Object.assign(show.cards[0].answers[0], {
      imageUrl: "https://foreign.invalid/a.png",
    })
    expect(() =>
      normalizePreviewDraft({
        ...input,
        authoredShowJson: JSON.stringify(show),
      }),
    ).toThrow()
  })
  it.each(["constructor", "prototype", "__proto__"])(
    "supports original valid key %s as an exact value in port3",
    (key) => {
      const show = authoredFixture()
      show.cards[0].key = key
      expect(tadaShowV1Schema.safeParse(show).success).toBe(true)
      const input = previewInputFixture(show),
        draft = normalizePreviewDraft(input)
      expect(getPreviewIdentityId(draft.input.identityMap, "cards", key)).toBe(
        `preview-card-${sha256(identityPreimage("card", key))}`,
      )
      expect(show.cards[0].key).toBe(key)
    },
  )
  it("sorts map arrays by UTF16 hex bytes, independent of authored card order", () => {
    const show = authoredFixture()
    show.cards[0].key = "\u{10000}"
    show.cards[1].key = "\uE000"
    const map = derivePreviewIdentityMap(JSON.stringify(show))
    expect(map.cards.map((e) => e.authoredKey).slice(-2)).toEqual([
      "\u{10000}",
      "\uE000",
    ])
    expect(show.cards[0].key).toBe("\u{10000}")
  })
  it.each(vectors)(
    "matches independent fixed code-unit vector %#",
    (vector) => {
      const key = String.fromCharCode(...vector.keyCodeUnits)
      const kind = vector.kind as "card" | "question" | "scene"
      expect(encodeIdentityKey(key)).toBe(vector.keyHex)
      const preimage = identityPreimage(kind, key)
      expect(Buffer.from(preimage, "ascii").toString("hex")).toBe(
        vector.preimageHex,
      )
      expect(sha256(preimage)).toBe(vector.sha256)
      const sourceCard =
        kind === "scene"
          ? { kind: "media", key }
          : { ...authoredFixture(2, 1).cards[0], key }
      const show = {
        ...authoredFixture(2, 1),
        cards: [
          sourceCard,
          ...authoredFixture(2, 1).cards.map((card) => ({
            ...card,
            key: "other-question",
          })),
        ],
      }
      expect(tadaShowV1Schema.safeParse(show).success).toBe(true)
      const map = normalizePreviewDraft(previewInputFixture(show)).input
        .identityMap
      expect(
        getPreviewIdentityId(
          map,
          kind === "card"
            ? "cards"
            : kind === "question"
              ? "questions"
              : "scenes",
          key,
        ),
      ).toBe(`preview-${kind}-${vector.sha256}`)
      expect(
        createHash("sha256")
          .update(Buffer.from(vector.preimageHex, "hex"))
          .digest("hex"),
      ).toBe(vector.sha256)
    },
  )
  it("accepts two distinct source-valid lone-surrogate keys together", () => {
    const show = authoredFixture(2, 5)
    show.cards[0].key = "\ud800"
    show.cards[1].key = "\ud801"
    show.cards[2].key = "\ufffd"
    show.cards[3].key = "é"
    show.cards[4].key = "e\u0301"
    expect(tadaShowV1Schema.safeParse(show).success).toBe(true)
    const draft = normalizePreviewDraft(previewInputFixture(show))
    expect(
      new Set(draft.input.identityMap.cards.map((entry) => entry.previewId))
        .size,
    ).toBe(5)
    expect(draft.show.cards.map((card) => card.key)).toEqual(
      show.cards.map((card) => card.key),
    )
  })
  it("preserves source-valid blank media as absence without declaring an asset", () => {
    const show = {
      ...authoredFixture(2, 1),
      cards: [
        { key: "blank-media", kind: "media" },
        ...authoredFixture(2, 1).cards,
      ],
    }
    const native = tadaShowV1Schema.parse(show)
    const draft = normalizePreviewDraft(previewInputFixture(show))
    expect(native.cards[0]).toMatchObject({ mediaUrl: "" })
    expect(draft.show.cards[0]).toMatchObject({ mediaUrl: "" })
    expect(draft.input.assets).toEqual([])
    for (const url of [
      " ",
      "https://private.invalid/media",
      "javascript:alert(1)",
    ]) {
      const altered = {
        ...show,
        cards: [
          { key: "blank-media", kind: "media", mediaUrl: url },
          ...authoredFixture(2, 1).cards,
        ],
      }
      expect(() =>
        normalizePreviewDraft(previewInputFixture(altered)),
      ).toThrow()
    }
  })
  it("rejects old ports, unsorted/duplicate/forged/missing arrays and structural prototype keys", () => {
    const input = previewInputFixture()
    expect(
      previewDraftInputSchema.safeParse({ ...input, portVersion: 1 }).success,
    ).toBe(false)
    expect(
      previewDraftInputSchema.safeParse({ ...input, portVersion: 2 }).success,
    ).toBe(false)
    expect(
      previewDraftInputSchema.safeParse({ ...input, identityRuleVersion: 1 })
        .success,
    ).toBe(false)
    expect(
      previewIdentityMapSchema.safeParse({
        ...input.identityMap,
        identityRuleVersion: 1,
      }).success,
    ).toBe(false)
    const reversed = {
      ...input.identityMap,
      cards: [...input.identityMap.cards].reverse(),
    }
    expect(previewIdentityMapSchema.safeParse(reversed).success).toBe(false)
    expect(
      previewIdentityMapSchema.safeParse({
        ...input.identityMap,
        cards: [input.identityMap.cards[0], input.identityMap.cards[0]],
      }).success,
    ).toBe(false)
    expect(() =>
      normalizePreviewDraft({
        ...input,
        identityMap: {
          ...input.identityMap,
          cards: input.identityMap.cards.slice(1),
        },
      }),
    ).toThrow()
    const changed = structuredClone(input)
    changed.identityMap.cards[0].previewId = "forged"
    expect(() => normalizePreviewDraft(changed)).toThrow("identity-mismatch")
    expect(() =>
      normalizePreviewDraft({
        ...input,
        identityMap: JSON.parse(
          '{"cards":[],"questions":[],"scenes":[],"__proto__":{}}',
        ),
      }),
    ).toThrow()
  })
})
