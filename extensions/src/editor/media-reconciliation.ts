// oxlint-disable typescript/no-unnecessary-condition -- Preserve historical sidecar cleanup semantics.
import type { UploadedMedia } from "@razzia/common/types/game"
import { isQuizExtrasV2, type AnyQuizExtras } from "../core/index"

/** Preserve the editor's established cleanup semantics after an authorized delete. */
export function reconcileDeletedEditorMedia(
  extras: AnyQuizExtras | null,
  item: UploadedMedia,
): AnyQuizExtras | null {
  if (extras) {
    let hasChanges = false
    const updatedPerQuestion = { ...extras.perQuestion }

    for (const [qId, qItem] of Object.entries(updatedPerQuestion)) {
      const updatedItem = { ...qItem }
      let itemChanged = false

      if (updatedItem.answerVisuals?.some((v) => v.url === item.url)) {
        itemChanged = true
        updatedItem.answerVisuals = updatedItem.answerVisuals.map((v) =>
          v.url === item.url
            ? { ...v, url: undefined, display: "text" as const }
            : v,
        )
      }

      if (updatedItem.interlude?.url === item.url) {
        itemChanged = true
        updatedItem.interlude = {
          ...updatedItem.interlude,
          url: undefined,
        }
      }

      if (updatedItem.background?.url === item.url) {
        itemChanged = true
        delete updatedItem.background
      }

      if (updatedItem.audioCues) {
        const nextCues = { ...updatedItem.audioCues }

        for (const key of [
          "showQuestion",
          "answersMusic",
          "revealResults",
        ] as const) {
          if (nextCues[key]?.url === item.url) {
            itemChanged = true
            nextCues[key] = {
              mode: "inherit",
              volume: nextCues[key]?.volume ?? 0.8,
            }
          }
        }
        updatedItem.audioCues = nextCues
      }

      if (itemChanged) {
        hasChanges = true
        updatedPerQuestion[qId] = updatedItem
      }
    }

    const updatedAudio = { ...extras.audio }
    let audioChanged = false

    for (const [cueId, cueSetting] of Object.entries(updatedAudio.cues)) {
      if (cueSetting.url === item.url) {
        audioChanged = true
        updatedAudio.cues = {
          ...updatedAudio.cues,
          [cueId as keyof typeof updatedAudio.cues]: {
            ...cueSetting,
            source: "default",
            url: undefined,
          },
        }
      }
    }

    const updatedScenes = isQuizExtrasV2(extras)
      ? { ...extras.scenes }
      : undefined
    let scenesChanged = false

    if (updatedScenes) {
      for (const [sId, scene] of Object.entries(updatedScenes)) {
        const nextScene = { ...scene }
        let sChanged = false

        if ("mediaUrl" in nextScene && nextScene.mediaUrl === item.url) {
          if (nextScene.kind === "media") {
            nextScene.mediaUrl = ""
          } else {
            delete (nextScene as { mediaUrl?: string }).mediaUrl
          }

          sChanged = true
        }

        if (nextScene.background?.url === item.url) {
          delete nextScene.background
          sChanged = true
        }

        if (nextScene.audio?.url === item.url) {
          delete nextScene.audio
          sChanged = true
        }

        if (sChanged) {
          scenesChanged = true
          updatedScenes[sId] = nextScene
        }
      }
    }

    const updatedCatalog = extras.mediaCatalog?.filter(
      (c) => c.url !== item.url && c.name !== item.name,
    )
    const catalogChanged =
      (updatedCatalog?.length ?? 0) !== (extras.mediaCatalog?.length ?? 0)

    if (hasChanges || audioChanged || scenesChanged || catalogChanged) {
      return {
        ...extras,
        perQuestion: updatedPerQuestion,
        audio: updatedAudio,
        ...(isQuizExtrasV2(extras) && updatedScenes
          ? { scenes: updatedScenes }
          : {}),
        ...(updatedCatalog ? { mediaCatalog: updatedCatalog } : {}),
      }
    }
  }

  return extras
}
