// Source tests authored for the later authorized SERVER run; not locally executed.
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { canonicalJson } from "./digest"
import {
  diagnosticCompiledRegistryV2Schema,
  compiledSourceRecordSchema,
  nativeResourceIndexV2Schema,
  rendererArtifactIndexV2Schema,
  diagnosticRightsAssessmentSchema,
  rightsReviewReceiptV2Schema,
  pnpmStoreMembershipReceiptV2Schema,
  dependencyProvenanceV2Schema,
  previewTypographyEnvironmentV2Schema,
  platformTypographyDependencyV2Schema,
} from "./compiled-index-schema"
import {
  diagnoseHostReceiptAuthority,
  diagnoseStoreMembershipReceipt,
} from "./compiled-index-authority"
import {
  diagnoseCompiledArtifactBytes,
  parseCanonicalCompiledIndex,
} from "./compiled-index-validation"

const digest = "a".repeat(64),
  git = "b".repeat(40)
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
const encode = (value: unknown) =>
  new TextEncoder().encode(canonicalJson(value))
const tracked = (path: string) => ({
  kind: "git-tracked" as const,
  gitCommit: git,
  path,
  gitBlob: git,
  sha256: digest,
})
const lock = tracked("pnpm-lock.yaml")
const packageFile = (path = "wght.css") => ({
  kind: "pnpm-package-file" as const,
  packageName: "@fontsource-variable/rubik",
  packageVersion: "5.3.0",
  lockfilePath: "pnpm-lock.yaml" as const,
  lockfileSha256: digest,
  snapshotKey: "@fontsource-variable/rubik@5.3.0",
  resolutionIntegrity:
    "sha512-yQUf8qle24MJYA+EuauyF+cqjjN6I715nGjitt3sGmwZA0XfA4fWJcLq1C/diREZl4Qzn1E80nLMc0ipC/a4Lg==",
  packagePath: path,
  bytes: 3,
  sha256: digest,
})
const fixture = () => {
  // Synthetic diagnostic bytes, not a renderer, image decode or accepted pin.
  const image = new Uint8Array([1, 2, 3]),
    js = new TextEncoder().encode("export const candidate = 1"),
    license = new TextEncoder().encode("Synthetic license evidence only")
  const licenses = [{ artifactPath: "LICENSE.txt", sha256: hash(license) }]
  const source = {
    ...tracked("packages/web/public/native/image.png"),
    sha256: hash(image),
  }
  const resources = {
    format: "tadazz-native-resource-index",
    schemaVersion: 2,
    scope: "intrinsic-source-only",
    resources: [
      {
        artifactPath: "native/image.png",
        requestPath: "/native/image.png",
        usage: "stage-fixed",
        kind: "image",
        mime: "image/png",
        bytes: image.length,
        sha256: hash(image),
        source,
        catalogRef: null,
        licenses,
        rights: {
          status: "unknown",
          provenance: "repository-existing",
          reviewReceipt: null,
        },
        dimensions: { width: 1, height: 1, decodedPixels: 1 },
      },
    ],
  }
  const data = new Map([
    ["LICENSE.txt", license],
    ["native/image.png", image],
    ["renderer.js", js],
    ["resource-index.json", encode(resources)],
  ])
  const files = [...data.entries()].map(([path, value]) => ({
    path,
    kind:
      path === "LICENSE.txt"
        ? "license"
        : path === "renderer.js"
          ? "module"
          : path.endsWith("json")
            ? "metadata"
            : "image",
    mime:
      path === "LICENSE.txt"
        ? "text/plain"
        : path === "renderer.js"
          ? "text/javascript"
          : path.endsWith("json")
            ? "application/json"
            : "image/png",
    bytes: value.length,
    sha256: hash(value),
  }))
  const artifact = {
    format: "tadazz-preview-artifact-index",
    schemaVersion: 2,
    portVersion: 3,
    identityRuleVersion: 2,
    renderer: { id: "diagnostic-only", version: "1.0.0" },
    abi: "native-stage-mount-v1",
    entryModule: "renderer.js",
    entryExport: "candidate",
    resourceIndexPath: "resource-index.json",
    files,
    source: {
      gitCommit: git,
      lockfileSha256: digest,
      files: [source, tracked("qa/build.ts")],
    },
    toolchain: {
      node: "test-source",
      pnpm: "test-source",
      bundler: "not-executed",
      platform: "synthetic",
      arch: "synthetic",
      buildRecipe: tracked("qa/build.ts"),
    },
  }
  return { artifact, resources, data }
}

function membership() {
  const content = new Uint8Array([10, 20, 30]),
    indexSha = "c".repeat(64)
  const sha512 = createHash("sha512").update(content).digest("hex")
  const integrity = `sha512-${Buffer.from(sha512, "hex").toString("base64")}`
  return {
    format: "tadazz-pnpm-store-membership-receipt",
    schemaVersion: 2,
    id: "synthetic-untrusted",
    proofKind: "reviewed-immutable-pnpm-cafs-membership",
    lock,
    packageName: "@fontsource-variable/rubik",
    packageVersion: "5.3.0",
    snapshotKey: "@fontsource-variable/rubik@5.3.0",
    resolutionIntegrity: packageFile().resolutionIntegrity,
    inputs: [
      { kind: "cafs-content", path: "content/font", sha256: hash(content) },
      { kind: "pnpm-index", path: "index/package.json", sha256: indexSha },
    ],
    files: [
      {
        packagePath: "wght.css",
        originalIndexRow: {
          indexInputSha256: indexSha,
          indexRowSha256: hash(
            encode({ integrity, size: content.length, mode: 0o644 }),
          ),
          rowKey: "wght.css",
          alias: null,
          bytes: content.length,
          sha512,
          integrity,
          mode: 0o644,
        },
        observed: {
          bytes: content.length,
          sha512,
          sha256: hash(content),
          mode: 0o644,
          contentInputSha256: hash(content),
        },
      },
    ],
  }
}

describe("revision-2 diagnostic compiled indexes, never executable acceptance", () => {
  it("parses exact Git and actual locked-package identity without inventing a Git font path", () => {
    expect(
      compiledSourceRecordSchema.parse(tracked("source/file.ts")).kind,
    ).toBe("git-tracked")
    expect(compiledSourceRecordSchema.parse(packageFile()).kind).toBe(
      "pnpm-package-file",
    )
    expect(
      compiledSourceRecordSchema.safeParse({ ...packageFile(), gitCommit: git })
        .success,
    ).toBe(false)
    expect(
      compiledSourceRecordSchema.safeParse({
        ...packageFile(),
        snapshotKey: "rubik@other",
      }).success,
    ).toBe(false)
    expect(
      compiledSourceRecordSchema.safeParse({
        ...packageFile(),
        resolutionIntegrity: `sha256-${digest}`,
      }).success,
    ).toBe(false)
  })
  it.each([
    "../outside",
    "/absolute",
    "C:/drive",
    "a\\b",
    "a/%2e%2e/b",
    "a?q",
    "a#fragment",
    "a//b",
    "a/./b",
    "a/../b",
    "a/\ud800",
  ])("rejects unsafe source path %s", (path) => {
    expect(compiledSourceRecordSchema.safeParse(tracked(path)).success).toBe(
      false,
    )
    expect(
      compiledSourceRecordSchema.safeParse({
        ...packageFile(),
        packagePath: path,
      }).success,
    ).toBe(false)
  })
  it("permits genuine dot filenames without permitting dot segments", () => {
    expect(
      compiledSourceRecordSchema.safeParse(tracked(".config/build.ts")).success,
    ).toBe(true)
  })
  it("rejects accessors before reading, prototype data, cycles and sparse arrays", () => {
    let reads = 0
    const accessor = Object.defineProperty({}, "kind", {
      enumerable: true,
      get() {
        reads++
        return "git-tracked"
      },
    })
    expect(compiledSourceRecordSchema.safeParse(accessor).success).toBe(false)
    expect(reads).toBe(0)
    expect(
      compiledSourceRecordSchema.safeParse(
        Object.assign(Object.create({ inherited: true }), tracked("a")),
      ).success,
    ).toBe(false)
    const cycle: { next?: unknown } = {}
    cycle.next = cycle
    expect(compiledSourceRecordSchema.safeParse(cycle).success).toBe(false)
    expect(
      nativeResourceIndexV2Schema.safeParse({
        ...fixture().resources,
        resources: Array(1),
      }).success,
    ).toBe(false)
  })
  it("rejects unknown/legacy versions, hidden fields, excess counts and unsafe numbers", () => {
    const { artifact, resources } = fixture()
    expect(
      rendererArtifactIndexV2Schema.safeParse({ ...artifact, schemaVersion: 1 })
        .success,
    ).toBe(false)
    expect(
      nativeResourceIndexV2Schema.safeParse({ ...resources, accepted: true })
        .success,
    ).toBe(false)
    expect(
      compiledSourceRecordSchema.safeParse(
        Object.defineProperty(tracked("a"), "hidden", { value: 1 }),
      ).success,
    ).toBe(false)
    expect(
      nativeResourceIndexV2Schema.safeParse({
        ...resources,
        resources: Array.from({ length: 129 }, () => resources.resources[0]),
      }).success,
    ).toBe(false)
    expect(
      compiledSourceRecordSchema.safeParse({
        ...packageFile(),
        bytes: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false)
  })
  it("freezes parsed nested records and keeps unknown rights diagnostic-only", () => {
    const { artifact, resources, data } = fixture()
    const parsed = nativeResourceIndexV2Schema.parse(resources)
    expect(Object.isFrozen(parsed.resources[0].rights)).toBe(true)
    const result = diagnoseCompiledArtifactBytes(artifact, resources, data)
    expect(result.issues).toEqual([
      "execution-scope-unregistered",
      "rights-unknown:native/image.png",
    ])
    expect(result.executableAcceptance).toBe(false)
    expect(result.compiledPins).toEqual([])
    expect(result.remainingGates).toContain("actual-module-request-closure")
  })
  it("does not trust forged reviewed receipts, owner labels or booleans", () => {
    const { artifact, resources } = fixture()
    const forged = {
      ...resources,
      resources: [
        {
          ...resources.resources[0],
          rights: {
            status: "reviewed",
            provenance: "owner-authorized",
            reviewReceipt: { id: "forged-owner", sha256: digest },
          },
        },
      ],
    }
    expect(nativeResourceIndexV2Schema.safeParse(forged).success).toBe(true)
    expect(diagnoseHostReceiptAuthority(artifact, forged).issues).toContain(
      "rights-receipt-untrusted:native/image.png",
    )
    expect(
      diagnosticRightsAssessmentSchema.safeParse({
        ...forged.resources[0].rights,
        approved: true,
      }).success,
    ).toBe(false)
    expect(
      diagnosticRightsAssessmentSchema.safeParse({
        status: "unknown",
        provenance: "repository-existing",
        reviewReceipt: { id: "fake", sha256: digest },
      }).success,
    ).toBe(false)
  })
  it("requires actual license obligations and exact operation/scope in receipt shape", () => {
    const receipt = {
      format: "tadazz-rights-review-receipt",
      schemaVersion: 2,
      id: "untrusted",
      scope: {
        renderer: { id: "r", version: "1.0.0" },
        sourceTheme: { id: "t", version: "1.0.0" },
      },
      operation: "private-internal-qa",
      resources: [
        {
          sha256: digest,
          licenses: [],
          obligations: ["Preserve actual obligations"],
        },
      ],
    }
    expect(rightsReviewReceiptV2Schema.safeParse(receipt).success).toBe(true)
    expect(
      rightsReviewReceiptV2Schema.safeParse({
        ...receipt,
        resources: [{ ...receipt.resources[0], obligations: [] }],
      }).success,
    ).toBe(false)
    expect(
      rightsReviewReceiptV2Schema.safeParse({ ...receipt, operation: "all" })
        .success,
    ).toBe(false)
  })
  it("rejects duplicate/case-colliding paths, wrong MIME and self-index cycles", () => {
    const { artifact } = fixture()
    expect(
      rendererArtifactIndexV2Schema.safeParse({
        ...artifact,
        files: [...artifact.files, artifact.files[0]],
      }).success,
    ).toBe(false)
    expect(
      rendererArtifactIndexV2Schema.safeParse({
        ...artifact,
        files: [
          { ...artifact.files[0], path: "license.TXT" },
          ...artifact.files,
        ],
      }).success,
    ).toBe(false)
    expect(
      rendererArtifactIndexV2Schema.safeParse({
        ...artifact,
        files: artifact.files.map((f) => ({ ...f, mime: "text/javascript" })),
      }).success,
    ).toBe(false)
    expect(
      rendererArtifactIndexV2Schema.safeParse({
        ...artifact,
        files: [
          { ...artifact.files[0], path: "artifact-index.json" },
          ...artifact.files,
        ],
      }).success,
    ).toBe(false)
  })
  it("rejects reordered, duplicate-request, catalog and dimension inconsistencies", () => {
    const { artifact, resources } = fixture(),
      first = resources.resources[0]
    expect(
      rendererArtifactIndexV2Schema.safeParse({
        ...artifact,
        files: [...artifact.files].reverse(),
      }).success,
    ).toBe(false)
    expect(
      nativeResourceIndexV2Schema.safeParse({
        ...resources,
        resources: [first, { ...first, artifactPath: "native/other.png" }],
      }).success,
    ).toBe(false)
    expect(
      nativeResourceIndexV2Schema.safeParse({
        ...resources,
        resources: [
          { ...first, catalogRef: { assetId: "old", sha256: digest } },
        ],
      }).success,
    ).toBe(false)
    expect(
      nativeResourceIndexV2Schema.safeParse({
        ...resources,
        resources: [
          { ...first, dimensions: { width: 2, height: 2, decodedPixels: 3 } },
        ],
      }).success,
    ).toBe(false)
  })
  it("binds exact canonical JSON and rejects alternate bytes/duplicate object keys", () => {
    const { resources } = fixture(),
      text = canonicalJson(resources)
    expect(
      parseCanonicalCompiledIndex(text, nativeResourceIndexV2Schema),
    ).toEqual(resources)
    for (const wrong of [
      text + "\n",
      "\ufeff" + text,
      JSON.stringify(resources, null, 2),
      text.replace('"schemaVersion":2', '"schemaVersion":2,"schemaVersion":2'),
    ])
      expect(() =>
        parseCanonicalCompiledIndex(wrong, nativeResourceIndexV2Schema),
      ).toThrow()
  })
  it("detects one-byte mutation, missing/extra files and license/resource-index binding", () => {
    const { artifact, resources, data } = fixture()
    data.set("renderer.js", new Uint8Array(data.get("renderer.js")!).fill(0))
    data.delete("LICENSE.txt")
    data.set("unexpected.bin", new Uint8Array([1]))
    const result = diagnoseCompiledArtifactBytes(artifact, resources, data)
    expect(result.issues).toContain("file-bytes-mismatch:renderer.js")
    expect(result.issues).toContain("missing-file:LICENSE.txt")
    expect(result.issues).toContain("unexpected-file:unexpected.bin")
    const changed = {
      ...resources,
      resources: [
        {
          ...resources.resources[0],
          licenses: [{ artifactPath: "LICENSE.txt", sha256: digest }],
        },
      ],
    }
    const issues = diagnoseCompiledArtifactBytes(artifact, changed, data).issues
    expect(issues).toContain("license-file-mismatch:LICENSE.txt")
    expect(issues).toContain("resource-index-binding-mismatch")
  })
  it("requires resource source to be in the actual indexed source set", () => {
    const { artifact, resources, data } = fixture()
    expect(
      diagnoseCompiledArtifactBytes(
        {
          ...artifact,
          source: {
            ...artifact.source,
            files: [tracked("other.ts"), artifact.toolchain.buildRecipe],
          },
        },
        resources,
        data,
      ).issues,
    ).toContain("resource-source-missing:native/image.png")
  })
  it("records original pnpm row/alias, mode and SHA-512 without a tarball/signature claim", () => {
    const receipt = membership()
    expect(pnpmStoreMembershipReceiptV2Schema.safeParse(receipt).success).toBe(
      true,
    )
    expect(diagnoseStoreMembershipReceipt(receipt)).toEqual([])
    const file = receipt.files[0]
    for (const observed of [
      { ...file.observed, mode: 0o755 },
      { ...file.observed, bytes: 4 },
      { ...file.observed, sha512: "d".repeat(128) },
    ])
      expect(
        pnpmStoreMembershipReceiptV2Schema.safeParse({
          ...receipt,
          files: [{ ...file, observed }],
        }).success,
      ).toBe(false)
    expect(
      pnpmStoreMembershipReceiptV2Schema.safeParse({
        ...receipt,
        proofKind: "independent-tarball-signature",
      }).success,
    ).toBe(false)
    expect(
      pnpmStoreMembershipReceiptV2Schema.safeParse({
        ...receipt,
        inputs: [receipt.inputs[0]],
      }).success,
    ).toBe(false)
  })
  it("detects a forged SHA-512/integrity pairing even in structurally valid rows", () => {
    const receipt = membership(),
      file = receipt.files[0],
      wrong = "e".repeat(128)
    expect(
      diagnoseStoreMembershipReceipt({
        ...receipt,
        files: [
          {
            ...file,
            originalIndexRow: { ...file.originalIndexRow, sha512: wrong },
            observed: { ...file.observed, sha512: wrong },
          },
        ],
      }),
    ).toEqual(["index-sha512-mismatch:wght.css"])
  })
  it("does not turn parsed dependency provenance or package observation into trusted membership", () => {
    const pkg = packageFile()
    const provenance = {
      format: "tadazz-dependency-provenance",
      schemaVersion: 2,
      lock,
      packageName: pkg.packageName,
      packageVersion: pkg.packageVersion,
      snapshotKey: pkg.snapshotKey,
      resolutionIntegrity: pkg.resolutionIntegrity,
      licenseDeclaration: "OFL-1.1",
      importers: [
        { path: "extensions", specifier: "^5.3.0", resolvedVersion: "5.3.0" },
      ],
      files: [pkg],
      membershipReceipt: { id: "untrusted", sha256: digest },
    }
    expect(dependencyProvenanceV2Schema.safeParse(provenance).success).toBe(
      true,
    )
    const { artifact, resources } = fixture()
    expect(
      diagnoseHostReceiptAuthority(
        {
          ...artifact,
          source: {
            ...artifact.source,
            files: [...artifact.source.files, pkg],
          },
        },
        resources,
      ).issues,
    ).toContain(
      "package-membership-untrusted:@fontsource-variable/rubik/wght.css",
    )
    expect(
      dependencyProvenanceV2Schema.safeParse({
        ...provenance,
        lock: { ...lock, sha256: "c".repeat(64) },
      }).success,
    ).toBe(false)
  })
  it("keeps platform Rubik and non-hermetic stage environment receipts separate", () => {
    const platform = {
      format: "tadazz-platform-typography-dependency",
      schemaVersion: 2,
      scope: "platform-chrome-only",
      family: "Rubik Variable",
      css: packageFile(),
      license: packageFile("LICENSE"),
      files: [packageFile("files/rubik-latin-wght-normal.woff2")],
    }
    expect(
      platformTypographyDependencyV2Schema.safeParse(platform).success,
    ).toBe(true)
    expect(
      platformTypographyDependencyV2Schema.safeParse({
        ...platform,
        scope: "native-stage",
      }).success,
    ).toBe(false)
    const environment = {
      format: "tadazz-preview-typography-environment",
      schemaVersion: 2,
      scope: "native-stage-environment",
      typographyPolicy: "preserve-selected-theme-system-stack",
      pixelQualification: "environment-specific-non-hermetic",
      os: "synthetic",
      browser: "not-run",
      deviceScale: 1,
      viewport: { width: 1920, height: 1080 },
      observations: [
        {
          locale: "ja",
          computedFamily: "Inter, system-ui",
          glyphEvidence: null,
          japaneseFallback: "unverified",
        },
      ],
    }
    expect(
      previewTypographyEnvironmentV2Schema.safeParse(environment).success,
    ).toBe(true)
    expect(
      previewTypographyEnvironmentV2Schema.safeParse({
        ...environment,
        pixelQualification: "identical-pixels-everywhere",
      }).success,
    ).toBe(false)
    expect(
      previewTypographyEnvironmentV2Schema.safeParse({
        ...environment,
        observations: [
          {
            ...environment.observations[0],
            japaneseFallback: "observed-in-this-environment",
          },
        ],
      }).success,
    ).toBe(false)
  })
  it("parses a full descriptor without activating it and rejects wider capabilities", () => {
    const descriptor = {
      format: "tadazz-executable-preview-registry",
      schemaVersion: 2,
      portVersion: 3,
      identityRuleVersion: 2,
      registry: { id: "untrusted-registry", version: "1.0.0" },
      renderer: { id: "r", version: "1.0.0" },
      sourceTheme: { id: "t", version: "1.0.0" },
      rendererBuildSha256: digest,
      resourceIndexSha256: digest,
      capabilities: {
        roles: ["manager", "spectator"],
        phases: ["question", "answerCards", "voting", "voteLocked", "results"],
        questionTypes: ["single", "multi"],
        playModes: ["quiz", "survey"],
        minAnswers: 2,
        maxAnswers: 5,
        localSelection: false,
        callerMedia: "denied",
        audio: "silent",
        seek: "unavailable",
      },
      budgets: {
        maxArtifactBytes: 100,
        maxResourceBytes: 80,
        maxImageBytes: 80,
        maxDecodedImagePixels: 100,
        maxFontBytes: 20,
      },
    }
    expect(
      diagnosticCompiledRegistryV2Schema.safeParse(descriptor).success,
    ).toBe(true)
    for (const patch of [
      { roles: ["manager", "player", "spectator"] },
      { localSelection: true },
      { audio: "enabled" },
      { seek: "available" },
      { maxAnswers: 6 },
      { callerMedia: "allowed" },
    ])
      expect(
        diagnosticCompiledRegistryV2Schema.safeParse({
          ...descriptor,
          capabilities: { ...descriptor.capabilities, ...patch },
        }).success,
      ).toBe(false)
    expect(
      diagnosticCompiledRegistryV2Schema.safeParse({
        ...descriptor,
        budgets: { ...descriptor.budgets, maxFontBytes: 81 },
      }).success,
    ).toBe(false)
    const { artifact, resources } = fixture()
    expect(
      diagnoseHostReceiptAuthority(artifact, resources).compiledPins,
    ).toEqual([])
    const diagnostics = diagnoseCompiledArtifactBytes(
      artifact,
      resources,
      fixture().data,
      descriptor,
    )
    expect(diagnostics.issues).toContain("registry-renderer-mismatch")
    expect(diagnostics.issues).toContain("registry-index-digest-mismatch")
    expect(diagnostics.issues).toContain("registry-budget-exceeded")
    expect(diagnostics.executableAcceptance).toBe(false)
  })
  it("rejects dotted/global/prototype entry exports instead of aliasing native source", () => {
    const { artifact } = fixture()
    for (const entryExport of [
      "window.mountPreviewCandidate",
      "__proto__",
      "prototype",
      "constructor",
      "default",
      "a-b",
    ])
      expect(
        rendererArtifactIndexV2Schema.safeParse({ ...artifact, entryExport })
          .success,
      ).toBe(false)
    expect(
      rendererArtifactIndexV2Schema.safeParse({
        ...artifact,
        entryExport: "mountPreviewCandidate",
      }).success,
    ).toBe(true)
  })
  it.each([
    "Artifact-Index.json",
    "REGISTRY.JSON",
    "Accepted-Pin.JSON",
    "Artifact-Index.json/child",
  ])("rejects reserved root output %s in isolation", (path) => {
    const { artifact } = fixture()
    const extra = {
      ...artifact.files[0],
      path,
      kind: "metadata",
      mime: "application/json",
    }
    const result = rendererArtifactIndexV2Schema.safeParse({
      ...artifact,
      files: [...artifact.files, extra].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      ),
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(
        result.error.issues.some(
          (i) => i.message === "show-library:index-hash-cycle",
        ),
      ).toBe(true)
  })
  it.each([
    ["a", "a/b"],
    ["A", "a/b"],
    ["A/B", "a"],
    ["a/b", "a"],
  ])("rejects regular-file ancestor collision %s / %s", (first, second) => {
    const { artifact } = fixture()
    const files = [
      ...artifact.files,
      ...[first, second].map((path) => ({ ...artifact.files[0], path })),
    ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    const result = rendererArtifactIndexV2Schema.safeParse({
      ...artifact,
      files,
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(
        result.error.issues.some(
          (i) => i.message === "show-library:index-file-ancestor-collision",
        ),
      ).toBe(true)
  })
  it.each([
    "declared",
    "tracked",
    "recipe-commit",
    "recipe-membership",
    "recipe-hash",
  ])("binds single revision and exact recipe: %s", (caseName) => {
    const { artifact } = fixture(),
      other = "c".repeat(40)
    let changed: unknown = artifact
    if (caseName === "declared")
      changed = {
        ...artifact,
        source: { ...artifact.source, gitCommit: other },
      }
    if (caseName === "tracked")
      changed = {
        ...artifact,
        source: {
          ...artifact.source,
          files: artifact.source.files.map((f, i) =>
            i === 0 ? { ...f, gitCommit: other } : f,
          ),
        },
      }
    if (caseName === "recipe-commit")
      changed = {
        ...artifact,
        toolchain: {
          ...artifact.toolchain,
          buildRecipe: { ...artifact.toolchain.buildRecipe, gitCommit: other },
        },
      }
    if (caseName === "recipe-membership")
      changed = {
        ...artifact,
        source: {
          ...artifact.source,
          files: artifact.source.files.slice(0, 1),
        },
      }
    if (caseName === "recipe-hash")
      changed = {
        ...artifact,
        toolchain: {
          ...artifact.toolchain,
          buildRecipe: {
            ...artifact.toolchain.buildRecipe,
            sha256: "c".repeat(64),
          },
        },
      }
    const result = rendererArtifactIndexV2Schema.safeParse(changed)
    expect(result.success).toBe(false)
    const message =
      caseName.startsWith("recipe-") && caseName !== "recipe-commit"
        ? "show-library:index-recipe-membership"
        : "show-library:index-source-commit"
    if (!result.success)
      expect(result.error.issues.some((i) => i.message === message)).toBe(true)
  })
  it.each(["QA/build.ts", "qa"])(
    "rejects aliased or ancestor tracked input %s",
    (path) => {
      const { artifact } = fixture()
      const files = [...artifact.source.files, tracked(path)].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      )
      const result = rendererArtifactIndexV2Schema.safeParse({
        ...artifact,
        source: { ...artifact.source, files },
      })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(
          result.error.issues.some(
            (i) =>
              i.message ===
              (path === "qa"
                ? "show-library:index-file-ancestor-collision"
                : "show-library:index-case-collision"),
          ),
        ).toBe(true)
    },
  )
  it("applies file-tree collision rules to package, resource and license collections", () => {
    const { artifact, resources } = fixture()
    const packages = [packageFile("A"), packageFile("a/b")]
    const packageResult = rendererArtifactIndexV2Schema.safeParse({
      ...artifact,
      source: {
        ...artifact.source,
        files: [...artifact.source.files, ...packages],
      },
    })
    expect(packageResult.success).toBe(false)
    const first = resources.resources[0]
    const resourceResult = nativeResourceIndexV2Schema.safeParse({
      ...resources,
      resources: [
        { ...first, artifactPath: "a", requestPath: "/a" },
        { ...first, artifactPath: "a/b", requestPath: "/a/b" },
      ],
    })
    expect(resourceResult.success).toBe(false)
    const licenseResult = nativeResourceIndexV2Schema.safeParse({
      ...resources,
      resources: [
        {
          ...first,
          licenses: [
            { artifactPath: "A", sha256: digest },
            { artifactPath: "a/b", sha256: digest },
          ],
        },
      ],
    })
    expect(licenseResult.success).toBe(false)
    for (const result of [packageResult, resourceResult, licenseResult])
      if (!result.success)
        expect(
          result.error.issues.some(
            (i) => i.message === "show-library:index-file-ancestor-collision",
          ),
        ).toBe(true)
  })
  it.each(["long", "object", "symbol", "traversal", "control", "absolute"])(
    "rejects unbounded/untyped evidence key before formatting: %s",
    (caseName) => {
      const { artifact, resources, data } = fixture()
      let conversions = 0
      const object = {
        [Symbol.toPrimitive]() {
          conversions++
          throw new Error("must-not-coerce")
        },
      }
      const bad =
        caseName === "long"
          ? "x".repeat(241)
          : caseName === "object"
            ? object
            : caseName === "symbol"
              ? Symbol("bad")
              : caseName === "traversal"
                ? "../bad"
                : caseName === "control"
                  ? "a\nlog"
                  : "/absolute"
      const evidence = new Map<unknown, Uint8Array>(data)
      evidence.set(bad, new Uint8Array([1]))
      expect(() =>
        diagnoseCompiledArtifactBytes(
          artifact,
          resources,
          evidence as ReadonlyMap<string, Uint8Array>,
        ),
      ).toThrow("show-library:invalid-evidence-path")
      expect(conversions).toBe(0)
    },
  )
  it("uses intrinsic Map size/entries and an owned map instead of overridable getters", () => {
    const { artifact, resources, data } = fixture()
    let calls = 0
    class PoisonMap extends Map<string, Uint8Array> {}
    const poison = () => {
      calls++
      throw new Error("must-not-call-override")
    }
    Object.defineProperties(PoisonMap.prototype, {
      size: { get: poison },
      entries: { value: poison },
      get: { value: poison },
      [Symbol.iterator]: { value: poison },
    })
    const result = diagnoseCompiledArtifactBytes(
      artifact,
      resources,
      new PoisonMap(data),
    )
    expect(result.issues).toEqual([
      "execution-scope-unregistered",
      "rights-unknown:native/image.png",
    ])
    expect(result.executableAcceptance).toBe(false)
    expect(calls).toBe(0)
  })
  it("rejects proxy/non-Map evidence without invoking caller getters", () => {
    const { artifact, resources, data } = fixture()
    let calls = 0
    const poison = () => {
      calls++
      throw new Error("must-not-call-proxy")
    }
    const proxy = new Proxy(data, { get: poison, getPrototypeOf: poison })
    expect(() =>
      diagnoseCompiledArtifactBytes(artifact, resources, proxy),
    ).toThrow("show-library:byte-evidence-budget")
    const object = Object.defineProperty({}, "size", { get: poison })
    expect(() =>
      diagnoseCompiledArtifactBytes(
        artifact,
        resources,
        object as ReadonlyMap<string, Uint8Array>,
      ),
    ).toThrow("show-library:byte-evidence-budget")
    expect(calls).toBe(0)
  })
})
