// oxlint-disable typescript/no-unnecessary-condition -- Validate untrusted serialized browser records before treating them as StudioDraft.
import { isStudioSnapshot, type StudioSnapshot } from "./studio-snapshot"

export interface StudioDraftScope {
  ownerId: string
  quizzId: string | null
}

export interface StudioDraftBaseline {
  revision: number
  baseDigest: string
}

export interface StudioDraft {
  version: 1
  id: string
  scope: StudioDraftScope
  savedAt: number
  baseline: StudioDraftBaseline
  snapshot: StudioSnapshot
}

export type DraftStorage = Pick<
  Storage,
  "length" | "key" | "getItem" | "setItem" | "removeItem"
>

export const STUDIO_DRAFT_MAX_BYTES = 2 * 1024 * 1024

export const studioDraftPrefix = (scope: StudioDraftScope) =>
  `tadazz:studio-draft:v1:${encodeURIComponent(scope.ownerId)}:${scope.quizzId === null ? "new" : `quiz-${encodeURIComponent(scope.quizzId)}`}:`

export const studioDraftKey = (draft: Pick<StudioDraft, "scope" | "id">) =>
  `${studioDraftPrefix(draft.scope)}${draft.id}`

export function readStudioDrafts(
  storage: DraftStorage,
  scope: StudioDraftScope,
): { drafts: StudioDraft[]; invalid: boolean } {
  const drafts: StudioDraft[] = []
  let invalid = false
  const prefix = studioDraftPrefix(scope)
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)

    if (!key?.startsWith(prefix)) {
      continue
    }

    try {
      const raw = storage.getItem(key)

      if (!raw || raw.length * 2 > STUDIO_DRAFT_MAX_BYTES) {
        invalid = true

        continue
      }

      const draft = JSON.parse(raw) as StudioDraft

      if (
        draft.version !== 1 ||
        typeof draft.id !== "string" ||
        !Number.isFinite(draft.savedAt) ||
        draft.savedAt <= 0 ||
        draft.scope?.ownerId !== scope.ownerId ||
        draft.scope.quizzId !== scope.quizzId ||
        typeof draft.baseline?.revision !== "number" ||
        !Number.isSafeInteger(draft.baseline.revision) ||
        typeof draft.baseline.baseDigest !== "string" ||
        studioDraftKey(draft) !== key ||
        !isStudioSnapshot(draft.snapshot) ||
        (scope.quizzId !== null &&
          draft.snapshot.extras.quizId !== scope.quizzId) ||
        draft.snapshot.extras.revision !== draft.baseline.revision
      ) {
        invalid = true

        continue
      }

      drafts.push(draft)
    } catch {
      invalid = true
    }
  }

  return { drafts: drafts.sort((a, b) => b.savedAt - a.savedAt), invalid }
}

export function writeStudioDraft(
  storage: DraftStorage,
  draft: StudioDraft,
): void {
  if (!draft.scope.ownerId || !isStudioSnapshot(draft.snapshot)) {
    throw new Error("Invalid Studio draft")
  }

  const serialized = JSON.stringify(draft)

  if (serialized.length * 2 > STUDIO_DRAFT_MAX_BYTES) {
    throw new Error("Studio draft exceeds browser backup limit")
  }

  const key = studioDraftKey(draft)
  const existing = storage.getItem(key)

  if (existing !== null && existing !== serialized) {
    throw new Error("A Studio draft version is immutable")
  }

  storage.setItem(key, serialized)
}

// Writers allocate immutable version IDs. Cleanup can only remove this exact
// version, never the newer key another tab writes during cleanup.
export function removeStudioDraft(
  storage: DraftStorage,
  draft: StudioDraft,
): boolean {
  const key = studioDraftKey(draft)

  if (storage.getItem(key) !== JSON.stringify(draft)) {
    return false
  }

  storage.removeItem(key)

  return true
}

export function isStudioDraftStale(
  draft: StudioDraft,
  baseline: StudioDraftBaseline,
): boolean {
  return (
    draft.scope.quizzId !== null &&
    (draft.baseline.revision !== baseline.revision ||
      draft.baseline.baseDigest !== baseline.baseDigest)
  )
}
