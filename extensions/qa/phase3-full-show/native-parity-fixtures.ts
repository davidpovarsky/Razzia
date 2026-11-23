/** QA-only renderer inputs. These are never issuer results, live votes or saved drafts. */
import assert from "node:assert/strict"
import {
  fullShowFrameV3Schema,
  fullShowSceneV3Schema,
  type FullShowFrameV3,
} from "../../src/mcp-app/contracts/full-show-frame.ts"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import { nativePreviewFrameV1Schema } from "../../src/core/show-library/native-preview-frame-schema.ts"
import { nativePreviewVisualSettingsV2Schema } from "../../src/core/show-library/native-preview-renderer-v2-schema.ts"
import { sceneConfigSchema } from "../../src/core/studio-timeline-schema.ts"
import { computePollRanking } from "../../src/presentation/poll-ranking.ts"

const sources = [
  "extensions/src/core/show-library/native-preview-frame-schema.ts",
  "extensions/src/core/show-library/native-preview-renderer-v2-schema.ts",
  "extensions/src/presentation/show-library-preview/stage-scene-adapter.ts",
  "extensions/src/presentation/poll-ranking.ts",
  "extensions/src/presentation/scene-presenter.tsx",
  "extensions/src/core/studio-timeline-schema.ts",
] as const

const familySources = {
  "tadazz-classic": [
    "extensions/src/presentation/show-library-preview/NativePreviewStage.tsx",
    "extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx",
  ],
  "razzia-original": [
    "extensions/src/presentation/show-library-preview/NativeRazziaPreviewV2.tsx",
    "packages/web/src/features/game/components/PhotoCardGrid.tsx",
    "packages/web/src/features/game/utils/answer-style.ts",
    "extensions/src/presentation/stage-fit.tsx",
    "extensions/src/mcp-app/widget/native-photo-card-port.ts",
  ],
} as const

export interface NativeParityFixture {
  readonly id: string
  readonly proof: "renderer-only-synthetic-fixture"
  readonly sourceFrameSha256: string
  readonly frameSha256: string
  readonly rendererBuildId: string
  readonly definitionSha256: string
  readonly sourceModules: readonly string[]
  readonly frame: FullShowFrameV3
  readonly expected: {
    readonly counts?: readonly number[]
    readonly percentages?: readonly number[]
    readonly winnerIndices?: readonly number[]
    readonly totalVotes?: number
    readonly isZeroVotes?: boolean
    readonly isTie?: boolean
    readonly imageOnly?: boolean
    readonly imageUrls?: readonly string[]
    readonly imageAlts?: readonly string[]
    readonly captionLabels?: readonly string[]
    readonly compositionSha256?: string
    readonly mediaSha256?: string
    readonly motion?: "native-motion-enabled" | "native-motion-and-razzia-fade"
    readonly sceneKind?: string
    readonly scenePreset?: string
    readonly sceneTitle?: string
    readonly emptySceneData?: boolean
  }
}

function checkedSource(raw: FullShowFrameV3): FullShowFrameV3 {
  const frame = fullShowFrameV3Schema.parse(raw)
  assert.equal(frame.inventory.context.mode, "demo")
  assert.equal(frame.inventory.context.actions, "synthetic-only")
  assert.equal(frame.inventory.context.join, "unavailable-demo")

  return frame
}

function seal(
  source: FullShowFrameV3,
  candidate: FullShowFrameV3,
  identity: { id: string; expected: NativeParityFixture["expected"] },
): NativeParityFixture {
  const frame = fullShowFrameV3Schema.parse(candidate)
  assert.equal(frame.rendererBuildId, source.rendererBuildId)
  assert.deepEqual(frame.theme, source.theme)
  const family = source.theme.id
  assert(
    family === "tadazz-classic" || family === "razzia-original",
    "Native parity fixtures support only Tadazz Classic and Razzia Original",
  )

  return {
    ...identity,
    proof: "renderer-only-synthetic-fixture",
    sourceFrameSha256: hashJson(source),
    frameSha256: hashJson(frame),
    rendererBuildId: frame.rendererBuildId,
    definitionSha256: frame.theme.definitionSha256,
    sourceModules: [...sources, ...familySources[family]],
    frame,
  }
}

function resultBase(source: FullShowFrameV3): FullShowFrameV3 {
  assert.equal(source.content.kind, "question")
  assert.equal(source.content.frame.choices.length, 5)
  assert.equal(source.presentation.answerVisuals.length, 5)
  const selected = source.inventory.chapters.find(
    (chapter) => chapter.id === source.inventory.selectedChapterId,
  )
  assert(selected)
  const results = source.inventory.chapters.find(
    (chapter) =>
      chapter.cardId === selected.cardId && chapter.kind === "results",
  )
  assert(results)

  return fullShowFrameV3Schema.parse({
    ...source,
    inventory: {
      ...source.inventory,
      selectedChapterId: results.id,
      context: { ...source.inventory.context, reducedMotion: true },
    },
    content: {
      ...source.content,
      frame: nativePreviewFrameV1Schema.parse({
        ...source.content.frame,
        phase: "results",
        epoch: results.index + 1,
        question: { ...source.content.frame.question, mode: "survey" },
        clock: { elapsedMs: 0, deadlineMs: null, paused: true },
        results: source.content.frame.choices.map((choice) => ({
          answerId: choice.id,
          count: 0,
          percent: 0,
        })),
      }),
    },
  })
}

function resultFixture(
  source: FullShowFrameV3,
  input: { id: string; frame: FullShowFrameV3; counts: readonly number[] },
): NativeParityFixture {
  const frame = structuredClone(input.frame)
  assert(frame.content.kind === "question")
  const total = input.counts.reduce((sum, count) => sum + count, 0)
  const percentages = input.counts.map((count) =>
    total === 0 ? 0 : (count * 100) / total,
  )
  frame.content.frame.results = frame.content.frame.choices.map(
    (choice, index) => ({
      answerId: choice.id,
      count: input.counts[index],
      percent: percentages[index],
    }),
  )
  const ranking = computePollRanking(
    frame.content.frame.choices.map((choice, index) => ({
      answerIndex: index,
      label: choice.label,
      count: input.counts[index],
      percentage: percentages[index],
    })),
  )

  return seal(source, frame, {
    id: input.id,
    expected: {
      counts: input.counts,
      percentages,
      winnerIndices: ranking.winners.map((winner) => winner.answerIndex),
      totalVotes: ranking.totalVotes,
      isZeroVotes: ranking.isZeroVotes,
      isTie: ranking.isTie,
      imageOnly: frame.presentation.answerVisuals.every(
        (visual) => visual.display === "image",
      ),
      imageUrls: frame.presentation.answerVisuals.map((visual) => visual.url),
      imageAlts: frame.presentation.answerVisuals.map((visual) => visual.alt),
      captionLabels: frame.content.frame.choices.map((choice) => choice.label),
      compositionSha256: hashJson(frame.content),
      mediaSha256: hashJson(frame.presentation),
    },
  })
}

/** Five admitted images enter via the real host frame; this helper introduces no asset URL. */
export function createNativeResultParityFixtures(
  raw: FullShowFrameV3,
): readonly NativeParityFixture[] {
  const source = checkedSource(raw)
  const base = resultBase(source)
  const zero = resultFixture(source, {
    id: "zero-votes-five-pictures",
    frame: base,
    counts: [0, 0, 0, 0, 0],
  })
  const tie = resultFixture(source, {
    id: "tie-five-pictures",
    frame: base,
    counts: [3, 3, 0, 0, 0],
  })
  const rotated = structuredClone(tie.frame)
  rotated.presentation.answerVisuals = tie.frame.presentation.answerVisuals.map(
    (visual, index, all) => ({
      ...visual,
      url: all[(index + 1) % all.length].url,
      alt: all[(index + 1) % all.length].alt,
    }),
  )
  const media = resultFixture(source, {
    id: "media-swap-same-composition",
    frame: rotated,
    counts: [3, 3, 0, 0, 0],
  })
  assert.equal(media.expected.compositionSha256, tie.expected.compositionSha256)
  const imageOnly = structuredClone(tie.frame)
  imageOnly.presentation.answerVisuals =
    imageOnly.presentation.answerVisuals.map((visual) => ({
      ...visual,
      display: "image",
    }))
  const motionFrame = structuredClone(tie.frame)
  motionFrame.inventory.context.reducedMotion = false
  assert(motionFrame.content.kind === "question")

  if (motionFrame.theme.id === "razzia-original") {
    motionFrame.content.visualSettings =
      nativePreviewVisualSettingsV2Schema.parse({
        ...motionFrame.content.visualSettings,
        stageAnimations: {
          ...motionFrame.content.visualSettings.stageAnimations,
          resultsRevealEntrance: {
            preset: "fade",
            durationMs: 800,
            timing: "sequential",
            staggerMs: 90,
          },
        },
      })
  }

  const motion = resultFixture(source, {
    id: "native-motion-same-pictures",
    frame: motionFrame,
    counts: [3, 3, 0, 0, 0],
  })
  assert.equal(motion.expected.mediaSha256, tie.expected.mediaSha256)

  return [
    zero,
    tie,
    media,
    resultFixture(source, {
      id: "image-only-five-pictures",
      frame: imageOnly,
      counts: [3, 3, 0, 0, 0],
    }),
    {
      ...motion,
      expected: {
        ...motion.expected,
        motion:
          motionFrame.theme.id === "razzia-original"
            ? "native-motion-and-razzia-fade"
            : "native-motion-enabled",
      },
    },
  ]
}

const sceneDefinitions = [
  {
    id: "leaderboard-empty",
    kind: "leaderboard",
    title: "Synthetic leaderboard - no scores",
  },
  {
    id: "interim-results-empty",
    kind: "interimResults",
    title: "Synthetic interim results - no votes",
  },
  {
    id: "answer-recap-empty",
    kind: "answerRecap",
    title: "Synthetic answer recap - no responses",
    mode: "mostSelected",
    maxItemsPerPage: 4,
    showCounts: true,
    showPercentages: true,
  },
  {
    id: "countdown-three-seconds",
    kind: "countdown",
    title: "Synthetic countdown",
    durationSeconds: 3,
  },
  {
    id: "animation-interlude",
    kind: "animation",
    title: "Synthetic interlude",
    preset: "interlude",
    durationMs: 3000,
  },
  {
    id: "animation-spotlight",
    kind: "animation",
    title: "Synthetic spotlight",
    preset: "spotlight",
    durationMs: 3000,
  },
] as const

/** Exact declared scene kinds only; empty states do not imply real scoring or all-preset parity. */
export function createAdditionalNativeSceneFixtures(
  raw: FullShowFrameV3,
): readonly NativeParityFixture[] {
  const source = checkedSource(raw)

  return sceneDefinitions.map(({ id, ...definition }) => {
    const digest = hashJson({ scope: "renderer-only-synthetic-fixture", id })
    const scene = fullShowSceneV3Schema.parse({
      ...definition,
      id: `preview-scene-${digest}`,
      advance: "manual",
    })
    sceneConfigSchema.parse({
      ...scene,
      id: "00000000-0000-4000-8000-000000000001",
    })
    const cardId = `preview-card-${digest}`
    const chapterId = `${cardId}:${scene.kind}`
    const frame = fullShowFrameV3Schema.parse({
      ...source,
      inventory: {
        ...source.inventory,
        title: "Synthetic renderer scene fixture",
        selectedChapterId: chapterId,
        chapters: [
          {
            id: chapterId,
            cardId,
            index: 0,
            kind: scene.kind,
            cardOrdinal: 1,
            questionOrdinal: null,
            duration: { kind: "manual" },
          },
        ],
      },
      content: { kind: "scene", scene },
      presentation: { ...source.presentation, answerVisuals: [] },
    })

    return seal(source, frame, {
      id,
      expected: {
        sceneKind: scene.kind,
        sceneTitle: scene.title,
        ...(scene.preset ? { scenePreset: scene.preset } : {}),
        emptySceneData: true,
      },
    })
  })
}
