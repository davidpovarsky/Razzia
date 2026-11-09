// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import * as spec from "./motion-spec"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../..")
const canonical = readFileSync(
  resolve(
    root,
    "docs/extensions/references/TADAZZ_Motion_Showcase_One_Click_20261105.html",
  ),
  "utf8",
)
// Script source of the reference TadazzMotion class (first <script> block).
const script = canonical.slice(
  canonical.indexOf("<script>"),
  canonical.indexOf("</script>"),
)

describe("TADAZZ motion spec — 1:1 parity with the canonical reference", () => {
  it("easings are verbatim", () => {
    expect(script).toContain(`const EASE = '${spec.EASE}'`)
    expect(script).toContain(`const SPRING = '${spec.SPRING}'`)
  })

  it.each([
    // [reference source fragment, spec value it pins]
    [
      "{duration:630,easing:SPRING}",
      spec.QUESTION_PANEL_ENTER.timing.duration === 630,
    ],
    [
      "{duration:720,delay:180+i*115,easing:SPRING}",
      spec.CARD_ENTER.delay(2) === 180 + 2 * 115,
    ],
    [
      "translateY(95px) scale(.88) rotateX(-9deg)",
      spec.CARD_ENTER.frames[0].transform ===
        "translateY(95px) scale(.88) rotateX(-9deg)",
    ],
    [
      "translateY(-6px) scale(1.025) rotateX(0)",
      spec.CARD_ENTER.frames[1].transform ===
        "translateY(-6px) scale(1.025) rotateX(0)",
    ],
    ["},70);", spec.VOTE_TIMER_TICK_MS === 70],
    [
      "{duration:530,delay:i*40}",
      spec.CARD_LOCK.delay(3) === 120 && spec.CARD_LOCK.duration === 530,
    ],
    [
      "{duration:550,delay:250+i*85}",
      spec.RESULT_NUMBER_ENTER.delay(1) === 335,
    ],
    [
      "{duration:1050,delay:380+i*55,easing:'cubic-bezier(.21,.77,.16,1)'}",
      spec.RESULT_FILL.easing === "cubic-bezier(.21,.77,.16,1)",
    ],
    ["1050,380+i*55", spec.RESULT_COUNT.duration === 1050],
    [
      "{duration:680,delay:80*j,easing:SPRING}",
      spec.WINNER_SPRING.delay(2) === 160,
    ],
    [
      "translateY(-17px) scale(1.04)",
      spec.WINNER_SPRING.frames[1].transform ===
        "translateY(-17px) scale(1.04)",
    ],
    [
      "{duration:600,delay:i*105,easing:SPRING}",
      spec.LEADER_ROW_ENTER.delay(2) === 210,
    ],
    ["750,140+i*105", spec.LEADER_SCORE_ENTER.delay(1) === 245],
    [
      "{duration:820,delay:i*55,easing:SPRING}",
      spec.LEADER_ROW_MOVE.duration === 820,
    ],
    [":130;", spec.LEADER_ROW_MOVE.newRowOffset === 130],
    ["820,i*50", spec.LEADER_SCORE_MOVE.delay(2) === 100],
    [
      "{duration:590,easing:'cubic-bezier(.75,0,.18,1)'}",
      spec.WIPE.approachDuration === 590,
    ],
    ["{duration:180}", spec.WIPE.wordDuration === 180],
    ["{opacity:.42}", spec.WIPE.flash[1].opacity === 0.42],
    ["{duration:260}", spec.WIPE.flashDuration === 260],
    ["?0:140", spec.WIPE.coveredHoldMs === 140],
    [
      "{duration:600,easing:'cubic-bezier(.78,.02,.27,1)'}",
      spec.WIPE.exitDuration === 600,
    ],
    ["{duration:270}", spec.WIPE.wordOutDuration === 270],
    ["{duration:1320,easing:SPRING}", spec.INTRO.logoDuration === 1320],
    [
      "{duration:980,delay:450,easing:'cubic-bezier(.2,.7,.2,1)'}",
      spec.INTRO.shockDelay === 450,
    ],
    ["{duration:1090,easing:SPRING}", spec.FINALE.logoDuration === 1090],
    ["{duration:520,delay:420}", spec.FINALE.headlineDelay === 420],
    ["{duration:940,delay:550,easing:SPRING}", spec.FINALE.nameDelay === 550],
    ["{duration:500,delay:940}", spec.FINALE.scoreDelay === 940],
    ["i<52", spec.FINALE.confettiCount === 52],
    ["2650+(i%7)*210", spec.confettiBit(3).duration === 2650 + 3 * 210],
    ["370+(i%9)*50", spec.confettiBit(10).delay === 370 + 1 * 50],
    [
      "qLen>102?'41px':qLen>58?'49px':'61px'",
      spec.questionFontSize("x".repeat(103)) === "41px" &&
        spec.questionFontSize("x".repeat(59)) === "49px",
    ],
    [
      "labelLen>20?' very-long':labelLen>=12?' long':''",
      spec.cardLengthClass("x".repeat(21)) === "very-long" &&
        spec.cardLengthClass("x".repeat(12)) === "long",
    ],
  ])("reference contains %s and the port matches", (fragment, matches) => {
    expect(script).toContain(fragment)
    expect(matches).toBe(true)
  })

  it("confetti colours are verbatim", () => {
    expect(script).toContain(
      `const colors=['#efff3d','#5dbaff','#e888f8','#ffc668','#fff8ee'];`,
    )
    expect(spec.FINALE.confettiColors).toEqual([
      "#efff3d",
      "#5dbaff",
      "#e888f8",
      "#ffc668",
      "#fff8ee",
    ])
  })

  it("keeps the canonical five-card geometry and centres fewer cards at the same width", () => {
    expect(spec.CARD_WIDTH).toBeCloseTo((1920 - 246 - 96) / 5)
    expect(spec.cardsRowInsets(5)).toEqual({ left: 123, right: 123 })
    const three = spec.cardsRowInsets(3)
    expect(three.left).toBeCloseTo(three.right)
    expect(1920 - three.left - three.right).toBeCloseTo(
      3 * spec.CARD_WIDTH + 2 * 24,
    )
  })

  it("timer keeps the reference 00:ss format and extends to minutes", () => {
    expect(spec.formatTimer(29.2)).toBe("00:30")
    expect(spec.formatTimer(0)).toBe("00:00")
    expect(spec.formatTimer(75)).toBe("01:15")
  })

  it("ported stylesheet and extracted assets have not drifted from the reference", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [resolve(root, "scripts/tadazz/extract-motion-assets.mjs"), "--check"],
        { cwd: root, stdio: "pipe" },
      ),
    ).not.toThrow()
  })

  it("ported stylesheet keeps every canonical tz-* rule used by the stage", () => {
    const css = readFileSync(resolve(here, "tadazz-motion-kit.css"), "utf8")
    for (const cls of [
      ".tz-stage",
      ".tz-backdrop",
      ".tz-ambient",
      ".tz-question-panel",
      ".tz-question-text",
      ".tz-cards",
      ".tz-card",
      ".tz-photo-frame",
      ".tz-card-label",
      ".tz-statusbar",
      ".tz-result-track",
      ".tz-result-fill",
      ".tz-result-number",
      ".tz-winner-tag",
      ".tz-leader-row",
      ".tz-wipe",
      ".tz-confetti",
      ".tz-intro-logo",
      ".tz-win-name",
    ]) {
      expect(css).toContain(cls)
    }
    expect(css).not.toContain("tz-demo-controls")
    expect(css).not.toContain("base64")
  })
})
