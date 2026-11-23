import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as native from "../../../../packages/socket/src/services/config"
import {
  accountsEnabled,
  activeAccount,
} from "../../../../packages/socket/src/services/account-scope"
import {
  createNativeCreationPort,
  recoverCreationReservations,
} from "./creation-reservation"
import {
  createCreationFixture,
  creationExtras,
  creationInput,
  creationTree,
  removeCreationFixture,
  requireCreationRecord,
} from "./creation-fixture"
import {
  assertCreationRuns,
  creationChild,
  creationRecoveryReport,
  creationReplayTwice,
  retainCreationReceipt,
  requireCreationCheckpoint,
  type CreationRecoveryMode,
} from "./creation-process"
import { CREATION_FAMILY, discoverCreationScopes } from "./creation-scope"

const witnesses = (state: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(state)
      .filter(([name]) =>
        /\/(?:base\.record|sidecar\.record|intent\.json)$/u.test(name),
      )
      .map(([name, value]) => [path.basename(name), value]),
  )
const publics = (state: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(state).filter(
      ([name]) =>
        name.startsWith("quizz/") || name.startsWith("extensions/quizzes/"),
    ),
  )
const readyPhase = (state: Record<string, unknown>) => {
  const record = requireCreationRecord(witnesses(state)["intent.json"])

  if (typeof record.hex !== "string") {
    throw new Error("Missing synthetic creation intent byte image")
  }

  return requireCreationRecord(
    JSON.parse(Buffer.from(record.hex, "hex").toString()),
  ).phase
}

describe.runIf(process.platform === "linux")(
  "C1 independent review regressions",
  () => {
    type InitializedFixtureValue = ReturnType<typeof createCreationFixture>
    let fixture: InitializedFixtureValue | undefined = undefined
    function requireInitializedFixture(): InitializedFixtureValue {
      if (fixture === undefined) {
        throw new Error("Fixture state fixture was read before initialization")
      }

      return fixture
    }
    let outside: ReturnType<typeof createCreationFixture> | undefined =
      undefined

    let config: string | undefined = undefined,
      accounts: string | undefined = undefined
    beforeEach(() => {
      config = process.env.CONFIG_PATH
      accounts = process.env.TADAZZ_ACCOUNTS_ENABLED
      outside = undefined
      fixture = createCreationFixture()
    })
    afterEach(() => {
      vi.restoreAllMocks()
      removeCreationFixture(
        requireInitializedFixture().root,
        requireInitializedFixture().token,
      )

      if (outside) {
        removeCreationFixture(outside.root, outside.token)
      }

      if (config === undefined) {
        delete process.env.CONFIG_PATH
      } else {
        process.env.CONFIG_PATH = config
      }

      if (accounts === undefined) {
        delete process.env.TADAZZ_ACCOUNTS_ENABLED
      } else {
        process.env.TADAZZ_ACCOUNTS_ENABLED = accounts
      }
    })
    it.each(["base", "sidecar"])(
      "re-fences warm absent %s parent before releasing witnesses",
      async (sibling) => {
        const receipt: Record<string, unknown> = { sibling, state: "STARTED" }

        try {
          const interrupted = await creationChild(
            "before-id-return",
            requireInitializedFixture().root,
            requireInitializedFixture().token,
          )
          const checkpoint = requireCreationCheckpoint(
            JSON.parse(
              fs.readFileSync(
                path.join(
                  requireInitializedFixture().root,
                  ".c1-interrupted.json",
                ),
                "utf8",
              ),
            ),
          )
          const failed = await creationReplayTwice(
            requireInitializedFixture().root,
            requireInitializedFixture().token,
            `recover-${sibling}-fence-fails` as CreationRecoveryMode,
          )
          Object.assign(receipt, { interrupted, checkpoint, failed })
          assertCreationRuns(failed)
          expect(interrupted.signal).toBe("SIGKILL")
          expect(interrupted.timedOut).toBe(false)
          expect(checkpoint.pid).toBe(interrupted.pid)
          expect(Object.keys(witnesses(checkpoint.state))).toHaveLength(3)
          for (const run of failed) {
            expect(run.process.code, run.process.stderr).toBe(2)
            expect(run.process.timedOut).toBe(false)
            expect(run.faultActivations).toBeGreaterThan(0)
            expect(readyPhase(run.state)).toBe("ready")
            expect(witnesses(run.state)).toStrictEqual(
              witnesses(checkpoint.state),
            )
          }
          expect(Object.keys(publics(failed[1].state))).toHaveLength(0)
          const recovered = await creationReplayTwice(
            requireInitializedFixture().root,
            requireInitializedFixture().token,
          )
          receipt.recovered = recovered
          assertCreationRuns(recovered)

          expect(
            new Set([
              interrupted.pid,
              ...failed.map((run) => run.pid),
              ...recovered.map((run) => run.pid),
            ]).size,
          ).toBe(5)
          for (const run of recovered) {
            expect(run.process.code, run.process.stderr).toBe(0)
            expect(run.process.timedOut).toBe(false)
            expect(Object.keys(run.state)).toHaveLength(0)
          }
          expect(creationRecoveryReport(recovered[1]).recovered).toBe(0)
          receipt.state = "PASS"
        } catch (error) {
          receipt.state = "FAIL"
          receipt.error = String(error)
          throw error
        } finally {
          retainCreationReceipt(`review-absent-${sibling}`, receipt)
        }
      },
      150000,
    )
    it.each([
      "active-committed",
      "resolved-committed",
      "active-empty",
      "resolved-empty",
    ])(
      "re-establishes both move parents at %s and retries twice",
      async (scenario) => {
        const receipt: Record<string, unknown> = { scenario, state: "STARTED" }

        try {
          const empty = scenario.endsWith("empty")
          const interrupted = await creationChild(
            empty ? "before-slot-removal" : "committed-visible",
            requireInitializedFixture().root,
            requireInitializedFixture().token,
          )
          const checkpoint = requireCreationCheckpoint(
            JSON.parse(
              fs.readFileSync(
                path.join(
                  requireInitializedFixture().root,
                  ".c1-interrupted.json",
                ),
                "utf8",
              ),
            ),
          )
          const phase = scenario.startsWith("active") ? "active" : "resolved"
          const failed = await creationReplayTwice(
            requireInitializedFixture().root,
            requireInitializedFixture().token,
            `recover-${phase}-move-fence-fails` as CreationRecoveryMode,
          )
          Object.assign(receipt, { interrupted, checkpoint, failed })
          assertCreationRuns(failed)
          expect(interrupted.signal).toBe("SIGKILL")
          expect(interrupted.timedOut).toBe(false)
          expect(checkpoint.pid).toBe(interrupted.pid)
          expect(Object.keys(witnesses(checkpoint.state))).toHaveLength(
            empty ? 0 : 3,
          )
          for (const run of failed) {
            expect(run.process.code, run.process.stderr).toBe(2)
            expect(run.process.timedOut).toBe(false)
            expect(run.faultActivations).toBeGreaterThan(0)
            expect(run.phases.active).toEqual([])
            expect(run.phases.resolved).toHaveLength(1)
            expect(witnesses(run.state)).toStrictEqual(
              witnesses(checkpoint.state),
            )
            expect(publics(run.state)).toStrictEqual(publics(checkpoint.state))
          }
          const recovered = await creationReplayTwice(
            requireInitializedFixture().root,
            requireInitializedFixture().token,
          )
          receipt.recovered = recovered
          assertCreationRuns(recovered)

          expect(
            new Set([
              interrupted.pid,
              ...failed.map((run) => run.pid),
              ...recovered.map((run) => run.pid),
            ]).size,
          ).toBe(5)
          for (const run of recovered) {
            expect(run.process.code, run.process.stderr).toBe(0)
            expect(run.process.timedOut).toBe(false)
            expect(run.phases).toStrictEqual({ active: [], resolved: [] })
            expect(publics(run.state)).toStrictEqual(publics(checkpoint.state))
            expect(witnesses(run.state)).toEqual({})
          }
          expect(creationRecoveryReport(recovered[1]).recovered).toBe(0)
          receipt.state = "PASS"
        } catch (error) {
          receipt.state = "FAIL"
          receipt.error = String(error)
          throw error
        } finally {
          retainCreationReceipt(`review-move-${scenario}`, receipt)
        }
      },
      150000,
    )
    it("refuses an unknown phase without changing any evidence", () => {
      requireInitializedFixture().port.create(creationInput(), creationExtras())
      const unknown = path.join(
        requireInitializedFixture().root,
        CREATION_FAMILY,
        "legacy-global",
        "future-phase",
      )
      fs.mkdirSync(unknown, { mode: 0o700 })
      fs.writeFileSync(path.join(unknown, "unresolved-intent"), "retain me")
      const before = creationTree(requireInitializedFixture().root)
      expect(() =>
        recoverCreationReservations(requireInitializedFixture().root),
      ).toThrow(/Unknown.*phase/)
      expect(creationTree(requireInitializedFixture().root)).toStrictEqual(
        before,
      )
    })
    it.each(["registry", "tenants", "owner"])(
      "refuses nonprivate %s intermediate before replay",
      (component) => {
        const registry = path.join(
          requireInitializedFixture().root,
          CREATION_FAMILY,
        )
        const tenants = path.join(registry, "tenants")
        const owner = path.join(tenants, "00000000-0000-4000-8000-0000000000AF")
        fs.mkdirSync(owner, { recursive: true, mode: 0o700 })
        const changed = { registry, tenants, owner }[
          component as "registry" | "tenants" | "owner"
        ]
        fs.chmodSync(changed, 0o750)
        const before = creationTree(requireInitializedFixture().root),
          { mode } = fs.statSync(changed)
        expect(() =>
          discoverCreationScopes(requireInitializedFixture().root),
        ).toThrow(/not private/)
        expect(() =>
          recoverCreationReservations(requireInitializedFixture().root),
        ).toThrow(/not private/)
        expect(creationTree(requireInitializedFixture().root)).toStrictEqual(
          before,
        )
        expect(fs.statSync(changed).mode).toBe(mode)
      },
    )
    it("leaves a supported legacy symlink root alone when C1 is absent", () => {
      const legacy = path.join(requireInitializedFixture().root, "legacy")
      const alias = path.join(requireInitializedFixture().root, "legacy-alias")
      fs.mkdirSync(legacy)
      fs.writeFileSync(path.join(legacy, "sentinel"), "legacy bytes")
      fs.symlinkSync(legacy, alias)
      const before = fs.readFileSync(path.join(legacy, "sentinel"), "utf8")
      expect(recoverCreationReservations(alias).unresolved).toEqual([])
      expect(fs.readdirSync(legacy)).toEqual(["sentinel"])
      expect(fs.readFileSync(path.join(legacy, "sentinel"), "utf8")).toBe(
        before,
      )
    })
    it("denies a linked quiz lookup before preparation and performs zero target reads", () => {
      outside = createCreationFixture()
      process.env.CONFIG_PATH = requireInitializedFixture().root
      const foreign = outside.root
      const quizz = path.join(requireInitializedFixture().root, "quizz")
      fs.writeFileSync(
        path.join(foreign, "sentinel.json"),
        JSON.stringify(creationInput()),
      )
      fs.symlinkSync(foreign, quizz)
      const prepare = vi.fn(native.prepareNativeQuizCreation)
      const reads: string[] = []
      const readFile = fs.readFileSync.bind(fs),
        readDirectory = fs.readdirSync.bind(fs)
      vi.spyOn(fs, "readFileSync").mockImplementation(((
        file: fs.PathOrFileDescriptor,
        ...args: unknown[]
      ) => {
        if (
          String(file).startsWith(quizz) ||
          String(file).startsWith(foreign)
        ) {
          reads.push(String(file))
        }

        return (readFile as (...args: unknown[]) => unknown)(file, ...args)
      }) as typeof fs.readFileSync)
      vi.spyOn(fs, "readdirSync").mockImplementation(((
        directory: fs.PathLike,
        ...args: unknown[]
      ) => {
        if (
          String(directory).startsWith(quizz) ||
          String(directory).startsWith(foreign)
        ) {
          reads.push(String(directory))
        }

        return (readDirectory as (...args: unknown[]) => unknown)(
          directory,
          ...args,
        )
      }) as typeof fs.readdirSync)
      const port = createNativeCreationPort({
        configuredRoot: () => requireInitializedFixture().root,
        getPath: native.getPath,
        accountsEnabled,
        activeOwner: activeAccount,
        prepare,
      })
      expect(() => port.create(creationInput(), creationExtras())).toThrow(
        /directory/,
      )
      expect(prepare).not.toHaveBeenCalled()
      expect(reads).toEqual([])
      vi.restoreAllMocks()
      expect(fs.readdirSync(foreign).sort()).toEqual([
        ".c1-fixture.json",
        "sentinel.json",
      ])
      expect(
        JSON.parse(
          fs.readFileSync(path.join(foreign, "sentinel.json"), "utf8"),
        ),
      ).toStrictEqual(creationInput())
    })
  },
)
