/** DIAGNOSTIC ONLY: instrumented first-case sequence, not original-test acceptance. */
import { createHash, randomBytes } from "node:crypto"
import {
  mkdtempSync,
  rmSync,
  openSync,
  writeSync,
  closeSync,
  readFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ThemeInstallationStore, type TrustedThemeBuild } from "./installation"
import type { ThemePrincipal } from "./review"
import {
  createInstallationFixture as fixture,
  picture,
  sound,
} from "./installation.fixture"
const fd = openSync("/evidence/public-step-trace.jsonl", "wx", 0o600)
const origin = process.hrtime.bigint()
let sequence = 0
function cg() {
  try {
    return Object.fromEntries(
      readFileSync("/sys/fs/cgroup/cpu.stat", "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const [k, v] = line.trim().split(/\s+/u)
          return [k, Number(v)]
        }),
    )
  } catch {
    return null
  }
}
function sample() {
  const cpu = process.cpuUsage(),
    mem = process.memoryUsage(),
    usage = process.resourceUsage()
  return {
    wallMs: Number(process.hrtime.bigint() - origin) / 1e6,
    cpuUserUs: cpu.user,
    cpuSystemUs: cpu.system,
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    fsRead: usage.fsRead,
    fsWrite: usage.fsWrite,
    voluntaryContextSwitches: usage.voluntaryContextSwitches,
    involuntaryContextSwitches: usage.involuntaryContextSwitches,
    cgroup: cg(),
  }
}
function emit(
  event: string,
  label: string,
  data: Record<string, unknown> = {},
) {
  writeSync(
    fd,
    JSON.stringify({
      sequence: ++sequence,
      event,
      label,
      ...sample(),
      ...data,
    }) + "\n",
  )
}
function step<T>(label: string, fn: () => T): T {
  emit("START", label)
  const start = process.hrtime.bigint(),
    cpu = process.cpuUsage()
  try {
    const result = fn(),
      elapsed = Number(process.hrtime.bigint() - start) / 1e6,
      delta = process.cpuUsage(cpu)
    emit("END", label, {
      durationMs: elapsed,
      deltaCpuUserUs: delta.user,
      deltaCpuSystemUs: delta.system,
    })
    return result
  } catch (error) {
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6,
      delta = process.cpuUsage(cpu)
    emit("THROW", label, {
      durationMs: elapsed,
      deltaCpuUserUs: delta.user,
      deltaCpuSystemUs: delta.system,
      errorName: error instanceof Error ? error.name : "unknown",
      errorCode:
        typeof error === "object" && error
          ? String((error as { code?: unknown }).code ?? "")
          : "",
    })
    throw error
  }
}
const dirs: string[] = [],
  stores: ThemeInstallationStore[] = []
afterEach(() => {
  emit("TEARDOWN_BEGIN", "cleanup")
  let n = 0
  for (const store of stores.splice(0))
    step(`close.${++n}`, () => store.close())
  for (const dir of dirs.splice(0))
    step("cleanup.synthetic-scratch", () =>
      rmSync(dir, { recursive: true, force: true }),
    )
  emit("TEARDOWN_COMPLETE", "cleanup")
  closeSync(fd)
})
const author: ThemePrincipal = {
  tenantId: "tenant-a",
  userId: "alice",
  grants: ["author"],
}
const reviewer: ThemePrincipal = {
  tenantId: "tenant-a",
  userId: "bob",
  grants: ["review", "publish"],
}
const stranger: ThemePrincipal = {
  tenantId: "tenant-b",
  userId: "eve",
  grants: ["author", "review", "publish"],
}
const approval = {
  approved: true,
  qaEvidenceSha256: "a".repeat(64),
  rightsReviewed: true,
  contentReviewed: true,
  accessibilityReviewed: true,
  performanceReviewed: true,
} as const
function workspace(builds: ReadonlyMap<string, TrustedThemeBuild> = new Map()) {
  const dir = mkdtempSync(join(tmpdir(), "tadazz-installation-diag-"))
  dirs.push(dir)
  const file = join(dir, "themes.sqlite"),
    key = randomBytes(32)
  const store = step(
    "constructor.main",
    () => new ThemeInstallationStore(file, key, builds),
  )
  stores.push(store)
  return { file, key, store }
}
function prepare(
  store: ThemeInstallationStore,
  version = "1.0.0",
  kind: "declarative" | "code-backed" = "declarative",
) {
  const definition = step(`fixture.${version}`, () => fixture(version, kind))
  const id = step(`draft.${version}`, () => store.draft(author, definition))
  step(`upload.picture.${version}`, () =>
    store.upload(author, id, "picture", picture),
  )
  step(`upload.sound.${version}`, () =>
    store.upload(author, id, "sound", sound),
  )
  step(`validate.${version}`, () => store.validate(author, id))
  return id
}
function approvalFor(
  store: ThemeInstallationStore,
  id: string,
  version: string,
) {
  const details = step(`details.${version}`, () => store.details(author, id))
  return {
    ...approval,
    expectedRevision: details.revision,
    manifestSha256: details.manifestSha256,
  }
}
function publish(store: ThemeInstallationStore, id: string, version: string) {
  step(`requestReview.${version}`, () => store.requestReview(author, id))
  const receipt = approvalFor(store, id, version)
  step(`approve.${version}`, () => store.approve(reviewer, id, receipt))
  step(`stage.${version}`, () => store.stage(reviewer, id))
  step(`publish.${version}`, () => store.publish(reviewer, id))
}
describe("DIAGNOSTIC ONLY public-step trace (not original acceptance)", () => {
  it("same first-case operations and exact original Buffer toEqual, original 30000ms budget", () => {
    emit("BODY_BEGIN", "first-case", {
      pid: process.pid,
      tmpdir: tmpdir(),
      pictureBytes: picture.length,
      soundBytes: sound.length,
      pictureSha256: createHash("sha256").update(picture).digest("hex"),
    })
    const { store, file, key } = workspace()
    const first = prepare(store)
    expect(step("catalog.empty", () => store.catalog(author.tenantId))).toEqual(
      [],
    )
    expect(
      step("preview.first", () => store.preview(author, first)).assets[0].url,
    ).toMatch(/^\/media\/theme_[a-f0-9]{32}_[a-f0-9]{64}\.png$/u)
    expect(() =>
      step("expected-denial.unstaged-publish", () =>
        store.publish(reviewer, first),
      ),
    ).toThrow("staged")
    publish(store, first, "1.0.0")
    expect(
      step("catalog.other-tenant", () => store.catalog(stranger.tenantId)),
    ).toEqual([])
    const bytes = step(
      "readAsset.published-picture",
      () => store.readAsset(author, first, "picture", true).bytes,
    )
    step("assert.large-buffer.toEqual", () => expect(bytes).toEqual(picture))
    const second = prepare(store, "2.0.0")
    publish(store, second, "2.0.0")
    expect(
      step("active.second", () =>
        store.active(author.tenantId, "qa-independent"),
      ),
    ).toBe(second)
    const reopened = step(
      "constructor.reopened",
      () => new ThemeInstallationStore(file, key),
    )
    stores.push(reopened)
    expect(
      step("catalog.reopened", () => reopened.catalog(author.tenantId)).map(
        (d) => d.version,
      ),
    ).toEqual(["1.0.0", "2.0.0"])
    step("publish.rollback", () => reopened.publish(reviewer, first, true))
    expect(
      step("active.first", () =>
        reopened.active(author.tenantId, "qa-independent"),
      ),
    ).toBe(first)
    expect(
      step("availableVersions", () =>
        reopened.availableVersions(author.tenantId),
      ),
    ).toEqual([{ id: "qa-independent", version: "1.0.0" }])
    expect(
      step("catalog.after-rollback", () =>
        reopened.catalog(author.tenantId),
      ).map((d) => d.version),
    ).toEqual(["1.0.0", "2.0.0"])
    expect(
      step("auditLog", () => reopened.auditLog(author)).map((e) => e.action),
    ).toEqual([
      "draft",
      "upload",
      "upload",
      "validate",
      "preview",
      "request-review",
      "approve",
      "stage",
      "publish",
      "draft",
      "upload",
      "upload",
      "validate",
      "request-review",
      "approve",
      "stage",
      "publish",
      "rollback",
    ])
    const duplicate = step("fixture.duplicate", () => fixture())
    expect(() =>
      step("expected-denial.immutable-draft", () =>
        reopened.draft(author, duplicate),
      ),
    ).toThrow("Immutable")
    expect(() =>
      step("expected-denial.immutable-upload", () =>
        reopened.upload(author, first, "picture", picture),
      ),
    ).toThrow("immutable")
    emit("BODY_COMPLETE", "first-case")
  })
})
