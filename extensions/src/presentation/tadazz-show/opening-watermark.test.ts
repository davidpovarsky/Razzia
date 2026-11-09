import fs from "node:fs"
import { expect, it } from "vitest"
import { stripOpeningExportWatermark } from "./lottie-plate"
it("removes only the identified badge from the actual opening without changing its timing or source", () => {
  const original = JSON.parse(
    fs.readFileSync(
      new URL(
        "../../../../packages/web/public/tadazz-show/opening/TADAZZ-Opening-4-5s.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    layers: Array<Record<string, unknown>>
    [key: string]: unknown
  }
  const clean = stripOpeningExportWatermark(original)
  expect(clean.layers).toEqual(original.layers.slice(1))
  expect(original.layers[0]).toMatchObject({
    ind: 15,
    refId: "13",
  })
  for (const key of Object.keys(original).filter(
    (keyValue) => keyValue !== "layers",
  )) {
    expect(clean[key]).toEqual(original[key])
  }
})
it("preserves unrelated exports and opening animations", () => {
  const other = {
    w: 640,
    h: 360,
    meta: {
      g: "https://jitter.video",
    },
    layers: [
      {
        ty: 0,
        refId: "different",
      },
    ],
  }
  expect(stripOpeningExportWatermark(other)).toBe(other)
})
