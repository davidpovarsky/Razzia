import { describe, it, expect } from "vitest"
import { storyElapsedSeconds } from "./story-clock"
describe("authoritative story clock", () => {
  it("rejoins the current choreography instead of replaying the entrance", () => {
    expect(storyElapsedSeconds({ sceneStartedAt: 10000 }, 48000)).toBe(38)
  })
  it("freezes at the server pause snapshot, including a late/reconnected client", () => {
    expect(
      storyElapsedSeconds(
        { sceneStartedAt: 10000, scenePaused: true, sceneElapsedMs: 23150 },
        99000,
      ),
    ).toBe(23.15)
  })
  it("resumes from the server-adjusted origin and clamps clock skew", () => {
    expect(
      storyElapsedSeconds({ sceneStartedAt: 60000, scenePaused: false }, 83150),
    ).toBe(23.15)
    expect(storyElapsedSeconds({ sceneStartedAt: 84000 }, 83150)).toBe(0)
  })
})
