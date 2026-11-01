import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  BUILT_IN_SOUNDS_LIST,
  CANONICAL_BUILT_IN_SOUNDS,
  DEFAULT_CUE_URLS,
} from "./audio-catalog"
import { CUE_IDS } from "./constants"

describe("Gate 1: Canonical Built-In Sound Catalog & Asset Verification", () => {
  it("defines exactly 9 canonical built-in audio cues without duplicates", () => {
    expect(BUILT_IN_SOUNDS_LIST).toHaveLength(9)
    expect(Object.keys(CANONICAL_BUILT_IN_SOUNDS)).toHaveLength(9)

    const cueIds = new Set<string>()
    const names = new Set<string>()
    const urls = new Set<string>()

    for (const sound of BUILT_IN_SOUNDS_LIST) {
      expect(CUE_IDS).toContain(sound.cueId)
      expect(cueIds.has(sound.cueId)).toBe(false)
      cueIds.add(sound.cueId)

      expect(names.has(sound.name)).toBe(false)
      names.add(sound.name)

      expect(urls.has(sound.url)).toBe(false)
      urls.add(sound.url)

      expect(sound.type).toBe("audio")
      expect(sound.builtIn).toBe(true)
      expect(typeof sound.defaultLoop).toBe("boolean")
      expect(sound.label.trim().length).toBeGreaterThan(0)
      expect(sound.url.startsWith("/sounds/")).toBe(true)
    }

    expect(cueIds.size).toBe(9)
    expect(names.size).toBe(9)
    expect(urls.size).toBe(9)
  })

  it("verifies DEFAULT_CUE_URLS maps every CueId to its canonical URL", () => {
    for (const cueId of CUE_IDS) {
      expect(DEFAULT_CUE_URLS[cueId]).toBeDefined()
      expect(DEFAULT_CUE_URLS[cueId]).toBe(CANONICAL_BUILT_IN_SOUNDS[cueId].url)
    }
  })

  it("asserts every canonical sound URL resolves to a real, non-empty file under packages/web/public/sounds", () => {
    // Resolve workspace root deterministically from current test file location:
    // extensions/src/core/audio-catalog.test.ts -> ../../../
    const workspaceRoot = path.resolve(__dirname, "../../..")
    const publicDir = path.join(workspaceRoot, "packages", "web", "public")

    expect(fs.existsSync(publicDir)).toBe(true)

    for (const sound of BUILT_IN_SOUNDS_LIST) {
      const cleanSubPath = sound.url.replace(/^\/+/u, "")
      const fullPath = path.join(publicDir, cleanSubPath)

      expect(
        fs.existsSync(fullPath),
        `Sound asset does not exist on disk: ${fullPath} for cue ${sound.cueId}`,
      ).toBe(true)

      const stat = fs.statSync(fullPath)
      expect(stat.isFile(), `Expected file at ${fullPath}`).toBe(true)
      expect(
        stat.size,
        `Expected non-empty file at ${fullPath}, got ${stat.size} bytes`,
      ).toBeGreaterThan(1000)
    }
  })
})
