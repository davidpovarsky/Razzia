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
    type InitializedRootValue = string
    let root: InitializedRootValue | undefined = undefined
    function requireInitializedRoot(): InitializedRootValue {
      if (root === undefined) {
        throw new Error("Fixture state root was read before initialization")
      }

      return root
    }
    beforeEach(() => {
      root = fs.mkdtempSync(
        path.join(creationFixtureParent(), "tadazz-c1-scope-synthetic-"),
      )
    })
    afterEach(() => {
      vi.restoreAllMocks()

      if (
        path.dirname(fs.realpathSync(requireInitializedRoot())) !==
          creationFixtureParent() ||
        !path
          .basename(requireInitializedRoot())
          .startsWith("tadazz-c1-scope-synthetic-")
      ) {
        throw new Error("Refusing non-synthetic scope cleanup")
      }

      fs.rmSync(requireInitializedRoot(), { recursive: true, force: true })
    })
    it("rejects missing enabled owner before fallback path lookup or allocation", () => {
      const getPath = vi.fn(() => requireInitializedRoot())
      const configuredRoot = vi.fn(() => requireInitializedRoot())
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
      expect(fs.readdirSync(requireInitializedRoot())).toEqual([])
    })
    it("preserves exact tenant spelling and rejects a flag or owner switch", () => {
      let enabled = true
      let owner = OWNER
      const environment = {
        configuredRoot: () => requireInitializedRoot(),
        accountsEnabled: () => enabled,
        activeOwner: () => owner,
        getPath: () =>
          enabled
            ? path.join(requireInitializedRoot(), "tenants", owner)
            : requireInitializedRoot(),
      }
      const scope = captureCreationScope(environment)
      expect(scope.owner).toBe(OWNER)
      expect(scope.root).toBe(
        path.join(requireInitializedRoot(), "tenants", OWNER),
      )
      owner = OWNER.toLowerCase()
      expect(() => assertCreationScope(environment, scope)).toThrow(/changed/)
      owner = OWNER
      enabled = false
      expect(() => assertCreationScope(environment, scope)).toThrow(/changed/)
      expect(captureCreationScope(environment)).toMatchObject({
        mode: "legacy-global",
        owner: null,
        root: requireInitializedRoot(),
      })
      expect(fs.readdirSync(requireInitializedRoot())).toEqual([])
    })
    it("discovers only explicit private families without scanning customer tenant directories", () => {
      const registry = path.join(requireInitializedRoot(), CREATION_FAMILY)
      fs.mkdirSync(path.join(registry, "tenants", OWNER), {
        recursive: true,
        mode: 0o700,
      })
      fs.mkdirSync(path.join(registry, "legacy-global"), { mode: 0o700 })
      fs.mkdirSync(path.join(requireInitializedRoot(), "tenants"))
      fs.writeFileSync(
        path.join(requireInitializedRoot(), "tenants", "customer-sentinel"),
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
      const scopes = discoverCreationScopes(requireInitializedRoot())
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
          path.join(requireInitializedRoot(), "tenants", "customer-sentinel"),
          "utf8",
        ),
      ).toBe("do not inspect customer tree")
    })
    it("does not create an absent family and rejects symlinked registry components", () => {
      expect(discoverCreationScopes(requireInitializedRoot())).toEqual([])
      expect(fs.readdirSync(requireInitializedRoot())).toEqual([])
      const foreign = path.join(requireInitializedRoot(), "foreign")
      fs.mkdirSync(foreign)
      fs.writeFileSync(path.join(foreign, "sentinel"), "foreign bytes")
      fs.symlinkSync(
        foreign,
        path.join(requireInitializedRoot(), CREATION_FAMILY),
      )
      expect(() => discoverCreationScopes(requireInitializedRoot())).toThrow(
        /directory/,
      )
      expect(fs.readdirSync(foreign)).toEqual(["sentinel"])
      expect(fs.readFileSync(path.join(foreign, "sentinel"), "utf8")).toBe(
        "foreign bytes",
      )
    })
  },
)
