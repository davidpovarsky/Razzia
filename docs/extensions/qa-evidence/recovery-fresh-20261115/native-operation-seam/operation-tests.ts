import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createHash, randomUUID } from "node:crypto"
import { createNativeCreationPort, recoverCreationReservations } from "../../../../../extensions/src/server/storage/creation-reservation"
import { OPERATION_FAMILY } from "../../../../../extensions/src/server/storage/creation-operation-record"
import { nativeInput, richNativeExtras } from "../../../../../extensions/src/server/storage/native-binding-fixture"
import * as native from "../../../../../packages/socket/src/services/config"
import { accountsEnabled, activeAccount, withAccount } from "../../../../../packages/socket/src/services/account-scope"

const OWNER = "00000000-0000-4000-8000-0000000000a1"
const FOREIGN = "00000000-0000-4000-8000-0000000000b2"
const binding = { version: 1 as const, operationId: "a".repeat(64), authorizationDigest: "b".repeat(64) }
const input = nativeInput("Durable operation"), extras = richNativeExtras("template", input)
extras.timeline.forEach((item, index) => { item.id = `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}` })
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const selected = process.env.C1_OPERATION_RECEIPTS!
const self = fileURLToPath(import.meta.url)
const ports = () => createNativeCreationPort({
  configuredRoot: () => process.env.CONFIG_PATH!, getPath: native.getPath,
  accountsEnabled, activeOwner: activeAccount, prepare: (value) => {
    if (process.argv[2] === "child" && process.argv[3] === "claim-before-target") {
      receipt("claim-before-target-checkpoint", { pid: process.pid, operation: read(opFile(process.env.CONFIG_PATH!)), state: snapshot(process.env.CONFIG_PATH!) })
      process.kill(process.pid, "SIGKILL")
    }
    return native.prepareNativeQuizCreation(value)
  },
  enableOperationBindings: true,
})
const run = <T>(fn: () => T | Promise<T>) => withAccount<T>(OWNER, fn)
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"))
const opFile = (root: string) => path.join(root, OPERATION_FAMILY, binding.operationId, "operation.json")
function snapshot(root: string) {
  const result: Record<string, string> = {}
  const walk = (folder: string) => {
    for (const name of fs.readdirSync(folder).sort()) {
      const file = path.join(folder, name)
      if (fs.lstatSync(file).isDirectory()) walk(file)
      else result[path.relative(root, file)] = hash(fs.readFileSync(file))
    }
  }
  walk(root)
  return result
}
function receipt(name: string, value: unknown) {
  fs.writeFileSync(path.join(selected, name + ".json"), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 })
}
async function fixture(fn: (root: string) => void | Promise<void>) {
  const root = fs.mkdtempSync(path.join(process.env.C1_OPERATION_FIXTURES ?? os.tmpdir(), "tadazz-op-owned-"))
  const token = randomUUID()
  fs.writeFileSync(path.join(root, ".owner"), token, { flag: "wx" })
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  for (const owner of [OWNER, FOREIGN]) {
    fs.mkdirSync(path.join(root, "tenants", owner, "quizz"), { recursive: true, mode: 0o700 })
    fs.mkdirSync(path.join(root, "tenants", owner, "extensions", "quizzes"), { recursive: true, mode: 0o700 })
    fs.writeFileSync(path.join(root, "tenants", owner, "quizz", "sentinel.txt"), "unrelated native sentinel", { flag: "wx" })
    fs.writeFileSync(path.join(root, "tenants", owner, "extensions", "quizzes", "sentinel.txt"), "unrelated sidecar sentinel", { flag: "wx" })
  }
  try { return await fn(root) }
  finally {
    assert.equal(fs.realpathSync(root), root)
    assert.equal(fs.readFileSync(path.join(root, ".owner"), "utf8"), token)
    assert.ok(path.basename(root).startsWith("tadazz-op-owned-"))
    fs.rmSync(root, { recursive: true })
  }
}
function child(root: string, mode: string) {
  const result = spawnSync(process.execPath, [self, "child", mode, root], { encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024 })
  return { pid: result.pid, status: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }
}
function verifySentinels(root: string) {
  for (const owner of [OWNER, FOREIGN]) {
    assert.equal(fs.readFileSync(path.join(root, "tenants", owner, "quizz", "sentinel.txt"), "utf8"), "unrelated native sentinel")
    assert.equal(fs.readFileSync(path.join(root, "tenants", owner, "extensions", "quizzes", "sentinel.txt"), "utf8"), "unrelated sidecar sentinel")
  }
}
if (process.argv[2] === "child") {
  const [, , , mode, root] = process.argv
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  if (mode === "lookup") {
    const status = await run(() => ports().operations!.lookup(binding))
    process.stdout.write(JSON.stringify({ pid: process.pid, status, state: snapshot(root) }))
  } else if (mode === "retry") {
    let result: unknown
    try { result = await run(() => ports().operations!.create(binding, input, extras)) }
    catch (error) { result = { rejected: String(error) } }
    process.stdout.write(JSON.stringify({ pid: process.pid, result, state: snapshot(root) }))
  } else if (mode === "recover") {
    const report = recoverCreationReservations(root)
    process.stdout.write(JSON.stringify({ pid: process.pid, report }))
  } else {
    if (mode === "bound-before-public") {
      const original = fs.linkSync
      fs.linkSync = ((...args: Parameters<typeof fs.linkSync>) => {
        receipt(mode + "-checkpoint", { pid: process.pid, operation: read(opFile(root)), state: snapshot(root) })
        process.kill(process.pid, "SIGKILL")
        return original(...args)
      }) as typeof fs.linkSync
    }
    if (mode === "commit-before-operation") {
      const original = fs.renameSync
      fs.renameSync = ((from, to) => {
        original(from, to)
        if (String(to).endsWith("/intent.json") && read(String(to)).phase === "committed") {
          receipt(mode + "-checkpoint", { pid: process.pid, operation: read(opFile(root)), state: snapshot(root) })
          process.kill(process.pid, "SIGKILL")
        }
      }) as typeof fs.renameSync
    }
    const result = await run(() => ports().operations!.create(binding, input, extras))
    if (mode === "after-f-outcome") {
      const file = path.join(root, "f-outcome.json")
      fs.writeFileSync(file, JSON.stringify(result), { flag: "wx", mode: 0o600 })
      const fd = fs.openSync(file, "r")
      fs.fsyncSync(fd)
      fs.closeSync(fd)
      const directory = fs.openSync(root, "r")
      fs.fsyncSync(directory)
      fs.closeSync(directory)
    }
    receipt(mode + "-checkpoint", { pid: process.pid, result, operation: read(opFile(root)), state: snapshot(root) })
    process.kill(process.pid, "SIGKILL")
  }
} else {
  test("baseline: optional trusted seam is present only when selected", () => fixture(() => run(() => {
    assert.ok(ports().operations)
    const disabled = createNativeCreationPort({ configuredRoot: () => process.env.CONFIG_PATH!, getPath: native.getPath, accountsEnabled, activeOwner: activeAccount, prepare: native.prepareNativeQuizCreation })
    assert.equal(disabled.operations, undefined)
  })))
  test("default C1 create remains compatible and creates no operation registry", () => fixture(root => run(() => {
    const port = createNativeCreationPort({ configuredRoot: () => root, getPath: native.getPath, accountsEnabled, activeOwner: activeAccount, prepare: native.prepareNativeQuizCreation })
    const result = port.create(input, extras)
    assert.equal(result.revision, 1)
    assert.ok(result.quizId)
    assert.ok(!fs.existsSync(path.join(root, OPERATION_FAMILY)))
    assert.equal(fs.readdirSync(path.join(root, ".tadazz-creation-v1", "tenants", OWNER, "active")).length, 0)
    const first = child(root, "recover"), second = child(root, "recover")
    assert.equal(first.status, 0); assert.equal(second.status, 0)
    assert.equal(JSON.parse(second.stdout).report.recovered, 0)
    verifySentinels(root)
    receipt("default-compatible", { result, first, second, state: snapshot(root) })
  })))
  test("missing native owner and accounts OFF refuse before operation writes", () => fixture(root => {
    const before = snapshot(root)
    assert.throws(() => ports().operations!.create(binding, input, extras), /owner/)
    process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
    assert.throws(() => ports().operations!.lookup(binding), /tenant scope/)
    assert.throws(() => ports().operations!.create(binding, input, extras), /tenant scope/)
    assert.deepEqual(snapshot(root), before)
    assert.ok(!fs.existsSync(path.join(root, OPERATION_FAMILY)))
    verifySentinels(root)
    receipt("native-scope-required", { before, after: snapshot(root) })
  }))
  test("binding, content and owner mismatches preserve result and all bytes", () => fixture(root => run(async () => {
    const port = ports().operations!
    assert.deepEqual(port.lookup(binding), { status: "absent" })
    const result = port.create(binding, input, extras)
    const before = snapshot(root)
    assert.deepEqual(port.create(binding, input, extras), result)
    assert.throws(() => port.create(binding, { ...input, subject: "changed approved revision" }, extras), /content changed/)
    assert.throws(() => port.lookup({ ...binding, authorizationDigest: "c".repeat(64) }), /authorization/)
    await assert.rejects(withAccount(FOREIGN, () => port.lookup(binding)), /scope/)
    assert.throws(() => port.lookup({ ...binding, operationId: "../bad" }), /binding/)
    assert.deepEqual(snapshot(root), before)
    verifySentinels(root)
    receipt("mismatch-preservation", { result, before, after: snapshot(root) })
  })))
  test("original outcome survives later native edits and deletion", () => fixture(root => run(() => {
    const port = ports().operations!, result = port.create(binding, input, extras)
    const folder = path.join(root, "tenants", OWNER, "quizz")
    const base = fs.readdirSync(folder).find(name => name.endsWith(".json"))!
    fs.writeFileSync(path.join(folder, base), "later edited content")
    fs.unlinkSync(path.join(root, "tenants", OWNER, "extensions", "quizzes", result.quizId + ".json"))
    const before = snapshot(root)
    const look = child(root, "lookup"), retry = child(root, "retry")
    assert.equal(look.status, 0); assert.equal(retry.status, 0)
    assert.deepEqual(JSON.parse(look.stdout).status, { status: "committed", result })
    assert.deepEqual(JSON.parse(retry.stdout).result, result)
    assert.deepEqual(snapshot(root), before)
    const afterEdit = snapshot(root)
    fs.unlinkSync(path.join(folder, base))
    const deletedBefore = snapshot(root)
    const deletedLookup = child(root, "lookup"), deletedRetry = child(root, "retry")
    assert.equal(deletedLookup.status, 0); assert.equal(deletedRetry.status, 0)
    assert.deepEqual(JSON.parse(deletedLookup.stdout).status, { status: "committed", result })
    assert.deepEqual(JSON.parse(deletedRetry.stdout).result, result)
    assert.deepEqual(snapshot(root), deletedBefore)
    assert.equal(fs.readdirSync(folder).filter(name => name.endsWith(".json")).length, 0)
    verifySentinels(root)
    receipt("later-edits", { result, before, after: afterEdit, look, retry, deletedBefore, deletedAfter: snapshot(root), deletedLookup, deletedRetry })
  })))
  for (const mode of ["claim-before-target", "bound-before-public", "commit-before-operation", "after-native-commit", "after-f-outcome"]) {
    test("fresh-process crash/reconcile: " + mode, () => fixture(root => {
      const killed = child(root, mode)
      assert.equal(killed.signal, "SIGKILL"); assert.equal(killed.error, undefined)
      const checkpoint = read(path.join(selected, mode + "-checkpoint.json"))
      const lookup = child(root, "lookup")
      assert.equal(lookup.status, 0)
      const observed = JSON.parse(lookup.stdout)
      assert.notEqual(observed.pid, checkpoint.pid)
      if (mode === "claim-before-target") {
        assert.equal(observed.status.status, "unresolved")
        assert.equal(checkpoint.operation.target, null)
        const before = snapshot(root)
        const retry = child(root, "retry")
        assert.equal(retry.status, 0)
        assert.match(JSON.parse(retry.stdout).result.rejected, /unresolved/)
        assert.deepEqual(snapshot(root), before)
        receipt(mode + "-replay", { killed, lookup, retry, before, after: snapshot(root) })
      } else if (mode === "bound-before-public") {
        assert.equal(observed.status.status, "reserved")
        assert.equal(observed.status.quizId, checkpoint.operation.target.quizId)
        const replay = child(root, "recover")
        assert.equal(replay.status, 0)
        const retry = child(root, "retry")
        assert.equal(retry.status, 0)
        assert.match(JSON.parse(retry.stdout).result.rejected, /unresolved/)
        assert.equal(read(opFile(root)).target.quizId, checkpoint.operation.target.quizId)
        receipt(mode + "-replay", { killed, lookup, replay, retry, final: snapshot(root) })
      } else {
        assert.equal(observed.status.status, "committed")
        const before = snapshot(root)
        const retry = child(root, "retry")
        assert.equal(retry.status, 0)
        assert.deepEqual(JSON.parse(retry.stdout).result, observed.status.result)
        assert.deepEqual(snapshot(root), before)
        if (mode === "after-f-outcome") assert.deepEqual(read(path.join(root, "f-outcome.json")), observed.status.result)
        assert.equal(fs.readdirSync(path.join(root, OPERATION_FAMILY)).length, 1)
        assert.equal(fs.readdirSync(path.join(root, "tenants", OWNER, "quizz")).filter(name => name.endsWith(".json")).length, 1)
        receipt(mode + "-replay", { killed, lookup, retry, before, after: snapshot(root) })
      }
      verifySentinels(root)
    }))
  }
  test("tampered committed outcome remains unresolved and byte preserved", () => fixture(root => run(() => {
    const port = ports().operations!, result = port.create(binding, input, extras)
    const value = read(opFile(root)); value.result.quizId = "Z".repeat(21)
    fs.writeFileSync(opFile(root), JSON.stringify(value))
    const before = snapshot(root)
    assert.equal(port.lookup(binding).status, "unresolved")
    assert.throws(() => port.create(binding, input, extras))
    assert.deepEqual(snapshot(root), before)
    receipt("tamper", { original: result, before, after: snapshot(root) })
  })))
  test("operation directory lost-CAS cannot allocate a native target", () => fixture(root => run(() => {
    const original = fs.mkdirSync.bind(fs)
    fs.mkdirSync = ((file, options) => {
      if (String(file) === path.dirname(opFile(root))) {
        original(file, options)
        throw Object.assign(new Error("synthetic lost CAS"), { code: "EEXIST" })
      }
      return original(file, options)
    }) as typeof fs.mkdirSync
    try { assert.throws(() => ports().operations!.create(binding, input, extras), /CAS/) }
    finally { fs.mkdirSync = original }
    const before = snapshot(root)
    assert.equal(ports().operations!.lookup(binding).status, "unresolved")
    assert.throws(() => ports().operations!.create(binding, input, extras))
    assert.deepEqual(snapshot(root), before)
    verifySentinels(root)
    receipt("lost-cas", { before, after: snapshot(root) })
  })))
  test("flag change cannot reinterpret an established tenant operation as global", () => fixture(root => run(() => {
    const port = ports().operations!, result = port.create(binding, input, extras)
    const before = snapshot(root)
    process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
    assert.throws(() => port.lookup(binding), /scope/)
    assert.throws(() => port.create(binding, input, extras), /scope/)
    process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
    assert.deepEqual(port.lookup(binding), { status: "committed", result })
    assert.deepEqual(snapshot(root), before)
    receipt("flag-change", { result, before, after: snapshot(root) })
  })))
  test("record CAS loss retains private evidence without public publication", () => fixture(root => run(() => {
    const original = fs.fsyncSync.bind(fs)
    let injected = false
    fs.fsyncSync = ((fd) => {
      original(fd)
      const named = fs.readlinkSync(`/proc/self/fd/${fd}`)
      if (!injected && named.startsWith(opFile(root) + ".") && named.endsWith(".next")) {
        injected = true
        fs.writeFileSync(opFile(root), "synthetic changed operation witness")
      }
    }) as typeof fs.fsyncSync
    try { assert.throws(() => ports().operations!.create(binding, input, extras), /failed/) }
    finally { fs.fsyncSync = original }
    assert.equal(injected, true)
    const before = snapshot(root)
    assert.equal(ports().operations!.lookup(binding).status, "unresolved")
    assert.throws(() => ports().operations!.create(binding, input, extras))
    assert.deepEqual(snapshot(root), before)
    assert.equal(fs.readdirSync(path.join(root, "tenants", OWNER, "quizz")).filter(name => name.endsWith(".json")).length, 0)
    verifySentinels(root)
    receipt("record-cas-loss", { before, after: snapshot(root) })
  })))
  test("live cooperating writer contention is rejected before binding allocation", () => fixture(root => run(() => {
    const port = ports(), cap = port.reserve(input, extras)
    const before = snapshot(root)
    assert.throws(() => port.operations!.create(binding, input, extras), /busy/)
    assert.deepEqual(snapshot(root), before)
    const result = port.publish(cap)
    assert.ok(result.quizId)
    assert.ok(!fs.existsSync(path.join(root, OPERATION_FAMILY)))
    verifySentinels(root)
  })))
}
