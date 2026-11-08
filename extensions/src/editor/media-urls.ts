// oxlint-disable typescript/no-unnecessary-condition -- Preserve defensive guards for historical sidecars.
import type { Question } from "@razzia/common/types/game"
import { isQuizExtrasV2, type AnyQuizExtras } from "../core/index"

export function collectEditorMediaUrls(
  questions: ReadonlyArray<Pick<Question, "media">>,
  extras: AnyQuizExtras | null,
): Set<string> {
  const urls = new Set<string>()

  for (const q of questions) {
    if (q.media?.url) {
      urls.add(q.media.url)
    }
  }

  if (extras) {
    for (const pq of Object.values(extras.perQuestion ?? {})) {
      if (!pq) {
        continue
      }

      if (pq.background?.url) {
        urls.add(pq.background.url)
      }

      if (pq.interlude?.url) {
        urls.add(pq.interlude.url)
      }

      for (const av of pq.answerVisuals ?? []) {
        if (av.url) {
          urls.add(av.url)
        }
      }

      if (pq.audioCues?.showQuestion?.url) {
        urls.add(pq.audioCues.showQuestion.url)
      }

      if (pq.audioCues?.answersMusic?.url) {
        urls.add(pq.audioCues.answersMusic.url)
      }

      if (pq.audioCues?.revealResults?.url) {
        urls.add(pq.audioCues.revealResults.url)
      }
    }

    if (isQuizExtrasV2(extras)) {
      for (const scene of Object.values(extras.scenes ?? {})) {
        if (!scene) {
          continue
        }

        if ("mediaUrl" in scene && typeof scene.mediaUrl === "string") {
          urls.add(scene.mediaUrl)
        }

        if (scene.background?.url) {
          urls.add(scene.background.url)
        }

        if (scene.audio?.url) {
          urls.add(scene.audio.url)
        }
      }
    }

    for (const cue of Object.values(extras.audio?.cues ?? {})) {
      if (cue?.url) {
        urls.add(cue.url)
      }
    }

    for (const cat of extras.mediaCatalog ?? []) {
      if (cat.url) {
        urls.add(cat.url)
      }
    }
  }

  return urls
}
