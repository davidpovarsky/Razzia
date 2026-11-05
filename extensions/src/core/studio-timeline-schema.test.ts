import { describe, expect, it } from "vitest"
import {
  animationSceneSchema,
  type ActiveSceneData,
  type PublicFullShowData,
} from "./studio-timeline-schema"

describe("studio-timeline-schema: FullShow fields and ActiveSceneData validation", () => {
  it("parses and preserves all full-show animationSceneSchema fields", () => {
    const rawScene = {
      id: "a0000000-0000-4000-8000-000000000001",
      kind: "animation" as const,
      preset: "company-opening",
      title: "Creating Worlds Opening",
      durationMs: 2940,
      round: 1,
      completed: 3,
      dialNumber: "079-999-9999",
      connectedTables: [1, 2, 5, 8],
      representatives: [
        { table: 1, name: "Sarah" },
        { table: 2, name: "David" },
      ],
      winners: [
        {
          title: "Team Alpha",
          imageUrl: "/tadazz-show/second-library/teaser-screen.jpg",
        },
      ],
      contestants: [
        { title: "Option A - The Hero", imageUrl: "/media/hero.png" },
        { title: "Option B - The Rebel", imageUrl: "/media/rebel.png" },
      ],
      voteCount: 42,
      resolvedIndex: 1,
      eventArtworkUrl: "/tadazz-show/second-library/teaser-screen.jpg",
      curtainLeftUrl: "/media/curtain-left.png",
      curtainRightUrl: "/media/curtain-right.png",
      groupPage: 2,
      storyRoles: [
        "THE THREAT",
        "THE MISSION",
        "THE TWIST",
        "THE CLIMAX",
        "THE RESOLUTION",
      ],
    }

    const parsed = animationSceneSchema.parse(rawScene)
    expect(parsed.id).toBe(rawScene.id)
    expect(parsed.kind).toBe("animation")
    expect(parsed.preset).toBe("company-opening")
    expect(parsed.title).toBe("Creating Worlds Opening")
    expect(parsed.durationMs).toBe(2940)
    expect(parsed.round).toBe(1)
    expect(parsed.completed).toBe(3)
    expect(parsed.dialNumber).toBe("079-999-9999")
    expect(parsed.connectedTables).toEqual([1, 2, 5, 8])
    expect(parsed.representatives).toEqual([
      { table: 1, name: "Sarah" },
      { table: 2, name: "David" },
    ])
    expect(parsed.winners).toEqual([
      {
        title: "Team Alpha",
        imageUrl: "/tadazz-show/second-library/teaser-screen.jpg",
      },
    ])
    expect(parsed.contestants).toEqual([
      { title: "Option A - The Hero", imageUrl: "/media/hero.png" },
      { title: "Option B - The Rebel", imageUrl: "/media/rebel.png" },
    ])
    expect(parsed.voteCount).toBe(42)
    expect(parsed.resolvedIndex).toBe(1)
    expect(parsed.eventArtworkUrl).toBe(
      "/tadazz-show/second-library/teaser-screen.jpg",
    )
    expect(parsed.curtainLeftUrl).toBe("/media/curtain-left.png")
    expect(parsed.curtainRightUrl).toBe("/media/curtain-right.png")
    expect(parsed.groupPage).toBe(2)
    expect(parsed.storyRoles).toEqual([
      "THE THREAT",
      "THE MISSION",
      "THE TWIST",
      "THE CLIMAX",
      "THE RESOLUTION",
    ])
  })

  it("handles animationSceneSchema with default fields and no full-show data without error", () => {
    const rawScene = {
      id: "a0000000-0000-4000-8000-000000000002",
      kind: "animation" as const,
      preset: "spotlight",
    }

    const parsed = animationSceneSchema.parse(rawScene)
    expect(parsed.id).toBe(rawScene.id)
    expect(parsed.preset).toBe("spotlight")
    expect(parsed.durationMs).toBe(3000)
    expect(parsed.round).toBeUndefined()
    expect(parsed.connectedTables).toBeUndefined()
  })

  it("assigns and accesses fullShow data inside ActiveSceneData typed structure", () => {
    const fullShow: PublicFullShowData = {
      round: 2,
      completed: 4,
      dialNumber: "079-555-1234",
      connectedTables: [1, 2, 3, 4],
      representatives: [
        { table: 1, name: "Table 1" },
        { table: 4, name: "Table 4" },
      ],
      winners: [{ title: "Table 4" }],
      contestants: [{ title: "Contestant 1" }, { title: "Contestant 2" }],
      voteCount: 15,
      resolvedIndex: 0,
      eventArtworkUrl: "/tadazz-show/second-library/teaser-screen.jpg",
      curtainLeftUrl: "/media/curtain-l.png",
      curtainRightUrl: "/media/curtain-r.png",
      groupPage: 1,
      storyRoles: ["THREAT", "MISSION", "TWIST", "CLIMAX", "RESOLUTION"],
    }

    const activeSceneData: ActiveSceneData = {
      fullShow,
    }

    expect(activeSceneData.fullShow).toBeDefined()
    expect(activeSceneData.fullShow?.round).toBe(2)
    expect(activeSceneData.fullShow?.completed).toBe(4)
    expect(activeSceneData.fullShow?.connectedTables).toEqual([1, 2, 3, 4])
    expect(activeSceneData.fullShow?.eventArtworkUrl).toBe(
      "/tadazz-show/second-library/teaser-screen.jpg",
    )
    expect(activeSceneData.fullShow?.groupPage).toBe(1)
  })

  it("allows ActiveSceneData without fullShow or with null fullShow", () => {
    const activeSceneData1: ActiveSceneData = {}
    expect(activeSceneData1.fullShow).toBeUndefined()

    const activeSceneData2: ActiveSceneData = {
      fullShow: null,
    }
    expect(activeSceneData2.fullShow).toBeNull()
  })
})
