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
import { assertCreationPrivateHttpErrors } from "../../../../extensions/src/server/storage/creation-native-review-fixture"
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

function isQuizCreationObservationRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function requireQuizCreationObservationRecord(
  value: unknown,
): Record<string, unknown> {
  if (!isQuizCreationObservationRecord(value)) {
    throw new Error("Invalid quiz-creation evidence record")
  }

  return value
}

function requireQuizCreationObservationString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Missing quiz-creation evidence text")
  }

  return value
}

function isQuizCreationObservationArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isQuizCreationObservationRuns(
  value: unknown,
): value is Array<Record<string, unknown>> {
  if (!isQuizCreationObservationArray(value)) {
    return false
  }

  for (const entry of value) {
    if (!isQuizCreationObservationRecord(entry)) {
      return false
    }
  }

  return true
}

function requireQuizCreationObservationRuns(
  value: unknown,
): Array<Record<string, unknown>> {
  if (!isQuizCreationObservationRuns(value)) {
    throw new Error("Invalid quiz-creation replay evidence array")
  }

  return value
}

function isQuizCreationObservationResult(
  value: unknown,
): value is Record<string, unknown> & { quizId: string } {
  return (
    isQuizCreationObservationRecord(value) && typeof value.quizId === "string"
  )
}

function requireQuizCreationObservationResult(
  value: unknown,
): Record<string, unknown> & { quizId: string } {
  if (!isQuizCreationObservationResult(value)) {
    throw new Error("Invalid quiz-creation API result")
  }

  return value
}

describe.runIf(process.platform === "linux")(
  "C1 actual native creation composition",
  () => {
    type InitializedFixtureValue = ReturnType<typeof createCreationFixture>
    let fixture: InitializedFixtureValue | undefined = undefined
    function requireInitializedFixture(): InitializedFixtureValue {
      if (fixture === undefined) {
        throw new Error("Fixture state fixture was read before initialization")
      }

      return fixture
    }
    let config: string | undefined = undefined,
      accounts: string | undefined = undefined,
      prototype: string | undefined = undefined
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
      removeCreationFixture(
        requireInitializedFixture().root,
        requireInitializedFixture().token,
      )

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

      if (prototype === undefined) {
        delete process.env.TADAZZ_C1_CREATION_PROTOTYPE
      } else {
        process.env.TADAZZ_C1_CREATION_PROTOTYPE = prototype
      }
    })
    it("uses the actual validator, one preparer and independent random8 native basename without opaque save", () => {
      const input = {
        ...creationInput(),
        ignoredByNative: "stripped before frozen digest",
      }
      const before = JSON.stringify(input)
      const result = requireInitializedFixture().service.createCompositeQuiz({
        quizz: input,
        extras: creationExtras(),
      })
      const files = fs.readdirSync(native.getPath("quizz"))
      expect(result.quizId).toMatch(/^[A-Za-z0-9_-]{21}$/u)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/-[A-Za-z0-9_-]{8}\.json$/u)
      expect(files[0]).not.toBe(`${result.quizId}.json`)
      const stored = requireQuizCreationObservationRecord(
        JSON.parse(
          fs.readFileSync(native.getPath(`quizz/${files[0]}`), "utf8"),
        ),
      )
      const { id, ...logical } = stored
      expect(id).toBe(result.quizId)
      expect(logical).toStrictEqual(quizzValidator.parse(input))
      expect(result.baseDigest).toBe(
        computeCanonicalBaseDigest(quizzValidator.parse(input)),
      )
      expect(JSON.stringify(input)).toBe(before)
      const composite = requireInitializedFixture().service.getCompositeQuiz(
        result.quizId,
      )
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
      const before = creationTree(requireInitializedFixture().root)
      process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
      expect(() => native.prepareNativeQuizCreation(creationInput())).toThrow(
        /scope/,
      )
      expect(() =>
        requireInitializedFixture().service.createCompositeQuiz({
          quizz: creationInput(),
          extras: creationExtras(),
        }),
      ).toThrow(/owner/)
      expect(creationTree(requireInitializedFixture().root)).toStrictEqual(
        before,
      )
    })
    it("uses real manager JWT/session middleware in two tenants and discovers the dedicated roots after a flag change", async () => {
      process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
      process.env.TADAZZ_C1_CREATION_PROTOTYPE = "true"
      const owners = [
        "00000000-0000-4000-8000-0000000000A1",
        "00000000-0000-4000-8000-0000000000B2",
      ]
      const db = getAccountDb()
      for (const owner of owners) {
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
      }
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
        const result = requireQuizCreationObservationResult(
          await response.json(),
        )
        results.push(result)
        await withAccount(owner, () =>
          expect(native.getQuizzById(result.quizId).id).toBe(result.quizId),
        )
      }
      expect(results[0].quizId).not.toBe(results[1].quizId)
      expect(
        fs.existsSync(path.join(requireInitializedFixture().root, "quizz")),
      ).toBe(false)
      const baseline = creationTree(requireInitializedFixture().root)
      const interrupted = await creationChild({
        mode: "before-id-return",
        root: requireInitializedFixture().root,
        token: requireInitializedFixture().token,
        sequence: "",
        owner: owners[0],
      })
      expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL")
      expect(interrupted.timedOut).toBe(false)
      process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
      const runs = requireQuizCreationObservationRuns(
        await creationReplayTwice(
          requireInitializedFixture().root,
          requireInitializedFixture().token,
        ),
      )
      expect(
        new Set([interrupted.pid, ...runs.map((run) => run.pid)]).size,
      ).toBe(3)
      for (const run of runs) {
        expect(
          requireQuizCreationObservationRecord(run.process).code,
          requireQuizCreationObservationString(
            requireQuizCreationObservationRecord(run.process).stderr,
          ),
        ).toBe(0)
        expect(requireQuizCreationObservationRecord(run.process).timedOut).toBe(
          false,
        )
        expect(run.state).toStrictEqual(baseline)
      }
      retainCreationReceipt("actual-api-tenant-flag-replay", {
        state: "PASS",
        owners,
        interrupted,
        baseline,
        runs,
      })
      for (const owner of owners) {
        expect(
          fs.readdirSync(
            path.join(
              requireInitializedFixture().root,
              "tenants",
              owner,
              "quizz",
            ),
          ),
        ).toHaveLength(1)
      }
    }, 85000)
    it("keeps actual HTTP create/import failures private before durable intent", async () => {
      process.env.TADAZZ_C1_CREATION_PROTOTYPE = "true"
      const { api } = await import("../api/index")
      await assertCreationPrivateHttpErrors(
        async (url, init) => api.request(url, init),
        () => mintToken("c1-synthetic-manager", SESSION_ROLES.MANAGER),
      )
    })
    it("retains explicit accounts-off legacy import with no sidecar publication", () => {
      const result =
        requireInitializedFixture().service.importEnhancedBundle(
          creationInput(),
        )
      expect(result.quizId).toMatch(/^[A-Za-z0-9_-]{21}$/u)
      expect(fs.readdirSync(native.getPath("extensions/quizzes"))).toEqual([])
      expect(
        requireInitializedFixture().service.getCompositeQuiz(result.quizId)
          .extras,
      ).toBeNull()
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
          const baseline = publicFiles(
            creationTree(requireInitializedFixture().root),
          )
          const interrupted = await creationChild({
            mode: boundary,
            root: requireInitializedFixture().root,
            token: requireInitializedFixture().token,
          })
          const checkpoint = requireQuizCreationObservationRecord(
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

          const runs = requireQuizCreationObservationRuns(
            await creationReplayTwice(
              requireInitializedFixture().root,
              requireInitializedFixture().token,
            ),
          )
          Object.assign(receipt, { interrupted, checkpoint, baseline, runs })
          expect(interrupted.timedOut).toBe(false)
          expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL")
          expect(
            new Set([interrupted.pid, ...runs.map((run) => run.pid)]).size,
          ).toBe(3)
          for (const run of runs) {
            expect(run.pid).toBe(
              requireQuizCreationObservationRecord(run.process).pid,
            )
            expect(
              requireQuizCreationObservationRecord(run.process).timedOut,
            ).toBe(false)
            expect(
              requireQuizCreationObservationRecord(run.process).code,
              requireQuizCreationObservationString(
                requireQuizCreationObservationRecord(run.process).stderr,
              ),
            ).toBe(0)
            expect(
              publicFiles(requireQuizCreationObservationRecord(run.state)),
            ).toStrictEqual(
              [
                "committed-visible",
                "private-cleanup",
                "before-slot-removal",
              ].includes(boundary)
                ? publicFiles(
                    requireQuizCreationObservationRecord(checkpoint.state),
                  )
                : baseline,
            )
          }
          expect(
            requireQuizCreationObservationRecord(runs[1].report).recovered,
          ).toBe(0)
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
