import { describe, expect, it } from "vitest"
import {
  buildXlsxBuffer,
  exportRosterToCsv,
  formatFullPhoneDisplay,
  generateRosterCsvTemplate,
  generateRosterPlayerId,
  generateRosterXlsxTemplate,
  normalizePhoneE164,
  parseRosterImportFile,
} from "./index"

describe("Phone Roster & XLSX/CSV Import (P0)", () => {
  describe("normalizePhoneE164 & formatFullPhoneDisplay", () => {
    it("normalizes Israeli numbers with leading zero, hyphens, spaces, +972, and 00972", () => {
      expect(normalizePhoneE164("050-123-4567")).toBe("+972501234567")
      expect(normalizePhoneE164("052 765 4321")).toBe("+972527654321")
      expect(normalizePhoneE164("+972541112233")).toBe("+972541112233")
      expect(normalizePhoneE164("00972541112233")).toBe("+972541112233")
      expect(normalizePhoneE164("+9720501234567")).toBe("+972501234567")
      expect(normalizePhoneE164("972501234567")).toBe("+972501234567")
      expect(normalizePhoneE164("077-226-3533")).toBe("+972772263533")
      expect(normalizePhoneE164("02-654-3210")).toBe("+97226543210")
    })

    it("normalizes UK numbers (+44, 0044, 11-digit 07..., +440...)", () => {
      expect(normalizePhoneE164("+447911123456")).toBe("+447911123456")
      expect(normalizePhoneE164("00447911123456")).toBe("+447911123456")
      expect(normalizePhoneE164("07911 123456")).toBe("+447911123456")
      expect(normalizePhoneE164("+4407911123456")).toBe("+447911123456")
      expect(normalizePhoneE164("447911123456")).toBe("+447911123456")
      expect(normalizePhoneE164("020 7946 0999")).toBe("+442079460999")
    })

    it("rejects hidden/anonymous caller IDs, formulas, scientific notation, and invalid numbers", () => {
      expect(normalizePhoneE164("")).toBeNull()
      expect(normalizePhoneE164(null)).toBeNull()
      expect(normalizePhoneE164("anonymous")).toBeNull()
      expect(normalizePhoneE164("PRIVATE")).toBeNull()
      expect(normalizePhoneE164("***-***-1234")).toBeNull()
      expect(normalizePhoneE164("=SUM(A1:A2)")).toBeNull()
      expect(normalizePhoneE164("9.72501E+11")).toBeNull()
      expect(normalizePhoneE164("12345")).toBeNull()
      expect(normalizePhoneE164("123456789012345678")).toBeNull()
    })

    it("formats full unmasked phone display for host UI", () => {
      expect(formatFullPhoneDisplay("+972501234567")).toBe("+972501234567")
      expect(formatFullPhoneDisplay("+447911123456")).toBe("+447911123456")
      expect(formatFullPhoneDisplay(null)).toBe("—")
      expect(formatFullPhoneDisplay("")).toBe("—")
    })
  })

  describe("XLSX & CSV Import / Export", () => {
    it("parses downloadable .xlsx and .csv templates cleanly", () => {
      const csvTpl = generateRosterCsvTemplate()
      const csvRes = parseRosterImportFile(csvTpl, "template.csv")
      expect(csvRes.ok).toBe(true)
      expect(csvRes.valid).toBe(true)
      expect(csvRes.validCount).toBe(3)
      expect(csvRes.validParticipants[0]?.phoneE164).toBe("+972501234567")
      expect(csvRes.validParticipants[1]?.phoneE164).toBe("+972527654321")
      expect(csvRes.validParticipants[2]?.phoneE164).toBe("+447911123456")

      const xlsxTpl = generateRosterXlsxTemplate()
      const xlsxRes = parseRosterImportFile(xlsxTpl, "template.xlsx")
      expect(xlsxRes.ok).toBe(true)
      expect(xlsxRes.valid).toBe(true)
      expect(xlsxRes.validCount).toBe(3)
      const xlsxPhones: Array<string | null> = []
      for (const p of xlsxRes.validParticipants) {
        xlsxPhones.push(p.phoneE164)
      }
      expect(xlsxPhones).toEqual([
        "+972501234567",
        "+972527654321",
        "+447911123456",
      ])
    })

    it("imports 100 and 400+ rows in both .xlsx and .csv preserving leading zeros and +44/+972", () => {
      const rows100: string[][] = [["name", "phone"]]
      for (let i = 1; i <= 100; i += 1) {
        const padded = String(i).padStart(4, "0")
        const phone =
          i % 2 === 0 ? `050-123-${padded}` : `+44791112${padded}`
        rows100.push([`Player ${i}`, phone])
      }

      const xlsx100 = buildXlsxBuffer(rows100)
      const res100 = parseRosterImportFile(xlsx100, "roster-100.xlsx")
      expect(res100.ok).toBe(true)
      expect(res100.valid).toBe(true)
      expect(res100.totalRows).toBe(100)
      expect(res100.validCount).toBe(100)
      expect(res100.invalidCount).toBe(0)
      expect(res100.validParticipants[0]?.phoneE164).toBe("+447911120001")
      expect(res100.validParticipants[1]?.phoneE164).toBe("+972501230002")

      // 420 rows test
      const rows420: string[][] = [["Player Name", "Phone Number"]]
      for (let i = 1; i <= 420; i += 1) {
        const padded = String(i).padStart(4, "0")
        rows420.push([`Participant ${i}`, `054-888-${padded}`])
      }
      const xlsx420 = buildXlsxBuffer(rows420)
      const res420 = parseRosterImportFile(xlsx420, "roster-420.xlsx")
      expect(res420.ok).toBe(true)
      expect(res420.valid).toBe(true)
      expect(res420.totalRows).toBe(420)
      expect(res420.validCount).toBe(420)

      // Export to CSV and re-import
      const exportedCsv = exportRosterToCsv(res100.validParticipants)
      const reimported = parseRosterImportFile(exportedCsv, "reimport.csv")
      expect(reimported.valid).toBe(true)
      expect(reimported.validCount).toBe(100)
    })

    it("detects row-level errors: formulas, scientific notation, missing name/phone, duplicates in file and existing roster", () => {
      const existing = [
        {
          rosterPlayerId: generateRosterPlayerId(),
          displayName: "Existing User",
          phoneE164: "+972509999999",
        },
      ]

      const mixedXlsx = buildXlsxBuffer([
        ["name", "phone"],
        ["Valid User", "050-111-2222"],
        ["Formula User", { value: "0501113333", formula: "CONCATENATE(0,501113333)" }],
        ["Sci User", "9.72501E+11"],
        ["", "050-111-4444"],
        ["Missing Phone", ""],
        ["Dup In File", "+972501112222"],
        ["Dup In Roster", "050-999-9999"],
        ["Bad Phone", "not-a-phone"],
      ])

      const result = parseRosterImportFile(mixedXlsx, "mixed.xlsx", existing)
      expect(result.totalRows).toBe(8)
      expect(result.validCount).toBe(1)
      expect(result.invalidCount).toBe(7)
      // 1 valid row can still be approved if desired
      expect(result.ok).toBe(true)
      // Has errors
      expect(result.valid).toBe(false)

      const errorReasons: string[] = []
      for (const err of result.errors) {
        errorReasons.push(err.reasonKey)
      }
      expect(errorReasons).toContain("errors:extensions.formulaNotAllowed")
      expect(errorReasons).toContain("errors:extensions.scientificNotationPhone")
      expect(errorReasons).toContain("errors:extensions.missingParticipantName")
      expect(errorReasons).toContain("errors:extensions.missingPhoneNumber")
      expect(errorReasons).toContain("errors:extensions.duplicatePhoneInImport")
      expect(errorReasons).toContain("errors:extensions.duplicatePhoneInRoster")
      expect(errorReasons).toContain("errors:extensions.invalidPhoneNumber")
    })

    it("fails cleanly on empty, corrupt, or unsupported files", () => {
      const emptyRes = parseRosterImportFile("", "empty.csv")
      expect(emptyRes.ok).toBe(false)
      expect(emptyRes.fatalError).toBeTruthy()

      const corruptXlsx = parseRosterImportFile(
        new Uint8Array([1, 2, 3, 4, 5]),
        "corrupt.xlsx",
      )
      expect(corruptXlsx.ok).toBe(false)
      expect(corruptXlsx.fatalError).toContain("corruptXlsxFile")

      const badExt = parseRosterImportFile("name,phone\nA,0501234567", "file.pdf")
      expect(badExt.ok).toBe(false)
      expect(badExt.fatalError).toContain("Only .xlsx and .csv")
    })
  })
})
