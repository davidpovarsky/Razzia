import { describe, expect, it } from "vitest"
import { questionMediaValidator } from "./quizz"

describe("bundled first-party question media", () => {
  it("accepts local family images and clips through the native question contract", () => {
    for (const [type, url] of [
      ["image", "/tadazz-show/family-mixup/media/duck.png"],
      ["video", "/tadazz-show/family-mixup/media/cups-observe.mp4"],
    ]) {
      expect(questionMediaValidator.safeParse({ type, url }).success).toBe(true)
    }
  })
  it("rejects traversal, encoded traversal, backslashes and non-bundled paths", () => {
    for (const url of [
      "/tadazz-show/../secret",
      "/tadazz-show/%2e%2e/secret",
      "/tadazz-show/%252e%252e/secret",
      "/tadazz-show/dir\\file.png",
      "/tadazz-show/./file.png",
      "/other/file.png",
      "/tadazz-show/image.png?unsafe=1",
    ]) {
      expect(
        questionMediaValidator.safeParse({ type: "image", url }).success,
        url,
      ).toBe(false)
    }
  })
})
