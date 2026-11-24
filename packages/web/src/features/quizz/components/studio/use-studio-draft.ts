// oxlint-disable react/set-state-in-effect -- Browser backup is external state.
import { getClientId } from "@razzia/web/lib/session"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  isStudioDraftStale,
  readStudioDrafts,
  removeStudioDraft,
  writeStudioDraft,
  type StudioDraft,
  type StudioDraftScope,
} from "./studio-draft-storage"
import {
  isStudioSnapshot,
  studioContent,
  type StudioSnapshot,
} from "./studio-snapshot"

interface Options {
  quizzId: string | null
  snapshot: StudioSnapshot | null
  ready: boolean
  dirty: boolean
  initialBaseDigest: string
  restore: (snapshot: StudioSnapshot) => void
}

export function useStudioDraft({
  quizzId,
  snapshot,
  ready,
  dirty,
  initialBaseDigest,
  restore,
}: Options) {
  // Every write has an immutable key. An editor replaces only its own prior
  // key after the new write succeeds; recovery cannot erase a later version.
  const [scope] = useState<StudioDraftScope>(() => ({
    ownerId: getClientId(),
    quizzId,
  }))
  const [pendingDrafts, setPendingDrafts] = useState<StudioDraft[]>([])
  const [storageIssue, setStorageIssue] = useState(false)
  const [acceptedBaseline, setAcceptedBaseline] = useState({
    revision: 0,
    baseDigest: initialBaseDigest,
  })
  const [draftConflict, setDraftConflict] = useState<{
    serverRevision: number
    expectedRevision: number
  } | null>(null)
  const state = useRef({
    loaded: false,
    pending: false,
    stopped: false,
    baseline: {
      revision: 0,
      baseDigest: initialBaseDigest,
    },
    accepted: {
      revision: 0,
      baseDigest: initialBaseDigest,
    },
    owned: null as StudioDraft | null,
    recovered: null as StudioDraft | null,
    snapshot: null as StudioSnapshot | null,
    dirty: false,
  })

  useEffect(() => {
    if (snapshot && isStudioSnapshot(snapshot)) {
      state.current.snapshot = structuredClone(snapshot)
      state.current.dirty = dirty
    }
  }, [snapshot, dirty])

  useEffect(() => {
    const { current } = state

    if (!ready || !snapshot || !isStudioSnapshot(snapshot) || current.loaded) {
      return
    }

    current.loaded = true
    current.baseline = {
      revision: snapshot.extras.revision,
      baseDigest: initialBaseDigest,
    }
    current.accepted = current.baseline
    setAcceptedBaseline(current.baseline)

    if (!scope.ownerId) {
      setStorageIssue(true)

      return
    }

    try {
      const result = readStudioDrafts(localStorage, scope)
      current.pending = result.drafts.length > 0
      setPendingDrafts(result.drafts)
      setStorageIssue(result.invalid)
    } catch {
      setStorageIssue(true)
    }
  }, [ready, snapshot, initialBaseDigest, scope])

  const persist = useCallback(() => {
    const { current } = state

    if (
      !current.loaded ||
      current.pending ||
      current.stopped ||
      !current.snapshot ||
      !scope.ownerId ||
      scope.ownerId !== getClientId()
    ) {
      return
    }

    try {
      if (!current.dirty) {
        if (current.owned) {
          removeStudioDraft(localStorage, current.owned)
        }

        current.owned = null

        return
      }

      const previous = current.owned
      const draft: StudioDraft = {
        version: 1,
        id: crypto.randomUUID(),
        scope,
        savedAt: Date.now(),
        baseline: current.baseline,
        snapshot: {
          ...current.snapshot,
          extras: {
            ...current.snapshot.extras,
            revision: current.baseline.revision,
          },
        },
      }
      writeStudioDraft(localStorage, draft)
      current.owned = draft

      if (previous) {
        removeStudioDraft(localStorage, previous)
      }

      if (current.recovered) {
        removeStudioDraft(localStorage, current.recovered)
        current.recovered = null
      }

      setStorageIssue(false)
    } catch {
      setStorageIssue(true)
    }
  }, [scope])

  useEffect(() => {
    if (!ready) {
      return
    }

    const timer = window.setTimeout(persist, 350)

    return () => window.clearTimeout(timer)
  }, [snapshot, dirty, ready, pendingDrafts, persist])

  useEffect(() => {
    const flushHidden = () => {
      if (document.visibilityState === "hidden") {
        persist()
      }
    }
    window.addEventListener("pagehide", persist)
    window.addEventListener("beforeunload", persist)
    document.addEventListener("visibilitychange", flushHidden)

    return () => {
      persist()
      window.removeEventListener("pagehide", persist)
      window.removeEventListener("beforeunload", persist)
      document.removeEventListener("visibilitychange", flushHidden)
    }
  }, [persist])

  const pendingDraft = pendingDrafts.at(0) ?? null
  const restoreDraft = useCallback(() => {
    if (!pendingDraft || scope.ownerId !== getClientId()) {
      return
    }

    const { current } = state
    const stale = isStudioDraftStale(pendingDraft, current.accepted)
    current.pending = false
    current.baseline = pendingDraft.baseline
    current.recovered = pendingDraft
    restore(structuredClone(pendingDraft.snapshot))
    // The native field-array adapter flushes removal state before replacement.
    // Its effects may run inside restore; publish the durable copy afterwards.
    current.snapshot = structuredClone(pendingDraft.snapshot)
    current.dirty = true
    setDraftConflict(
      stale
        ? {
            serverRevision: current.accepted.revision,
            expectedRevision: pendingDraft.baseline.revision,
          }
        : null,
    )
    setPendingDrafts([])
    persist()
  }, [pendingDraft, scope.ownerId, restore, persist])

  const discardDraft = useCallback(() => {
    if (!pendingDraft) {
      return
    }

    try {
      removeStudioDraft(localStorage, pendingDraft)
    } catch {
      setStorageIssue(true)
    }

    const remaining = pendingDrafts.slice(1)
    state.current.pending = remaining.length > 0
    setPendingDrafts(remaining)
  }, [pendingDraft, pendingDrafts])

  const discardCurrentDraft = useCallback(() => {
    const { current } = state
    current.stopped = true

    try {
      if (current.owned) {
        removeStudioDraft(localStorage, current.owned)
      }

      if (current.recovered) {
        removeStudioDraft(localStorage, current.recovered)
      }
    } catch {
      setStorageIssue(true)
    }

    current.owned = null
    current.recovered = null
  }, [])

  const acceptSavedDraft = useCallback(
    (saved: StudioSnapshot): boolean => {
      const { current } = state
      const unchanged =
        current.snapshot !== null &&
        studioContent(current.snapshot) === studioContent(saved)
      current.baseline = {
        revision: saved.extras.revision,
        baseDigest: saved.extras.baseDigest,
      }
      current.accepted = current.baseline
      setAcceptedBaseline(current.baseline)
      setDraftConflict(null)

      if (unchanged) {
        discardCurrentDraft()
      } else {
        // Keep newer content, but durably bind it to the identity and revision
        // returned by this save before the queued React metadata update runs.
        if (current.snapshot) {
          current.snapshot = {
            ...current.snapshot,
            extras: {
              ...current.snapshot.extras,
              quizId: saved.extras.quizId,
              revision: saved.extras.revision,
              baseDigest: saved.extras.baseDigest,
            },
          }
        }

        persist()
      }

      return unchanged
    },
    [discardCurrentDraft, persist],
  )

  const acceptReloadedDraft = useCallback(
    (loaded: StudioSnapshot) => {
      discardCurrentDraft()
      const { current } = state
      current.stopped = false
      current.pending = false
      current.snapshot = structuredClone(loaded)
      current.dirty = false
      current.baseline = {
        revision: loaded.extras.revision,
        baseDigest: loaded.extras.baseDigest,
      }
      current.accepted = current.baseline
      setAcceptedBaseline(current.baseline)
      setDraftConflict(null)
      setPendingDrafts([])
    },
    [discardCurrentDraft],
  )

  return {
    pendingDraft,
    pendingDraftStale: pendingDraft
      ? isStudioDraftStale(pendingDraft, acceptedBaseline)
      : false,
    storageIssue,
    draftConflict,
    restoreDraft,
    discardDraft,
    discardCurrentDraft,
    acceptSavedDraft,
    acceptReloadedDraft,
  }
}

export type StudioDraftState = ReturnType<typeof useStudioDraft>
