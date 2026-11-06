import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { stripLottieBackgroundPlate } from "./lottie-plate"
import { MotionEngine } from "./motion-engine"
import {
  TADAZZ_OPENING_SOUNDTRACK_DURATION_MS,
  TADAZZ_OPENING_VIDEO_DURATION_MS,
} from "./TadazzOpening"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")
const load = (name: string) =>
  JSON.parse(
    readFileSync(
      resolve(root, "packages/web/public/tadazz-show/opening", name),
      "utf8",
    ),
  ) as Record<string, unknown>

describe("opening Lottie overlay", () => {
  it("uses the verified 7.933 second visual boundary and independent 12 second music boundary", () => {
    expect(TADAZZ_OPENING_VIDEO_DURATION_MS).toBe(7933)
    expect(TADAZZ_OPENING_SOUNDTRACK_DURATION_MS).toBe(12000)
  })

  it("keeps the source MP4 audio permanently muted in the opening component", () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "TadazzOpening.tsx"),
      "utf8",
    )
    expect(source).toContain("video.defaultMuted = true")
    expect(source).toContain("video.muted = true")
    expect(source).toContain("video.volume = 0")
    expect(source).not.toContain("video.muted = false")
  })

  it("removes only the opaque full-canvas plate of TADAZZ-Opening-4-5s.json", () => {
    const src = load("TADAZZ-Opening-4-5s.json")
    const { data, removed } = stripLottieBackgroundPlate(src)
    expect(removed).toHaveLength(1)
    expect(removed[0].kind).toBe("shape-rect")
    expect(removed[0].color).toEqual([0.043, 0.059, 0.239])
    expect((data.layers as unknown[]).length).toBe(
      (src.layers as unknown[]).length - 1,
    )
    // Original object untouched (served file stays byte-identical).
    expect((src.layers as unknown[]).length).toBe(75)
    expect(data.assets).toBe(src.assets)
  })

  it("handles Scene-1.json the same way (white plate)", () => {
    const { removed } = stripLottieBackgroundPlate(load("Scene-1.json"))
    expect(removed).toHaveLength(1)
    expect(removed[0].color).toEqual([1, 1, 1])
  })

  it("keeps animations that have no plate", () => {
    const { removed, data } = stripLottieBackgroundPlate({
      w: 100,
      h: 100,
      layers: [{ ty: 4, shapes: [{ ty: "el" }] }],
    })
    expect(removed).toHaveLength(0)
    expect((data.layers as unknown[]).length).toBe(1)
  })
})

describe("MotionEngine (port of _animate/_tweenText)", () => {
  const fakeNode = () =>
    ({
      style: {} as Record<string, string>,
      textContent: "",
    }) as unknown as HTMLElement

  it("applies the final keyframe immediately with reduced motion", async () => {
    const engine = new MotionEngine()
    engine.reducedMotion = true
    const node = fakeNode()
    await engine.animate(
      node,
      [{ opacity: 0 }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 500 },
    )
    expect(node.style.opacity).toBe("1")
    expect(node.style.transform).toBe("translateY(0)")
  })

  it("fast-forward (finishAnimations) completes the current sequence only", async () => {
    const engine = new MotionEngine()
    engine.finishAll()
    const node = fakeNode()
    await engine.countPercent(node, 0, 46, 1050, 380)
    expect(node.textContent).toBe("46%")
    engine.reset()
    expect(engine.currentSequence).toBe(1)
  })

  it("formats leaderboard numbers like the reference", async () => {
    const engine = new MotionEngine()
    engine.reducedMotion = true
    const node = fakeNode()
    await engine.countNumber(node, 0, 12345)
    expect(node.textContent).toBe("12,345")
  })
})
