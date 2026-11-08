import { randomBytes, createHash } from "node:crypto"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, expect, it } from "vitest"
import { showThemeRegistry } from "../../core/show-themes/registry"
import {
  inspectAuthoringDirectory,
  validateThemePackage,
} from "./validate-package"
import { ThemeReviewWorkspace, type ThemePrincipal } from "./review"

const publicRoot = resolve(
  import.meta.dirname,
  "../../../../packages/web/public",
)
const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

it("validates actual Classic assets including bounded embedded Lottie rasters", async () => {
  const result = await validateThemePackage(
    showThemeRegistry.classic(),
    publicRoot,
    { trustedRepository: true },
  )
  expect(result.assetCount).toBe(31)
  expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/u)
  await expect(
    validateThemePackage(showThemeRegistry.classic(), publicRoot),
  ).rejects.toThrow("rights")
})

it("rejects changed hashes, external fetching and executable/archive payloads", async () => {
  const definition = structuredClone(showThemeRegistry.classic())
  definition.assets[0].sha256 = "0".repeat(64)
  await expect(
    validateThemePackage(definition, publicRoot, { trustedRepository: true }),
  ).rejects.toThrow("hash")
  definition.assets[0].url = "https://example.com/asset.webp"
  await expect(
    validateThemePackage(definition, publicRoot, { trustedRepository: true }),
  ).rejects.toThrow("never downloads")
  const directory = await mkdtemp(join(tmpdir(), "theme-payload-"))
  directories.push(directory)
  await writeFile(
    join(directory, "payload.js"),
    "throw new Error('never execute')",
  )
  await expect(inspectAuthoringDirectory(directory)).rejects.toThrow("Unsafe")
  await rm(join(directory, "payload.js"))
  await writeFile(join(directory, "nested.zip"), Buffer.from("not a trusted archive"))
  await expect(inspectAuthoringDirectory(directory)).rejects.toThrow("Unsafe")
})

it("rejects MIME spoofing even when an attacker updates the hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "theme-spoof-"))
  directories.push(directory)
  const definition = structuredClone(showThemeRegistry.classic())
  const [asset] = definition.assets
  const file = join(directory, `.${asset.url}`)
  await mkdir(resolve(file, ".."), { recursive: true })
  const bytes = Buffer.from("<script>alert(1)</script>")
  await writeFile(file, bytes)
  asset.bytes = bytes.length
  asset.sha256 = createHash("sha256").update(bytes).digest("hex")
  await expect(
    validateThemePackage(definition, directory, { trustedRepository: true }),
  ).rejects.toThrow("signature")
})

const principal = (
  tenantId: string,
  userId: string,
  grants: ThemePrincipal["grants"],
): ThemePrincipal => ({ tenantId, userId, grants })
it("isolates two tenants, denies self-review, signs immutable versions and rolls back only published versions", () => {
  const workspace = new ThemeReviewWorkspace(randomBytes(32))
  const author = principal("tenant-a", "author", ["author"])
  const reviewer = principal("tenant-a", "reviewer", ["review", "publish"])
  const other = principal("tenant-b", "reviewer", [
    "author",
    "review",
    "publish",
  ])
  const definition = structuredClone(showThemeRegistry.classic())
  definition.kind = "declarative"
  const receipt = () => ({
    definition,
    manifestSha256: createHash("sha256")
      .update(JSON.stringify(definition))
      .digest("hex"),
  })
  const key = workspace.draft(author, receipt())
  expect(workspace.list(other)).toEqual([])
  expect(() => workspace.inspect(other, key)).toThrow("Not found")
  expect(() =>
    workspace.review(other, key, { qaDigest: "a".repeat(64) }),
  ).toThrow("Not found")
  expect(() =>
    workspace.review({ ...author, grants: ["review"] }, key, {
      qaDigest: "a".repeat(64),
    }),
  ).toThrow("Independent")
  expect(() => workspace.publish(reviewer, key)).toThrow("Review")
  expect(() => workspace.rollback(reviewer, key)).toThrow("signed")
  workspace.review(reviewer, key, { qaDigest: "a".repeat(64) })
  expect(workspace.publish(reviewer, key).signature).toMatch(/^[a-f0-9]{64}$/u)
  definition.version = "1.0.1"
  const second = workspace.draft(author, receipt())
  workspace.review(reviewer, second, { qaDigest: "b".repeat(64) })
  workspace.publish(reviewer, second)
  workspace.rollback(reviewer, key)
  expect(workspace.activeKey(reviewer)).toBe(key)
  expect(() =>
    workspace.draft(author, { ...receipt(), manifestSha256: "0".repeat(64) }),
  ).toThrow("mismatch")
  expect(workspace.auditLog(other)).toEqual([])
  expect(workspace.auditLog(reviewer).at(-1)?.action).toBe("rollback")
})

it("requires the platform build lane for code-backed themes", () => {
  const workspace = new ThemeReviewWorkspace(randomBytes(32))
  const definition = showThemeRegistry.classic()
  const key = workspace.draft(principal("tenant", "author", ["author"]), {
    definition,
    manifestSha256: createHash("sha256")
      .update(JSON.stringify(definition))
      .digest("hex"),
  })
  expect(() =>
    workspace.review(principal("tenant", "reviewer", ["review"]), key, {
      qaDigest: "a".repeat(64),
      trustedBuildDigest: "b".repeat(64),
    }),
  ).toThrow("platform")
})
