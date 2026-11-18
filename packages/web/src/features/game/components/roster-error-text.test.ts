import { createInstance } from "i18next"
import { describe, expect, it } from "vitest"
import { parseRosterImportFile } from "@razzia/extensions/core"
import {
  getExtensionResources,
  SUPPORTED_EXTENSION_LANGUAGES,
} from "@razzia/extensions/locales"
import { localizeRosterError } from "./roster-error-text"

const resources = getExtensionResources()

describe("host roster parser and error localization", () => {
  it.each(SUPPORTED_EXTENSION_LANGUAGES)(
    "translates actual CSV import errors in %s",
    async (lng) => {
      const instance = createInstance()
      await instance.init({
        lng,
        resources,
        fallbackLng: false,
        interpolation: { escapeValue: false },
      })
      const invalid = parseRosterImportFile(
        "name,other\nExample,invalid",
        "rows.csv",
      )
      expect(invalid.ok).toBe(false)
      const key = invalid.errors[0]?.reasonKey
      expect(key).toBe("errors:extensions.invalidImportHeaders")
      const localized = localizeRosterError(instance.t, key)
      expect(localized).toBe(
        resources[lng].extensions.roster.errors.invalidImportHeaders,
      )
      expect(localized).not.toContain("errors:")
    },
  )

  it("keeps Hebrew row errors and unknown-error fallback localized", async () => {
    const instance = createInstance()
    await instance.init({ lng: "he", resources, fallbackLng: false })
    const invalid = parseRosterImportFile("name,phone\nדוגמה,123", "rows.csv")
    expect(invalid.invalidCount).toBe(1)
    expect(localizeRosterError(instance.t, invalid.rows[0].errorKey)).toBe(
      resources.he.extensions.roster.errors.invalidPhoneNumber,
    )
    expect(
      localizeRosterError(instance.t, "unrecognized backend details"),
    ).toBe(resources.he.extensions.roster.errors.corruptImportFile)
    expect(
      localizeRosterError(
        instance.t,
        "extensions:roster.errors.missingParticipantName",
      ),
    ).toBe(resources.he.extensions.roster.errors.missingParticipantName)
    await instance.changeLanguage("fr")
    expect(localizeRosterError(instance.t, invalid.rows[0].errorKey)).toBe(
      resources.fr.extensions.roster.errors.invalidPhoneNumber,
    )
  })
})
