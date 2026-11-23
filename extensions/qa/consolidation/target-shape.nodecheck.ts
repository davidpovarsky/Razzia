import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createHash, randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { quizExtrasV2Schema, type QuizExtrasV2 } from "../../src/core/index"
import { createNativeCreationPort } from "../../src/server/storage/creation-reservation"
import {
  nativeInput,
  richNativeExtras,
} from "../../src/server/storage/native-binding-fixture"
import * as native from "../../../packages/socket/src/services/config"
import {
  accountsEnabled,
  activeAccount,
  withAccount,
} from "../../../packages/socket/src/services/account-scope"

function isTargetShapeObservationRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function requireTargetShapeObservationRecord(
  value: unknown,
): Record<string, unknown> {
  if (!isTargetShapeObservationRecord(value)) {
    throw new Error("Invalid target-shape evidence record")
  }

  return value
}

function requireTargetShapeObservationString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Missing target-shape evidence text")
  }

  return value
}

function requireTargetShapeObservationPresent<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Missing target-shape evidence value")
  }

  return value
}

function isTargetShapeObservationExtras(value: unknown): value is QuizExtrasV2 {
  const parsed = quizExtrasV2Schema.safeParse(value)

  return parsed.success && isDeepStrictEqual(parsed.data, value)
}

function requireTargetShapeObservationExtras(
  value: unknown,
): QuizExtrasV2 | null {
  if (value === null) {
    return value
  }

  if (!isTargetShapeObservationExtras(value)) {
    throw new Error("Invalid raw target-shape fixture extras")
  }

  return value
}

const OWNER = "00000000-0000-4000-8000-0000000000a1"
const binding = {
  version: 1 as const,
  operationId: "3".repeat(64),
  authorizationDigest: "4".repeat(64),
}
const self = fileURLToPath(import.meta.url)
const folder = requireTargetShapeObservationString(
  process.env.C1_TARGET_SHAPE_RECEIPTS,
)

const record = (root: string) =>
  path.join(
    root,
    ".tadazz-creation-operations-v1",
    binding.operationId,
    "operation.json",
  )
const read = (file: string) =>
  requireTargetShapeObservationRecord(JSON.parse(fs.readFileSync(file, "utf8")))

const port = () =>
  requireTargetShapeObservationPresent(
    createNativeCreationPort({
      configuredRoot: () =>
        requireTargetShapeObservationString(process.env.CONFIG_PATH),
      getPath: native.getPath,
      accountsEnabled,
      activeOwner: activeAccount,
      prepare: native.prepareNativeQuizCreation,
      enableOperationBindings: true,
    }).operations,
  )

const scoped = <T>(fn: () => T | Promise<T>) => withAccount<T>(OWNER, fn)
function snapshot(root: string) {
  const result: Record<string, string> = {}
  function walk(directory: string) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name)

      if (fs.lstatSync(file).isDirectory()) {
        walk(file)
      } else {
        result[path.relative(root, file)] = createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex")
      }
    }
  }
  walk(root)

  return result
}
function validateFixture(root: string, token: string) {
  assert.equal(path.dirname(root), os.tmpdir())
  assert.equal(fs.realpathSync(root), root)
  assert.ok(path.basename(root).startsWith("tadazz-target-shape-owned-"))
  assert.equal(fs.readFileSync(path.join(root, ".owner"), "utf8"), token)
}
function fresh(root: string, token: string, mode: string) {
  const child = spawnSync(
    process.execPath,
    [self, "child", mode, root, token],
    { encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024 },
  )
  assert.equal(child.error, undefined)
  assert.equal(child.status, 0, child.stderr)
  assert.equal(child.signal, null)
  const body = requireTargetShapeObservationRecord(JSON.parse(child.stdout))
  assert.equal(body.pid, child.pid)
  assert.notEqual(body.pid, process.pid)

  return {
    pid: child.pid,
    exit: child.status,
    signal: child.signal,
    stdout: child.stdout,
    stderr: child.stderr,
    body,
  }
}

if (process.argv[2] === "child") {
  const [, , , mode, root, token] = process.argv
  validateFixture(root, token)
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  let outcome: unknown = undefined

  try {
    if (mode === "lookup") {
      outcome = await scoped(() => port().lookup(binding))
    } else if (mode === "retry") {
      const request = read(path.join(root, "request.json"))
      outcome = await scoped(() =>
        port().create(
          binding,
          requireTargetShapeObservationRecord(request.input),
          requireTargetShapeObservationExtras(request.extras),
        ),
      )
    } else {
      throw Error("Unknown target fixture command")
    }
  } catch (error) {
    outcome = { rejected: String(error) }
  }

  process.stdout.write(
    JSON.stringify({ pid: process.pid, outcome, state: snapshot(root) }),
  )
} else {
  for (const field of [
    "valid-scalar-control",
    "valid-null-sidecar-control",
    "quizId",
    "nonce",
    "logicalDigest",
    "baseSha256",
    "sidecarSha256",
  ]) {
    test(`target scalar shape: ${field}`, async () => {
      const root = fs.mkdtempSync(
          path.join(os.tmpdir(), "tadazz-target-shape-owned-"),
        ),
        token = randomUUID()
      fs.writeFileSync(path.join(root, ".owner"), token, { flag: "wx" })
      process.env.CONFIG_PATH = root
      process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
      fs.mkdirSync(path.join(root, "tenants", OWNER, "quizz"), {
        recursive: true,
        mode: 0o700,
      })
      const sentinel = path.join(
        root,
        "tenants",
        OWNER,
        "quizz",
        "sentinel.txt",
      )
      fs.writeFileSync(sentinel, "Unrelated native sentinel", { flag: "wx" })

      try {
        const input = nativeInput("Scalar target fixture"),
          extras =
            field === "valid-null-sidecar-control"
              ? null
              : richNativeExtras("template", input)
        fs.writeFileSync(
          path.join(root, "request.json"),
          JSON.stringify({ input, extras }),
          { flag: "wx", mode: 0o600 },
        )
        const result = await scoped(() => port().create(binding, input, extras))
        const original = read(record(root)),
          changed = structuredClone(original)

        if (!field.startsWith("valid-")) {
          assert.equal(
            typeof requireTargetShapeObservationRecord(changed.target)[field],
            "string",
          )
          requireTargetShapeObservationRecord(changed.target)[field] = [
            requireTargetShapeObservationRecord(changed.target)[field],
          ]

          if (field === "quizId") {
            requireTargetShapeObservationRecord(changed.result).quizId = [
              requireTargetShapeObservationRecord(changed.result).quizId,
            ]
          }

          if (field === "logicalDigest") {
            requireTargetShapeObservationRecord(changed.result).baseDigest = [
              requireTargetShapeObservationRecord(changed.result).baseDigest,
            ]
          }

          fs.writeFileSync(record(root), JSON.stringify(changed, null, 2))
        }

        const before = snapshot(root)
        const lookup = fresh(root, token, "lookup"),
          retry = fresh(root, token, "retry")
        const evidence = {
          field,
          original,
          changed,
          result,
          before,
          after: snapshot(root),
          lookup,
          retry,
        }
        // Preserve observed outcomes even for baseline assertion failures.
        fs.writeFileSync(
          path.join(folder, `${field}.json`),
          `${JSON.stringify(evidence, null, 2)}\n`,
          { flag: "wx", mode: 0o600 },
        )

        if (field.startsWith("valid-")) {
          assert.deepEqual(lookup.body.outcome, { status: "committed", result })
          assert.deepEqual(retry.body.outcome, result)
        } else {
          assert.deepEqual(lookup.body.outcome, {
            status: "unresolved",
            quizId: null,
          })
          assert.equal(
            typeof requireTargetShapeObservationRecord(retry.body.outcome)
              .rejected,
            "string",
          )
        }

        assert.deepEqual(snapshot(root), before)
        assert.equal(
          fs
            .readdirSync(path.join(root, "tenants", OWNER, "quizz"))
            .filter((name) => name.endsWith(".json")).length,
          1,
        )
        assert.equal(
          fs.readFileSync(sentinel, "utf8"),
          "Unrelated native sentinel",
        )
      } finally {
        validateFixture(root, token)
        fs.rmSync(root, { recursive: true })
      }
    })
  }
}
