// HOST ONLY. Never import from a renderer payload or activate through a barrel.
import { createHash } from "node:crypto"
import { canonicalJson } from "./digest"
import { freeze } from "./primitives"
import {
  diagnosticCompiledRegistryV2Schema,
  nativeResourceIndexV2Schema,
  rendererArtifactIndexV2Schema,
  pnpmStoreMembershipReceiptV2Schema,
  type RightsReviewReceiptV2,
  type PnpmStoreMembershipReceiptV2,
} from "./compiled-index-schema"

// Only a later, separately reviewed source edit can add an immutable receipt.
// No setter, factory, caller registry, network lookup or registration API exists.
const ROOT_REVIEWED_RIGHTS_RECEIPTS: readonly RightsReviewReceiptV2[] = freeze(
  [],
)
const ROOT_REVIEWED_STORE_RECEIPTS: readonly PnpmStoreMembershipReceiptV2[] =
  freeze([])
const hash = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")

/** A caller record can be internally consistent without being trusted. */
export function diagnoseStoreMembershipReceipt(
  input: unknown,
): readonly string[] {
  const receipt = pnpmStoreMembershipReceiptV2Schema.parse(input),
    issues: string[] = []
  for (const file of receipt.files) {
    const sriHex = Buffer.from(
      file.originalIndexRow.integrity.slice(7),
      "base64",
    ).toString("hex")

    if (sriHex !== file.originalIndexRow.sha512) {
      issues.push(`index-sha512-mismatch:${file.packagePath}`)
    }
  }

  return freeze(issues.sort())
}

/** Diagnostic authority check. Even a future matching receipt cannot activate a pin. */
export function diagnoseHostReceiptAuthority(
  artifactInput: unknown,
  resourceInput: unknown,
  descriptorInput?: unknown,
) {
  const artifact = rendererArtifactIndexV2Schema.parse(artifactInput)
  const resources = nativeResourceIndexV2Schema.parse(resourceInput)
  const descriptor =
    descriptorInput === undefined
      ? null
      : diagnosticCompiledRegistryV2Schema.parse(descriptorInput)
  // No reviewed executable/source-theme scope is installed by this stage.
  const issues: string[] = ["execution-scope-unregistered"]
  for (const resource of resources.resources) {
    if (resource.rights.status === "unknown") {
      issues.push(`rights-unknown:${resource.artifactPath}`)

      continue
    }

    const reference = resource.rights.reviewReceipt
    const trusted = ROOT_REVIEWED_RIGHTS_RECEIPTS.some(
      (receipt) =>
        receipt.id === reference.id &&
        hash(receipt) === reference.sha256 &&
        receipt.operation === "executable-preview" &&
        descriptor !== null &&
        canonicalJson(descriptor.renderer) ===
          canonicalJson(artifact.renderer) &&
        canonicalJson(receipt.scope.sourceTheme) ===
          canonicalJson(descriptor.sourceTheme) &&
        canonicalJson(receipt.scope.renderer) ===
          canonicalJson(artifact.renderer) &&
        receipt.resources.some(
          (entry) =>
            entry.sha256 === resource.sha256 &&
            canonicalJson(entry.licenses) ===
              canonicalJson(resource.licenses) &&
            entry.obligations.length > 0,
        ),
    )

    if (!trusted) {
      issues.push(`rights-receipt-untrusted:${resource.artifactPath}`)
    }
  }
  const packageSources = [
    ...artifact.source.files,
    ...resources.resources.map((r) => r.source),
  ].filter((s) => s.kind === "pnpm-package-file")
  for (const source of packageSources) {
    const trusted = ROOT_REVIEWED_STORE_RECEIPTS.some(
      (receipt) =>
        receipt.lock.sha256 === source.lockfileSha256 &&
        receipt.packageName === source.packageName &&
        receipt.packageVersion === source.packageVersion &&
        receipt.snapshotKey === source.snapshotKey &&
        receipt.resolutionIntegrity === source.resolutionIntegrity &&
        diagnoseStoreMembershipReceipt(receipt).length === 0 &&
        receipt.files.some(
          (file) =>
            file.packagePath === source.packagePath &&
            file.observed.bytes === source.bytes &&
            file.observed.sha256 === source.sha256,
        ),
    )

    if (!trusted) {
      issues.push(
        `package-membership-untrusted:${source.packageName}/${source.packagePath}`,
      )
    }
  }

  return freeze({
    status: "unavailable" as const,
    executableAcceptance: false as const,
    compiledPins: [] as readonly never[],
    issues: [...new Set(issues)].sort(),
  })
}
