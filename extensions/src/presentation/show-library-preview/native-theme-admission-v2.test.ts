import { describe, expect, it } from "vitest"
import { getNativeShowLibrary } from "../../core/show-library/native-library"
import { nativePreviewThemeBindingV2Schema } from "../../core/show-library/native-preview-renderer-v2-schema"
import {
  resolveCardStageAnimations,
  resolveQuestionDecoration,
} from "../../core/card-appearance"
import { resolveBundledPreviewThemeV2 } from "./native-theme-admission-v2"

const { families } = getNativeShowLibrary()
const built = families.map((family) => ({
  ...family.ref,
  rendererId: family.definition.rendererId,
  definitionSha256: family.definitionSha256,
}))
const bindingFor = (index: number) => {
  const family = families[index]!

  return nativePreviewThemeBindingV2Schema.parse({
    format: "tadazz-native-preview-theme",
    schemaVersion: 2,
    portVersion: 3,
    identityRuleVersion: 2,
    questionId: `preview-question-${"a".repeat(64)}`,
    role: "spectator",
    draftRevision: 1,
    theme: family.ref,
    rendererId: family.definition.rendererId,
    definitionSha256: family.definitionSha256,
    compositionDocumentSha256: "b".repeat(64),
    slots: Object.fromEntries(
      family.visualSlots.map((slot) => [
        slot.slot,
        { variantId: slot.defaultVariantId },
      ]),
    ),
    settings: {
      stageAnimations: resolveCardStageAnimations({}),
      questionDecoration: resolveQuestionDecoration({}),
    },
  })
}
describe("V2 exact built native theme admission", () => {
  it.each([0, 1])(
    "resolves actual family %s and all 15 exact variants",
    (index) => {
      const binding = bindingFor(index)
      const theme = resolveBundledPreviewThemeV2(binding, built)
      expect(theme.definition.id).toBe(binding.theme.id)
      expect(Object.keys(theme.slots)).toHaveLength(15)
      for (const [slot, value] of Object.entries(binding.slots)) {
        expect(theme.slots[slot as keyof typeof theme.slots].id).toBe(
          value.variantId,
        )
      }
    },
  )
  it("rejects a valid-shaped foreign definition digest", () => {
    expect(() =>
      resolveBundledPreviewThemeV2(
        { ...bindingFor(0), definitionSha256: "0".repeat(64) },
        built,
      ),
    ).toThrow("unbuilt-native-definition")
  })
  it("rejects same-family fabricated variant IDs", () => {
    const binding = structuredClone(bindingFor(0))
    binding.slots.question.variantId = `${binding.theme.id}.question.fabricated`
    expect(() => resolveBundledPreviewThemeV2(binding, built)).toThrow(
      "unbuilt-native-variant",
    )
  })
  it("rejects missing, duplicate or wrong-renderer built records", () => {
    const binding = bindingFor(0)
    expect(() => resolveBundledPreviewThemeV2(binding, [])).toThrow(
      "unbuilt-native-definition",
    )
    expect(() =>
      resolveBundledPreviewThemeV2(binding, [...built, built[0]!]),
    ).toThrow("unbuilt-native-definition")
    expect(() =>
      resolveBundledPreviewThemeV2(
        binding,
        built.map((entry) => ({ ...entry, rendererId: "razzia-native-stage" })),
      ),
    ).toThrow("unbuilt-native-definition")
  })
})
