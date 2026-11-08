import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import {
  showThemeDefinitionSchema,
  type ShowThemeDefinition,
} from "../../core/show-themes/definition"

export interface ThemePrincipal {
  tenantId: string
  userId: string
  grants: Array<"author" | "review" | "publish" | "platform">
}

interface Artifact {
  key: string
  tenantId: string
  definition: ShowThemeDefinition
  digest: string
  authorId: string
  reviewedBy?: string
  qaDigest?: string
  signature?: string
}

export interface ThemeAudit {
  action: "draft" | "review" | "publish" | "rollback"
  tenantId: string
  actorId: string
  key: string
}

/** Offline review/reference boundary. No HTTP installer is registered. Production must inject authenticated principals and durable private storage. */
export class ThemeReviewWorkspace {
  private readonly artifacts = new Map<string, Artifact>()
  private readonly active = new Map<string, string>()
  private readonly events: ThemeAudit[] = []
  constructor(private readonly signingKey: Buffer) {
    if (signingKey.length < 32) {
      throw new Error("A private signing key of at least 32 bytes is required")
    }
  }
  private static require(
    principal: ThemePrincipal,
    grant: ThemePrincipal["grants"][number],
  ) {
    if (
      !principal.tenantId ||
      !principal.userId ||
      !principal.grants.includes(grant)
    ) {
      throw new Error("Forbidden")
    }
  }
  private own(principal: ThemePrincipal, key: string) {
    const artifact = this.artifacts.get(key)

    if (!artifact || artifact.tenantId !== principal.tenantId) {
      throw new Error("Not found")
    }

    return artifact
  }
  private audit(
    principal: ThemePrincipal,
    action: ThemeAudit["action"],
    key: string,
  ) {
    this.events.push({
      action,
      tenantId: principal.tenantId,
      actorId: principal.userId,
      key,
    })
  }
  private sign(artifact: Artifact) {
    return createHmac("sha256", this.signingKey)
      .update(
        JSON.stringify([
          artifact.key,
          artifact.tenantId,
          artifact.digest,
          artifact.reviewedBy,
          artifact.qaDigest,
        ]),
      )
      .digest("hex")
  }
  draft(
    principal: ThemePrincipal,
    validated: { definition: ShowThemeDefinition; manifestSha256: string },
  ) {
    ThemeReviewWorkspace.require(principal, "author")
    const definition = showThemeDefinitionSchema.parse(validated.definition)
    const digest = createHash("sha256")
      .update(JSON.stringify(definition))
      .digest("hex")

    if (digest !== validated.manifestSha256) {
      throw new Error("Validation receipt mismatch")
    }

    const key = `${encodeURIComponent(principal.tenantId)}/${definition.id}@${definition.version}`

    if (this.artifacts.has(key)) {
      throw new Error("Immutable version already exists")
    }

    this.artifacts.set(key, {
      key,
      tenantId: principal.tenantId,
      definition: structuredClone(definition),
      digest,
      authorId: principal.userId,
    })
    this.audit(principal, "draft", key)

    return key
  }
  review(
    principal: ThemePrincipal,
    key: string,
    evidence: { qaDigest: string; trustedBuildDigest?: string },
  ) {
    ThemeReviewWorkspace.require(principal, "review")
    const artifact = this.own(principal, key)

    if (artifact.signature || artifact.authorId === principal.userId) {
      throw new Error("Independent review is required")
    }

    if (!/^[a-f0-9]{64}$/u.test(evidence.qaDigest)) {
      throw new Error("QA evidence digest required")
    }
    // Code cannot be registered by a tenant review: the platform trusted-build lane is required.

    if (
      artifact.definition.kind === "code-backed" &&
      (!principal.grants.includes("platform") ||
        !/^[a-f0-9]{64}$/u.test(evidence.trustedBuildDigest ?? ""))
    ) {
      throw new Error("Trusted platform code review/build is required")
    }

    artifact.reviewedBy = principal.userId
    artifact.qaDigest = createHash("sha256")
      .update(JSON.stringify(evidence))
      .digest("hex")
    this.audit(principal, "review", key)
  }
  publish(principal: ThemePrincipal, key: string) {
    ThemeReviewWorkspace.require(principal, "publish")
    const artifact = this.own(principal, key)

    if (!artifact.reviewedBy || !artifact.qaDigest) {
      throw new Error("Review required")
    }

    artifact.signature ??= this.sign(artifact)
    this.active.set(principal.tenantId, key)
    this.audit(principal, "publish", key)

    return this.inspect(principal, key)
  }
  rollback(principal: ThemePrincipal, key: string) {
    ThemeReviewWorkspace.require(principal, "publish")
    const artifact = this.own(principal, key)

    if (
      !artifact.signature ||
      !timingSafeEqual(
        Buffer.from(artifact.signature, "hex"),
        Buffer.from(this.sign(artifact), "hex"),
      )
    ) {
      throw new Error("Previously signed version required")
    }

    this.active.set(principal.tenantId, key)
    this.audit(principal, "rollback", key)
  }
  inspect(principal: ThemePrincipal, key: string) {
    return structuredClone(this.own(principal, key))
  }
  list(principal: ThemePrincipal) {
    return [...this.artifacts.values()]
      .filter((item) => item.tenantId === principal.tenantId)
      .map((item) => this.inspect(principal, item.key))
  }
  auditLog(principal: ThemePrincipal) {
    return structuredClone(
      this.events.filter((item) => item.tenantId === principal.tenantId),
    )
  }
  activeKey(principal: ThemePrincipal) {
    return this.active.get(principal.tenantId)
  }
}
