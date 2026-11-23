import type {
  DemoClockSnapshot,
  PreviewPlan,
} from "../../../core/show-library/preview-schemas"
import { z } from "zod"
import type { ShowThemeAudioEvent } from "../../../core/show-themes/selection"

const selectionId = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9._-]+$/u)

export const previewSelectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("published-demo"),
    catalogueId: selectionId,
  }),
  z.strictObject({ kind: z.literal("account-owned"), quizId: selectionId }),
])

const immutableRevision = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value)

export const previewSourceSchema = z.discriminatedUnion("kind", [
  previewSelectionSchema.options[0].extend({ immutableRevision }),
  previewSelectionSchema.options[1].extend({ immutableRevision }),
])

/** A tile selects an ID only. The authenticated adapter, never the tile, resolves ACL/revision. */
export type PreviewSelection =
  | Readonly<{ kind: "published-demo"; catalogueId: string }>
  | Readonly<{ kind: "account-owned"; quizId: string }>

export type PreviewSource = PreviewSelection &
  Readonly<{ immutableRevision: string }>

/** Provider projection only; this consumer never compiles an authored timeline. */
export interface PreviewChapter {
  readonly id: string
  readonly authoredKey: string
  readonly phase: string
  readonly title: string
  readonly duration:
    | { readonly kind: "known"; readonly milliseconds: number }
    | { readonly kind: "manual" | "infinite" | "unknown" }
  readonly seek: "unavailable" | "chapter-only" | "media-time"
}

export interface PreviewSnapshot {
  readonly chapterId: string | null
  readonly clock: Readonly<DemoClockSnapshot>
  readonly ended: boolean
  readonly manualImageReveal?: boolean
  readonly screenPhase?: "lobby"
  /** Absent until the original media owner has measured real seekable ranges. */
  readonly media?: Readonly<{
    timeSeconds: number
    durationSeconds: number
    seekable: ReadonlyArray<readonly [number, number]>
  }>
}

export const previewUnavailableReasonSchema = z.enum([
  "source-unavailable",
  "access-denied",
  "stale-revision",
  "renderer-unavailable",
  "assets-unavailable",
  "playback-unavailable",
])

export type PreviewUnavailableReason = z.infer<
  typeof previewUnavailableReasonSchema
>

export const previewPreferencesSchema = z.strictObject({
  locale: z.enum(["en", "fr", "de", "es", "it", "ja", "tr", "vi", "he"]),
  reducedMotion: z.boolean(),
})

export type PreviewPreferences = z.infer<typeof previewPreferencesSchema>

/**
 * Integration port for the original D/E provider, NOT an alternate controller.
 * open performs lazy read-only source resolution using its authenticated closure;
 * no caller account/role, raw quiz, room, socket, asset URL or executable enters
 * a tile. No shared private cache. Every open/revalidation checks ACL/revision.
 * Public binding must be an actually published/licensed sanitized projection.
 * A reviewed executable pin and approved assets precede returning a session.
 * Candidate V2/current-card data alone cannot satisfy this port's full-show gate.
 */
export interface GamePreviewProvider {
  open(
    selection: PreviewSelection,
    signal: AbortSignal,
    preferences?: Readonly<PreviewPreferences>,
  ): Promise<
    | { status: "unavailable"; reason: PreviewUnavailableReason }
    | { status: "ready"; session: GamePreviewSession }
  >
}

export interface GamePreviewSession {
  previewLobby?: (signal: AbortSignal) => Promise<void>
  auditionAudioEvent?: (
    event: ShowThemeAudioEvent | null,
    signal: AbortSignal,
  ) => Promise<void>
  readonly source: PreviewSource
  readonly plan: Readonly<PreviewPlan>
  readonly coverage: "current-card" | "full-show"
  readonly sampleData: boolean
  readonly chapters: readonly PreviewChapter[]
  /** Original stage/clock/director/audio owner only. open must not mount a stage. */
  mount(element: HTMLElement, options: { muted: true }): void | Promise<void>
  snapshot(): PreviewSnapshot
  subscribe(listener: () => void): () => void
  play(signal?: AbortSignal): void | Promise<void>
  pause(): void | Promise<void>
  replay(signal?: AbortSignal): void | Promise<void>
  /** Accepted seek reconstructs a paused real stage and resolves after commit. */
  seekChapter(id: string, signal: AbortSignal): Promise<void>
  seekMedia?(seconds: number, signal: AbortSignal): Promise<void>
  /** Local bounded composition authoring only; never saves or grants asset access. */
  setAppearance?(appearance: unknown, signal: AbortSignal): Promise<void>
  setRole?(
    role: "manager" | "player" | "spectator",
    signal: AbortSignal,
  ): Promise<void>
  setSoundEnabled?(enabled: boolean, signal: AbortSignal): Promise<void>
  setMediaRevealed?: (revealed: boolean, signal: AbortSignal) => Promise<void>
  /** Revokes transitions/audio immediately; resolves after resource teardown. */
  dispose(): void | Promise<void>
}

export function selectionKey(selection: PreviewSelection): string {
  return JSON.stringify(
    selection.kind === "published-demo"
      ? [selection.kind, selection.catalogueId]
      : [selection.kind, selection.quizId],
  )
}

export function sourceMatchesSelection(
  source: PreviewSource,
  selection: PreviewSelection,
): boolean {
  return (
    previewSelectionSchema.safeParse(selection).success &&
    previewSourceSchema.safeParse(source).success &&
    selectionKey(source) === selectionKey(selection)
  )
}

/** Defensive UI checks, not a replacement for server ACL or executable admission. */
export function sessionMatchesSelection(
  session: GamePreviewSession,
  selection: PreviewSelection,
): boolean {
  const { plan, chapters } = session

  return (
    sourceMatchesSelection(session.source, selection) &&
    plan.resolution.kind !== "unavailable" &&
    plan.capabilities.supportedRoles.includes("spectator") &&
    chapters.length > 0 &&
    chapters.length <= 256 &&
    new Set(chapters.map((chapter) => chapter.id)).size === chapters.length &&
    chapters.every(
      (chapter) =>
        chapter.id.length > 0 &&
        chapter.title.trim().length > 0 &&
        (chapter.duration.kind !== "known" ||
          (Number.isFinite(chapter.duration.milliseconds) &&
            chapter.duration.milliseconds > 0)),
    )
  )
}

export function canSeekChapter(
  session: GamePreviewSession,
  chapter: PreviewChapter,
): boolean {
  return (
    session.plan.resolution.kind !== "unavailable" &&
    session.coverage === "full-show" &&
    session.plan.capabilities.seek !== "unavailable" &&
    session.chapters.includes(chapter) &&
    chapter.seek !== "unavailable"
  )
}
