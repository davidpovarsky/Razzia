import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  assertCreationScope,
  captureCreationScope,
  CREATION_FAMILY,
  discoverCreationScopes,
} from "./creation-scope"
import { creationFixtureParent } from "./creation-fixture-root"

const OWNER = "00000000-0000-4000-8000-0000000000AF"
describe.runIf(process.platform === "linux")(
  "C1 explicit creation scope",
  () => {
    let root: string
    beforeEach(() => {
      root = fs.mkdtempSync(
        path.join(creationFixtureParent(), "tadazz-c1-scope-synthetic-"),
      )
    })
    afterEach(() => {
      vi.restoreAllMocks()
      if (
        path.dirname(fs.realpathSync(root)) !== creationFixtureParent() ||
        !path.basename(root).startsWith("tadazz-c1-scope-synthetic-")
      )
        throw new Error("Refusing non-synthetic scope cleanup")
      fs.rmSync(root, { recursive: true, force: true })
    })
    it("rejects missing enabled owner before fallback path lookup or allocation", () => {
      const getPath = vi.fn(() => root)
      const configuredRoot = vi.fn(() => root)
      expect(() =>
        captureCreationScope({
          configuredRoot,
          getPath,
          accountsEnabled: () => true,
          activeOwner: () => undefined,
        }),
      ).toThrow(/owner/)
      expect(getPath).not.toHaveBeenCalled()
      expect(configuredRoot).not.toHaveBeenCalled()
      expect(fs.readdirSync(root)).toEqual([])
    })
    it("preserves exact tenant spelling and rejects a flag or owner switch", () => {
      let enabled = true
      let owner = OWNER
      const environment = {
        configuredRoot: () => root,
        accountsEnabled: () => enabled,
        activeOwner: () => owner,
        getPath: () => (enabled ? path.join(root, "tenants", owner) : root),
      }
      const scope = captureCreationScope(environment)
      expect(scope.owner).toBe(OWNER)
      expect(scope.root).toBe(path.join(root, "tenants", OWNER))
      owner = OWNER.toLowerCase()
      expect(() => assertCreationScope(environment, scope)).toThrow(/changed/)
      owner = OWNER
      enabled = false
      expect(() => assertCreationScope(environment, scope)).toThrow(/changed/)
      expect(captureCreationScope(environment)).toMatchObject({
        mode: "legacy-global",
        owner: null,
        root,
      })
      expect(fs.readdirSync(root)).toEqual([])
    })
    it("discovers only explicit private families without scanning customer tenant directories", () => {
      const registry = path.join(root, CREATION_FAMILY)
      fs.mkdirSync(path.join(registry, "tenants", OWNER), { recursive: true })
      fs.mkdirSync(path.join(registry, "legacy-global"))
      fs.mkdirSync(path.join(root, "tenants"))
      fs.writeFileSync(
        path.join(root, "tenants", "customer-sentinel"),
        "do not inspect customer tree",
      )
      const readDirectory = fs.readdirSync.bind(fs)
      const inspected: string[] = []
      vi.spyOn(fs, "readdirSync").mockImplementation(((
        directory: fs.PathLike,
        options?: unknown,
      ) => {
        inspected.push(String(directory))
        return readDirectory(directory, options as { encoding: "utf8" })
      }) as typeof fs.readdirSync)
      const scopes = discoverCreationScopes(root)
      expect(scopes.map((scope) => scope.mode)).toEqual([
        "legacy-global",
        "tenant",
      ])
      expect(scopes[1].owner).toBe(OWNER)
      expect(
        inspected.every((directory) => directory.startsWith(registry)),
      ).toBe(true)
      expect(
        fs.readFileSync(
          path.join(root, "tenants", "customer-sentinel"),
          "utf8",
        ),
      ).toBe("do not inspect customer tree")
    })
    it("does not create an absent family and rejects symlinked registry components", () => {
      expect(discoverCreationScopes(root)).toEqual([])
      expect(fs.readdirSync(root)).toEqual([])
      const foreign = path.join(root, "foreign")
      fs.mkdirSync(foreign)
      fs.writeFileSync(path.join(foreign, "sentinel"), "foreign bytes")
      fs.symlinkSync(foreign, path.join(root, CREATION_FAMILY))
      expect(() => discoverCreationScopes(root)).toThrow(/directory/)
      expect(fs.readdirSync(foreign)).toEqual(["sentinel"])
      expect(fs.readFileSync(path.join(foreign, "sentinel"), "utf8")).toBe(
        "foreign bytes",
      )
    })
  },
)
