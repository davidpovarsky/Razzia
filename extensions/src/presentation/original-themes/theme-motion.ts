import type { OriginalThemeId } from "../../core/show-themes/original-theme-families"

/**
 * Visual strategies only. The shared motion owner still schedules every cue,
 * answer admission, deadline, pause, replay and cleanup. These transforms never
 * create a timer or another animation owner.
 */
const entrances: Record<
  OriginalThemeId,
  { question: string; answer: string; ease: string }
> = {
  "family-mixup": {
    question: "translate3d(0,26px,0)",
    answer: "translate3d(0,24px,0)",
    ease: "cubic-bezier(.2,.8,.2,1)",
  },
  "royal-quiz": {
    question: "translate3d(0,42px,0) scale(.985)",
    answer: "translate3d(0,34px,0) rotateX(-9deg)",
    ease: "cubic-bezier(.16,.84,.24,1)",
  },
  "neon-arcade": {
    question: "translate3d(-48px,0,0) scaleX(.96)",
    answer: "translate3d(85px,0,0) skewX(-5deg)",
    ease: "cubic-bezier(.12,.96,.2,1)",
  },
  "retro-tv": {
    question: "scale(.94) rotate(-1deg)",
    answer: "perspective(900px) rotateX(-55deg) translateY(12px)",
    ease: "cubic-bezier(.22,1.1,.42,1)",
  },
  "magic-storybook": {
    question: "perspective(1400px) rotateY(-9deg)",
    answer: "translate3d(24px,35px,0) rotate(-3deg)",
    ease: "cubic-bezier(.22,.82,.24,1)",
  },
  "crystal-future": {
    question: "translate3d(0,22px,0) scale(.97)",
    answer: "translate3d(0,40px,0) scale(.92)",
    ease: "cubic-bezier(.2,.7,.25,1)",
  },
  "carnival-pop": {
    question: "translate3d(0,60px,0) rotate(-2deg) scale(.92)",
    answer: "translate3d(0,70px,0) rotate(5deg) scale(.82)",
    ease: "cubic-bezier(.2,1.18,.35,1)",
  },
  "sports-arena": {
    question: "translate3d(-110px,0,0) skewX(-8deg)",
    answer: "translate3d(120px,0,0)",
    ease: "cubic-bezier(.14,.94,.18,1)",
  },
  "mystery-noir": {
    question: "translate3d(0,18px,0)",
    answer: "translate3d(22px,0,0)",
    ease: "cubic-bezier(.25,.6,.3,1)",
  },
}

export const originalThemeSparkColors: Record<
  OriginalThemeId,
  readonly string[]
> = {
  "family-mixup": ["#2549c7", "#f58b2b", "#ffd76a"],
  "royal-quiz": ["#efce87", "#fff4d8", "#af874a"],
  "neon-arcade": ["#62f3e6", "#ed7cff", "#719aff"],
  "retro-tv": ["#ffb568", "#f9dfb0", "#8ad0bc"],
  "magic-storybook": ["#f5d992", "#b8d4ac", "#fff1c9"],
  "crystal-future": ["#b4f6ff", "#e5f2ff", "#a4bcff"],
  "carnival-pop": ["#ffe179", "#ff93bf", "#8ae2da"],
  "sports-arena": ["#ff8578", "#8cbcff", "#f1f5fb"],
  "mystery-noir": ["#d4af7b", "#e9ddc7", "#9e8b6c"],
}

export function originalThemeMotion(
  family: OriginalThemeId | undefined,
  node: Element,
  frames: Keyframe[],
): { frames: Keyframe[]; easing?: string } {
  if (!family) {
    return { frames }
  }

  const profile = entrances[family]
  const entering = frames[0]?.opacity === 0

  // Only an actual entrance is substituted. Selection/reveal animations retain
  // their shared state transitions and can never re-enter a retained question.
  if (
    entering &&
    node.matches(
      ".q-frame, .photo-question-panel, .interlude-title, .leader-head, .spotlight-name",
    )
  ) {
    return {
      frames: [
        { opacity: 0, transform: profile.question },
        { opacity: 1, transform: "none" },
      ],
      easing: profile.ease,
    }
  }

  if (entering && node.matches(".choice-slot, .photo-option, .team-row")) {
    return {
      frames: [
        { opacity: 0, transform: profile.answer },
        { opacity: 1, transform: "none" },
      ],
      easing: profile.ease,
    }
  }

  if (!entering && node.matches(".choice-slot")) {
    // Narrow ledger/ticket rows cannot lift into the preceding answer. Result
    // emphasis uses the same timed opacity/outline and the shared progress fill.
    return { frames: frames.map((frame) => ({ ...frame, transform: "none" })) }
  }

  // Every world docks its clock at the same admitted frame. The shared sweep
  // remains untouched; a flying clock must not cover a newly admitted answer.
  if (node.matches(".countdown-floater")) {
    return {
      frames: [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "none" },
      ],
      easing: profile.ease,
    }
  }

  return { frames }
}
