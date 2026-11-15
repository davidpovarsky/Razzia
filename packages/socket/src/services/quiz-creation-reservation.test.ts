import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { computeCanonicalBaseDigest } from "@razzia/extensions/core"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { SESSION_ROLES } from "@razzia/common/constants"
import * as native from "./config"
import { withAccount } from "./account-scope"
import { getAccountDb, closeAccountDb } from "./account-db"
import { mintToken } from "./auth"
import {
  createCreationFixture,
  creationExtras,
  creationInput,
  creationTree,
  removeCreationFixture,
} from "../../../../extensions/src/server/storage/creation-fixture"
import {
  creationChild,
  creationReplayTwice,
  retainCreationReceipt,
} from "../../../../extensions/src/server/storage/creation-process"

describe.runIf(process.platform === "linux")(
  "C1 actual native creation composition",
  () => {
    let fixture: ReturnType<typeof createCreationFixture>
    let config: string | undefined,
      accounts: string | undefined,
      prototype: string | undefined
    beforeEach(() => {
      config = process.env.CONFIG_PATH
      accounts = process.env.TADAZZ_ACCOUNTS_ENABLED
      prototype = process.env.TADAZZ_C1_CREATION_PROTOTYPE
      closeAccountDb()
      fixture = createCreationFixture()
    })
    afterEach(() => {
      vi.restoreAllMocks()
      closeAccountDb()
      removeCreationFixture(fixture.root, fixture.token)
      if (config === undefined) delete process.env.CONFIG_PATH
      else process.env.CONFIG_PATH = config
      if (accounts === undefined) delete process.env.TADAZZ_ACCOUNTS_ENABLED
      else process.env.TADAZZ_ACCOUNTS_ENABLED = accounts
      if (prototype === undefined)
        delete process.env.TADAZZ_C1_CREATION_PROTOTYPE
      else process.env.TADAZZ_C1_CREATION_PROTOTYPE = prototype
    })
    it("uses the actual validator, one preparer and independent random8 native basename without opaque save", () => {
      const input = {
        ...creationInput(),
        ignoredByNative: "stripped before frozen digest",
      }
      const before = JSON.stringify(input)
      const result = fixture.service.createCompositeQuiz({
        quizz: input,
        extras: creationExtras(),
      })
      const files = fs.readdirSync(native.getPath("quizz"))
      expect(result.quizId).toMatch(/^[A-Za-z0-9_-]{21}$/u)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/-[A-Za-z0-9_-]{8}\.json$/u)
      expect(files[0]).not.toBe(`${result.quizId}.json`)
      const stored = JSON.parse(
        fs.readFileSync(native.getPath(`quizz/${files[0]}`), "utf8"),
      )
      const { id, ...logical } = stored
      expect(id).toBe(result.quizId)
      expect(logical).toStrictEqual(quizzValidator.parse(input))
      expect(result.baseDigest).toBe(
        computeCanonicalBaseDigest(quizzValidator.parse(input)),
      )
      expect(JSON.stringify(input)).toBe(before)
      const composite = fixture.service.getCompositeQuiz(result.quizId)
      expect(composite.digestMatches).toBe(true)
      expect(composite.extras?.schemaVersion).toBe(2)
      native.updateQuizz(result.quizId, {
        ...logical,
        subject: "C1 actual update",
      })
      expect(native.getQuizzById(result.quizId).subject).toBe(
        "C1 actual update",
      )
      native.deleteQuizz(result.quizId)
      expect(fs.readdirSync(native.getPath("quizz"))).toEqual([])
    })
    it("keeps idless legacy bytes unchanged during pure preparation and rejects missing enabled owner before allocation", () => {
      fs.mkdirSync(native.getPath("quizz"))
      const file = native.getPath("quizz/idless-sentinel.json")
      const bytes = JSON.stringify(creationInput())
      fs.writeFileSync(file, bytes)
      const inode = fs.statSync(file, { bigint: true }).ino
      native.prepareNativeQuizCreation(creationInput())
      expect(fs.readFileSync(file, "utf8")).toBe(bytes)
      expect(fs.statSync(file, { bigint: true }).ino).toBe(inode)
      const before = creationTree(fixture.root)
      process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
      expect(() => native.prepareNativeQuizCreation(creationInput())).toThrow(
        /scope/,
      )
      expect(() =>
        fixture.service.createCompositeQuiz({
          quizz: creationInput(),
          extras: creationExtras(),
        }),
      ).toThrow(/owner/)
      expect(creationTree(fixture.root)).toStrictEqual(before)
    })
    it("uses real manager JWT/session middleware in two tenants and discovers the dedicated roots after a flag change", async () => {
      process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
      process.env.TADAZZ_C1_CREATION_PROTOTYPE = "true"
      const owners = [
        "00000000-0000-4000-8000-0000000000A1",
        "00000000-0000-4000-8000-0000000000B2",
      ]
      const db = getAccountDb()
      for (const owner of owners)
        db.prepare(
          "INSERT INTO accounts(id,email,salt,hash,verified_at,created_at) VALUES(?,?,?,?,?,?)",
        ).run(
          owner,
          `${owner}@synthetic.invalid`,
          "synthetic",
          "synthetic",
          Date.now(),
          Date.now(),
        )
      const { api: app } = await import("../api/index")
      const results: Array<{ quizId: string }> = []
      for (const owner of owners) {
        const session = await mintToken(owner, SESSION_ROLES.MANAGER)
        const response = await app.request("/extensions/quizzes", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quizz: creationInput(),
            extras: creationExtras(),
          }),
        })
        expect(response.status).toBe(201)
        const result = (await response.json()) as { quizId: string }
        results.push(result)
        await withAccount(owner, () =>
          expect(native.getQuizzById(result.quizId).id).toBe(result.quizId),
        )
      }
      expect(results[0].quizId).not.toBe(results[1].quizId)
      expect(fs.existsSync(path.join(fixture.root, "quizz"))).toBe(false)
      const baseline = creationTree(fixture.root)
      const interrupted = await creationChild(
        "before-id-return",
        fixture.root,
        fixture.token,
        "",
        owners[0],
      )
      expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL")
      expect(interrupted.timedOut).toBe(false)
      process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
      const runs = await creationReplayTwice(fixture.root, fixture.token)
      expect(
        new Set([interrupted.pid, ...runs.map((run) => run.pid)]).size,
      ).toBe(3)
      for (const run of runs) {
        expect(run.process.code, run.process.stderr).toBe(0)
        expect(run.process.timedOut).toBe(false)
        expect(run.state).toStrictEqual(baseline)
      }
      retainCreationReceipt("actual-api-tenant-flag-replay", {
        state: "PASS",
        owners,
        interrupted,
        baseline,
        runs,
      })
      for (const owner of owners)
        expect(
          fs.readdirSync(path.join(fixture.root, "tenants", owner, "quizz")),
        ).toHaveLength(1)
    }, 85000)
    it("retains explicit accounts-off legacy import with no sidecar publication", () => {
      const result = fixture.service.importEnhancedBundle(creationInput())
      expect(result.quizId).toMatch(/^[A-Za-z0-9_-]{21}$/u)
      expect(fs.readdirSync(native.getPath("extensions/quizzes"))).toEqual([])
      expect(fixture.service.getCompositeQuiz(result.quizId).extras).toBeNull()
    })
    it.each([
      "before-public",
      "after-sidecar",
      "before-id-return",
      "committed-visible",
      "private-cleanup",
      "before-slot-removal",
    ] as const)(
      "survives actual native %s SIGKILL and two fresh startup replays",
      async (boundary) => {
        const receipt: Record<string, unknown> = { boundary, state: "STARTED" }
        try {
          fs.mkdirSync(native.getPath("quizz"))
          native.saveQuizz({
            ...creationInput(),
            subject: "Unrelated native sentinel",
          })
          const publicFiles = (state: Record<string, unknown>) =>
            Object.fromEntries(
              Object.entries(state).filter(
                ([key]) =>
                  key.startsWith("quizz/") ||
                  key.startsWith("extensions/quizzes/"),
              ),
            )
          const baseline = publicFiles(creationTree(fixture.root))
          const interrupted = await creationChild(
            boundary,
            fixture.root,
            fixture.token,
          )
          const checkpoint = JSON.parse(
            fs.readFileSync(
              path.join(fixture.root, ".c1-interrupted.json"),
              "utf8",
            ),
          )
          const runs = await creationReplayTwice(fixture.root, fixture.token)
          Object.assign(receipt, { interrupted, checkpoint, baseline, runs })
          expect(interrupted.timedOut).toBe(false)
          expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL")
          expect(
            new Set([interrupted.pid, ...runs.map((run) => run.pid)]).size,
          ).toBe(3)
          for (const run of runs) {
            expect(run.pid).toBe(run.process.pid)
            expect(run.process.timedOut).toBe(false)
            expect(run.process.code, run.process.stderr).toBe(0)
            expect(publicFiles(run.state)).toStrictEqual(
              [
                "committed-visible",
                "private-cleanup",
                "before-slot-removal",
              ].includes(boundary)
                ? publicFiles(checkpoint.state)
                : baseline,
            )
          }
          expect(runs[1].report.recovered).toBe(0)
          receipt.state = "PASS"
        } catch (error) {
          receipt.state = "FAIL"
          receipt.error = error instanceof Error ? error.stack : String(error)
          throw error
        } finally {
          retainCreationReceipt(`native-${boundary}`, receipt)
        }
      },
      85000,
    )
  },
)
