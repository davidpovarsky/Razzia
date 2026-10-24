import { describe, expect, it } from "vitest"
import { calculateRevealProgress, isValidAnswerVisual } from "./index"

describe("MEDIA Acceptance Cases & Unit Tests", () => {
  describe("MEDIA01 & MEDIA02: Answer Visual Validation & Accessibility", () => {
    it("MEDIA01: valid image-only answer passes validation and retains required fields", () => {
      const validVisual = {
        answerIndex: 0,
        display: "image" as const,
        url: "/media/cat.jpg",
        alt: "A cute orange tabby cat",
      }

      expect(isValidAnswerVisual(validVisual)).toBe(true)
    })

    it("MEDIA02: image answer missing alt is rejected", () => {
      const missingAlt = {
        answerIndex: 0,
        display: "image" as const,
        url: "/media/cat.jpg",
        // Whitespace only
        alt: "   ",
      }

      expect(isValidAnswerVisual(missingAlt)).toBe(false)
    })

    it("MEDIA02: image answer with javascript: URL is rejected", () => {
      const xssVisual = {
        answerIndex: 1,
        display: "image" as const,
        url: ["java", "script:alert(1)"].join(""),
        alt: "Malicious payload",
      }

      expect(isValidAnswerVisual(xssVisual)).toBe(false)
    })

    it("MEDIA02: data: and file: URLs are also rejected", () => {
      const dataUriVisual = {
        answerIndex: 0,
        display: "image" as const,
        url: "data:image/png;base64,iVBORw0KGgo=",
        alt: "Data URI test",
      }

      const fileUriVisual = {
        answerIndex: 0,
        display: "both" as const,
        url: "file:///etc/passwd",
        alt: "File URL test",
      }

      expect(isValidAnswerVisual(dataUriVisual)).toBe(false)
      expect(isValidAnswerVisual(fileUriVisual)).toBe(false)
    })

    it("accepts valid HTTPS external URLs", () => {
      const httpsVisual = {
        answerIndex: 2,
        display: "both" as const,
        url: "https://example.com/images/quiz.png",
        alt: "External secure image",
      }

      expect(isValidAnswerVisual(httpsVisual)).toBe(true)
    })
  })

  describe("MEDIA03: Synchronized Reveal Calculation", () => {
    it("returns 1.0 (fully revealed) when serverStartedAt is undefined", () => {
      expect(calculateRevealProgress(undefined, 2000)).toBe(1.0)
    })

    it("calculates exact progress during the animation window", () => {
      const startedAt = 10000
      const durationMs = 4000

      // At start (elapsed = 0ms) -> progress = 0.0
      expect(calculateRevealProgress(startedAt, durationMs, 10000)).toBe(0.0)

      // Halfway (elapsed = 2000ms) -> progress = 0.5
      expect(calculateRevealProgress(startedAt, durationMs, 12000)).toBe(0.5)

      // Three quarters (elapsed = 3000ms) -> progress = 0.75
      expect(calculateRevealProgress(startedAt, durationMs, 13000)).toBe(0.75)
    })

    it("MEDIA03: if client reconnects after durationMs has elapsed, progress is 1.0 (no replay)", () => {
      const startedAt = 10000
      const durationMs = 3000

      // Reconnect at 15000ms (5000ms elapsed > 3000ms duration)
      const reconnectNow = 15000
      expect(calculateRevealProgress(startedAt, durationMs, reconnectNow)).toBe(
        1.0,
      )
    })

    it("handles future startedAt cleanly (progress 0.0, no negative value)", () => {
      const startedAt = 20000
      const durationMs = 2000
      // Client clock slightly behind or future start
      const clockSkewNow = 19000

      expect(calculateRevealProgress(startedAt, durationMs, clockSkewNow)).toBe(
        0.0,
      )
    })
  })
})
