import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as native from "../../../../packages/socket/src/services/config"
import {
  accountsEnabled,
  activeAccount,
} from "../../../../packages/socket/src/services/account-scope"
import { createNativeCreationPort } from "./creation-reservation"
import { CompositeStorageService } from "./service"
import { createDefaultQuizExtras } from "../../core/index"
import {
  createCreationFixture,
  creationExtras,
  creationInput,
  creationIntents,
  creationTree,
  removeCreationFixture,
} from "./creation-fixture"
import {
  creationChild,
  creationReplayTwice,
  retainCreationReceipt,
} from "./creation-process"

describe.runIf(process.platform === "linux")(
  "C1 private creation ownership and uncertainty",
  () => {
    let fixture: ReturnType<typeof createCreationFixture>
    let config: string | undefined, accounts: string | undefined
    beforeEach(() => {
      config = process.env.CONFIG_PATH
      accounts = process.env.TADAZZ_ACCOUNTS_ENABLED
      fixture = createCreationFixture()
    })
    afterEach(() => {
      vi.restoreAllMocks()
      removeCreationFixture(fixture.root, fixture.token)
      if (config === undefined) delete process.env.CONFIG_PATH
      else process.env.CONFIG_PATH = config
      if (accounts === undefined) delete process.env.TADAZZ_ACCOUNTS_ENABLED
      else process.env.TADAZZ_ACCOUNTS_ENABLED = accounts
    })
    const portWith = (prepare: typeof native.prepareNativeQuizCreation) =>
      createNativeCreationPort({
        configuredRoot: () => fixture.root,
        getPath: native.getPath,
        accountsEnabled,
        activeOwner: activeAccount,
        prepare,
      })
    it.each([1, 2])(
      "preserves native create/export/enhanced-import semantics for V%s with fresh question/timeline IDs",
      (version) => {
        const full = creationExtras()
        const extras =
          version === 2
            ? full
            : createDefaultQuizExtras(
                "source-id",
                full.questionIds,
                full.baseDigest,
              )
        const created = fixture.service.createCompositeQuiz({
          quizz: creationInput(),
          extras,
        })
        const bundle = fixture.service.exportEnhancedBundle(created.quizId)
        const input = JSON.stringify(bundle)
        const imported = fixture.service.importEnhancedBundle(bundle)
        const reloaded = fixture.service.getCompositeQuiz(imported.quizId)
        expect(imported.quizId).not.toBe(created.quizId)
        expect(reloaded.digestMatches).toBe(true)
        expect(reloaded.extras?.schemaVersion).toBe(version)
        expect(reloaded.extras?.questionIds[0]).not.toBe(
          bundle.extras.questionIds[0],
        )
        expect(JSON.stringify(bundle)).toBe(input)
        if (
          reloaded.extras?.schemaVersion === 2 &&
          bundle.extras.schemaVersion === 2
        ) {
          expect(reloaded.extras.authoring).toStrictEqual(
            bundle.extras.authoring,
          )
          expect(reloaded.extras.scenes).toStrictEqual(bundle.extras.scenes)
          expect(reloaded.extras.timeline.map((item) => item.id)).not.toEqual(
            bundle.extras.timeline.map((item) => item.id),
          )
        }
      },
    )
    it("preserves authored-show note and opening metadata through the native reservation path", () => {
      const result = fixture.service.importEnhancedBundle({
        format: "tada-show",
        version: 1,
        title: "C1 authored import",
        note: "C1 full metadata",
        baseGameMode: "quiz",
        cards: [
          {
            key: "OPEN",
            kind: "opening",
            title: "Opening",
            durationMs: 2000,
            advance: "manual",
          },
          {
            key: "Q01",
            kind: "quiz",
            questionType: "single",
            question: "Question?",
            answers: [{ text: "A" }, { text: "B" }],
            correctAnswers: [1],
          },
        ],
        settings: [],
      })
      const composite = fixture.service.getCompositeQuiz(result.quizId)
      expect(composite.digestMatches).toBe(true)
      expect(composite.extras?.schemaVersion).toBe(2)
      if (composite.extras?.schemaVersion !== 2)
        throw new Error("Expected full V2")
      expect(composite.extras.authoring?.showNote).toBe("C1 full metadata")
      expect(composite.extras.timeline.map((item) => item.kind)).toEqual([
        "opening",
        "question",
      ])
    })
    it("publishes zero public files when the first intent file fence fails", async () => {
      const sync = fs.fsyncSync.bind(fs)
      let failures = 0
      vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
        if (fs.fstatSync(fd).isFile()) {
          failures++
          throw new Error("EIO first intent file fence")
        }
        sync(fd)
      })
      expect(() =>
        fixture.port.create(creationInput(), creationExtras()),
      ).toThrow(/reservation failed/)
      vi.restoreAllMocks()
      expect(failures).toBe(1)
      expect(fs.readdirSync(native.getPath("quizz"))).toEqual([])
      expect(fs.readdirSync(native.getPath("extensions/quizzes"))).toEqual([])
      expect(creationIntents(fixture.root)[0].entry.phase).toBe("preparing")
      const before = creationTree(fixture.root)
      const runs = await creationReplayTwice(fixture.root, fixture.token)
      for (const run of runs) {
        expect(run.process.code).toBe(2)
        expect(run.state).toStrictEqual(before)
      }
      retainCreationReceipt("failed-intent-fence", {
        state: "PASS",
        failures,
        zeroPublicFiles: true,
        before,
        runs,
      })
    }, 70000)
    it("fails EXDEV without publication and reports a verified complete rollback", () => {
      let failures = 0
      vi.spyOn(fs, "linkSync").mockImplementation(() => {
        failures++
        throw Object.assign(new Error("EXDEV same-filesystem requirement"), {
          code: "EXDEV",
        })
      })
      expect(() =>
        fixture.port.create(creationInput(), creationExtras()),
      ).toThrow(/rollback complete/)
      expect(failures).toBe(1)
      expect(fs.readdirSync(native.getPath("quizz"))).toEqual([])
      expect(fs.readdirSync(native.getPath("extensions/quizzes"))).toEqual([])
      expect(creationIntents(fixture.root)).toEqual([])
    })
    it("catches an enhanced sidecar EEXIST race before base publication and retains foreign bytes plus intent", async () => {
      const link = fs.linkSync.bind(fs)
      let activations = 0
      vi.spyOn(fs, "linkSync").mockImplementation((from, to) => {
        if (
          String(to).includes(
            `${path.sep}extensions${path.sep}quizzes${path.sep}`,
          )
        ) {
          activations++
          fs.writeFileSync(to, "foreign raced sidecar", { flag: "wx" })
        }
        link(from, to)
      })
      expect(() =>
        fixture.port.create(creationInput(), creationExtras()),
      ).toThrow(/unresolved/)
      vi.restoreAllMocks()
      expect(activations).toBe(1)
      expect(fs.readdirSync(native.getPath("quizz"))).toEqual([])
      const before = creationTree(fixture.root)
      const runs = await creationReplayTwice(fixture.root, fixture.token)
      for (const run of runs) {
        expect(run.process.code).toBe(2)
        expect(run.state).toStrictEqual(before)
      }
      retainCreationReceipt("enhanced-sidecar-race", {
        state: "PASS",
        activations,
        zeroBasePublication: true,
        before,
        runs,
      })
    }, 70000)
    it("freezes one actual preparation and full V2 bytes and rejects foreign/reentrant/consumed capabilities", () => {
      const prepare = vi.fn(native.prepareNativeQuizCreation)
      const port = portWith(prepare)
      const input = creationInput(),
        extras = creationExtras()
      const cap = port.reserve(input, extras)
      const staged = creationIntents(fixture.root)[0].entry
      expect(staged.phase).toBe("ready")
      expect(staged.base).not.toBeNull()
      expect(staged.sidecar).not.toBeNull()
      expect(fs.readdirSync(native.getPath("quizz"))).toEqual([])
      input.subject = "Caller mutation must not publish"
      extras.authoring = { showNote: "Caller mutation must not publish" }
      expect(() => port.create(creationInput(), creationExtras())).toThrow(
        /busy/,
      )
      expect(() => fixture.port.publish(cap)).toThrow(/Foreign/)
      const result = port.publish(cap)
      expect(prepare).toHaveBeenCalledTimes(1)
      expect(result.quizId).toBe(staged.quizId)
      expect(
        fs.readFileSync(native.getPath(`quizz/${staged.baseFileName}`), "utf8"),
      ).toBe(staged.targetBase.raw)
      expect(
        fs.readFileSync(
          native.getPath(`extensions/quizzes/${result.quizId}.json`),
          "utf8",
        ),
      ).toBe(staged.targetSidecar!.raw)
      const before = creationTree(fixture.root)
      expect(() => port.publish(cap)).toThrow(/consumed/)
      expect(creationTree(fixture.root)).toStrictEqual(before)
    })
    it("rejects root storage-ID mismatch before preparation, allocation or filesystem changes", () => {
      const prepare = vi.fn(native.prepareNativeQuizCreation)
      const service = new CompositeStorageService({
        ...native,
        creation: portWith(prepare),
      })
      const before = creationTree(fixture.root)
      expect(() =>
        service.importEnhancedBundle({
          bundleVersion: 1,
          quizz: { ...creationInput(), id: "different-source" },
          extras: creationExtras(),
        }),
      ).toThrow(/identity/)
      expect(prepare).not.toHaveBeenCalled()
      expect(creationTree(fixture.root)).toStrictEqual(before)
    })
    it("denies a pre-existing orphan sidecar before legacy base publication and retains exact foreign bytes", () => {
      let sidecar = "",
        bytes = "",
        ino = 0n
      const prepare = vi.fn((input: unknown) => {
        const prepared = native.prepareNativeQuizCreation(input)
        fs.mkdirSync(native.getPath("extensions/quizzes"), { recursive: true })
        sidecar = native.getPath(`extensions/quizzes/${prepared.id}.json`)
        bytes = JSON.stringify({
          foreign: "pre-existing orphan",
          quizId: prepared.id,
        })
        fs.writeFileSync(sidecar, bytes)
        ino = fs.statSync(sidecar, { bigint: true }).ino
        return prepared
      })
      expect(() => portWith(prepare).create(creationInput(), null)).toThrow(
        /collision/,
      )
      expect(prepare).toHaveBeenCalledTimes(1)
      expect(fs.readdirSync(native.getPath("quizz"))).toEqual([])
      expect(fs.readFileSync(sidecar, "utf8")).toBe(bytes)
      expect(fs.statSync(sidecar, { bigint: true }).ino).toBe(ino)
    })
    it("expiry rejects publication and preserves intent without using the timer as cleanup authority", async () => {
      const cap = fixture.port.reserve(creationInput(), creationExtras())
      const staged = creationIntents(fixture.root)[0].entry
      const before = creationTree(fixture.root)
      vi.spyOn(Date, "now").mockReturnValue(staged.expiresAt + 1)
      expect(() => fixture.port.publish(cap)).toThrow(/Expired/)
      expect(creationTree(fixture.root)).toStrictEqual(before)
      vi.restoreAllMocks()
      const runs = await creationReplayTwice(fixture.root, fixture.token)
      for (const run of runs)
        expect(run.process.code, run.process.stderr).toBe(0)
      expect(runs[1].report.recovered).toBe(0)
    }, 70000)
    it.each([
      "base-replacement",
      "sidecar-in-place",
      "missing-witness",
      "newer-intent",
    ])(
      "retains BOTH siblings and complete evidence on %s in two fresh replays",
      async (fault) => {
        const receipt: Record<string, unknown> = { fault, state: "STARTED" }
        try {
          const interrupted = await creationChild(
            "before-id-return",
            fixture.root,
            fixture.token,
          )
          const { file, entry } = creationIntents(fixture.root)[0]
          const base = native.getPath(`quizz/${entry.baseFileName}`)
          const sidecar = native.getPath(
            `extensions/quizzes/${entry.quizId}.json`,
          )
          if (fault === "base-replacement") {
            const original = fs.statSync(base, { bigint: true }).ino
            const bytes = fs.readFileSync(base)
            fs.unlinkSync(base)
            fs.writeFileSync(base, bytes, { flag: "wx", mode: 0o600 })
            expect(fs.statSync(base, { bigint: true }).ino).not.toBe(original)
          } else if (fault === "sidecar-in-place") {
            const inode = fs.statSync(sidecar, { bigint: true }).ino
            const data = JSON.parse(fs.readFileSync(sidecar, "utf8"))
            data.revision = 9
            fs.writeFileSync(sidecar, JSON.stringify(data))
            expect(fs.statSync(sidecar, { bigint: true }).ino).toBe(inode)
          } else if (fault === "missing-witness")
            fs.unlinkSync(path.join(path.dirname(file), "base.record"))
          else fs.writeFileSync(file, JSON.stringify({ ...entry, version: 99 }))
          const before = creationTree(fixture.root)
          const runs = await creationReplayTwice(fixture.root, fixture.token)
          Object.assign(receipt, { interrupted, before, runs })
          expect(interrupted.signal).toBe("SIGKILL")
          expect(interrupted.timedOut).toBe(false)
          expect(
            new Set([interrupted.pid, ...runs.map((run) => run.pid)]).size,
          ).toBe(3)
          for (const run of runs) {
            expect(run.process.timedOut).toBe(false)
            expect(run.process.code, run.process.stderr).toBe(2)
            expect(run.state).toStrictEqual(before)
          }
          receipt.state = "PASS"
        } catch (error) {
          receipt.state = "FAIL"
          receipt.error = error instanceof Error ? error.stack : String(error)
          throw error
        } finally {
          retainCreationReceipt(`proof-${fault}`, receipt)
        }
      },
      85000,
    )
    it("qualifies null-sidecar external interference honestly: an uncontrolled insertion can race a base link, and then the WHOLE pair is retained", async () => {
      const link = fs.linkSync.bind(fs)
      let activations = 0
      vi.spyOn(fs, "linkSync").mockImplementation((from, to) => {
        const entry = creationIntents(fixture.root)[0].entry
        if (String(to).endsWith(entry.baseFileName)) {
          activations++
          fs.writeFileSync(
            native.getPath(`extensions/quizzes/${entry.quizId}.json`),
            JSON.stringify({ external: "not a cooperating C1 writer" }),
            { flag: "wx" },
          )
        }
        link(from, to)
      })
      expect(() => fixture.port.create(creationInput(), null)).toThrow(
        /unresolved/,
      )
      vi.restoreAllMocks()
      expect(activations).toBe(1)
      const before = creationTree(fixture.root)
      const runs = await creationReplayTwice(fixture.root, fixture.token)
      for (const run of runs) {
        expect(run.process.code).toBe(2)
        expect(run.state).toStrictEqual(before)
      }
      retainCreationReceipt("qualified-external-interference", {
        state: "PASS",
        activations,
        baseWasPublishedAfterExternalInsertion: true,
        before,
        runs,
        claim:
          "Not protected against arbitrary nonparticipating writers; no atomic pair isolation",
      })
    }, 70000)
    it("re-fences warm-visible committed intent and retains all witnesses when a fresh process repeats the fence failure", async () => {
      const rename = fs.renameSync.bind(fs),
        sync = fs.fsyncSync.bind(fs)
      let committedVisible = false,
        failures = 0
      vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
        rename(from, to)
        if (
          String(to).endsWith("intent.json") &&
          JSON.parse(fs.readFileSync(to, "utf8")).phase === "committed"
        )
          committedVisible = true
      })
      vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
        if (committedVisible && fs.fstatSync(fd).isDirectory()) {
          failures++
          throw new Error("EIO warm committed directory")
        }
        sync(fd)
      })
      expect(() =>
        fixture.port.create(creationInput(), creationExtras()),
      ).toThrow(/unresolved/)
      vi.restoreAllMocks()
      expect(failures).toBe(1)
      const before = creationTree(fixture.root)
      const blocked = await creationReplayTwice(
        fixture.root,
        fixture.token,
        true,
      )
      for (const run of blocked) {
        expect(run.process.code).toBe(2)
        expect(run.state).toStrictEqual(before)
      }
      const runs = await creationReplayTwice(fixture.root, fixture.token)
      for (const run of runs) {
        expect(run.process.code, run.process.stderr).toBe(0)
        for (const name of Object.keys(before).filter(
          (name) =>
            name.startsWith("quizz/") || name.startsWith("extensions/quizzes/"),
        ))
          expect(run.state[name]).toStrictEqual(before[name])
      }
      retainCreationReceipt("warm-visible-commit", {
        state: "PASS",
        failures,
        before,
        blocked,
        runs,
      })
    }, 140000)
  },
)
