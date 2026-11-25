import { describe, expect, it } from "vitest"
import {
  calculateAggregatePercentages,
  calculateRevealState,
  easeOutCubic,
} from "./reveal-timeline"

describe("A4: Cinematic Percentage Reveal Timeline & Reducer (Maya V3)", () => {
  const baseOptions = {
    timelineKey: "q1:1:1",
    targetPercentages: { 0: 75, 1: 25, 2: 0, 3: 0 },
    barDurationMs: 800,
    pauseDurationMs: 250,
    startedAt: 10000,
  }

  describe("Timeline Progression", () => {
    it("at t=0ms: bars at 0%, not revealed, stage animating", () => {
      const state = calculateRevealState(baseOptions, 10000)
      expect(state.stage).toBe("animating")
      expect(state.progress).toBe(0)
      expect(state.isRevealed).toBe(false)
      expect(state.displayPercentages[0]).toBe(0)
      expect(state.displayPercentages[1]).toBe(0)
    })

    it("at t=400ms (halfway): smooth cubic ease-out progress, display percentages interpolated", () => {
      const state = calculateRevealState(baseOptions, 10400)
      expect(state.stage).toBe("animating")
      expect(state.isRevealed).toBe(false)
      // Halfway cubic ease-out: 1 - (1 - 0.5)^3 = 0.875
      expect(state.progress).toBeCloseTo(easeOutCubic(0.5), 2)
      expect(state.displayPercentages[0]).toBe(
        Math.round(75 * easeOutCubic(0.5)),
      )
      expect(state.displayPercentages[0]).toBeGreaterThan(0)
      expect(state.displayPercentages[0]).toBeLessThan(75)
    })

    it("at t=800ms: bar animation complete (100% of target), pause stage active, correctness NOT revealed yet", () => {
      const state = calculateRevealState(baseOptions, 10800)
      expect(state.stage).toBe("paused")
      expect(state.progress).toBe(1)
      expect(state.isRevealed).toBe(false)
      expect(state.displayPercentages[0]).toBe(75)
      expect(state.displayPercentages[1]).toBe(25)
    })

    it("at t=1050ms (after 250ms pause): stage revealed, isRevealed is true, final percentages held", () => {
      const state = calculateRevealState(baseOptions, 11050)
      expect(state.stage).toBe("revealed")
      expect(state.progress).toBe(1)
      expect(state.isRevealed).toBe(true)
      expect(state.displayPercentages[0]).toBe(75)
      expect(state.displayPercentages[1]).toBe(25)
    })
  })

  describe("Snapshot & Reconnect Resilience", () => {
    it("reconnect mid-animation (t=500ms): calculates from authoritative startedAt without resetting to 0", () => {
      const state = calculateRevealState(baseOptions, 10500)
      expect(state.stage).toBe("animating")
      expect(state.progress).toBeCloseTo(easeOutCubic(500 / 800), 2)
      expect(state.displayPercentages[0]).toBeGreaterThan(50)
      expect(state.isRevealed).toBe(false)
    })

    it("reconnect late (t=5000ms, past reveal): immediately snaps to revealed state without replay", () => {
      const state = calculateRevealState(baseOptions, 15000)
      expect(state.stage).toBe("revealed")
      expect(state.progress).toBe(1)
      expect(state.isRevealed).toBe(true)
      expect(state.displayPercentages[0]).toBe(75)
      expect(state.displayPercentages[1]).toBe(25)
    })
  })

  describe("Accessibility & Reduced Motion", () => {
    it("reducedMotion=true: immediately snaps to final revealed state without motion", () => {
      // At start timestamp
      const state = calculateRevealState(
        { ...baseOptions, reducedMotion: true },
        10000,
      )
      expect(state.stage).toBe("revealed")
      expect(state.progress).toBe(1)
      expect(state.isRevealed).toBe(true)
      expect(state.displayPercentages[0]).toBe(75)
    })
  })

  describe("Question Types & Aggregate Calculations", () => {
    it("single-choice: percentages sum to 100%", () => {
      // Total 10 votes
      const responses = { 0: 6, 1: 2, 2: 2 }
      const pcts = calculateAggregatePercentages(responses)
      expect(pcts[0]).toBe(60)
      expect(pcts[1]).toBe(20)
      expect(pcts[2]).toBe(20)
      expect(pcts[0] + pcts[1] + pcts[2]).toBe(100)
    })

    it("multiple-choice: percentages calculated per total responders and may exceed 100%", () => {
      // 10 players total; 8 chose opt 0, 7 chose opt 1
      const responses = { 0: 8, 1: 7, 2: 1 }
      const pcts = calculateAggregatePercentages(responses, 10)
      expect(pcts[0]).toBe(80)
      expect(pcts[1]).toBe(70)
      expect(pcts[2]).toBe(10)
      // Totals over 100% permitted for multi-select
      expect(pcts[0] + pcts[1]).toBe(150)
    })

    it("zero responders: handles gracefully without division by zero or NaN", () => {
      const responses = { 0: 0, 1: 0, 2: 0, 3: 0 }
      const pcts = calculateAggregatePercentages(responses, 0)
      expect(pcts[0]).toBe(0)
      expect(pcts[1]).toBe(0)
      expect(pcts[2]).toBe(0)
      expect(pcts[3]).toBe(0)
    })

    it("supports all 3 answer-close triggers: timer natural, everyone answered, host End Timer", () => {
      const triggers = [
        "timer_natural",
        "everyone_answered",
        "end_timer",
      ] as const
      for (const trigger of triggers) {
        const state = calculateRevealState(
          { ...baseOptions, timelineKey: `q1:${trigger}:1` },
          11100,
        )
        expect(state.isRevealed).toBe(true)
        expect(state.displayPercentages[0]).toBe(75)
      }
    })
  })
})
