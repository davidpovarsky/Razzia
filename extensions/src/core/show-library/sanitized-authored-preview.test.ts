import { expect, it } from "vitest"
import { authoredFixture } from "./preview-fixtures"
import { sanitizeAuthoredShowForPreview } from "./sanitized-authored-preview"

it("sanitizes unsaved native authoring data without changing the editor source", () => {
  const source = {
    ...authoredFixture(2, 1),
    settings: [{ scope: "roster", value: "PRIVATE_CONTACT_SENTINEL" }],
    cards: [
      ...authoredFixture(2, 1).cards,
      {
        key: "PHONE_01",
        kind: "animation",
        preset: "phone-instructions",
        title: "Join",
        durationMs: 3000,
        advance: "manual",
        dialNumber: "+440000000000",
        representatives: [{ name: "PRIVATE_CONTACT_SENTINEL" }],
        connectedTables: [1],
      },
    ],
  }
  const before = JSON.stringify(source)
  const result = sanitizeAuthoredShowForPreview(source)
  expect(result.cards.map((card) => card.kind)).toEqual(["quiz", "animation"])
  expect(JSON.stringify(result)).not.toContain("PRIVATE_CONTACT_SENTINEL")
  expect(JSON.stringify(result)).not.toContain("+440000000000")
  expect(JSON.stringify(result)).not.toContain("connectedTables")
  expect(JSON.stringify(source)).toBe(before)
})
