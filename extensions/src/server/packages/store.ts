/* oxlint-disable eslint/max-params -- Audited operations explicitly bind principal, immutable upload, CAS revision and selected content policy. */
/* oxlint-disable typescript/no-non-null-assertion -- Aggregate rows and immutable inventory/build values are checked before use. */
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import { createHmac, randomUUID } from "node:crypto"
import { z } from "zod"
import type { ShowThemeDefinition } from "../../core/show-themes/definition"
import type { ThemePrincipal } from "../show-themes/review"
import { inspectPackage, packageThemeDefinitions } from "./preflight"
import {
  normalizePackageDocument,
  packageMediaName,
  relativizeDocument,
} from "./references"
import {
  unpackPackage,
  packPackage,
  packageSha,
  type PortablePackage,
} from "./archive"
import { stagePackageGame } from "./game-stage"
import { nativeBundleToAuthoredShow } from "../../core/show-authoring-convert"
import type { EnhancedBundle } from "../../core/bundle"
import { packageManifestSchema } from "../../core/packages/manifest"
import { PackageError } from "./error"
import { enforcePackageStorageBudget } from "./storage-budget"

export { PackageError }

interface Row {
  tenant: string
  upload: string
  package_id: string
  version: string
  source: string
  phase: string
  revision: number
  author: string
  review: string | null
  build: string | null
  definitions: string
  games: string
  targets: string
  report: string
}
const reviewSchema = z.strictObject({
  revision: z.number().int().positive(),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  buildDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  qaEvidenceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  rightsReviewed: z.literal(true),
  contentReviewed: z.literal(true),
  accessibilityReviewed: z.literal(true),
  performanceReviewed: z.literal(true),
})

export const packageReviewSchema = reviewSchema

/** Metadata only in SQLite; archives, objects and builds are immutable files. */
export class PackageStore {
  readonly db: DatabaseSync
  readonly root: string
  private readonly secret: string
  private readonly tenantConfig: (tenant: string) => string
  constructor(
    root: string,
    secret: string,
    tenantConfig: (tenant: string) => string,
    options: { readOnly?: boolean } = {},
  ) {
    this.root = root
    this.secret = secret
    this.tenantConfig = tenantConfig
    fs.mkdirSync(root, { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path.join(root, "packages.sqlite"), {
      readOnly: options.readOnly ?? false,
    })

    if (options.readOnly) {
      return
    }

    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS packages(tenant TEXT, upload TEXT PRIMARY KEY, package_id TEXT, version TEXT,
      source TEXT, phase TEXT, revision INTEGER, author TEXT, review TEXT, build TEXT,
      definitions TEXT, games TEXT, targets TEXT, report TEXT, UNIQUE(tenant,package_id,version));
      CREATE TABLE IF NOT EXISTS package_active(tenant TEXT, package_id TEXT, upload TEXT, PRIMARY KEY(tenant,package_id));
      CREATE TABLE IF NOT EXISTS package_audit(sequence INTEGER PRIMARY KEY, tenant TEXT, actor TEXT, upload TEXT, action TEXT, at INTEGER);
      CREATE TABLE IF NOT EXISTS package_requests(tenant TEXT, key TEXT, digest TEXT, upload TEXT, PRIMARY KEY(tenant,key));`)

    if (
      !this.db
        .prepare("PRAGMA table_info(packages)")
        .all()
        .some((r) => r.name === "report")
    ) {
      this.db.exec("ALTER TABLE packages ADD COLUMN report TEXT")
    }

    // Recover before a server using this enabled store can accept requests.
    for (const row of this.db
      .prepare("SELECT * FROM packages WHERE phase='installing'")
      .all() as unknown as Row[]) {
      this.compensate(row)
    }
  }
  close() {
    this.db.close()
  }
  tenantRoot(tenant: string) {
    return path.join(this.root, packageSha(tenant))
  }
  private archivePath(row: Row) {
    return path.join(this.tenantRoot(row.tenant), `${row.source}.tadazz`)
  }
  private static require(
    p: ThemePrincipal,
    grant: "author" | "review" | "publish",
  ) {
    if (!p.userId || !p.tenantId || !p.grants.includes(grant)) {
      throw new PackageError("PACKAGE_FORBIDDEN", 403)
    }
  }
  own(p: ThemePrincipal, upload: string): Row {
    const row = this.db
      .prepare("SELECT * FROM packages WHERE tenant=? AND upload=?")
      .get(p.tenantId, upload) as unknown as Row | undefined

    if (!row || !p.userId) {
      throw new PackageError("PACKAGE_NOT_FOUND", 404)
    }

    return row
  }
  private audit(p: ThemePrincipal, upload: string, action: string) {
    this.db
      .prepare(
        "INSERT INTO package_audit(tenant,actor,upload,action,at) VALUES(?,?,?,?,?)",
      )
      .run(p.tenantId, p.userId, upload, action, Date.now())
  }
  readPackage(row: Row) {
    const bytes = fs.readFileSync(this.archivePath(row))

    if (packageSha(bytes) !== row.source) {
      throw new PackageError("PACKAGE_DIGEST_CHANGED", 409)
    }

    return unpackPackage(bytes)
  }
  upload(p: ThemePrincipal, bytes: Buffer, idempotency: string) {
    PackageStore.require(p, "author")

    if (!/^[a-zA-Z0-9_-]{8,128}$/u.test(idempotency)) {
      throw new PackageError("PACKAGE_IDEMPOTENCY_REQUIRED", 400)
    }

    const digest = packageSha(bytes)
    const previous = this.db
      .prepare("SELECT * FROM package_requests WHERE tenant=? AND key=?")
      .get(p.tenantId, idempotency)

    if (previous) {
      if (previous.digest !== digest) {
        throw new PackageError("PACKAGE_IDEMPOTENCY_CONFLICT", 409)
      }

      return this.details(p, String(previous.upload))
    }

    const { pkg, report } = inspectPackage(bytes)

    if (
      this.db
        .prepare(
          "SELECT 1 FROM packages WHERE tenant=? AND package_id=? AND version=?",
        )
        .get(p.tenantId, pkg.manifest.id, pkg.manifest.version)
    ) {
      throw new PackageError("PACKAGE_VERSION_EXISTS", 409)
    }

    const used = this.db
      .prepare("SELECT COUNT(*) AS count FROM packages WHERE tenant=?")
      .get(p.tenantId)!.count as number
    const usedBytes = this.db
      .prepare(
        "SELECT COALESCE(SUM(json_extract(report,'$.totalBytes')),0) AS bytes FROM packages WHERE tenant=?",
      )
      .get(p.tenantId)!.bytes as number

    if (used >= 100 || usedBytes + report.totalBytes > 1_000_000_000) {
      throw new PackageError("PACKAGE_QUOTA", 413)
    }

    const directory = this.tenantRoot(p.tenantId)
    enforcePackageStorageBudget(
      directory,
      bytes.length * 2 + report.totalBytes + 16_000_000,
    )
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const archive = path.join(directory, `${digest}.tadazz`)

    if (!fs.existsSync(archive)) {
      fs.writeFileSync(archive, bytes, { flag: "wx", mode: 0o600 })
    }

    const upload = randomUUID()
    this.db.exec("BEGIN IMMEDIATE")

    try {
      this.db
        .prepare(
          "INSERT INTO packages(tenant,upload,package_id,version,source,phase,revision,author,review,build,definitions,games,targets,report) VALUES(?,?,?,?,?,?,1,?,NULL,NULL,'[]','[]','[]',?)",
        )
        .run(
          p.tenantId,
          upload,
          pkg.manifest.id,
          pkg.manifest.version,
          digest,
          report.status,
          p.userId,
          JSON.stringify(report),
        )
      this.db
        .prepare("INSERT INTO package_requests VALUES(?,?,?,?)")
        .run(p.tenantId, idempotency, digest, upload)
      this.audit(p, upload, "upload")
      this.db.exec("COMMIT")
    } catch (e) {
      this.db.exec("ROLLBACK")
      throw e
    }

    return this.details(p, upload)
  }
  details(p: ThemePrincipal, upload: string) {
    const row = this.own(p, upload)
    const report = row.report
      ? (JSON.parse(row.report) as ReturnType<typeof inspectPackage>["report"])
      : inspectPackage(fs.readFileSync(this.archivePath(row))).report

    return {
      uploadId: upload,
      phase: row.phase,
      revision: row.revision,
      buildDigest: row.build,
      reviewed: this.approved(row),
      installedGames: JSON.parse(row.games) as string[],
      ...report,
      status: row.phase,
    }
  }
  list(p: ThemePrincipal) {
    return this.db
      .prepare(
        "SELECT upload,package_id,version,phase,revision,build,games FROM packages WHERE tenant=? ORDER BY rowid DESC",
      )
      .all(p.tenantId)
  }
  requestBuild(p: ThemePrincipal, upload: string) {
    PackageStore.require(p, "author")
    const row = this.own(p, upload)

    if (row.phase === "building") {
      return
    }

    if (!["validated", "failed"].includes(row.phase)) {
      throw new PackageError("PACKAGE_BUILD_STATE", 409)
    }

    const dir = path.join(this.tenantRoot(p.tenantId), "jobs", upload)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    for (const name of ["result.json", "bundle.json"]) {
      fs.rmSync(path.join(dir, name), { force: true })
    }
    const source = this.readPackage(row)
    fs.writeFileSync(
      path.join(dir, "request.json"),
      JSON.stringify({
        uploadId: upload,
        sourceDigest: row.source,
        themes: packageThemeDefinitions(source)
          .filter((d) => d.sandbox)
          .map((d) => ({ id: d.id, entry: d.sandbox!.entry })),
      }),
    )
    fs.copyFileSync(this.archivePath(row), path.join(dir, "source.tadazz"))
    this.db
      .prepare("UPDATE packages SET phase='building' WHERE upload=?")
      .run(upload)
    this.audit(p, upload, "build-requested")
  }
  acceptBuild(p: ThemePrincipal, upload: string) {
    const row = this.own(p, upload)

    if (row.phase !== "building") {
      return row.phase
    }

    const dir = path.join(this.tenantRoot(p.tenantId), "jobs", upload)
    const receiptPath = path.join(dir, "result.json")

    if (!fs.existsSync(receiptPath)) {
      return "building"
    }

    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8")) as {
      sourceDigest: string
      outputDigest: string
      mediaValidated: boolean
      error?: string
    }

    if (receipt.error) {
      this.db
        .prepare("UPDATE packages SET phase='failed' WHERE upload=?")
        .run(upload)

      return "failed"
    }

    const output = fs.readFileSync(path.join(dir, "bundle.json"))

    if (
      receipt.sourceDigest !== row.source ||
      !receipt.mediaValidated ||
      output.length > 8_000_000 ||
      packageSha(output) !== receipt.outputDigest
    ) {
      throw new PackageError("PACKAGE_BUILD_DIGEST", 409)
    }

    fs.writeFileSync(
      path.join(
        this.tenantRoot(p.tenantId),
        `${receipt.outputDigest}.build.json`,
      ),
      output,
      { mode: 0o600 },
    )
    this.stageObjects(p.tenantId, this.readPackage(row))
    this.db
      .prepare(
        "UPDATE packages SET build=?,phase='preview-ready',revision=revision+1 WHERE upload=?",
      )
      .run(receipt.outputDigest, upload)
    this.audit(p, upload, "build-accepted")

    return "preview-ready"
  }
  private stageObjects(tenant: string, pkg: PortablePackage) {
    for (const file of pkg.manifest.files.filter(
      (f) => !["source", "style", "descriptor"].includes(f.kind),
    )) {
      const object = path.join(this.tenantRoot(tenant), "objects", file.sha256)
      fs.mkdirSync(path.dirname(object), { recursive: true, mode: 0o700 })

      if (!fs.existsSync(object)) {
        fs.writeFileSync(object, pkg.files.get(file.path)!, {
          flag: "wx",
          mode: 0o600,
        })
      } else if (
        !fs.lstatSync(object).isFile() ||
        packageSha(fs.readFileSync(object)) !== file.sha256
      ) {
        throw new PackageError("PACKAGE_ASSET_CORRUPT", 409)
      }
    }
  }
  approve(p: ThemePrincipal, upload: string, input: unknown) {
    PackageStore.require(p, "review")
    const row = this.own(p, upload),
      review = reviewSchema.parse(input)

    if (
      row.author === p.userId ||
      row.phase !== "preview-ready" ||
      review.revision !== row.revision ||
      review.sourceDigest !== row.source ||
      review.buildDigest !== row.build
    ) {
      throw new PackageError("PACKAGE_REVIEW_STALE_OR_SELF", 409)
    }

    const signed = JSON.stringify({ reviewer: p.userId, ...review })
    const signature = createHmac("sha256", this.secret)
      .update(`${row.tenant}:${row.upload}:${signed}`)
      .digest("hex")
    this.db
      .prepare("UPDATE packages SET review=? WHERE upload=?")
      .run(JSON.stringify({ signed, signature }), upload)
    this.audit(p, upload, "review-approved")
  }
  private approved(row: Row) {
    if (!row.review) {
      return false
    }

    const { signed, signature } = JSON.parse(row.review) as {
      signed: string
      signature: string
    }

    return (
      createHmac("sha256", this.secret)
        .update(`${row.tenant}:${row.upload}:${signed}`)
        .digest("hex") === signature
    )
  }
  install(
    p: ThemePrincipal,
    upload: string,
    expectedRevision: number,
    selected: string[],
    useClassicWhenThemeSkipped = false,
  ) {
    PackageStore.require(p, "author")
    const row = this.own(p, upload)

    if (row.phase === "installed") {
      return this.details(p, upload)
    }

    if (row.phase !== "preview-ready" || row.revision !== expectedRevision) {
      throw new PackageError("PACKAGE_INSTALL_STATE", 409)
    }

    const pkg = this.readPackage(row)

    if (
      selected.some((id) => !pkg.manifest.contents.some((c) => c.id === id)) ||
      new Set(selected).size !== selected.length ||
      !selected.length
    ) {
      throw new PackageError("PACKAGE_SELECTION", 400)
    }

    const items = pkg.manifest.contents.filter((c) => selected.includes(c.id))

    if (items.some((c) => c.kind !== "game") && !this.approved(row)) {
      throw new PackageError("PACKAGE_REVIEW_REQUIRED", 409)
    }

    const existing = this.catalog(p.tenantId)

    if (
      items.some(
        (c) =>
          c.kind !== "game" &&
          existing.some((d) => d.id === c.id && d.version === row.version),
      )
    ) {
      throw new PackageError("PACKAGE_THEME_VERSION_EXISTS", 409)
    }

    if (
      !useClassicWhenThemeSkipped &&
      items.some(
        (c) =>
          c.themeRef &&
          !items.some(
            (t) => `${t.id}@${pkg.manifest.version}` === c.themeRef,
          ) &&
          !existing.some((t) => `${t.id}@${t.version}` === c.themeRef),
      )
    ) {
      throw new PackageError("PACKAGE_DEPENDENCY", 409)
    }

    const definitions = packageThemeDefinitions(pkg)
      .filter((d) => selected.includes(d.id))
      .map((d) => ({
        ...d,
        ...(d.sandbox
          ? {
              runtime: {
                packageId: pkg.manifest.id,
                version: pkg.manifest.version,
                sourceDigest: row.source,
                buildDigest: row.build!,
              },
            }
          : {}),
      }))
    const config = this.tenantConfig(p.tenantId)
    const stage = path.join(this.tenantRoot(p.tenantId), "staging", upload)
    const stageRoot = path.resolve(this.tenantRoot(p.tenantId), "staging")

    if (!path.resolve(stage).startsWith(stageRoot + path.sep)) {
      throw new PackageError("PACKAGE_STAGING_PATH", 409)
    }

    fs.rmSync(stage, { recursive: true, force: true })
    fs.mkdirSync(stage, { recursive: true, mode: 0o700 })
    const games = items
      .filter((c) => c.kind === "game")
      .map((content) => {
        const doc = normalizePackageDocument(pkg, content.path) as Record<
          string,
          unknown
        >

        if (content.themeRef) {
          const bundled = items.some(
            (t) => `${t.id}@${pkg.manifest.version}` === content.themeRef,
          )
          const [id, version] =
            !bundled && useClassicWhenThemeSkipped
              ? ["tadazz-classic", "1.0.0"]
              : content.themeRef.split("@")

          if (doc.format === "tada-show") {
            doc.defaults = {
              ...(doc.defaults ?? {}),
              showTheme: { id, version },
            }
          } else if (doc.bundleVersion === 1) {
            const extras = doc.extras as Record<string, unknown>
            extras.defaults = {
              ...(extras.defaults ?? {}),
              showTheme: { id, version },
            }
          } else {
            throw new PackageError("PACKAGE_THEME_REQUIRES_ENHANCED_GAME")
          }
        }

        return stagePackageGame(doc, path.join(stage, content.id))
      })
    const files = games.flatMap((g) => g.files)

    if (files.some((f) => fs.existsSync(path.join(config, f.relative)))) {
      throw new PackageError("PACKAGE_TARGET_EXISTS", 409)
    }

    const targets = files.map((f) => f.relative)
    // Write-ahead compensation list. Targets have fresh UUIDs; never overwrite.
    this.db
      .prepare(
        "UPDATE packages SET phase='installing',targets=? WHERE upload=?",
      )
      .run(JSON.stringify(targets), upload)

    try {
      this.stageObjects(p.tenantId, pkg)
      for (const file of files) {
        const target = path.join(config, file.relative)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, file.bytes, { flag: "wx", mode: 0o600 })
      }
      this.db.exec("BEGIN IMMEDIATE")
      this.db
        .prepare(
          "UPDATE packages SET phase='installed',definitions=?,games=? WHERE upload=?",
        )
        .run(
          JSON.stringify(definitions),
          JSON.stringify(games.map((g) => g.quizId)),
          upload,
        )
      this.db
        .prepare(
          "INSERT INTO package_active VALUES(?,?,?) ON CONFLICT(tenant,package_id) DO UPDATE SET upload=excluded.upload",
        )
        .run(p.tenantId, row.package_id, upload)
      this.audit(p, upload, "private-install")
      this.db.exec("COMMIT")
    } catch (e) {
      if (this.db.isTransaction) {
        this.db.exec("ROLLBACK")
      }

      this.compensate({ ...row, targets: JSON.stringify(targets) })
      throw e
    }

    return this.details(p, upload)
  }
  private compensate(row: Row) {
    for (const relative of JSON.parse(row.targets) as string[]) {
      if (
        !/^(?:quizz|extensions\/quizzes)\/[a-f0-9-]{36}\.json$/u.test(relative)
      ) {
        throw new PackageError("PACKAGE_JOURNAL_INVALID", 409)
      }

      fs.rmSync(path.join(this.tenantConfig(row.tenant), relative), {
        force: true,
      })
    }
    this.db
      .prepare(
        "UPDATE packages SET phase='preview-ready',targets='[]' WHERE upload=?",
      )
      .run(row.upload)
  }
  catalog(tenant: string, activeOnly = false): ShowThemeDefinition[] {
    const rows = this.db
      .prepare(
        activeOnly
          ? "SELECT p.* FROM packages p JOIN package_active a ON a.upload=p.upload WHERE p.tenant=? AND p.phase='installed'"
          : "SELECT * FROM packages WHERE tenant=? AND phase='installed'",
      )
      .all(tenant) as unknown as Row[]

    return rows.flatMap(
      (r) => JSON.parse(r.definitions) as ShowThemeDefinition[],
    )
  }
  rollback(p: ThemePrincipal, upload: string) {
    PackageStore.require(p, "author")
    const row = this.own(p, upload)

    if (row.phase !== "installed") {
      throw new PackageError("PACKAGE_ROLLBACK_STATE", 409)
    }

    this.db
      .prepare(
        "INSERT INTO package_active VALUES(?,?,?) ON CONFLICT(tenant,package_id) DO UPDATE SET upload=excluded.upload",
      )
      .run(p.tenantId, row.package_id, upload)
    this.audit(p, upload, "rollback")
  }
  export(p: ThemePrincipal, upload: string) {
    const row = this.own(p, upload),
      pkg = this.readPackage(row)

    if (pkg.manifest.files.some((f) => !f.exportable)) {
      throw new PackageError("PACKAGE_EXPORT_RIGHTS", 403)
    }

    this.audit(p, upload, "export")

    return fs.readFileSync(this.archivePath(row))
  }
  exportGame(p: ThemePrincipal, upload: string, bundle: EnhancedBundle) {
    const row = this.own(p, upload),
      source = this.readPackage(row)

    if (!(JSON.parse(row.games) as string[]).includes(bundle.extras.quizId)) {
      throw new PackageError("PACKAGE_NOT_FOUND", 404)
    }

    const files = new Map<string, Buffer>(),
      urls = new Map<string, string>()
    const assets = source.manifest.files.filter(
      (f) => !["descriptor", "source", "style"].includes(f.kind),
    )
    for (const file of assets) {
      if (!file.exportable) {
        throw new PackageError("PACKAGE_EXPORT_RIGHTS", 403)
      }

      files.set(file.path, source.files.get(file.path)!)
      urls.set(`/media/${packageMediaName(source, file.path)}`, file.path)
    }
    const documentPath = "games/export.json"
    const portable = relativizeDocument(
      nativeBundleToAuthoredShow(bundle, { includePrivateRoster: false }),
      documentPath,
      urls,
    )
    const bytes = Buffer.from(JSON.stringify(portable))
    files.set(documentPath, bytes)
    const manifest = packageManifestSchema.parse({
      ...source.manifest,
      id: `game-${row.source.slice(0, 12)}-${bundle.extras.quizId.slice(0, 8)}`,
      contents: [{ kind: "game", id: "exported-game", path: documentPath }],
      files: [
        ...assets,
        {
          path: documentPath,
          kind: "descriptor",
          bytes: bytes.length,
          sha256: packageSha(bytes),
          rights: "owner-authorized",
          provenance:
            "Authenticated owner export of authored game; original asset rights retained",
          exportable: true,
        },
      ],
    })
    const output = packPackage(manifest, files)
    inspectPackage(output)
    this.audit(p, upload, "export-current-game")

    return output
  }
  readMedia(tenant: string, name: string, previewSource = "") {
    if (!/^pkg_[a-f0-9]{24}_[a-f0-9]{64}\.[a-z0-9]+$/u.test(name)) {
      return null
    }

    const rows = this.db
      .prepare(
        "SELECT * FROM packages WHERE tenant=? AND source LIKE ? AND (phase='installed' OR (phase='preview-ready' AND source=?))",
      )
      .all(tenant, `${name.slice(4, 28)}%`, previewSource) as unknown as Row[]
    for (const row of rows) {
      if (!name.startsWith(`pkg_${row.source.slice(0, 24)}_`)) {
        continue
      }

      const report = row.report
        ? (JSON.parse(row.report) as ReturnType<
            typeof inspectPackage
          >["report"])
        : inspectPackage(fs.readFileSync(this.archivePath(row))).report
      const file = report.manifest.files.find(
        (f) =>
          !["descriptor", "source", "style", "font"].includes(f.kind) &&
          `pkg_${row.source.slice(0, 24)}_${f.sha256}.${f.path.split(".").at(-1)!.toLowerCase()}` ===
            name,
      )

      if (!file) {
        return null
      }

      const bytes = fs.readFileSync(
        path.join(this.tenantRoot(tenant), "objects", file.sha256),
      )

      if (packageSha(bytes) !== file.sha256) {
        throw new PackageError("PACKAGE_ASSET_CORRUPT", 409)
      }

      return {
        asset: {
          ...file,
          id: name,
          url: `/media/${name}`,
          kind: file.kind as "image" | "video" | "audio" | "lottie",
          preload: "slot" as const,
        },
        bytes,
      }
    }

    return null
  }
  uninstall(p: ThemePrincipal, upload: string) {
    PackageStore.require(p, "author")
    const row = this.own(p, upload)

    // Retention is intentional: authored games/history/live rooms may pin it.
    if (row.phase === "installed") {
      throw new PackageError("PACKAGE_REFERENCES_RETAINED", 409)
    }

    if (["building", "installing"].includes(row.phase)) {
      throw new PackageError("PACKAGE_BUILD_ACTIVE", 409)
    }

    const retained = this.db
      .prepare("SELECT source,build FROM packages WHERE tenant=? AND upload<>?")
      .all(row.tenant, upload)

    if (!retained.some((r) => r.source === row.source)) {
      fs.rmSync(this.archivePath(row), { force: true })
    }

    if (row.build && !retained.some((r) => r.build === row.build)) {
      fs.rmSync(
        path.join(this.tenantRoot(row.tenant), `${row.build}.build.json`),
        { force: true },
      )
    }

    if (!/^[a-f0-9-]{36}$/u.test(upload)) {
      throw new PackageError("PACKAGE_JOURNAL_INVALID", 409)
    }

    fs.rmSync(path.join(this.tenantRoot(row.tenant), "jobs", upload), {
      recursive: true,
      force: true,
    })
    this.db
      .prepare("DELETE FROM package_requests WHERE tenant=? AND upload=?")
      .run(row.tenant, upload)
    this.db.prepare("DELETE FROM packages WHERE upload=?").run(upload)
    this.audit(p, upload, "delete-draft")
  }
}
