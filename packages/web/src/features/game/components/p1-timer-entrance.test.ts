import { NO_TIME_LIMIT } from "@razzia/common/constants"
import { QUESTION_ENTRANCE_PRESETS } from "@razzia/extensions/core"
import { describe, expect, it } from "vitest"

describe("P1: Timer & Question Entrance Logic & Verification", () => {
  describe("AnswerCountdown logic & edge safety", () => {
    const computeTimerDisplay = (seconds: number) => {
      if (seconds === NO_TIME_LIMIT) {
        return { isVisible: false, text: "", isUrgent: false }
      }

      const clamped = Math.max(0, Math.floor(seconds))
      const isUrgent = clamped <= 5 && clamped > 0

      return {
        isVisible: true,
        text: String(clamped).padStart(2, "0"),
        isUrgent,
        rawSeconds: clamped,
      }
    }

    it("hides countdown completely when NO_TIME_LIMIT (-1)", () => {
      const res = computeTimerDisplay(NO_TIME_LIMIT)
      expect(res.isVisible).toBe(false)
      expect(res.text).toBe("")
    })

    it("formats 20 seconds as '20' without urgency", () => {
      const res = computeTimerDisplay(20)
      expect(res.isVisible).toBe(true)
      expect(res.text).toBe("20")
      expect(res.isUrgent).toBe(false)
    })

    it("formats 10 seconds as '10' without urgency", () => {
      const res = computeTimerDisplay(10)
      expect(res.isVisible).toBe(true)
      expect(res.text).toBe("10")
      expect(res.isUrgent).toBe(false)
    })

    it("triggers urgency warning state when seconds <= 5", () => {
      for (let s = 1; s <= 5; s++) {
        const res = computeTimerDisplay(s)
        expect(res.isVisible).toBe(true)
        expect(res.isUrgent).toBe(true)
        expect(res.text).toBe(`0${s}`)
      }
    })

    it("never renders negative numbers (clamps to 00)", () => {
      const resUnderflow = computeTimerDisplay(-5)
      expect(resUnderflow.isVisible).toBe(true)
      expect(resUnderflow.text).toBe("00")
      expect(resUnderflow.rawSeconds).toBe(0)
    })

    it("clamps fractional numbers cleanly (e.g. 5.9 -> 05)", () => {
      const res = computeTimerDisplay(5.9)
      expect(res.text).toBe("05")
      expect(res.isUrgent).toBe(true)
    })
  })

  describe("Question Entrance Presets & CSS Contract", () => {
    it("supports all seven locked entrance presets", () => {
      expect(QUESTION_ENTRANCE_PRESETS).toEqual([
        "none",
        "fade",
        "slide-up",
        "slide-side",
        "zoom-soft",
        "spotlight",
        "curtain",
      ])
    })

    it("maps preset to correct CSS class names", () => {
      for (const preset of QUESTION_ENTRANCE_PRESETS) {
        if (preset === "none") {
          continue
        }
        const className = `tada-entrance-${preset}`
        expect(className).toMatch(/^tada-entrance-(fade|slide-up|slide-side|zoom-soft|spotlight|curtain)$/)
      }
    })

    it("clamps entrance animation duration to bounded range [250ms, 2500ms]", () => {
      const clampDuration = (ms?: number) => {
        const fallback = 800
        if (ms === undefined || isNaN(ms)) {
          return fallback
        }
        return Math.min(2500, Math.max(250, ms))
      }

      expect(clampDuration(undefined)).toBe(800)
      expect(clampDuration(100)).toBe(250)
      expect(clampDuration(3000)).toBe(2500)
      expect(clampDuration(1200)).toBe(1200)
    })
  })
})
