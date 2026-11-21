import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createDefaultQuizExtrasV2 } from "../../core/index"
import { ExtensionGameSession } from "./session"

const BMS_QUIZ_ID = "6369bf77-c3d4-40ee-8a67-0476434b562f"

function snapshot(
  role: "manager" | "player",
  theme: { id: string; version: string } | undefined,
  composition = false,
  quizId = BMS_QUIZ_ID,
) {
  const extras = createDefaultQuizExtrasV2(
    quizId,
    [randomUUID()],
    "0".repeat(64),
  )
  extras.defaults.showTheme = theme
  if (composition) {
    extras.defaults.showComposition = {
      workspaceId: "00000000-0000-4000-8000-000000000099",
      documentId: "explicit-composition",
      version: "1.0.0",
      digest: "1".repeat(64),
      rendererBuildSha256: "2".repeat(64),
    }
  }
  return new ExtensionGameSession("theme-precedence", extras)
    .getStateSnapshot(role, []).extras
}

describe.each(["manager", "player"] as const)(
  "explicit presentation selection for %s",
  (role) => {
    it("retains the accepted BMS look for its stored Classic version", () => {
      expect(snapshot(role, { id: "tadazz-classic", version: "1.0.0" }))
        .toHaveProperty("stageLook", "guess-off")
    })

    it.each([
      { id: "curiosity-lab", version: "1.0.0" },
      { id: "tadazz-classic", version: "2.0.0" },
      { id: "bms-memory-files", version: "1.1.2" },
      undefined,
    ])("lets the selected theme control the same original quiz: %j", (theme) => {
      expect(snapshot(role, theme)).not.toHaveProperty("stageLook")
    })

    it("keeps an explicit composition authoritative even while its package is unavailable", () => {
      const result = snapshot(
        role,
        { id: "tadazz-classic", version: "1.0.0" },
        true,
      )
      expect(result).not.toHaveProperty("stageLook")
      expect(result).toHaveProperty("applicationCompositionUnavailable", true)
    })

    it("does not impose the BMS look on other Classic games", () => {
      expect(
        snapshot(
          role,
          { id: "tadazz-classic", version: "1.0.0" },
          false,
          "another-game",
        ),
      ).not.toHaveProperty("stageLook")
    })
  },
)
