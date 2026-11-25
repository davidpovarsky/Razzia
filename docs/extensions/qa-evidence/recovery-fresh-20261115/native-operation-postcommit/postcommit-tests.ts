import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createHash, randomUUID } from "node:crypto"
import {
  createNativeCreationPort,
  recoverCreationReservations,
} from "../../../../../extensions/src/server/storage/creation-reservation"
import {
  nativeInput,
  richNativeExtras,
} from "../../../../../extensions/src/server/storage/native-binding-fixture"
import * as native from "../../../../../packages/socket/src/services/config"
import {
  accountsEnabled,
  activeAccount,
  withAccount,
} from "../../../../../packages/socket/src/services/account-scope"

const OWNER = "00000000-0000-4000-8000-0000000000a1"
const OTHER = "00000000-0000-4000-8000-0000000000b2"
const binding = {
  version: 1 as const,
  operationId: "e".repeat(64),
  authorizationDigest: "f".repeat(64),
}
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"))
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const self = fileURLToPath(import.meta.url)
const selected = process.env.C1_POSTCOMMIT_RECEIPTS!
const op = (root: string) =>
  path.join(
    root,
    ".tadazz-creation-operations-v1",
    binding.operationId,
    "operation.json",
  )
const family = (root: string) =>
  path.join(root, ".tadazz-creation-v1", "tenants", OWNER)
const ports = () =>
  createNativeCreationPort({
    configuredRoot: () => process.env.CONFIG_PATH!,
    getPath: native.getPath,
    accountsEnabled,
    activeOwner: activeAccount,
    prepare: native.prepareNativeQuizCreation,
    enableOperationBindings: true,
  })
const scoped = <T>(fn: () => T | Promise<T>) => withAccount<T>(OWNER, fn)
function tree(root: string) {
  const result: Record<string, string> = {}
  function walk(directory: string) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name)
      if (fs.lstatSync(file).isDirectory()) walk(file)
      else result[path.relative(root, file)] = hash(fs.readFileSync(file))
    }
  }
  walk(root)
  return result
}
function publicTree(root: string) {
  return Object.fromEntries(
    Object.entries(tree(root)).filter(([name]) => name.startsWith("tenants/")),
  )
}
function validateFixture(root: string, token: string) {
  assert.equal(path.dirname(root), os.tmpdir())
  assert.equal(fs.realpathSync(root), root)
  assert.ok(path.basename(root).startsWith("tadazz-postcommit-owned-"))
  assert.equal(fs.readFileSync(path.join(root, ".owner"), "utf8"), token)
}
function child(root: string, token: string, mode: string) {
  const result = spawnSync(
    process.execPath,
    [self, "child", mode, root, token],
    { encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024 },
  )
  assert.equal(result.error, undefined)
  assert.equal(result.signal, null)
  assert.equal(result.status, 0, result.stderr)
  const body = JSON.parse(result.stdout)
  assert.equal(body.pid, result.pid)
  assert.notEqual(body.pid, process.pid)
  return {
    pid: result.pid,
    exit: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    body,
  }
}
function retained(name: string, value: unknown) {
  fs.writeFileSync(
    path.join(selected, name + ".json"),
    JSON.stringify(value, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  )
}
async function fixture(fn: (root: string, token: string) => Promise<void>) {
  const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "tadazz-postcommit-owned-"),
    ),
    token = randomUUID()
  fs.writeFileSync(path.join(root, ".owner"), token, { flag: "wx" })
  const input = nativeInput("Postcommit isolated acceptance"),
    extras = richNativeExtras("template", input)
  fs.writeFileSync(
    path.join(root, "request.json"),
    JSON.stringify({ input, extras }),
    { flag: "wx", mode: 0o600 },
  )
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  for (const owner of [OWNER, OTHER]) {
    fs.mkdirSync(path.join(root, "tenants", owner, "quizz"), {
      recursive: true,
      mode: 0o700,
    })
    fs.mkdirSync(path.join(root, "tenants", owner, "extensions", "quizzes"), {
      recursive: true,
      mode: 0o700,
    })
    fs.writeFileSync(
      path.join(root, "tenants", owner, "quizz", "sentinel.txt"),
      "native sentinel",
      { flag: "wx" },
    )
    fs.writeFileSync(
      path.join(
        root,
        "tenants",
        owner,
        "extensions",
        "quizzes",
        "sentinel.txt",
      ),
      "sidecar sentinel",
      { flag: "wx" },
    )
  }
  try {
    await fn(root, token)
  } finally {
    validateFixture(root, token)
    fs.rmSync(root, { recursive: true })
  }
}
function assertSentinels(root: string) {
  for (const owner of [OWNER, OTHER]) {
    assert.equal(
      fs.readFileSync(
        path.join(root, "tenants", owner, "quizz", "sentinel.txt"),
        "utf8",
      ),
      "native sentinel",
    )
    assert.equal(
      fs.readFileSync(
        path.join(
          root,
          "tenants",
          owner,
          "extensions",
          "quizzes",
          "sentinel.txt",
        ),
        "utf8",
      ),
      "sidecar sentinel",
    )
  }
}
function committedIntent(root: string) {
  const record = read(op(root)),
    target = record.target
  const active = path.join(family(root), "active", target.quizId, "intent.json")
  const resolved = path.join(
    family(root),
    "resolved",
    `${target.quizId}-${target.nonce}`,
    "intent.json",
  )
  const file = fs.existsSync(active) ? active : resolved
  const intent = read(file)
  assert.equal(intent.phase, "committed")
  assert.equal(intent.operation.operationId, binding.operationId)
  return {
    file,
    intent,
    record,
    result: {
      quizId: intent.quizId,
      revision: 1,
      baseDigest: intent.logicalDigest,
    },
  }
}
function editPublicAfterCommit(
  root: string,
  intent: ReturnType<typeof committedIntent>["intent"],
) {
  const base = path.join(root, "tenants", OWNER, "quizz", intent.baseFileName)
  const sidecar = path.join(
    root,
    "tenants",
    OWNER,
    "extensions",
    "quizzes",
    intent.quizId + ".json",
  )
  const nativeValue = read(base),
    extrasValue = read(sidecar)
  nativeValue.subject = "Later user edit must survive"
  extrasValue.authoring = { showNote: "Later sidecar edit must survive" }
  fs.writeFileSync(base, JSON.stringify(nativeValue, null, 2))
  fs.writeFileSync(sidecar, JSON.stringify(extrasValue, null, 2))
}

if (process.argv[2] === "child") {
  const [, , , mode, root, token] = process.argv
  validateFixture(root, token)
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  let outcome: unknown
  try {
    if (mode === "recover")
      outcome = { ok: true, report: recoverCreationReservations(root) }
    else if (mode === "lookup")
      outcome = await scoped(() => ports().operations!.lookup(binding))
    else if (mode === "retry") {
      const request = read(path.join(root, "request.json"))
      outcome = await scoped(() =>
        ports().operations!.create(binding, request.input, request.extras),
      )
    } else throw Error("Unknown fixture child mode")
  } catch (error) {
    outcome = { ok: false, error: String(error) }
  }
  process.stdout.write(
    JSON.stringify({
      pid: process.pid,
      outcome,
      public: publicTree(root),
      state: tree(root),
    }),
  )
} else {
  test("postcommit: ENOSPC outcome rename retains uncertainty and denies duplicate creation", () =>
    fixture(async (root, token) => {
      const rename = fs.renameSync.bind(fs)
      let injected = false
      fs.renameSync = ((from, to) => {
        if (
          String(to) === op(root) &&
          read(String(from)).phase === "committed"
        ) {
          injected = true
          throw Object.assign(Error("synthetic committed outcome ENOSPC"), {
            code: "ENOSPC",
          })
        }
        rename(from, to)
      }) as typeof fs.renameSync
      const request = read(path.join(root, "request.json"))
      try {
        await assert.rejects(
          scoped(() =>
            ports().operations!.create(binding, request.input, request.extras),
          ),
          /unresolved/,
        )
      } finally {
        fs.renameSync = rename
      }
      assert.equal(injected, true)
      const witness = committedIntent(root)
      assert.equal(witness.record.phase, "reserved")
      const nextNames = fs
        .readdirSync(path.dirname(op(root)))
        .filter((name) => name.endsWith(".next"))
      assert.equal(nextNames.length, 1)
      const next = read(path.join(path.dirname(op(root)), nextNames[0]))
      assert.equal(next.phase, "committed")
      editPublicAfterCommit(root, witness.intent)
      const before = tree(root),
        publicBefore = publicTree(root)
      const lookup = child(root, token, "lookup"),
        retry = child(root, token, "retry"),
        recover = child(root, token, "recover")
      assert.equal(lookup.body.outcome.status, "unresolved")
      assert.equal(retry.body.outcome.ok, false)
      assert.equal(recover.body.outcome.ok, false)
      assert.match(recover.body.outcome.error, /startup blocked/)
      assert.deepEqual(tree(root), before)
      assert.deepEqual(publicTree(root), publicBefore)
      assert.equal(
        fs
          .readdirSync(path.join(root, "tenants", OWNER, "quizz"))
          .filter((name) => name.endsWith(".json")).length,
        1,
      )
      assertSentinels(root)
      retained("outcome-rename-enospc", {
        injected,
        witness,
        pendingOutcome: next,
        before,
        after: tree(root),
        publicBefore,
        publicAfter: publicTree(root),
        lookup,
        retry,
        recover,
      })
    }))
  for (const fault of ["outcome-directory-fence", "resolved-private-cleanup"]) {
    test(
      "postcommit: " +
        fault +
        " preserves historical result and later edits through fresh cleanup",
      () =>
        fixture(async (root, token) => {
          const sync = fs.fsyncSync.bind(fs),
            unlink = fs.unlinkSync.bind(fs)
          let injected = false
          fs.fsyncSync = ((fd) => {
            if (
              fault === "outcome-directory-fence" &&
              !injected &&
              fs.readlinkSync(`/proc/self/fd/${fd}`) ===
                path.dirname(op(root)) &&
              fs.existsSync(op(root)) &&
              read(op(root)).phase === "committed"
            ) {
              injected = true
              throw Object.assign(Error("synthetic outcome directory EIO"), {
                code: "EIO",
              })
            }
            sync(fd)
          }) as typeof fs.fsyncSync
          fs.unlinkSync = ((file) => {
            if (
              fault === "resolved-private-cleanup" &&
              !injected &&
              String(file).startsWith(path.join(family(root), "resolved")) &&
              String(file).endsWith("/base.record")
            ) {
              injected = true
              throw Object.assign(
                Error("synthetic committed private cleanup EACCES"),
                { code: "EACCES" },
              )
            }
            unlink(file)
          }) as typeof fs.unlinkSync
          const request = read(path.join(root, "request.json"))
          try {
            await assert.rejects(
              scoped(() =>
                ports().operations!.create(
                  binding,
                  request.input,
                  request.extras,
                ),
              ),
              /unresolved/,
            )
          } finally {
            fs.fsyncSync = sync
            fs.unlinkSync = unlink
          }
          assert.equal(injected, true)
          const witness = committedIntent(root)
          assert.equal(witness.record.phase, "committed")
          assert.deepEqual(witness.record.result, witness.result)
          editPublicAfterCommit(root, witness.intent)
          const publicBefore = publicTree(root),
            outcomeHash = hash(fs.readFileSync(op(root)))
          const lookup = child(root, token, "lookup"),
            retry = child(root, token, "retry")
          assert.deepEqual(lookup.body.outcome, {
            status: "committed",
            result: witness.result,
          })
          assert.deepEqual(retry.body.outcome, witness.result)
          const first = child(root, token, "recover"),
            second = child(root, token, "recover"),
            finalLookup = child(root, token, "lookup")
          assert.equal(first.body.outcome.ok, true)
          assert.equal(first.body.outcome.report.recovered, 1)
          assert.equal(second.body.outcome.ok, true)
          assert.equal(second.body.outcome.report.recovered, 0)
          assert.deepEqual(finalLookup.body.outcome, {
            status: "committed",
            result: witness.result,
          })
          for (const phase of [lookup, retry, first, second, finalLookup])
            assert.deepEqual(phase.body.public, publicBefore)
          assert.equal(hash(fs.readFileSync(op(root))), outcomeHash)
          assert.ok(!fs.existsSync(witness.file))
          assert.equal(
            fs.readdirSync(path.join(root, ".tadazz-creation-operations-v1"))
              .length,
            1,
          )
          assertSentinels(root)
          retained(fault, {
            injected,
            witness,
            publicBefore,
            publicAfter: publicTree(root),
            originalOutcomeHash: outcomeHash,
            finalOutcomeHash: hash(fs.readFileSync(op(root))),
            lookup,
            retry,
            first,
            second,
            finalLookup,
            final: tree(root),
          })
        }),
    )
  }
}
