// SERVER ONLY. Additional observation harness; never imported by product source.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  watch,
  writeFileSync,
  unlinkSync,
} from "node:fs"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

const mode = process.argv[2]
if (!["absent", "regular", "hot-journal"].includes(mode))
  throw new Error("Unknown synthetic GET observation")
const helpers =
  await import("/ram/work/extensions/src/mcp-app/tests/first-party/fixtures.ts")
const f = await helpers.fixture()
const session = f.sessions[0]
let id = helpers.key()
const watchers = []
let events = []
let watcherError = null
let overflow = false
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n")
try {
  if (mode !== "absent")
    id = (
      await f.as(session, (p) => f.store().create(p, helpers.createInput()))
    ).draftId
  if (mode === "hot-journal") {
    const worker = fileURLToPath(
      new URL(
        "file:///ram/work/extensions/src/mcp-app/tests/first-party/hot-journal-worker.mjs",
      ),
    )
    const child = spawn(process.execPath, [worker, f.file(session.owner)], {
      env: { TMPDIR: tmpdir(), TMP: tmpdir(), TEMP: tmpdir() },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let workerError = ""
    child.stderr.on("data", (data) => {
      workerError = (workerError + data.toString()).slice(0, 4096)
    })
    const closed = new Promise((resolve, reject) => {
      child.once("error", reject)
      child.once("close", (_code, signal) =>
        signal === "SIGKILL"
          ? resolve()
          : reject(new Error("Synthetic crash worker failed: " + workerError)),
      )
    })
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Synthetic crash worker timeout")),
          10000,
        )
        child.stdout.once("data", (data) => {
          clearTimeout(timer)
          String(data).includes("READY")
            ? resolve()
            : reject(new Error("Worker not ready"))
        })
        child.once("error", (error) => {
          clearTimeout(timer)
          reject(error)
        })
        child.once("exit", () => {
          clearTimeout(timer)
          reject(new Error("Worker exited before ready"))
        })
      })
    } finally {
      child.kill("SIGKILL")
      await closed
    }
    assert.equal(
      readFileSync(f.file(session.owner) + "-journal")
        .subarray(0, 8)
        .toString("hex"),
      "d9d505f920a163d7",
    )
  }
  for (const name of ["tenants", "native-sentinels"]) {
    try {
      const observer = watch(
        join(f.root, name),
        { recursive: true },
        (event, file) => {
          if (events.length >= 256) overflow = true
          else
            events.push({ tree: name, event, file: file?.toString() ?? null })
        },
      )
      observer.on("error", (error) => {
        watcherError = error.code ?? "WATCH_ERROR"
      })
      watchers.push(observer)
    } catch (error) {
      watcherError = error.code ?? "WATCH_UNAVAILABLE"
    }
  }
  // Explicit positive control occurs BEFORE the GET baseline, never during it.
  const control = join(f.root, "tenants", ".synthetic-observer-control")
  writeFileSync(control, "synthetic observer positive control")
  await delay(50)
  unlinkSync(control)
  await delay(50)
  const controlEvents = events.length
  if (!controlEvents) watcherError ??= "NO_POSITIVE_CONTROL_EVENT"
  events = []
  overflow = false
  const before = helpers.snapshot(f.root)
  writeFileSync(
    `/evidence/get-${mode}-before.json`,
    JSON.stringify(before, null, 2) + "\n",
  )
  emit({
    phase: "GET_BEGIN",
    mode,
    root: f.root,
    expected: mode === "regular" ? 200 : mode === "absent" ? 404 : 503,
  })
  const response = await f.request(session, "/drafts/" + id)
  const body = await response.json()
  const after = helpers.snapshot(f.root)
  writeFileSync(
    `/evidence/get-${mode}-after.json`,
    JSON.stringify(after, null, 2) + "\n",
  )
  await delay(50)
  const expected = mode === "regular" ? 200 : mode === "absent" ? 404 : 503
  const equal = JSON.stringify(before) === JSON.stringify(after)
  emit({
    phase: "GET_END",
    mode,
    status: response.status,
    expected,
    errorCode: body.error?.code ?? null,
    snapshotEqual: equal,
    controlEvents,
    watcherError,
    overflow,
    observedMutationEvents: events,
    observation:
      !watcherError && !overflow && !events.length && equal
        ? "NO_OBSERVED_MUTATION"
        : "FAILED_OR_UNAVAILABLE",
    syscallNoWriteProof: "REQUIRES_SEPARATE_ACTUAL_TRACER_ANALYSIS",
    scope:
      "PRIVATE_DRAFT_AND_NATIVE_ONLY; ACTUAL_AUTH_DB_WAL_SHM_SEPARATE; OS_ATIME_EXCLUDED",
  })
  assert.equal(response.status, expected)
  assert.equal(equal, true)
  if (!watcherError) {
    assert.equal(overflow, false)
    assert.deepEqual(events, [])
  }
  if (mode === "hot-journal") {
    const destination = "/evidence/get-hot-journal-preserved"
    mkdirSync(destination, { mode: 0o700 })
    for (const suffix of ["", "-journal"]) {
      const source = f.file(session.owner) + suffix
      assert.equal(existsSync(source), true)
      copyFileSync(source, join(destination, "drafts.sqlite" + suffix))
    }
    emit({
      phase: "ARTIFACTS_CAPTURED",
      mode,
      destination,
      beforeFixtureTeardown: true,
    })
  }
  // Hash-only or watch-only equality never sets syscallNoWriteProof true.
} finally {
  for (const observer of watchers) observer.close()
  f.close()
}
