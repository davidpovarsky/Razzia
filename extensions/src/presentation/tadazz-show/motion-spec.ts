/**
 * TADAZZ Motion Kit — motion specification ported 1:1 from the canonical
 * reference `docs/extensions/references/TADAZZ_Motion_Showcase_One_Click_20261105.html`
 * (SHA-256 1eea4698…8669). Every keyframe, duration, delay and easing below is
 * copied verbatim from the reference `TadazzMotion` class; the comment on each
 * entry names the source method. Do not "tune" these values.
 */

export type Keyframes = Array<Record<string, string | number>>

export interface MotionTiming {
  duration: number
  delay?: number
  easing?: string
}

/** `const EASE` */
export const EASE = "cubic-bezier(.15,.82,.20,1)"
/** `const SPRING` */
export const SPRING = "cubic-bezier(.17,1.13,.3,1)"

/** Default timing of `_animate()` */
export const DEFAULT_TIMING: Required<MotionTiming> = {
  duration: 520,
  delay: 0,
  easing: EASE,
}

/** Canonical stage geometry (`.tz-stage`). */
export const STAGE_WIDTH = 1920
export const STAGE_HEIGHT = 1080

export const QUESTION_PANEL_ENTER: { frames: Keyframes; timing: MotionTiming } = {
  // _enterQuestion(): questionPanel
  frames: [
    { opacity: 0, transform: "translateY(-48px) scale(.94)", filter: "blur(10px)" },
    { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0px)" },
  ],
  timing: { duration: 630, easing: SPRING },
}

export const CARD_ENTER = {
  // _enterQuestion(): each card, delay 180 + i * 115
  frames: [
    {
      opacity: 0,
      transform: "translateY(95px) scale(.88) rotateX(-9deg)",
      filter: "brightness(.65)",
    },
    {
      opacity: 1,
      transform: "translateY(-6px) scale(1.025) rotateX(0)",
      filter: "brightness(1)",
    },
    {
      opacity: 1,
      transform: "translateY(0) scale(1) rotateX(0)",
      filter: "brightness(1)",
    },
  ] as Keyframes,
  duration: 720,
  delay: (i: number) => 180 + i * 115,
  easing: SPRING,
}

export const VOTE_TIMER_TICK_MS = 70 // openVoting(): setInterval(…, 70)

export const CARD_LOCK = {
  // lockVoting(): each card, delay i * 40
  frames: [
    { filter: "brightness(1)" },
    { filter: "brightness(.82)" },
    { filter: "brightness(.94)" },
  ] as Keyframes,
  duration: 530,
  delay: (i: number) => i * 40,
}

export const RESULT_NUMBER_ENTER = {
  // revealResults(): card.result, delay 250 + i * 85
  frames: [
    { opacity: 0, transform: "translateY(18px) scale(.8)" },
    { opacity: 1, transform: "translateY(0) scale(1)" },
  ] as Keyframes,
  duration: 550,
  delay: (i: number) => 250 + i * 85,
}

export const RESULT_FILL = {
  // revealResults(): card.fill width 0% → pct, delay 380 + i * 55
  duration: 1050,
  delay: (i: number) => 380 + i * 55,
  easing: "cubic-bezier(.21,.77,.16,1)",
}

export const RESULT_COUNT = {
  // revealResults(): _countNumber(card.result, 0, pct, 1050, 380 + i * 55)
  duration: 1050,
  delay: (i: number) => 380 + i * 55,
}

export const WINNER_SPRING = {
  // revealResults(): each favourite card, delay 80 * j
  frames: [
    { transform: "translateY(0) scale(1)" },
    { transform: "translateY(-17px) scale(1.04)" },
    { transform: "translateY(-10px) scale(1.02)" },
  ] as Keyframes,
  duration: 680,
  delay: (j: number) => 80 * j,
  easing: SPRING,
}

export const LEADER_ROW_ENTER = {
  // showLeaderboard(): each row, delay i * 105
  frames: [
    { opacity: 0, transform: "translateX(110px) scale(.97)" },
    { opacity: 1, transform: "translateX(0) scale(1)" },
  ] as Keyframes,
  duration: 600,
  delay: (i: number) => i * 105,
  easing: SPRING,
}

export const LEADER_SCORE_ENTER = {
  // showLeaderboard(): _animateNumeric(score, 0, score, 750, 140 + i * 105)
  duration: 750,
  delay: (i: number) => 140 + i * 105,
}

export const LEADER_ROW_MOVE = {
  // updateLeaderboard(): FLIP translateY(diff) → 0, delay i * 55; new rows enter from 130px
  newRowOffset: 130,
  frames: (diff: number, existed: boolean): Keyframes => [
    { transform: `translateY(${diff}px)`, opacity: existed ? 1 : 0 },
    { transform: "translateY(0)", opacity: 1 },
  ],
  duration: 820,
  delay: (i: number) => i * 55,
  easing: SPRING,
}

export const LEADER_SCORE_MOVE = {
  // updateLeaderboard(): _animateNumeric(score, prev, next, 820, i * 50)
  duration: 820,
  delay: (i: number) => i * 50,
}

export const WIPE = {
  // _playWipe()
  approachEasing: "cubic-bezier(.75,0,.18,1)",
  approachDuration: 590,
  blueIn: [{ transform: "translateX(-130%)" }, { transform: "translateX(0%)" }] as Keyframes,
  citronIn: [{ transform: "translateX(130%)" }, { transform: "translateX(0%)" }] as Keyframes,
  word: [
    { opacity: 0, transform: "translate(-50%,-50%) scale(.65) rotate(-9deg)" },
    { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(-4deg)" },
  ] as Keyframes,
  wordDuration: 180,
  flash: [{ opacity: 0 }, { opacity: 0.42 }, { opacity: 0 }] as Keyframes,
  flashDuration: 260,
  coveredHoldMs: 140,
  exitEasing: "cubic-bezier(.78,.02,.27,1)",
  exitDuration: 600,
  blueOut: [{ transform: "translateX(0)" }, { transform: "translateX(-135%)" }] as Keyframes,
  citronOut: [{ transform: "translateX(0)" }, { transform: "translateX(135%)" }] as Keyframes,
  wordOut: [{ opacity: 1 }, { opacity: 0 }] as Keyframes,
  wordOutDuration: 270,
}

export const INTRO = {
  // showIntro()
  logoInitial: { opacity: "0", transform: "translateY(100px) scale(.70) rotate(-6deg)" },
  logo: [
    { opacity: 0, transform: "translateY(120px) scale(.67) rotate(-6deg)", filter: "blur(15px)" },
    { opacity: 1, transform: "translateY(-15px) scale(1.04) rotate(1deg)", filter: "blur(0)" },
    { opacity: 1, transform: "translateY(0) scale(1) rotate(0)", filter: "blur(0)" },
  ] as Keyframes,
  logoDuration: 1320,
  shock: [
    { opacity: 0, transform: "translate(-50%,-50%) scale(.20)" },
    { opacity: 0.85, transform: "translate(-50%,-50%) scale(.52)" },
    { opacity: 0, transform: "translate(-50%,-50%) scale(2.7)" },
  ] as Keyframes,
  shockDuration: 980,
  shockDelay: 450,
  shockEasing: "cubic-bezier(.2,.7,.2,1)",
}

export const FINALE = {
  // showFinale()
  logo: [
    { opacity: 0, transform: "translateX(-50%) scale(.73) rotate(-3deg)" },
    { opacity: 1, transform: "translateX(-50%) scale(1.07) rotate(1deg)" },
    { opacity: 1, transform: "translateX(-50%) scale(1) rotate(0deg)" },
  ] as Keyframes,
  logoDuration: 1090,
  headline: [
    { opacity: 0, transform: "translateY(30px)" },
    { opacity: 1, transform: "translateY(0)" },
  ] as Keyframes,
  headlineDuration: 520,
  headlineDelay: 420,
  name: [
    { opacity: 0, transform: "translateY(75px) scale(.86)" },
    { opacity: 1, transform: "translateY(-8px) scale(1.04)" },
    { opacity: 1, transform: "translateY(0) scale(1)" },
  ] as Keyframes,
  nameDuration: 940,
  nameDelay: 550,
  score: [
    { opacity: 0, transform: "translateY(30px)" },
    { opacity: 1, transform: "translateY(0)" },
  ] as Keyframes,
  scoreDuration: 500,
  scoreDelay: 940,
  confettiColors: ["#efff3d", "#5dbaff", "#e888f8", "#ffc668", "#fff8ee"],
  confettiCount: 52,
}

/** showFinale(): deterministic confetti geometry, verbatim formulas. */
export function confettiBit(i: number) {
  const endX = Math.sin(i * 19) * 170
  return {
    background: FINALE.confettiColors[i % FINALE.confettiColors.length],
    left: `${(i * 79.3) % 1920}px`,
    width: `${8 + (i % 4) * 3}px`,
    height: `${12 + (i % 5) * 4}px`,
    frames: [
      { opacity: 0, transform: "translate(0,0) rotate(0)" },
      { opacity: 1, transform: `translate(${endX * 0.38}px,380px) rotate(130deg)` },
      { opacity: 0, transform: `translate(${endX}px,1150px) rotate(${i * 73}deg)` },
    ] as Keyframes,
    duration: 2650 + (i % 7) * 210,
    delay: 370 + (i % 9) * 50,
    easing: "linear",
  }
}

/** _renderQuestion(): question font size by length. */
export function questionFontSize(text: string): string {
  const qLen = text.length
  return qLen > 102 ? "41px" : qLen > 58 ? "49px" : "61px"
}

/** _card(): label length class. */
export function cardLengthClass(label: string): "" | "long" | "very-long" {
  const labelLen = label.length
  return labelLen > 20 ? "very-long" : labelLen >= 12 ? "long" : ""
}

/** Ease used by `_tweenText`: tzEaseOutCubic. */
export const tzEaseOutCubic = (p: number) => 1 - Math.pow(1 - p, 3)

/** `_updateTimer()` format — generalised to mm:ss beyond 59 s (reference: `'00:'+sec`). */
export function formatTimer(secondsLeft: number): string {
  const sec = Math.ceil(Math.max(0, secondsLeft))
  const minutes = Math.floor(sec / 60)
  return `${String(minutes).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`
}

/** Canonical card column geometry for exactly five cards (.tz-cards). */
export const CARDS_LEFT = 123
export const CARDS_GAP = 24
export const CARD_WIDTH = (STAGE_WIDTH - 2 * CARDS_LEFT - 4 * CARDS_GAP) / 5

/**
 * Adaptation for 1–4 options (the reference only defines five): keep the
 * exact canonical card width and gap, and centre the row. Returns the
 * left/right insets in stage pixels.
 */
export function cardsRowInsets(count: number): { left: number; right: number } {
  if (count >= 5 || count <= 0) return { left: CARDS_LEFT, right: CARDS_LEFT }
  const width = count * CARD_WIDTH + (count - 1) * CARDS_GAP
  const inset = (STAGE_WIDTH - width) / 2
  return { left: inset, right: inset }
}
