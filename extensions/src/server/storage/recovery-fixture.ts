import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  quizExtrasV2Schema,
} from "../../core/index"
import {
  getSidecarFilePath,
  writeSidecar,
  type StorageInjections,
} from "./sidecar"

export const QUESTION_ID = "00000000-0000-4000-8000-000000000001"

const SCENE_ID = "00000000-0000-4000-8000-000000000002"
const ITEM_ID = "00000000-0000-4000-8000-000000000003"

export const MEDIA_NAME = "synthetic.png"

export function createRecoveryFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "tadazz-recovery-synthetic-"),
  )
  const getPath = (subPath = "") => path.join(root, subPath)
  fs.mkdirSync(getPath("quizz"), { recursive: true })
  fs.mkdirSync(getPath("media"), { recursive: true })
  const basePath = (id: string) => getPath(`quizz/${id}.json`)
  const injections: StorageInjections = {
    getPath,
    getQuizzById: (id): unknown =>
      JSON.parse(fs.readFileSync(basePath(id), "utf8")),
    saveQuizz: (data) => {
      const id = crypto.randomUUID()
      fs.writeFileSync(basePath(id), JSON.stringify(data))

      return { id }
    },
    updateQuizz: (id, data) => {
      fs.writeFileSync(basePath(id), JSON.stringify(data))

      return { id }
    },
    deleteQuizz: (id) => {
      if (fs.existsSync(basePath(id))) {
        fs.unlinkSync(basePath(id))
      }
    },
  }
  function seed(id: string, referenced = true) {
    const base = {
      gameMode: "quiz",
      subject: `Synthetic ${id}`,
      questions: [
        {
          type: "single",
          question: "Synthetic question",
          answers: ["A", "B"],
          solutions: [0],
          time: 20,
          cooldown: 3,
          ...(referenced
            ? { media: { type: "image", url: `/media/${MEDIA_NAME}` } }
            : {}),
        },
      ],
    }
    const extras = createDefaultQuizExtrasV2(
      id,
      [QUESTION_ID],
      computeCanonicalBaseDigest(base),
    )
    extras.authoring = { showNote: 'Synthetic note\nquoted "content"' }
    extras.scenes[SCENE_ID] = {
      id: SCENE_ID,
      kind: "opening",
      title: "Synthetic opening",
      durationMs: 2500,
      advance: "manual",
      background: {
        url: "/media/back.png",
        fit: "cover",
        position: "center",
        overlayOpacity: 0.2,
      },
      audio: {
        mode: "custom",
        url: "/media/cue.mp3",
        volume: 0.4,
        loop: false,
      },
    }
    extras.timeline.unshift({ id: ITEM_ID, kind: "opening", sceneId: SCENE_ID })
    extras.perQuestion[QUESTION_ID] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "both",
          url: "/media/answer.png",
          alt: "Synthetic answer",
        },
      ],
      background: {
        url: "/media/back.png",
        fit: "contain",
        position: "center",
        overlayOpacity: 0.3,
      },
      questionEntrance: { preset: "fade", durationMs: 800 },
      reveal: {
        effect: "blur",
        durationMs: 1000,
        trigger: "manual",
        audience: "all",
      },
    }
    extras.mediaCatalog = [
      { name: "cue.mp3", url: "/media/cue.mp3", type: "audio", addedAt: 1 },
    ]
    extras.audio.cues.start = {
      source: "media",
      url: "/media/cue.mp3",
      volume: 0.7,
      enabled: true,
      loop: false,
    }
    const validated = quizExtrasV2Schema.parse(extras)
    injections.updateQuizz(id, base)
    writeSidecar(getPath, id, validated)

    return {
      base,
      extras: validated,
      basePath: basePath(id),
      sidecarPath: getSidecarFilePath(getPath, id),
    }
  }

  return { root, getPath, injections, seed, basePath }
}

export function fileDigest(file: string) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

export function removeSyntheticFixture(root: string) {
  const resolved = path.resolve(root)

  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith("tadazz-recovery-synthetic-")
  ) {
    throw new Error(`Refusing cleanup outside synthetic fixture: ${resolved}`)
  }

  fs.rmSync(resolved, { recursive: true, force: true })
}
