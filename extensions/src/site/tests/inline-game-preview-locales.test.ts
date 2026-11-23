import { describe, expect, it } from "vitest"
import i18next from "i18next"
import { previewResources } from "../components/game-preview/resources"

describe("isolated inline preview locale namespace", () => {
  it.each(Object.keys(previewResources))(
    "%s supplies every unavailable reason and interpolates chapter accessibility text",
    async (language) => {
      const dictionary =
        previewResources[language as keyof typeof previewResources]
      expect(Object.keys(dictionary).sort()).toEqual(
        Object.keys(previewResources.en).sort(),
      )
      const isolated = i18next.createInstance()
      await isolated.init({
        lng: language,
        fallbackLng: false,
        resources: { [language]: { tadazzGamePreview: dictionary } },
        ns: ["tadazzGamePreview"],
        defaultNS: "tadazzGamePreview",
      })
      const chapter = isolated.t("chapter", {
        number: 2,
        count: 5,
        title: "Fixture chapter",
      })
      expect(chapter).toContain("2")
      expect(chapter).toContain("5")
      expect(chapter).toContain("Fixture chapter")
      expect(chapter).not.toContain("{{")
      for (const key of Object.keys(dictionary)) {
        expect(isolated.exists(key)).toBe(true)
        expect(isolated.t(key).trim().length).toBeGreaterThan(0)
      }
    },
  )
})
