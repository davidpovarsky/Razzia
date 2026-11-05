import type { ShowScene } from "./presentation-scene"
import type {
  StageLeaderEntry,
  StageMode,
  StageQuestion,
  StageRevealInput,
  StageWinner,
  TadazzStageHandle,
} from "./TadazzStage"

/** One call on the stage handle. The director never invents data. */
export type StageStep =
  | { op: "showIntro" }
  | { op: "showQuestion"; question: StageQuestion }
  | { op: "presentOptions"; question: StageQuestion }
  | { op: "nextQuestion"; question: StageQuestion }
  | { op: "openVoting"; seconds: number | null; deadlineMs?: number }
  | { op: "lockVoting" }
  | { op: "revealResults"; reveal: StageRevealInput }
  | { op: "showLeaderboard"; entries: StageLeaderEntry[] }
  | { op: "updateLeaderboard"; entries: StageLeaderEntry[] }
  | { op: "playZZWipe"; thenCustom: boolean; interlude?: { title: string; subtitle?: string } }
  | { op: "showFinale"; winner: StageWinner | null }
  | { op: "showTopPick"; question?: StageQuestion; counts?: number[]; topIndex?: number | null; emptyMessage?: string }
  | { op: "showRoundRecap"; winners: Array<{ label: string; image?: string; alt?: string }>; round?: number | null; subtitle?: string }
  | { op: "showInterlude"; title: string; subtitle?: string }
  | { op: "custom" }
  | { op: "hold"; ms: number }

export interface StageSnapshot {
  questionKey: string | null
  mode: StageMode
}

/** Hold between the old and the new leaderboard (legacy Razzia timing). */
export const LEADERBOARD_UPDATE_DELAY_MS = 1600

const QUESTION_EXIT_KINDS = new Set(["results", "leaderboard", "player-result", "scene", "interlude"])

const isQuestionScene = (s: ShowScene | null) =>
  s?.kind === "question" || s?.kind === "voting" || s?.kind === "results"

const sameEntries = (a: StageLeaderEntry[], b: StageLeaderEntry[]) =>
  a.length === b.length && a.every((e, i) => e.id === b[i]?.id && e.score === b[i]?.score)

/**
 * Maps an authoritative scene change to the reference animation methods:
 *  question     → showQuestion() | nextQuestion() (ZZ wipe when leaving a previous question)
 *  voting       → presentOptions() + openVoting(server seconds)
 *  results      → lockVoting() (always played) + revealResults(server snapshot)
 *  leaderboard  → showLeaderboard(old) + updateLeaderboard(new)
 *  prepared     → playZZWipe() covering into the branded "Question N" card
 *  finale       → showFinale(real winner | null)
 *  scene kinds  → leaderboard/interimResults/transition/opening/closing as above
 */
export function planTransition(
  prev: ShowScene | null,
  next: ShowScene,
  stage: StageSnapshot,
  now = Date.now(),
): StageStep[] {
  const leavingQuestion =
    prev !== null &&
    (QUESTION_EXIT_KINDS.has(prev.kind) || (isQuestionScene(prev) && "question" in prev && "question" in next && prev.question.key !== (next as { question: StageQuestion }).question.key))

  switch (next.kind) {
    case "question": {
      if (stage.questionKey === next.question.key && (stage.mode === "question" || stage.mode === "voting")) return []
      return [leavingQuestion && stage.mode !== "custom" ? { op: "nextQuestion", question: next.question } : { op: "showQuestion", question: next.question }]
    }
    case "voting": {
      const steps: StageStep[] = []
      const onStage = stage.questionKey === next.question.key && stage.mode !== "custom" && stage.mode !== "leaderboard"
      if (onStage) steps.push({ op: "presentOptions", question: next.question })
      else steps.push(leavingQuestion && stage.mode !== "custom" ? { op: "nextQuestion", question: next.question } : { op: "showQuestion", question: next.question })
      const remaining = next.remainingSeconds ?? next.seconds
      steps.push({
        op: "openVoting",
        seconds: next.seconds,
        deadlineMs: remaining !== null && remaining !== undefined ? now + remaining * 1000 : undefined,
      })
      return steps
    }
    case "results": {
      const steps: StageStep[] = []
      const onStage = stage.questionKey === next.question.key && (stage.mode === "voting" || stage.mode === "question" || stage.mode === "locked" || stage.mode === "results")
      if (!onStage) {
        steps.push({ op: "showQuestion", question: next.question })
      } else {
        steps.push({ op: "presentOptions", question: next.question })
        if (stage.mode === "voting" || stage.mode === "question") steps.push({ op: "lockVoting" })
      }
      if (next.question.options.length > 0) steps.push({ op: "revealResults", reveal: next.reveal })
      return steps
    }
    case "leaderboard": {
      const steps: StageStep[] = []
      const start = next.previous.length > 0 ? next.previous : next.entries
      steps.push(stage.mode === "leaderboard" ? { op: "updateLeaderboard", entries: start } : { op: "showLeaderboard", entries: start })
      if (next.previous.length > 0 && !sameEntries(next.previous, next.entries)) {
        steps.push({ op: "hold", ms: LEADERBOARD_UPDATE_DELAY_MS })
        steps.push({ op: "updateLeaderboard", entries: next.entries })
      }
      return steps
    }
    case "finale":
      return [{ op: "showFinale", winner: next.winner }]
    case "prepared":
      return isQuestionScene(prev) || prev?.kind === "leaderboard" || prev?.kind === "player-result"
        ? [{ op: "playZZWipe", thenCustom: true }]
        : [{ op: "custom" }]
    case "interlude": {
      if (next.interlude.kind === "title" && next.interlude.title) {
        return [{ op: "showInterlude", title: next.interlude.title }]
      }
      return [{ op: "custom" }]
    }
    case "scene":
      return planScene(prev, next, stage)
    case "wait":
      if (isQuestionScene(prev) || stage.mode === "voting" || stage.mode === "question" || Boolean(stage.questionKey)) {
        return []
      }
      return [{ op: "custom" }]
    default:
      return stage.mode === "custom" ? [{ op: "custom" }] : [{ op: "custom" }]
  }
}

function planScene(prev: ShowScene | null, next: Extract<ShowScene, { kind: "scene" }>, stage: StageSnapshot): StageStep[] {
  const { scene, activeSceneData } = next
  switch (scene.kind) {
    case "leaderboard": {
      const entries = (activeSceneData?.leaderboard?.entries ?? []).map((e) => ({
        id: `rank:${e.displayName}`,
        name: e.displayName,
        score: e.points,
      }))
      return [stage.mode === "leaderboard" ? { op: "updateLeaderboard", entries } : { op: "showLeaderboard", entries }]
    }
    case "interimResults": {
      const r = activeSceneData?.interimResults
      if (!r || r.options.length === 0) return [{ op: "custom" }]
      const prevQ = prev && "question" in prev && prev.question.question === r.questionText ? prev.question : null
      const onStage =
        Boolean(stage.questionKey?.startsWith(`${r.questionText}#`)) &&
        (stage.mode === "voting" || stage.mode === "question" || stage.mode === "locked" || stage.mode === "results")
      const question: StageQuestion = {
        key: prevQ?.key ?? (onStage && stage.questionKey ? stage.questionKey : `${r.questionText}#0`),
        question: r.questionText,
        number: prevQ?.number ?? 0,
        totalQuestions: prevQ?.totalQuestions ?? null,
        options: r.options.map((o) => ({ label: o.label, image: o.imageUrl, alt: o.alt || o.label })),
      }
      const steps: StageStep[] = []
      if (!onStage) {
        steps.push({ op: "showQuestion", question })
      } else {
        steps.push({ op: "presentOptions", question })
        if (stage.mode === "voting" || stage.mode === "question") steps.push({ op: "lockVoting" })
      }
      const showPercentages = (scene as { showPercentages?: boolean }).showPercentages
      steps.push({
        op: "revealResults",
        reveal: {
          counts: r.options.map((o) => o.count),
          percentages: r.options.map((o) => o.percentage),
          mode: "survey",
          ...(typeof showPercentages === "boolean" ? { showPercentages } : {}),
        },
      })
      return steps
    }
    case "answerRecap": {
      const recap = activeSceneData?.answerRecap
      const fallbackItems = (scene as { recapItems?: Array<{ label?: string; image?: string; alt?: string }> }).recapItems
      if ((!recap || recap.items.length === 0) && (!fallbackItems || fallbackItems.length === 0)) return [{ op: "custom" }]
      const winners = recap && recap.items.length > 0
        ? recap.items.map((item) => {
            const option = (recap.mode === "correctAnswer" ? item.correctOptions?.[0] : undefined) ?? item.winningOptions[0]
            return {
              label: option ? option.label : item.questionText,
              image: option?.imageUrl,
              alt: option?.alt || option?.label || item.questionText,
            }
          })
        : (fallbackItems ?? []).map((fi) => ({
            label: fi.label ?? "",
            image: fi.image,
            alt: fi.alt ?? fi.label,
          }))
      return [{ op: "showRoundRecap", winners, subtitle: scene.subtitle }]
    }
    case "interlude":
      return [{ op: "showInterlude", title: scene.title ?? "INTERLUDE", subtitle: scene.subtitle ?? scene.description }]
    case "transition":
      return [
        scene.title
          ? { op: "playZZWipe", thenCustom: true, interlude: { title: scene.title, subtitle: scene.subtitle ?? scene.description } }
          : { op: "playZZWipe", thenCustom: true },
      ]
    case "animation": {
      const preset = (scene as { preset?: string }).preset
      const r = activeSceneData?.interimResults
      if (preset === "top-pick" || preset === "most-chosen" || preset === "spotlight") {
        const prevQ = prev && "question" in prev ? prev.question : undefined
        const question: StageQuestion | undefined = r
          ? {
              key: prevQ?.key ?? `${r.questionText}#0`,
              question: r.questionText,
              number: prevQ?.number ?? 1,
              totalQuestions: prevQ?.totalQuestions ?? null,
              options: r.options.map((o) => ({ label: o.label, image: o.imageUrl, alt: o.alt || o.label })),
            }
          : prevQ
        const counts = r ? r.options.map((o) => o.count) : undefined
        return [{ op: "showTopPick", question, counts, emptyMessage: scene.subtitle ?? scene.description }]
      }
      if (scene.title) {
        return [{ op: "showInterlude", title: scene.title, subtitle: scene.subtitle ?? scene.description }]
      }
      return [{ op: "custom" }]
    }
    case "opening":
    case "closing":
    case "media":
      if (scene.mediaUrl || scene.lottieUrl || (scene.overlayAnimations?.length ?? 0) > 0) return [{ op: "custom" }]
      if (scene.kind === "opening") return [{ op: "showIntro" }]
      if (scene.kind === "closing") {
        const winner = topWinner(activeSceneData?.leaderboard?.entries)
        return [{ op: "showFinale", winner }]
      }
      return [{ op: "custom" }]
    default:
      return prev?.kind === "voting" || prev?.kind === "results" ? [{ op: "playZZWipe", thenCustom: true }] : [{ op: "custom" }]
  }
}

function topWinner(entries: Array<{ displayName: string; points: number }> | undefined): StageWinner | null {
  const sorted = [...(entries ?? [])].sort((a, b) => b.points - a.points)
  const best = sorted[0]
  if (!best || !(best.points > 0)) return null
  return { name: sorted.filter((e) => e.points === best.points).map((e) => e.displayName).join(" & "), score: best.points }
}

/**
 * Resume after refresh/reconnect: render the CURRENT authoritative state
 * without replaying history (no lock flash, no old→new leaderboard race,
 * no holds). Remaining steps run with reduced motion by the caller.
 */
export function collapseForResume(steps: StageStep[]): StageStep[] {
  const out: StageStep[] = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (step.op === "hold" || step.op === "lockVoting") continue
    if (step.op === "updateLeaderboard" && out.length > 0) {
      const last = out[out.length - 1]
      if (last.op === "showLeaderboard" || last.op === "updateLeaderboard") {
        out[out.length - 1] = { op: last.op, entries: step.entries }
        continue
      }
    }
    if (step.op === "nextQuestion") {
      out.push({ op: "showQuestion", question: step.question })
      continue
    }
    if (step.op === "playZZWipe") {
      const hasFollowUp = i + 1 < steps.length
      if (!hasFollowUp) {
        out.push(step.interlude ? { op: "showInterlude", ...step.interlude } : step.thenCustom ? { op: "custom" } : step)
      }
      continue
    }
    out.push(step)
  }
  return out
}

/** Executes a plan on the stage; returns false if superseded by a newer token. */
export async function runSteps(
  handle: TadazzStageHandle,
  steps: StageStep[],
  isCurrent: () => boolean,
): Promise<boolean> {
  for (const step of steps) {
    if (!isCurrent()) return false
    switch (step.op) {
      case "showIntro":
        await handle.showIntro()
        break
      case "showQuestion":
        await handle.showQuestion(step.question)
        break
      case "presentOptions":
        await handle.presentOptions(step.question)
        break
      case "nextQuestion":
        await handle.nextQuestion(step.question)
        break
      case "openVoting":
        await handle.openVoting(step.seconds, step.deadlineMs)
        break
      case "lockVoting":
        await handle.lockVoting()
        break
      case "revealResults":
        await handle.revealResults(step.reveal)
        break
      case "showLeaderboard":
        await handle.showLeaderboard(step.entries)
        break
      case "updateLeaderboard":
        await handle.updateLeaderboard(step.entries)
        break
      case "playZZWipe": {
        const interlude = step.interlude
        if (interlude && handle.showInterlude) {
          const showInterlude = handle.showInterlude.bind(handle)
          await handle.playZZWipe(() => {
            void showInterlude(interlude)
          })
        } else {
          await handle.playZZWipe(step.thenCustom ? () => handle.showCustomScreen() : undefined)
        }
        break
      }
      case "showFinale":
        await handle.showFinale(step.winner)
        break
      case "showTopPick":
        if (handle.showTopPick) await handle.showTopPick(step)
        else await handle.showCustomScreen()
        break
      case "showRoundRecap":
        if (handle.showRoundRecap) await handle.showRoundRecap(step)
        else await handle.showCustomScreen()
        break
      case "showInterlude":
        if (handle.showInterlude) await handle.showInterlude(step)
        else await handle.showCustomScreen()
        break
      case "custom":
        await handle.showCustomScreen()
        break
      case "hold":
        await new Promise((r) => setTimeout(r, step.ms))
        break
    }
  }
  return isCurrent()
}
