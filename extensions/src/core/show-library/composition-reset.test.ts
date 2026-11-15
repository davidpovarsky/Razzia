import { describe, expect, it } from "vitest"
import { resetCompositionSection } from "./assets"
import { themeCompositionSchema } from "./schemas"

function fixture() {
  return {
    schemaVersion: 1,
    id: "composition-a",
    version: "1.0.0",
    baseTheme: { id: "tadazz-classic", version: "1.0.0" },
    registry: { id: "registry-a", version: "1.0.0" },
    sections: {
      assets: { backdrop: { assetId: "backdrop-a", sha256: "a".repeat(64) } },
      audio: { opening: { mode: "mute" } },
      templates: { question: { id: "question-a", version: "1.0.0" } },
      motion: { question: { id: "motion-a", version: "1.0.0" } },
    },
    roles: { spectator: { audio: { opening: { mode: "inherit" } } } },
    scopes: [],
  }
}

describe("composition section reset validates the runtime command", () => {
  it.each(["registry", "roles", "id", "unknown", "__proto__", "constructor"])(
    "rejects %s instead of silently accepting an unknown reset command",
    (section) => {
      const input = fixture()
      const before = JSON.stringify(input)

      expect(() => resetCompositionSection(input, section as never)).toThrow()
      expect(JSON.stringify(input)).toBe(before)
      expect(themeCompositionSchema.safeParse(input).success).toBe(true)
    },
  )
  it.each(["assets", "audio", "templates", "motion"] as const)(
    "resets only the base %s section and preserves metadata and overrides",
    (section) => {
      const input = fixture()
      const before = JSON.stringify(input)
      const output = resetCompositionSection(input, section)

      expect(themeCompositionSchema.safeParse(output).success).toBe(true)
      expect(output.sections).not.toHaveProperty(section)
      expect(Object.keys(output.sections)).toHaveLength(3)
      expect(output.registry).toEqual(input.registry)
      expect(output.roles).toEqual(input.roles)
      expect(JSON.stringify(input)).toBe(before)
    },
  )
})
