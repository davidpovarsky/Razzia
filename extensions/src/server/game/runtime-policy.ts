import { isQuizExtrasV2, type AnyQuizExtras } from "../../core/index"

/** Event-specific behavior never becomes the default for unrelated Razzia rooms. */
export function isCreatingWorldsProgram(
  sidecar: AnyQuizExtras | null,
): boolean {
  return Boolean(
    sidecar &&
    isQuizExtrasV2(sidecar) &&
    sidecar.questionIds.length === 10 &&
    ["round-one", "top-pick", "round-recap", "grand-finale"].every((preset) =>
      Object.values(sidecar.scenes).some(
        (scene) => scene.kind === "animation" && scene.preset === preset,
      ),
    ),
  )
}

export function allowsTemporaryGuests(
  quizzId: string | undefined,
  managerClientId: string,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return Boolean(
    quizzId &&
    (env.TADA_TEMP_GUEST_QUIZ_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .includes(quizzId) &&
    (!(env.TADA_TEMP_GUEST_OWNER_IDS ?? env.TADA_PILOT_OWNER_ID) ||
      (env.TADA_TEMP_GUEST_OWNER_IDS ?? env.TADA_PILOT_OWNER_ID ?? "")
        .split(",")
        .map((id) => id.trim())
        .includes(managerClientId)),
  )
}
