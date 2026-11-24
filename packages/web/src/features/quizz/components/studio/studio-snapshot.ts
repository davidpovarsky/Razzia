import type { AnyQuizExtras, QuizExtrasV2 } from "@razzia/extensions/core"
import type { QuizzFormValues } from "../../contexts/quizz-editor-context"

export interface StudioSnapshot {
  values: QuizzFormValues
  questionIds: string[]
  extras: AnyQuizExtras
  selectedTimelineId: string | null
  currentIndex: number
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right)

// Validate storage shape and linked identities, not publication validity.
// Empty text, incomplete answers and unfinished scene settings are valid drafts.
//
export function isStudioSnapshot(value: unknown): value is StudioSnapshot {
  if (!object(value) || !object(value.values) || !object(value.extras)) {
    return false
  }

  const { values, extras } = value
  const ids = value.questionIds

  if (
    !strings(ids) ||
    ids.length === 0 ||
    new Set(ids).size !== ids.length ||
    !Array.isArray(values.questions) ||
    values.questions.length !== ids.length ||
    typeof values.subject !== "string" ||
    !["quiz", "survey"].includes(String(values.gameMode)) ||
    !values.questions.every(
      (question) =>
        object(question) &&
        typeof question.question === "string" &&
        typeof question.type === "string" &&
        strings(question.answers) &&
        (question.solutions === undefined || Array.isArray(question.solutions)),
    ) ||
    extras.schemaVersion !== 2 ||
    typeof extras.quizId !== "string" ||
    typeof extras.revision !== "number" ||
    !Number.isSafeInteger(extras.revision) ||
    extras.revision < 0 ||
    typeof extras.baseDigest !== "string" ||
    !same(extras.questionIds, ids) ||
    !Array.isArray(extras.timeline) ||
    !object(extras.scenes) ||
    !object(extras.defaults) ||
    !object(extras.perQuestion) ||
    !object(extras.audio) ||
    !object(extras.teams) ||
    (extras.leaderboard !== undefined && !object(extras.leaderboard)) ||
    !(
      value.selectedTimelineId === null ||
      typeof value.selectedTimelineId === "string"
    ) ||
    typeof value.currentIndex !== "number" ||
    !Number.isInteger(value.currentIndex)
  ) {
    return false
  }

  const timelineIds = new Set<string>()
  const orderedQuestions: string[] = []
  for (const item of extras.timeline) {
    if (
      !object(item) ||
      typeof item.id !== "string" ||
      timelineIds.has(item.id)
    ) {
      return false
    }

    timelineIds.add(item.id)

    if (item.kind === "question") {
      if (typeof item.questionId !== "string") {
        return false
      }

      orderedQuestions.push(item.questionId)
    } else {
      if (typeof item.sceneId !== "string") {
        return false
      }

      const scene = extras.scenes[item.sceneId]

      if (
        !object(scene) ||
        scene.id !== item.sceneId ||
        scene.kind !== item.kind
      ) {
        return false
      }
    }
  }

  return same(orderedQuestions, ids)
}

/** Selection and server metadata do not turn an accepted save into a new edit. */
export function studioContent(snapshot: StudioSnapshot): string {
  return JSON.stringify({
    values: snapshot.values,
    questionIds: snapshot.questionIds,
    extras: {
      ...snapshot.extras,
      quizId: "",
      revision: 0,
      baseDigest: "",
    },
  })
}

export interface StudioHistoryEntry {
  before: StudioSnapshot
  after: StudioSnapshot
}

export interface StudioHistory {
  past: StudioHistoryEntry[]
  future: StudioHistoryEntry[]
}

export const createStudioHistory = (): StudioHistory => ({
  past: [],
  future: [],
})

const HISTORY_LIMIT = 50
const HISTORY_BYTES = 8 * 1024 * 1024
function bounded(entries: StudioHistoryEntry[]): StudioHistoryEntry[] {
  const kept = entries.slice(-HISTORY_LIMIT)
  let bytes = JSON.stringify(kept).length * 2

  while (kept.length && bytes > HISTORY_BYTES) {
    bytes -= JSON.stringify(kept[0]).length * 2
    kept.shift()
  }

  return kept
}

export function recordStudioEdit(
  history: StudioHistory,
  before: StudioSnapshot,
  after: StudioSnapshot,
): StudioHistory {
  if (studioContent(before) === studioContent(after)) {
    return history
  }

  return {
    past: bounded([...history.past, structuredClone({ before, after })]),
    future: [],
  }
}

// Reverse only fields changed by the structural transaction. Later typing,
// audio, roster and scene edits on surviving cards remain intact.
//
function restoreChangedFields(
  from: unknown,
  to: unknown,
  current: unknown,
): unknown {
  if (same(from, to)) {
    return structuredClone(current)
  }

  if (object(from) && object(to) && object(current)) {
    const keys = new Set([
      ...Object.keys(from),
      ...Object.keys(to),
      ...Object.keys(current),
    ])

    return Object.fromEntries(
      [...keys]
        .filter(
          (key) =>
            key !== "__proto__" && key !== "constructor" && key !== "prototype",
        )
        .map((key) => [
          key,
          restoreChangedFields(from[key], to[key], current[key]),
        ])
        .filter(([, value]) => value !== undefined),
    )
  }

  return structuredClone(to)
}

function restoreTransaction(
  from: StudioSnapshot,
  to: StudioSnapshot,
  current: StudioSnapshot,
): StudioSnapshot {
  const questions = to.questionIds.map((id, index) => {
    const sourceIndex = from.questionIds.indexOf(id)
    const currentIndex = current.questionIds.indexOf(id)

    return sourceIndex < 0 || currentIndex < 0
      ? structuredClone(to.values.questions[index])
      : restoreChangedFields(
          from.values.questions[sourceIndex],
          to.values.questions[index],
          current.values.questions[currentIndex],
        )
  }) as QuizzFormValues["questions"]
  const extras = restoreChangedFields(
    from.extras,
    to.extras,
    current.extras,
  ) as QuizExtrasV2
  const values = restoreChangedFields(
    from.values,
    to.values,
    current.values,
  ) as QuizzFormValues

  return {
    ...structuredClone(to),
    values: { ...values, questions },
    extras: {
      ...extras,
      quizId: current.extras.quizId,
      revision: current.extras.revision,
      baseDigest: current.extras.baseDigest,
    },
  }
}

export function moveStudioHistory(
  history: StudioHistory,
  current: StudioSnapshot,
  direction: "undo" | "redo",
): { history: StudioHistory; snapshot: StudioSnapshot } | null {
  const entries = direction === "undo" ? history.past : history.future
  const entry = entries.at(-1)

  if (!entry) {
    return null
  }

  const snapshot =
    direction === "undo"
      ? restoreTransaction(entry.after, entry.before, current)
      : restoreTransaction(entry.before, entry.after, current)

  if (!isStudioSnapshot(snapshot)) {
    return null
  }

  // Capture current edits in the reverse entry, including content typed into a
  // duplicated card before Undo, so Redo restores that exact authored card.
  const reverse =
    direction === "undo"
      ? { before: snapshot, after: current }
      : { before: current, after: snapshot }

  return {
    snapshot,
    history:
      direction === "undo"
        ? {
            past: entries.slice(0, -1),
            future: bounded([...history.future, structuredClone(reverse)]),
          }
        : {
            past: bounded([...history.past, structuredClone(reverse)]),
            future: entries.slice(0, -1),
          },
  }
}
