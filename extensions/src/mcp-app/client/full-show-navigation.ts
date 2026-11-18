import type { FullShowInventoryV3 } from "../contracts/full-show-selection.ts"
import type { FullShowPlaybackSnapshot } from "./full-show-playback.ts"

type Chapter = FullShowInventoryV3["chapters"][number]

/** The transport retains native phases; people navigate authored cards. */
export function fullShowCardNavigation(inventory: FullShowInventoryV3) {
  const cards: Chapter[] = []
  const seen = new Set<string>()
  for (const chapter of inventory.chapters) {
    if (!seen.has(chapter.cardId)) {
      seen.add(chapter.cardId)
      cards.push(chapter)
    }
  }
  const selected = inventory.chapters.find(
    (chapter) => chapter.id === inventory.selectedChapterId,
  )
  const index = selected
    ? cards.findIndex((chapter) => chapter.cardId === selected.cardId)
    : -1

  return {
    cards,
    index,
    selected,
    current: cards[index],
    previous: index > 0 ? cards[index - 1] : undefined,
    next: index >= 0 ? cards[index + 1] : undefined,
  }
}

/** Advance only at authored deadlines observed on the existing native clock. */
export function fullShowAutomaticChapter(
  inventory: FullShowInventoryV3,
  playback: FullShowPlaybackSnapshot,
): Chapter | undefined {
  const navigation = fullShowCardNavigation(inventory)
  const chapter = navigation.selected
  if (
    !chapter ||
    playback.clock.paused ||
    chapter.duration.kind !== "known" ||
    playback.clock.elapsedMs < chapter.duration.milliseconds
  ) {
    return undefined
  }
  if (chapter.kind === "question" || chapter.kind === "voting") {
    // Native voting renders the answer entrance too. The intermediate manual
    // answerCards/voteLocked snapshots remain available to explicit tool calls.
    const kind = chapter.kind === "question" ? "voting" : "results"

    return inventory.chapters.find(
      (candidate) =>
        candidate.cardId === chapter.cardId && candidate.kind === kind,
    )
  }

  return navigation.next
}
