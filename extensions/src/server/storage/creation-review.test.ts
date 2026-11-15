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
} from "./creation-fixture"
import {
  creationChild,
  creationReplayTwice,
  retainCreationReceipt,
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
  const record = witnesses(state)["intent.json"] as { hex: string }
  return JSON.parse(Buffer.from(record.hex, "hex").toString()).phase
}

describe.runIf(process.platform === "linux")(
  "C1 independent review regressions",
  () => {
    let fixture: ReturnType<typeof createCreationFixture>
    let outside: ReturnType<typeof createCreationFixture> | undefined
    let config: string | undefined, accounts: string | undefined
    beforeEach(() => {
      config = process.env.CONFIG_PATH
      accounts = process.env.TADAZZ_ACCOUNTS_ENABLED
      outside = undefined
      fixture = createCreationFixture()
    })
    afterEach(() => {
      vi.restoreAllMocks()
      removeCreationFixture(fixture.root, fixture.token)
      if (outside) removeCreationFixture(outside.root, outside.token)
      if (config === undefined) delete process.env.CONFIG_PATH
      else process.env.CONFIG_PATH = config
      if (accounts === undefined) delete process.env.TADAZZ_ACCOUNTS_ENABLED
      else process.env.TADAZZ_ACCOUNTS_ENABLED = accounts
    })
    it.each(["base", "sidecar"])(
      "re-fences warm absent %s parent before releasing witnesses",
      async (sibling) => {
        const receipt: Record<string, unknown> = { sibling, state: "STARTED" }
        try {
          const interrupted = await creationChild(
            "before-id-return",
            fixture.root,
            fixture.token,
          )
          const checkpoint = JSON.parse(
            fs.readFileSync(
              path.join(fixture.root, ".c1-interrupted.json"),
              "utf8",
            ),
          )
          const failed = await creationReplayTwice(
            fixture.root,
            fixture.token,
            `recover-${sibling}-fence-fails` as CreationRecoveryMode,
          )
          Object.assign(receipt, { interrupted, checkpoint, failed })
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
            fixture.root,
            fixture.token,
          )
          receipt.recovered = recovered
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
          expect(recovered[1].report.recovered).toBe(0)
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
            fixture.root,
            fixture.token,
          )
          const checkpoint = JSON.parse(
            fs.readFileSync(
              path.join(fixture.root, ".c1-interrupted.json"),
              "utf8",
            ),
          )
          const phase = scenario.startsWith("active") ? "active" : "resolved"
          const failed = await creationReplayTwice(
            fixture.root,
            fixture.token,
            `recover-${phase}-move-fence-fails` as CreationRecoveryMode,
          )
          Object.assign(receipt, { interrupted, checkpoint, failed })
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
            fixture.root,
            fixture.token,
          )
          receipt.recovered = recovered
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
          expect(recovered[1].report.recovered).toBe(0)
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
      fixture.port.create(creationInput(), creationExtras())
      const unknown = path.join(
        fixture.root,
        CREATION_FAMILY,
        "legacy-global",
        "future-phase",
      )
      fs.mkdirSync(unknown, { mode: 0o700 })
      fs.writeFileSync(path.join(unknown, "unresolved-intent"), "retain me")
      const before = creationTree(fixture.root)
      expect(() => recoverCreationReservations(fixture.root)).toThrow(
        /Unknown.*phase/,
      )
      expect(creationTree(fixture.root)).toStrictEqual(before)
    })
    it.each(["registry", "tenants", "owner"])(
      "refuses nonprivate %s intermediate before replay",
      (component) => {
        const registry = path.join(fixture.root, CREATION_FAMILY)
        const tenants = path.join(registry, "tenants")
        const owner = path.join(tenants, "00000000-0000-4000-8000-0000000000AF")
        fs.mkdirSync(owner, { recursive: true, mode: 0o700 })
        const changed = { registry, tenants, owner }[
          component as "registry" | "tenants" | "owner"
        ]
        fs.chmodSync(changed, 0o750)
        const before = creationTree(fixture.root),
          mode = fs.statSync(changed).mode
        expect(() => discoverCreationScopes(fixture.root)).toThrow(
          /not private/,
        )
        expect(() => recoverCreationReservations(fixture.root)).toThrow(
          /not private/,
        )
        expect(creationTree(fixture.root)).toStrictEqual(before)
        expect(fs.statSync(changed).mode).toBe(mode)
      },
    )
    it("leaves a supported legacy symlink root alone when C1 is absent", () => {
      const legacy = path.join(fixture.root, "legacy")
      const alias = path.join(fixture.root, "legacy-alias")
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
      process.env.CONFIG_PATH = fixture.root
      const foreign = outside.root
      const quizz = path.join(fixture.root, "quizz")
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
        if (String(file).startsWith(quizz) || String(file).startsWith(foreign))
          reads.push(String(file))
        return (readFile as (...args: unknown[]) => unknown)(file, ...args)
      }) as typeof fs.readFileSync)
      vi.spyOn(fs, "readdirSync").mockImplementation(((
        directory: fs.PathLike,
        ...args: unknown[]
      ) => {
        if (
          String(directory).startsWith(quizz) ||
          String(directory).startsWith(foreign)
        )
          reads.push(String(directory))
        return (readDirectory as (...args: unknown[]) => unknown)(
          directory,
          ...args,
        )
      }) as typeof fs.readdirSync)
      const port = createNativeCreationPort({
        configuredRoot: () => fixture.root,
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
