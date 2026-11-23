import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createHash, randomUUID } from "node:crypto"
import { createNativeCreationPort } from "../../../../../extensions/src/server/storage/creation-reservation"
import * as native from "../../../../../packages/socket/src/services/config"
import {
  accountsEnabled,
  activeAccount,
  withAccount,
} from "../../../../../packages/socket/src/services/account-scope"

const OWNER = "00000000-0000-4000-8000-0000000000a1"
const binding = {
  version: 1 as const,
  operationId: "1".repeat(64),
  authorizationDigest: "2".repeat(64),
}
const input = {
  gameMode: "quiz",
  subject: "Witness admission fixture",
  questions: [
    {
      type: "single",
      question: "Synthetic",
      answers: ["A", "B"],
      solutions: [0],
      cooldown: 3,
      time: 20,
    },
  ],
}
const self = fileURLToPath(import.meta.url)
const folder = process.env.C1_WITNESS_RECEIPTS!
const record = (root: string) =>
  path.join(
    root,
    ".tadazz-creation-operations-v1",
    binding.operationId,
    "operation.json",
  )
const port = () =>
  createNativeCreationPort({
    configuredRoot: () => process.env.CONFIG_PATH!,
    getPath: native.getPath,
    accountsEnabled,
    activeOwner: activeAccount,
    prepare: native.prepareNativeQuizCreation,
    enableOperationBindings: true,
  }).operations!
const scoped = <T>(fn: () => T | Promise<T>) => withAccount<T>(OWNER, fn)
function snapshot(root: string) {
  const result: Record<string, unknown> = {}
  function walk(directory: string) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name),
        stat = fs.lstatSync(file)
      if (stat.isSymbolicLink())
        result[path.relative(root, file)] = { link: fs.readlinkSync(file) }
      else if (stat.isDirectory()) walk(file)
      else
        result[path.relative(root, file)] = {
          sha256: createHash("sha256")
            .update(fs.readFileSync(file))
            .digest("hex"),
          mode: stat.mode,
          links: stat.nlink,
        }
    }
  }
  walk(root)
  return result
}
function assertFixture(root: string, token: string) {
  assert.equal(path.dirname(root), os.tmpdir())
  assert.equal(fs.realpathSync(root), root)
  assert.ok(path.basename(root).startsWith("tadazz-witness-owned-"))
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
  const body = JSON.parse(child.stdout)
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
  assertFixture(root, token)
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  let outcome: unknown
  try {
    if (mode === "lookup") outcome = await scoped(() => port().lookup(binding))
    else if (mode === "retry")
      outcome = await scoped(() => port().create(binding, input, null))
    else throw Error("Unknown witness fixture command")
  } catch (error) {
    outcome = { rejected: String(error) }
  }
  process.stdout.write(
    JSON.stringify({ pid: process.pid, outcome, snapshot: snapshot(root) }),
  )
} else {
  for (const fault of [
    "exposed-mode",
    "oversized-record",
    "hard-linked-record",
    "linked-slot",
  ]) {
    test("physical witness admission: " + fault, async () => {
      const root = fs.mkdtempSync(
          path.join(os.tmpdir(), "tadazz-witness-owned-"),
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
      const foreign = path.join(root, "foreign-sentinel.txt")
      fs.writeFileSync(foreign, "Unrelated private sentinel", { flag: "wx" })
      try {
        const result = await scoped(() => port().create(binding, input, null))
        assert.deepEqual(await scoped(() => port().lookup(binding)), {
          status: "committed",
          result,
        })
        const original = JSON.parse(fs.readFileSync(record(root), "utf8"))
        assert.equal(original.target.sidecarSha256, null)
        assert.ok(
          !fs.existsSync(
            path.join(
              root,
              "tenants",
              OWNER,
              "extensions",
              "quizzes",
              result.quizId + ".json",
            ),
          ),
        )
        if (fault === "exposed-mode") fs.chmodSync(record(root), 0o644)
        if (fault === "oversized-record")
          fs.appendFileSync(record(root), " ".repeat(16385))
        if (fault === "hard-linked-record")
          fs.linkSync(record(root), path.join(root, "linked-witness.json"))
        if (fault === "linked-slot") {
          const retained = path.join(root, "retained-original-slot")
          fs.renameSync(path.dirname(record(root)), retained)
          fs.symlinkSync(retained, path.dirname(record(root)), "dir")
        }
        const before = snapshot(root)
        const lookup = fresh(root, token, "lookup"),
          retry = fresh(root, token, "retry")
        assert.deepEqual(lookup.body.outcome, {
          status: "unresolved",
          quizId: null,
        })
        assert.equal(typeof retry.body.outcome.rejected, "string")
        assert.deepEqual(lookup.body.snapshot, before)
        assert.deepEqual(retry.body.snapshot, before)
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
        assert.equal(
          fs.readFileSync(foreign, "utf8"),
          "Unrelated private sentinel",
        )
        fs.writeFileSync(
          path.join(folder, fault + ".json"),
          JSON.stringify(
            {
              fault,
              original,
              result,
              before,
              after: snapshot(root),
              lookup,
              retry,
            },
            null,
            2,
          ) + "\n",
          { flag: "wx", mode: 0o600 },
        )
      } finally {
        assertFixture(root, token)
        fs.rmSync(root, { recursive: true })
      }
    })
  }
}
