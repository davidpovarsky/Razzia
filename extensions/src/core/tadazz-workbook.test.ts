import { describe, expect, it } from "vitest"
import { generateTadaShowWorkbookTemplate, parseTadaShowWorkbook, exportTadaShowWorkbook } from "./show-workbook"
import { authoredShowToNativeBundleDraft, nativeBundleToAuthoredShow } from "./show-authoring-convert"

describe("Tadazz opt-in background persistence across Excel and JSON", () => {
  it("retains animated show settings through XLSX and native V2", () => {
    const baseline = parseTadaShowWorkbook(generateTadaShowWorkbookTemplate())
    const original = {
      ...baseline,
      defaults: { ...baseline.defaults, tadazzBackground: {
        mode: "animated" as const, intensity: 1.25, paused: false,
        fit: "contain" as const,
      } },
    }
    const encoded = exportTadaShowWorkbook(original)
    const imported = parseTadaShowWorkbook(encoded)
    expect(imported.defaults?.tadazzBackground).toEqual(original.defaults.tadazzBackground)
    const converted = authoredShowToNativeBundleDraft(imported)
    expect(converted.ok).toBe(true)
    expect(converted.bundleDraft?.extras.defaults.tadazzBackground).toEqual(original.defaults.tadazzBackground)
    const authoredAgain = nativeBundleToAuthoredShow(converted.bundleDraft!)
    expect(authoredAgain.defaults?.tadazzBackground).toEqual(original.defaults.tadazzBackground)
    expect(parseTadaShowWorkbook(exportTadaShowWorkbook(authoredAgain)).defaults?.tadazzBackground)
      .toEqual(original.defaults.tadazzBackground)
  })
  it("retains original Razzia when no brand override is provided", () => {
    const baseline = parseTadaShowWorkbook(generateTadaShowWorkbookTemplate())
    expect(baseline.defaults?.tadazzBackground).toBeUndefined()
    const encoded = parseTadaShowWorkbook(exportTadaShowWorkbook(baseline))
    expect(encoded.defaults?.tadazzBackground).toBeUndefined()
  })
})
