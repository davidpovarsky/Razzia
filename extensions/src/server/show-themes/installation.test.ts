/* oxlint-disable typescript/no-non-null-assertion -- The fixture verifies an existing typed asset before reading its immutable media name. */
import { createHash, randomBytes } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { ThemeInstallationStore, type TrustedThemeBuild } from "./installation"
import type { ThemePrincipal } from "./review"
import {
  createInstallationFixture as fixture,
  picture,
  sound,
} from "./installation.fixture"

const sha = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex")
const dirs: string[] = []
const stores: ThemeInstallationStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close()
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
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
  const dir = mkdtempSync(join(tmpdir(), "tadazz-installation-test-"))
  dirs.push(dir)
  const file = join(dir, "themes.sqlite")
  const key = randomBytes(32)
  const store = new ThemeInstallationStore(file, key, builds)
  stores.push(store)

  return { file, key, store }
}
function prepare(
  store: ThemeInstallationStore,
  version = "1.0.0",
  kind: "declarative" | "code-backed" = "declarative",
) {
  const id = store.draft(author, fixture(version, kind))
  store.upload(author, id, "picture", picture)
  store.upload(author, id, "sound", sound)
  store.validate(author, id)

  return id
}
function publish(store: ThemeInstallationStore, id: string) {
  store.requestReview(author, id)
  store.approve(reviewer, id, approvalFor(store, id))
  store.stage(reviewer, id)
  store.publish(reviewer, id)
}
function approvalFor(store: ThemeInstallationStore, id: string) {
  const details = store.details(author, id)

  return {
    ...approval,
    expectedRevision: details.revision,
    manifestSha256: details.manifestSha256,
  }
}

describe("durable theme installation", () => {
  it("runs actual bytes through validation, independent approval, staging, publishing, restart and rollback", () => {
    const { store, file, key } = workspace()
    const first = prepare(store)
    expect(store.catalog(author.tenantId)).toEqual([])
    expect(store.preview(author, first).assets[0].url).toMatch(
      /^\/media\/theme_[a-f0-9]{32}_[a-f0-9]{64}\.png$/u,
    )
    expect(() => store.publish(reviewer, first)).toThrow("staged")
    publish(store, first)
    expect(store.catalog(stranger.tenantId)).toEqual([])
    expect(store.readAsset(author, first, "picture", true).bytes).toEqual(
      picture,
    )
    const second = prepare(store, "2.0.0")
    publish(store, second)
    expect(store.active(author.tenantId, "qa-independent")).toBe(second)
    const reopened = new ThemeInstallationStore(file, key)
    stores.push(reopened)
    expect(reopened.catalog(author.tenantId).map((d) => d.version)).toEqual([
      "1.0.0",
      "2.0.0",
    ])
    reopened.publish(reviewer, first, true)
    expect(reopened.active(author.tenantId, "qa-independent")).toBe(first)
    expect(reopened.availableVersions(author.tenantId)).toEqual([
      { id: "qa-independent", version: "1.0.0" },
    ])
    expect(reopened.catalog(author.tenantId).map((d) => d.version)).toEqual([
      "1.0.0",
      "2.0.0",
    ])
    expect(reopened.auditLog(author).map((e) => e.action)).toEqual([
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
    expect(() => reopened.draft(author, fixture())).toThrow("Immutable")
    expect(() => reopened.upload(author, first, "picture", picture)).toThrow(
      "immutable",
    )
  })
  it("denies other tenants, self-approval, unpublished rollback and forged asset digests", () => {
    const { store } = workspace()
    const id = store.draft(author, fixture())
    expect(() => store.upload(stranger, id, "picture", picture)).toThrow(
      "Not found",
    )
    expect(() =>
      store.upload(
        author,
        id,
        "picture",
        Buffer.from("<svg onload='evil()'/>"),
      ),
    ).toThrow("Invalid asset bytes")
    expect(() => store.validate(author, id)).toThrow("Missing asset")
    store.upload(author, id, "picture", picture)
    store.upload(author, id, "sound", sound)
    store.validate(author, id)
    expect(() => store.preview(stranger, id)).toThrow("Not found")
    expect(() => store.readAsset(stranger, id, "picture")).toThrow("Not found")
    store.requestReview(author, id)
    expect(() =>
      store.approve(
        { ...author, grants: ["review"] },
        id,
        approvalFor(store, id),
      ),
    ).toThrow("Independent")
    expect(() => store.approve(stranger, id, approvalFor(store, id))).toThrow(
      "Not found",
    )
    expect(() => store.publish(reviewer, id, true)).toThrow("published")
    expect(() =>
      store.draft({ ...author, tenantId: "platform" }, fixture()),
    ).toThrow("Forbidden")
  })
  it("rejects imported code-backed themes until an exact committed build AND platform review exist", () => {
    const { store } = workspace()
    const id = prepare(store, "1.0.0", "code-backed")
    store.requestReview(author, id)
    expect(() => store.approve(reviewer, id, approvalFor(store, id))).toThrow(
      "Forbidden",
    )
    expect(() =>
      store.approve(
        { ...reviewer, grants: [...reviewer.grants, "platform"] },
        id,
        approvalFor(store, id),
      ),
    ).toThrow("trusted build")
    const definition = fixture("1.0.0", "code-backed")
    const trusted = workspace(
      new Map([
        [
          "qa-independent@1.0.0",
          {
            manifestSha256: sha(JSON.stringify(definition)),
            buildSha256: "b".repeat(64),
          },
        ],
      ]),
    )
    const trustedId = prepare(trusted.store, "1.0.0", "code-backed")
    trusted.store.requestReview(author, trustedId)
    trusted.store.approve(
      { ...reviewer, grants: [...reviewer.grants, "platform"] },
      trustedId,
      approvalFor(trusted.store, trustedId),
    )
    trusted.store.stage(reviewer, trustedId)
    trusted.store.publish(reviewer, trustedId)
    expect(trusted.store.catalog(author.tenantId)[0].kind).toBe("code-backed")
  })
  it("fails closed after persisted signature, manifest or media tampering", () => {
    const { store, file } = workspace()
    const id = prepare(store)
    publish(store, id)
    const db = new DatabaseSync(file)

    try {
      db.prepare(
        "UPDATE theme_assets SET content=? WHERE artifact_id=? AND asset_id='picture'",
      ).run(Buffer.from("spoof"), id)
      expect(() => store.readAsset(author, id, "picture", true)).toThrow(
        "Invalid asset bytes",
      )
      db.prepare(
        "UPDATE theme_artifacts SET signature=? WHERE artifact_id=?",
      ).run("0".repeat(64), id)
      expect(() => store.catalog(author.tenantId)).toThrow("signature")
      expect(() => store.publish(reviewer, id, true)).toThrow("signature")
    } finally {
      db.close()
    }
  })
  it("supports review rejection and CAS draft revision, rejects stale approval and every contributor's self-review", () => {
    const { store } = workspace()
    const id = prepare(store)
    const oldReceipt = approvalFor(store, id)
    const oldName = store.preview(author, id).assets[0].url.split("/").at(-1)!
    store.requestReview(author, id)
    expect(() => store.revise(author, id, 1, fixture())).toThrow(
      "draft revision",
    )
    store.reject(reviewer, id, 1, "Improve contrast")
    const changed = fixture()
    changed.tokens.accent = "#abcdef"
    const coauthor: ThemePrincipal = {
      ...author,
      userId: "coauthor",
      grants: ["author", "review"],
    }
    expect(store.revise(coauthor, id, 1, changed)).toBe(2)
    expect(() => store.revise(author, id, 1, changed)).toThrow("draft revision")
    expect(() => store.readPreviewMedia(author, id, oldName, 1)).toThrow(
      "revision changed",
    )
    store.upload(author, id, "picture", picture)
    store.upload(author, id, "sound", sound)
    store.validate(author, id)
    store.requestReview(author, id)
    expect(() => store.approve(reviewer, id, oldReceipt)).toThrow("stale")
    expect(() => store.approve(coauthor, id, approvalFor(store, id))).toThrow(
      "Independent",
    )
    store.approve(reviewer, id, approvalFor(store, id))
    store.stage(reviewer, id)
    store.publish(reviewer, id)
    expect(() => store.revise(author, id, 2, changed)).toThrow("draft revision")
    expect(store.auditLog(author).map((event) => event.action)).toContain(
      "reject",
    )
    expect(store.auditLog(author).map((event) => event.action)).toContain(
      "revise",
    )
  })
})
