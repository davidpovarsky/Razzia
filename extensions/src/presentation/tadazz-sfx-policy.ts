export function acceptsQuestionMilestone(input: {
  name: string
  paintedScene: string
  paintedQuestion?: number
  currentQuestion?: number
  paintedQuestionKey?: string
  currentQuestionText?: string
  currentKind: string
  currentPhase?: string
  currentPreset?: string
  currentSceneKind?: string
}): boolean {
  const { name, paintedScene, paintedQuestion, currentQuestion, paintedQuestionKey, currentQuestionText, currentKind, currentPhase, currentPreset, currentSceneKind } = input
  if (name !== "survey-reveal" && name !== "top-pick-reveal") return true
  if (paintedQuestionKey && currentQuestionText) {
    if (paintedQuestionKey.replace(/#\d+$/, "") !== currentQuestionText) return false
  } else if (paintedQuestion !== undefined && currentQuestion !== undefined && paintedQuestion !== currentQuestion) return false
  const spotlight = currentKind === "scene" && ["top-pick", "most-chosen", "spotlight"].includes(currentPreset ?? "")
  if (name === "survey-reveal") return paintedScene === "survey-results" && (
    (currentKind === "results" && currentPhase === "responses") ||
    (currentKind === "scene" && currentSceneKind === "interimResults") || spotlight
  )
  if (name === "top-pick-reveal") return paintedScene === "top-pick" && spotlight
  return true
}
