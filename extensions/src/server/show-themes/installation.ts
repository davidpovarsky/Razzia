// oxlint-disable eslint/require-await, typescript/require-await -- Synchronous SQLite adapters implement the existing Promise-based composition storage contract.
/* oxlint-disable eslint/max-classes-per-file, eslint/class-methods-use-this, eslint/max-params, typescript/no-non-null-assertion -- The store and its domain error share one module; principal/artifact/revision/bytes stay explicit, and COUNT/owned-row lookups have guaranteed SQL results. */
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
} from "node:fs"
import { extname, dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import {
  showThemeDefinitionSchema,
  type ShowThemeDefinition,
} from "../../core/show-themes/definition"
import { showThemeRegistry } from "../../core/show-themes/registry"
import { validateThemeAssetBytes } from "./validate-package"
import type { ThemePrincipal } from "./review"
import {
  parseBuilderDocument,
  builderDigest,
  type BuilderDocument,
} from "../../components/theme-builder/document"
import {
  CompositionRepository,
  type CompositionDraftRecord,
  type CompositionPublication,
  type CompositionStorage,
} from "../../core/show-library/composition-repository"
import {
  builderPublicationAdmissionSchema,
  type BuilderPublicationAdmission,
} from "./application-composition-admission"

const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex")
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u)

export const themeApprovalSchema = z.strictObject({
  approved: z.literal(true),
  expectedRevision: z.number().int().positive(),
  manifestSha256: digestSchema,
  qaEvidenceSha256: digestSchema,
  rightsReviewed: z.literal(true),
  contentReviewed: z.literal(true),
  accessibilityReviewed: z.literal(true),
  performanceReviewed: z.literal(true),
})

type Approval = z.infer<typeof themeApprovalSchema>
type Phase =
  | "draft"
  | "validated"
  | "review-requested"
  | "approved"
  | "staged"
  | "published"
interface StoredArtifact {
  artifact_id: string
  tenant_id: string
  theme_id: string
  version: string
  definition: string
  phase: Phase
  author_id: string
  reviewer_id: string | null
  approval: string | null
  signature: string | null
  build_digest: string | null
  revision: number
}

export interface TrustedThemeBuild {
  manifestSha256: string
  buildSha256: string
}

export class ThemeInstallationError extends Error {
  readonly status: 400 | 403 | 404 | 409
  constructor(message: string, status: 400 | 403 | 404 | 409 = 400) {
    super(message)
    this.status = status
  }
}

/** Durable, private installation. Principal assignment is an authenticated server adapter's responsibility. */
export class ThemeInstallationStore {
  private readonly db: DatabaseSync
  private readonly signingKey: Buffer
  private readonly trustedBuilds: ReadonlyMap<string, TrustedThemeBuild>
  constructor(
    file: string,
    signingKey: Buffer,
    trustedBuilds: ReadonlyMap<string, TrustedThemeBuild> = new Map(),
  ) {
    if (signingKey.length < 32) {
      throw new Error("Private signing key required")
    }

    this.signingKey = signingKey
    this.trustedBuilds = trustedBuilds
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })

    if (!existsSync(file)) {
      closeSync(openSync(file, "wx", 0o600))
    }

    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) {
      throw new Error("Unsafe theme database")
    }

    if (process.platform !== "win32") {
      chmodSync(file, 0o600)
    }

    this.db = new DatabaseSync(file, { timeout: 3000 })
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS theme_artifacts (
        artifact_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, theme_id TEXT NOT NULL,
        version TEXT NOT NULL, definition TEXT NOT NULL, phase TEXT NOT NULL,
        author_id TEXT NOT NULL, reviewer_id TEXT, approval TEXT, signature TEXT, build_digest TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        UNIQUE(tenant_id, theme_id, version));
      CREATE TABLE IF NOT EXISTS theme_authors (
        artifact_id TEXT NOT NULL REFERENCES theme_artifacts(artifact_id), user_id TEXT NOT NULL,
        PRIMARY KEY(artifact_id,user_id));
      CREATE TABLE IF NOT EXISTS theme_assets (
        artifact_id TEXT NOT NULL REFERENCES theme_artifacts(artifact_id),
        asset_id TEXT NOT NULL, content BLOB NOT NULL, PRIMARY KEY(artifact_id, asset_id));
      CREATE TABLE IF NOT EXISTS theme_active (
        tenant_id TEXT NOT NULL, theme_id TEXT NOT NULL, artifact_id TEXT NOT NULL REFERENCES theme_artifacts(artifact_id),
        PRIMARY KEY(tenant_id, theme_id));
      CREATE TABLE IF NOT EXISTS theme_audit (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL,
        actor_id TEXT NOT NULL, artifact_id TEXT, action TEXT NOT NULL, at INTEGER NOT NULL, detail TEXT NOT NULL);`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS theme_builder_documents (
      tenant_id TEXT NOT NULL, document_id TEXT NOT NULL, document TEXT NOT NULL,
      revision INTEGER NOT NULL, document_sha256 TEXT NOT NULL, updated_by TEXT NOT NULL,
      PRIMARY KEY(tenant_id,document_id));`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS theme_builder_versions (
      tenant_id TEXT NOT NULL, document_id TEXT NOT NULL, version TEXT NOT NULL,
      publication TEXT NOT NULL, PRIMARY KEY(tenant_id,document_id,version));`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS theme_builder_publications (
      tenant_id TEXT NOT NULL, document_id TEXT NOT NULL, version TEXT NOT NULL,
      digest TEXT NOT NULL, admission TEXT NOT NULL,
      PRIMARY KEY(tenant_id,document_id,version));
      CREATE TABLE IF NOT EXISTS theme_builder_heads (
      tenant_id TEXT NOT NULL, document_id TEXT NOT NULL, version TEXT,
      revision INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(tenant_id,document_id));`)
  }
  close() {
    this.db.close()
  }
  /** Authoring persistence only; a saved composition grants no install or preview pin. */
  private builderRepository(
    p: ThemePrincipal,
    envelope?: BuilderDocument,
    onRead?: (document: BuilderDocument) => void,
  ) {
    this.require(p, "author")
    const owned = (key: { tenantId: string }) => {
      if (key.tenantId !== p.tenantId) {
        throw new ThemeInstallationError("Not found", 404)
      }
    }
    const storage: CompositionStorage = {
      readDraft: async (key) => {
        owned(key)
        const row = this.db
          .prepare(
            "SELECT * FROM theme_builder_documents WHERE tenant_id=? AND document_id=?",
          )
          .get(key.tenantId, key.draftId)

        if (!row) {
          return null
        }

        const document = parseBuilderDocument(
          JSON.parse(row.document as string),
        )
        onRead?.(document)

        return {
          key,
          revision: row.revision as number,
          document: document.content,
          documentSha256: row.document_sha256 as string,
        }
      },
      compareAndSwapDraft: async (
        key,
        expected,
        next: CompositionDraftRecord,
      ) => {
        owned(key)

        if (!envelope || envelope.id !== key.draftId) {
          throw new ThemeInstallationError("Invalid draft")
        }

        return this.transaction(() => {
          const row = this.db
            .prepare(
              "SELECT revision FROM theme_builder_documents WHERE tenant_id=? AND document_id=?",
            )
            .get(key.tenantId, key.draftId)

          if ((row?.revision ?? null) !== expected) {
            return false
          }

          if (!row) {
            const count = this.db
              .prepare(
                "SELECT COUNT(*) AS count FROM theme_builder_documents WHERE tenant_id=?",
              )
              .get(p.tenantId)!.count as number

            if (count >= 128) {
              throw new ThemeInstallationError(
                "Theme draft quota exceeded",
                409,
              )
            }
          }

          const document = parseBuilderDocument({
            ...envelope,
            content: next.document,
          })
          this.db
            .prepare(
              "INSERT INTO theme_builder_documents(tenant_id,document_id,document,revision,document_sha256,updated_by) VALUES (?,?,?,?,?,?) ON CONFLICT(tenant_id,document_id) DO UPDATE SET document=excluded.document,revision=excluded.revision,document_sha256=excluded.document_sha256,updated_by=excluded.updated_by",
            )
            .run(
              p.tenantId,
              key.draftId,
              JSON.stringify(document),
              next.revision,
              next.documentSha256,
              p.userId,
            )
          this.audit(p, "builder-save", null, {
            documentId: key.draftId,
            revision: next.revision,
            digest: builderDigest(document),
          })

          return true
        })
      },
      readVersion: async (key, version) => {
        owned(key)
        const row = this.db
          .prepare(
            "SELECT publication FROM theme_builder_versions WHERE tenant_id=? AND document_id=? AND version=?",
          )
          .get(key.tenantId, key.draftId, version)

        if (!row) {
          return null
        }

        const stored = JSON.parse(row.publication as string) as Record<
          string,
          unknown
        >

        return (stored.publication ?? stored) as CompositionPublication
      },
      publishIfRevision: async (key, expected, publication) => {
        owned(key)

        return this.transaction(() => {
          const current = this.db
            .prepare(
              "SELECT revision FROM theme_builder_documents WHERE tenant_id=? AND document_id=?",
            )
            .get(key.tenantId, key.draftId)

          if (current?.revision !== expected) {
            return "revision-conflict"
          }

          if (
            this.db
              .prepare(
                "SELECT 1 FROM theme_builder_versions WHERE tenant_id=? AND document_id=? AND version=?",
              )
              .get(key.tenantId, key.draftId, publication.version)
          ) {
            return "version-exists"
          }

          const count = this.db
            .prepare(
              "SELECT COUNT(*) AS count FROM theme_builder_versions WHERE tenant_id=? AND document_id=?",
            )
            .get(key.tenantId, key.draftId)!.count as number

          if (count >= 256) {
            throw new ThemeInstallationError(
              "Theme version quota exceeded",
              409,
            )
          }

          this.db
            .prepare(
              "INSERT INTO theme_builder_versions(tenant_id,document_id,version,publication) VALUES (?,?,?,?)",
            )
            .run(
              key.tenantId,
              key.draftId,
              publication.version,
              JSON.stringify({ publication, builderDocument: envelope }),
            )
          this.audit(p, "builder-content-version", null, {
            documentId: key.draftId,
            version: publication.version,
            runtimeAcceptance: publication.runtimeAcceptance,
          })

          return "stored"
        })
      },
    }

    return new CompositionRepository(storage)
  }
  async saveBuilderDocument(
    p: ThemePrincipal,
    expectedRevision: number,
    input: unknown,
  ) {
    this.require(p, "author")

    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new ThemeInstallationError("Invalid draft revision")
    }

    const document = parseBuilderDocument(input)

    try {
      const record = await this.builderRepository(p, document).save(
        { tenantId: p.tenantId, draftId: document.id },
        expectedRevision === 0 ? null : expectedRevision,
        document.content,
      )

      return {
        document,
        revision: record.revision,
        digest: builderDigest(document),
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "show-library:draft-revision-conflict"
      ) {
        throw new ThemeInstallationError("Draft revision conflict", 409)
      }

      throw error
    }
  }
  async readBuilderDocument(p: ThemePrincipal, id: string) {
    this.require(p, "author")
    const captured: { document?: BuilderDocument } = {}
    const record = await this.builderRepository(p, undefined, (document) => {
      captured.document = document
    }).read({ tenantId: p.tenantId, draftId: id })

    if (!record) {
      throw new ThemeInstallationError("Not found", 404)
    }

    if (!captured.document) {
      throw new ThemeInstallationError("Not found", 404)
    }

    return {
      document: captured.document,
      revision: record.revision,
      digest: builderDigest(captured.document),
    }
  }
  listBuilderDocuments(p: ThemePrincipal) {
    this.require(p, "author")

    return this.db
      .prepare(
        "SELECT document_id,revision,document FROM theme_builder_documents WHERE tenant_id=? ORDER BY document_id",
      )
      .all(p.tenantId)
      .map((row) => ({
        id: row.document_id as string,
        revision: row.revision as number,
        name: parseBuilderDocument(JSON.parse(row.document as string)).name,
      }))
  }
  /** Immutable authoring versions only. This never approves/installs a renderer. */
  async createBuilderVersion(
    p: ThemePrincipal,
    id: string,
    revision: number,
    version: string,
  ) {
    const current = await this.readBuilderDocument(p, id)

    try {
      await this.builderRepository(p, current.document).publish(
        { tenantId: p.tenantId, draftId: id },
        revision,
        version,
      )
    } catch (error) {
      if (
        error instanceof Error &&
        /^show-library:(draft-revision-conflict|revision-conflict|version-exists)$/u.test(
          error.message,
        )
      ) {
        throw new ThemeInstallationError("Draft revision conflict", 409)
      }

      throw error
    }

    return {
      version,
      revision,
      digest: current.digest,
      runtimeAcceptance: "not-evaluated" as const,
    }
  }
  listBuilderVersions(p: ThemePrincipal, id: string) {
    this.require(p, "author")
    const exists = this.db
      .prepare(
        "SELECT 1 FROM theme_builder_documents WHERE tenant_id=? AND document_id=?",
      )
      .get(p.tenantId, id)

    if (!exists) {
      throw new ThemeInstallationError("Not found", 404)
    }

    return this.db
      .prepare(
        "SELECT version,publication FROM theme_builder_versions WHERE tenant_id=? AND document_id=? ORDER BY rowid DESC",
      )
      .all(p.tenantId, id)
      .map((row) => {
        const stored = JSON.parse(row.publication as string) as Record<
          string,
          unknown
        >
        const publication = (stored.publication ?? stored) as Record<
          string,
          unknown
        >

        return {
          version: row.version as string,
          revision: publication.draftRevision as number,
          restorable: Boolean(stored.builderDocument),
          runtimeAcceptance: "not-evaluated" as const,
        }
      })
  }
  async restoreBuilderVersion(
    p: ThemePrincipal,
    id: string,
    revision: number,
    version: string,
  ) {
    this.require(p, "author")
    const row = this.db
      .prepare(
        "SELECT publication FROM theme_builder_versions WHERE tenant_id=? AND document_id=? AND version=?",
      )
      .get(p.tenantId, id, version)

    if (!row) {
      throw new ThemeInstallationError("Not found", 404)
    }

    const stored = JSON.parse(row.publication as string) as Record<
      string,
      unknown
    >

    // Old content-only versions cannot reconstruct their former component graph.
    if (!stored.builderDocument) {
      throw new ThemeInstallationError(
        "Version has no complete authoring envelope",
        409,
      )
    }

    const document = parseBuilderDocument(stored.builderDocument)

    if (document.id !== id) {
      throw new ThemeInstallationError("Invalid draft identity")
    }

    return await this.saveBuilderDocument(p, revision, document)
  }
  builderPublicationState(p: ThemePrincipal, id: string) {
    this.require(p, "author")

    if (
      !this.db
        .prepare(
          "SELECT 1 FROM theme_builder_documents WHERE tenant_id=? AND document_id=?",
        )
        .get(p.tenantId, id)
    ) {
      throw new ThemeInstallationError("Not found", 404)
    }

    const head = this.db
      .prepare(
        "SELECT * FROM theme_builder_heads WHERE tenant_id=? AND document_id=?",
      )
      .get(p.tenantId, id)

    return {
      revision: (head?.revision as number | undefined) ?? 0,
      activeVersion: (head?.version as string | undefined) ?? null,
      archived: head?.archived === 1,
      canPublish: p.grants.includes("publish"),
      versions: this.db
        .prepare(
          "SELECT version,digest FROM theme_builder_publications WHERE tenant_id=? AND document_id=? ORDER BY rowid DESC",
        )
        .all(p.tenantId, id)
        .map((row) => ({
          version: row.version as string,
          digest: row.digest as string,
        })),
    }
  }
  private builderVersionEnvelope(
    p: ThemePrincipal,
    id: string,
    version: string,
  ) {
    this.require(p, "author")
    const row = this.db
      .prepare(
        "SELECT publication FROM theme_builder_versions WHERE tenant_id=? AND document_id=? AND version=?",
      )
      .get(p.tenantId, id, version)

    if (!row) {
      throw new ThemeInstallationError("Not found", 404)
    }

    const stored = JSON.parse(row.publication as string) as Record<
      string,
      unknown
    >

    if (!stored.builderDocument) {
      throw new ThemeInstallationError(
        "Complete authoring version required",
        409,
      )
    }

    const document = parseBuilderDocument(stored.builderDocument)

    if (document.id !== id) {
      throw new ThemeInstallationError("Invalid draft identity")
    }

    return document
  }
  readPublishedBuilderVersion(p: ThemePrincipal, id: string, version: string) {
    this.require(p, "author")
    const row = this.db
      .prepare(
        "SELECT digest,admission FROM theme_builder_publications WHERE tenant_id=? AND document_id=? AND version=?",
      )
      .get(p.tenantId, id, version)

    if (!row) {
      throw new ThemeInstallationError("Not found", 404)
    }

    const document = this.builderVersionEnvelope(p, id, version)

    if (builderDigest(document) !== row.digest) {
      throw new ThemeInstallationError("Publication integrity mismatch", 409)
    }

    return {
      document,
      digest: row.digest,
      version,
      admission: builderPublicationAdmissionSchema.parse(
        JSON.parse(row.admission as string),
      ),
    }
  }
  listPublishedBuilderDocuments(p: ThemePrincipal) {
    this.require(p, "author")

    return this.db
      .prepare(
        "SELECT h.document_id,h.version,v.digest FROM theme_builder_heads h JOIN theme_builder_publications v ON v.tenant_id=h.tenant_id AND v.document_id=h.document_id AND v.version=h.version WHERE h.tenant_id=? AND h.archived=0 ORDER BY h.document_id",
      )
      .all(p.tenantId)
      .map((row) => ({
        id: row.document_id as string,
        version: row.version as string,
        digest: row.digest as string,
        name: this.builderVersionEnvelope(
          p,
          row.document_id as string,
          row.version as string,
        ).name,
      }))
  }
  async publishBuilderVersion(
    p: ThemePrincipal,
    id: string,
    revision: number,
    headRevision: number,
    version: string,
    admit: (
      document: BuilderDocument,
    ) => BuilderPublicationAdmission | Promise<BuilderPublicationAdmission>,
    rollback = false,
  ) {
    this.require(p, "publish")
    const current = await this.readBuilderDocument(p, id)

    if (current.revision !== revision) {
      throw new ThemeInstallationError("Draft revision conflict", 409)
    }

    const state = this.builderPublicationState(p, id)

    if (state.revision !== headRevision || state.archived) {
      throw new ThemeInstallationError("Publication revision conflict", 409)
    }

    let document: BuilderDocument = current.document,
      needsVersion = false

    if (rollback) {
      ;({ document } = this.readPublishedBuilderVersion(p, id, version))
    } else {
      needsVersion = !this.listBuilderVersions(p, id).some(
        (row) => row.version === version,
      )
      document = needsVersion
        ? current.document
        : this.builderVersionEnvelope(p, id, version)

      if (builderDigest(document) !== current.digest) {
        throw new ThemeInstallationError("Immutable version conflict", 409)
      }
    }

    const admission = builderPublicationAdmissionSchema.parse(
        await admit(document),
      ),
      digest = builderDigest(document)

    if (needsVersion) {
      await this.createBuilderVersion(p, id, revision, version)
    }

    return this.transaction(() => {
      const now = this.builderPublicationState(p, id)
      const draft = this.db
        .prepare(
          "SELECT revision FROM theme_builder_documents WHERE tenant_id=? AND document_id=?",
        )
        .get(p.tenantId, id)

      if (
        now.revision !== headRevision ||
        now.archived ||
        draft?.revision !== revision
      ) {
        throw new ThemeInstallationError("Publication revision conflict", 409)
      }

      const previous = this.db
        .prepare(
          "SELECT digest,admission FROM theme_builder_publications WHERE tenant_id=? AND document_id=? AND version=?",
        )
        .get(p.tenantId, id, version)

      if (
        previous &&
        (previous.digest !== digest ||
          previous.admission !== JSON.stringify(admission))
      ) {
        throw new ThemeInstallationError("Publication integrity mismatch", 409)
      }

      if (rollback && !previous) {
        throw new ThemeInstallationError("Not found", 404)
      }

      this.db
        .prepare(
          "INSERT OR IGNORE INTO theme_builder_publications(tenant_id,document_id,version,digest,admission) VALUES (?,?,?,?,?)",
        )
        .run(p.tenantId, id, version, digest, JSON.stringify(admission))
      this.db
        .prepare(
          "INSERT INTO theme_builder_heads(tenant_id,document_id,version,revision,archived) VALUES (?,?,?,?,0) ON CONFLICT(tenant_id,document_id) DO UPDATE SET version=excluded.version,revision=excluded.revision",
        )
        .run(p.tenantId, id, version, headRevision + 1)
      this.audit(p, rollback ? "builder-rollback" : "builder-publish", null, {
        documentId: id,
        version,
        digest,
        headRevision: headRevision + 1,
        rendererBuildSha256: admission.rendererBuildSha256,
      })

      return this.builderPublicationState(p, id)
    })
  }
  async archiveBuilderDocument(
    p: ThemePrincipal,
    id: string,
    revision: number,
    headRevision: number,
    archived: boolean,
  ) {
    this.require(p, "publish")
    const current = await this.readBuilderDocument(p, id)

    return this.transaction(() => {
      const state = this.builderPublicationState(p, id)
      const draft = this.db
        .prepare(
          "SELECT revision FROM theme_builder_documents WHERE tenant_id=? AND document_id=?",
        )
        .get(p.tenantId, id)

      if (
        current.revision !== revision ||
        draft?.revision !== revision ||
        state.revision !== headRevision
      ) {
        throw new ThemeInstallationError("Publication revision conflict", 409)
      }

      this.db
        .prepare(
          "INSERT INTO theme_builder_heads(tenant_id,document_id,version,revision,archived) VALUES (?,?,?,?,?) ON CONFLICT(tenant_id,document_id) DO UPDATE SET revision=excluded.revision,archived=excluded.archived",
        )
        .run(
          p.tenantId,
          id,
          state.activeVersion,
          headRevision + 1,
          Number(archived),
        )
      this.audit(p, archived ? "builder-archive" : "builder-unarchive", null, {
        documentId: id,
        headRevision: headRevision + 1,
      })

      return this.builderPublicationState(p, id)
    })
  }
  private require(p: ThemePrincipal, grant: ThemePrincipal["grants"][number]) {
    if (
      !p.tenantId ||
      !p.userId ||
      !p.grants.includes(grant) ||
      (p.tenantId === "platform" && !p.grants.includes("platform"))
    ) {
      throw new ThemeInstallationError("Forbidden", 403)
    }
  }
  private own(p: ThemePrincipal, artifactId: string): StoredArtifact {
    const row = this.db
      .prepare(
        "SELECT * FROM theme_artifacts WHERE tenant_id=? AND artifact_id=?",
      )
      .get(p.tenantId, artifactId)

    if (!row) {
      throw new ThemeInstallationError("Not found", 404)
    }

    return row as unknown as StoredArtifact
  }
  private audit(
    p: ThemePrincipal,
    action: string,
    artifactId: string | null,
    detail: unknown = {},
  ) {
    this.db
      .prepare(
        "INSERT INTO theme_audit(tenant_id,actor_id,artifact_id,action,at,detail) VALUES (?,?,?,?,?,?)",
      )
      .run(
        p.tenantId,
        p.userId,
        artifactId,
        action,
        Date.now(),
        JSON.stringify(detail),
      )
  }
  private transaction<T>(task: () => T): T {
    this.db.exec("BEGIN IMMEDIATE")

    try {
      const result = task()
      this.db.exec("COMMIT")

      return result
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }
  private definition(row: StoredArtifact): ShowThemeDefinition {
    return showThemeDefinitionSchema.parse(JSON.parse(row.definition))
  }
  private validateBytes(
    asset: ShowThemeDefinition["assets"][number],
    bytes: Buffer,
    status: 400 | 409 = 400,
  ) {
    try {
      validateThemeAssetBytes(asset, bytes, { embeddedResourcesOnly: true })
    } catch (error) {
      throw new ThemeInstallationError(
        error instanceof Error ? error.message : "Invalid asset",
        status,
      )
    }
  }
  private runtimeDefinition(row: StoredArtifact) {
    const definition = this.definition(row)
    for (const asset of definition.assets) {
      // Filename is generated from immutable server identity and verified bytes.
      asset.url = `/media/theme_${row.artifact_id.replaceAll("-", "")}_${asset.sha256}${extname(new URL(asset.url, "https://theme.invalid").pathname)}`
    }

    return showThemeDefinitionSchema.parse(definition)
  }
  private sign(row: StoredArtifact) {
    return createHmac("sha256", this.signingKey)
      .update(
        JSON.stringify([
          row.tenant_id,
          row.artifact_id,
          this.runtimeDefinition(row),
          row.author_id,
          row.reviewer_id,
          row.approval,
          row.build_digest,
          row.revision,
          this.db
            .prepare(
              "SELECT user_id FROM theme_authors WHERE artifact_id=? ORDER BY user_id",
            )
            .all(row.artifact_id),
        ]),
      )
      .digest("hex")
  }
  private verify(row: StoredArtifact) {
    const expected = this.sign(row)

    if (
      !row.signature ||
      !/^[a-f0-9]{64}$/u.test(row.signature) ||
      !timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(row.signature, "hex"),
      )
    ) {
      throw new ThemeInstallationError("Invalid artifact signature", 409)
    }
  }
  private parseInput(input: unknown) {
    const definition = showThemeDefinitionSchema.parse(input)

    if (definition.sandbox || definition.runtime) {
      throw new ThemeInstallationError(
        "Sandbox themes require the isolated portable package lane",
        409,
      )
    }

    if (showThemeRegistry.list().some((theme) => theme.id === definition.id)) {
      throw new ThemeInstallationError(
        "Bundled theme identity is source-controlled",
        409,
      )
    }

    if (!definition.localizations) {
      throw new ThemeInstallationError(
        "All eight theme label translations are required",
      )
    }

    if (
      definition.assets.reduce((n, asset) => n + asset.bytes, 0) > 160_000_000
    ) {
      throw new ThemeInstallationError("Package exceeds asset budget")
    }

    for (const asset of definition.assets) {
      if (
        asset.rights === "repository-existing" ||
        !asset.url.startsWith("/") ||
        !/^\/(media|sounds|tadazz-show)\/[A-Za-z0-9_@./-]+\.(png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg|json)$/u.test(
          asset.url,
        )
      ) {
        throw new ThemeInstallationError(
          "Only licensed or owner-authorized local supported media may be uploaded",
        )
      }
    }

    return definition
  }
  draft(p: ThemePrincipal, input: unknown) {
    this.require(p, "author")
    const definition = this.parseInput(input)

    return this.transaction(() => {
      const count = this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM theme_artifacts WHERE tenant_id=?",
        )
        .get(p.tenantId)!.count as number

      if (count >= 128) {
        throw new ThemeInstallationError("Theme version quota exceeded", 409)
      }

      const reserved =
        p.tenantId === "platform"
          ? this.db
              .prepare(
                "SELECT 1 FROM theme_artifacts WHERE tenant_id<>'platform' AND theme_id=?",
              )
              .get(definition.id)
          : this.db
              .prepare(
                "SELECT 1 FROM theme_artifacts WHERE tenant_id='platform' AND theme_id=?",
              )
              .get(definition.id)

      if (reserved) {
        throw new ThemeInstallationError("Reserved theme namespace", 409)
      }

      if (
        this.db
          .prepare(
            "SELECT 1 FROM theme_artifacts WHERE tenant_id=? AND theme_id=? AND version=?",
          )
          .get(p.tenantId, definition.id, definition.version)
      ) {
        throw new ThemeInstallationError(
          "Immutable version already exists",
          409,
        )
      }

      const id = randomUUID()
      this.db
        .prepare(
          "INSERT INTO theme_artifacts(artifact_id,tenant_id,theme_id,version,definition,phase,author_id) VALUES (?,?,?,?,?,'draft',?)",
        )
        .run(
          id,
          p.tenantId,
          definition.id,
          definition.version,
          JSON.stringify(definition),
          p.userId,
        )
      this.db
        .prepare("INSERT INTO theme_authors(artifact_id,user_id) VALUES (?,?)")
        .run(id, p.userId)
      this.audit(p, "draft", id, {
        manifestSha256: sha(JSON.stringify(definition)),
      })

      return id
    })
  }
  revise(
    p: ThemePrincipal,
    id: string,
    expectedRevision: number,
    input: unknown,
  ) {
    this.require(p, "author")
    const definition = this.parseInput(input)

    return this.transaction(() => {
      const row = this.own(p, id)

      if (
        !["draft", "validated"].includes(row.phase) ||
        row.revision !== expectedRevision
      ) {
        throw new ThemeInstallationError(
          "Editable current draft revision required",
          409,
        )
      }

      if (
        row.theme_id !== definition.id ||
        row.version !== definition.version
      ) {
        throw new ThemeInstallationError(
          "Draft identity/version cannot change",
          409,
        )
      }

      this.db.prepare("DELETE FROM theme_assets WHERE artifact_id=?").run(id)
      this.db
        .prepare(
          "UPDATE theme_artifacts SET definition=?,phase='draft',revision=revision+1,reviewer_id=NULL,approval=NULL,signature=NULL,build_digest=NULL WHERE artifact_id=?",
        )
        .run(JSON.stringify(definition), id)
      this.db
        .prepare(
          "INSERT OR IGNORE INTO theme_authors(artifact_id,user_id) VALUES (?,?)",
        )
        .run(id, p.userId)
      this.audit(p, "revise", id, { revision: row.revision + 1 })

      return row.revision + 1
    })
  }
  upload(p: ThemePrincipal, id: string, assetId: string, bytes: Buffer) {
    this.require(p, "author")

    return this.transaction(() => {
      const row = this.own(p, id)

      if (row.phase !== "draft") {
        throw new ThemeInstallationError("Validated assets are immutable", 409)
      }

      const asset = this.definition(row).assets.find((a) => a.id === assetId)

      if (!asset) {
        throw new ThemeInstallationError("Not found", 404)
      }

      this.validateBytes(asset, bytes)
      const used = this.db
        .prepare(
          "SELECT COALESCE(SUM(length(s.content)),0) AS bytes FROM theme_assets s JOIN theme_artifacts a ON a.artifact_id=s.artifact_id WHERE a.tenant_id=?",
        )
        .get(p.tenantId)!.bytes as number
      const old = this.db
        .prepare(
          "SELECT length(content) AS bytes FROM theme_assets WHERE artifact_id=? AND asset_id=?",
        )
        .get(id, assetId)?.bytes as number | undefined

      if (used - (old ?? 0) + bytes.length > 1_000_000_000) {
        throw new ThemeInstallationError("Private asset quota exceeded", 409)
      }

      this.db
        .prepare(
          "INSERT INTO theme_assets(artifact_id,asset_id,content) VALUES (?,?,?) ON CONFLICT(artifact_id,asset_id) DO UPDATE SET content=excluded.content",
        )
        .run(id, assetId, bytes)
      this.db
        .prepare(
          "INSERT OR IGNORE INTO theme_authors(artifact_id,user_id) VALUES (?,?)",
        )
        .run(id, p.userId)
      this.audit(p, "upload", id, {
        assetId,
        sha256: asset.sha256,
        bytes: bytes.length,
      })
    })
  }
  validate(p: ThemePrincipal, id: string) {
    this.require(p, "author")

    return this.transaction(() => {
      const row = this.own(p, id)

      if (row.phase !== "draft") {
        throw new ThemeInstallationError("Draft required", 409)
      }

      const definition = this.definition(row)
      for (const asset of definition.assets) {
        const stored = this.db
          .prepare(
            "SELECT content FROM theme_assets WHERE artifact_id=? AND asset_id=?",
          )
          .get(id, asset.id)

        if (!stored) {
          throw new ThemeInstallationError("Missing asset")
        }

        this.validateBytes(asset, Buffer.from(stored.content as Uint8Array))
      }
      this.db
        .prepare(
          "UPDATE theme_artifacts SET phase='validated' WHERE artifact_id=?",
        )
        .run(id)
      this.audit(p, "validate", id)

      return this.runtimeDefinition(row)
    })
  }
  requestReview(p: ThemePrincipal, id: string) {
    this.transition(
      p,
      id,
      "author",
      "validated",
      "review-requested",
      "request-review",
    )
  }
  private transition(
    p: ThemePrincipal,
    id: string,
    grant: ThemePrincipal["grants"][number],
    from: Phase,
    to: Phase,
    action: string,
  ) {
    this.require(p, grant)
    this.transaction(() => {
      if (this.own(p, id).phase !== from) {
        throw new ThemeInstallationError(`${from} required`, 409)
      }

      this.db
        .prepare("UPDATE theme_artifacts SET phase=? WHERE artifact_id=?")
        .run(to, id)
      this.audit(p, action, id)
    })
  }
  approve(p: ThemePrincipal, id: string, input: Approval) {
    this.require(p, "review")
    const approval = themeApprovalSchema.parse(input)
    this.transaction(() => {
      const row = this.own(p, id)

      if (
        row.phase !== "review-requested" ||
        row.author_id === p.userId ||
        this.db
          .prepare(
            "SELECT 1 FROM theme_authors WHERE artifact_id=? AND user_id=?",
          )
          .get(id, p.userId)
      ) {
        throw new ThemeInstallationError(
          "Independent requested review required",
          409,
        )
      }

      if (
        row.revision !== approval.expectedRevision ||
        sha(JSON.stringify(this.runtimeDefinition(row))) !==
          approval.manifestSha256
      ) {
        throw new ThemeInstallationError("Review receipt is stale", 409)
      }

      let buildDigest: string | null = null
      const definition = this.definition(row)

      if (definition.kind === "code-backed") {
        this.require(p, "platform")
        const build = this.trustedBuilds.get(
          `${definition.id}@${definition.version}`,
        )

        if (
          !build ||
          build.manifestSha256 !== sha(row.definition) ||
          !digestSchema.safeParse(build.buildSha256).success
        ) {
          throw new ThemeInstallationError(
            "Matching source-controlled trusted build required",
            409,
          )
        }

        buildDigest = build.buildSha256
      }

      this.db
        .prepare(
          "UPDATE theme_artifacts SET phase='approved',reviewer_id=?,approval=?,build_digest=? WHERE artifact_id=?",
        )
        .run(p.userId, JSON.stringify(approval), buildDigest, id)
      this.audit(p, "approve", id, approval)
    })
  }
  stage(p: ThemePrincipal, id: string) {
    this.require(p, "publish")
    this.transaction(() => {
      const row = this.own(p, id)

      if (row.phase !== "approved") {
        throw new ThemeInstallationError("Approval required", 409)
      }

      this.db
        .prepare(
          "UPDATE theme_artifacts SET phase='staged',signature=? WHERE artifact_id=?",
        )
        .run(this.sign(row), id)
      this.audit(p, "stage", id)
    })
  }
  reject(
    p: ThemePrincipal,
    id: string,
    expectedRevision: number,
    reason: string,
  ) {
    this.require(p, "review")
    const message = z.string().trim().min(1).max(1000).parse(reason)
    this.transaction(() => {
      const row = this.own(p, id)

      if (
        !["review-requested", "approved"].includes(row.phase) ||
        row.revision !== expectedRevision
      ) {
        throw new ThemeInstallationError("Current pending review required", 409)
      }

      this.db
        .prepare(
          "UPDATE theme_artifacts SET phase='validated',reviewer_id=NULL,approval=NULL,signature=NULL,build_digest=NULL WHERE artifact_id=?",
        )
        .run(id)
      this.audit(p, "reject", id, { reason: message, revision: row.revision })
    })
  }
  publish(p: ThemePrincipal, id: string, rollback = false) {
    this.require(p, "publish")
    this.transaction(() => {
      const row = this.own(p, id)

      if (row.phase !== (rollback ? "published" : "staged")) {
        throw new ThemeInstallationError(
          "Signed staged/published artifact required",
          409,
        )
      }

      this.verify(row)
      this.db
        .prepare(
          "UPDATE theme_artifacts SET phase='published' WHERE artifact_id=?",
        )
        .run(id)
      this.db
        .prepare(
          "INSERT INTO theme_active(tenant_id,theme_id,artifact_id) VALUES (?,?,?) ON CONFLICT(tenant_id,theme_id) DO UPDATE SET artifact_id=excluded.artifact_id",
        )
        .run(p.tenantId, row.theme_id, id)
      this.audit(p, rollback ? "rollback" : "publish", id)
    })
  }
  preview(p: ThemePrincipal, id: string) {
    return this.previewReceipt(p, id).definition
  }
  details(p: ThemePrincipal, id: string) {
    const row = this.own(p, id)

    return {
      phase: row.phase,
      revision: row.revision,
      manifestSha256: sha(JSON.stringify(this.runtimeDefinition(row))),
    }
  }
  previewReceipt(p: ThemePrincipal, id: string) {
    const row = this.own(p, id)

    if (row.phase === "draft") {
      throw new ThemeInstallationError("Validation required", 409)
    }

    this.audit(p, "preview", id)
    const definition = this.runtimeDefinition(row)

    return {
      definition,
      phase: row.phase,
      revision: row.revision,
      manifestSha256: sha(JSON.stringify(definition)),
    }
  }
  list(p: ThemePrincipal) {
    if (!p.userId || !p.tenantId) {
      throw new ThemeInstallationError("Forbidden", 403)
    }

    return this.db
      .prepare(
        "SELECT artifact_id,theme_id,version,phase,revision,author_id,reviewer_id FROM theme_artifacts WHERE tenant_id=? ORDER BY rowid",
      )
      .all(p.tenantId)
  }
  catalog(tenantId: string) {
    const rows = this.db
      .prepare(
        "SELECT * FROM theme_artifacts WHERE tenant_id=? AND phase='published' ORDER BY rowid",
      )
      .all(tenantId) as unknown as StoredArtifact[]

    return rows.map((row) => {
      this.verify(row)

      return this.runtimeDefinition(row)
    })
  }
  availableVersions(tenantId: string) {
    const rows = this.db
      .prepare(
        "SELECT a.* FROM theme_active x JOIN theme_artifacts a ON a.artifact_id=x.artifact_id WHERE x.tenant_id=? AND a.phase='published' ORDER BY a.rowid",
      )
      .all(tenantId) as unknown as StoredArtifact[]

    return rows.map((row) => {
      this.verify(row)

      return { id: row.theme_id, version: row.version }
    })
  }
  active(tenantId: string, themeId: string) {
    return this.db
      .prepare(
        "SELECT artifact_id FROM theme_active WHERE tenant_id=? AND theme_id=?",
      )
      .get(tenantId, themeId)?.artifact_id as string | undefined
  }
  readAsset(
    p: ThemePrincipal,
    id: string,
    assetId: string,
    publishedOnly = false,
  ) {
    const row = this.own(p, id)

    if (row.phase === "draft" || (publishedOnly && row.phase !== "published")) {
      throw new ThemeInstallationError("Not found", 404)
    }

    if (publishedOnly) {
      this.verify(row)
    }

    const definition = this.runtimeDefinition(row)
    const asset = definition.assets.find((a) => a.id === assetId)
    const value = this.db
      .prepare(
        "SELECT content FROM theme_assets WHERE artifact_id=? AND asset_id=?",
      )
      .get(id, assetId)

    if (!asset || !value) {
      throw new ThemeInstallationError("Not found", 404)
    }

    const bytes = Buffer.from(value.content as Uint8Array)
    this.validateBytes(asset, bytes, 409)

    return { asset, bytes }
  }
  readPublishedMedia(tenantId: string, name: string) {
    const match =
      /^theme_([a-f0-9]{32})_[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg|json)$/u.exec(
        name,
      )

    if (!match) {
      return null
    }

    const row = this.db
      .prepare(
        "SELECT * FROM theme_artifacts WHERE tenant_id=? AND replace(artifact_id,'-','')=? AND phase='published'",
      )
      .get(tenantId, match[1]) as unknown as StoredArtifact | undefined

    if (!row) {
      return null
    }

    const asset = this.runtimeDefinition(row).assets.find(
      (a) => a.url === `/media/${name}`,
    )

    if (!asset) {
      return null
    }

    return this.readAsset(
      { tenantId, userId: "authorized-media", grants: [] },
      row.artifact_id,
      asset.id,
      true,
    )
  }
  readPreviewMedia(
    p: ThemePrincipal,
    id: string,
    name: string,
    revision: number,
  ) {
    const row = this.own(p, id)

    if (row.revision !== revision) {
      throw new ThemeInstallationError("Preview revision changed", 409)
    }

    const asset = this.runtimeDefinition(row).assets.find(
      (a) => a.url === `/media/${name}`,
    )

    if (!asset) {
      return null
    }

    return this.readAsset(p, id, asset.id)
  }
  recordHttpAccess(
    p: ThemePrincipal,
    detail: { method: string; path: string; status: number },
  ) {
    if (!p.userId || !p.tenantId) {
      throw new ThemeInstallationError("Forbidden", 403)
    }

    this.audit(p, "http", null, detail)
  }
  auditLog(p: ThemePrincipal) {
    if (!p.userId || !p.tenantId) {
      throw new ThemeInstallationError("Forbidden", 403)
    }

    return this.db
      .prepare(
        "SELECT sequence,actor_id,artifact_id,action,at,detail FROM theme_audit WHERE tenant_id=? ORDER BY sequence",
      )
      .all(p.tenantId)
  }
}
