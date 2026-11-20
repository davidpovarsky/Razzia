import assert from "node:assert/strict"
import test from "node:test"
import {
  isPackageTool,
  packageInputs,
  type PackageToolName,
} from "../../contracts/package-authoring.ts"
import type { PackageAuthoringPort } from "../../server/package-authoring.ts"
import { ToolError } from "../../server/errors.ts"
import { config, harness, code, data, newKey, principal } from "./fixtures.ts"

const capabilities = {
  installer: true,
  runtime: false,
  upload: true,
  build: false,
  preview: false,
  install: false,
  export: true,
  archiveBytes: 180_000_000,
  chunkBytes: 24_000,
  reasons: ["runtime-disabled", "build-worker-unavailable"],
}

function status(uploadId = newKey()) {
  return {
    uploadId,
    packageId: "bms-memory-files",
    version: "1.0.0",
    title: "BMS Memory Files",
    phase: "preview-ready" as const,
    revision: 2,
    sourceDigest: "a".repeat(64),
    buildDigest: "b".repeat(64),
    reviewed: false,
    contents: [
      { id: "bms-theme", kind: "sandboxed-react-theme" as const },
      { id: "bms-game", kind: "game" as const },
    ],
    installedGameIds: [],
  }
}

function args(name: PackageToolName): Record<string, unknown> {
  switch (name) {
    case "get_authoring_capabilities":
    case "list_packages":
      return {}
    case "begin_package_upload":
      return {
        filename: "bms.tadazz",
        totalBytes: 22,
        sha256: "a".repeat(64),
        idempotencyKey: newKey(),
      }
    case "write_package_upload_chunk":
      return {
        transferId: newKey(),
        offset: 0,
        bytesBase64: "AA==",
        sha256: "a".repeat(64),
        idempotencyKey: newKey(),
      }
    case "complete_package_upload":
      return { transferId: newKey(), idempotencyKey: newKey() }
    case "get_package_status":
      return { uploadId: newKey() }
    case "preview_package":
      return { uploadId: newKey(), expectedRevision: 2, gameId: "bms-game" }
    case "install_package":
      return {
        uploadId: newKey(),
        expectedRevision: 2,
        selectedContentIds: ["bms-theme", "bms-game"],
        idempotencyKey: newKey(),
      }
    default:
      return {
        uploadId: newKey(),
        expectedRevision: 2,
        idempotencyKey: newKey(),
      }
  }
}

test("package capability results retain actual disabled native features", async () => {
  let calls = 0
  const h = await harness({
    packages: {
      async call(p, name, input) {
        calls++
        assert.equal(p.accountId, h.account.accountId)
        assert.equal(name, "get_authoring_capabilities")
        assert.deepEqual(input, { contractVersion: "0.1.0" })
        return { data: capabilities }
      },
    },
  })
  const missing = await harness()
  try {
    assert.deepEqual(
      data(await h.call("get_authoring_capabilities", {})),
      capabilities,
    )
    assert.equal(
      code(await missing.call("get_authoring_capabilities", {})),
      "DEPENDENCY_UNAVAILABLE",
    )
    assert.equal(calls, 1)
    assert.equal(isPackageTool("preview_package"), true)
    assert.equal(isPackageTool("approve_package"), false)
    assert.equal(isPackageTool("save_game"), false)
  } finally {
    await Promise.all([h.close(), missing.close()])
  }
})

// Deliberately independent of the implementation's packageScopes table.
const scopeCases: readonly [PackageToolName, readonly string[]][] = [
  ["get_authoring_capabilities", ["tadazz.catalog.read"]],
  ["list_packages", ["tadazz.drafts.read"]],
  ["begin_package_upload", ["tadazz.drafts.write"]],
  ["write_package_upload_chunk", ["tadazz.drafts.write"]],
  ["complete_package_upload", ["tadazz.drafts.write"]],
  ["get_package_status", ["tadazz.drafts.read"]],
  ["build_package", ["tadazz.drafts.read", "tadazz.drafts.write"]],
  ["preview_package", ["tadazz.drafts.read"]],
  ["delete_package_draft", ["tadazz.drafts.read", "tadazz.drafts.write"]],
  ["install_package", ["tadazz.drafts.read", "tadazz.library.write"]],
  ["export_package", ["tadazz.drafts.read", "tadazz.exports.read"]],
]

for (const [name, required] of scopeCases) {
  test(`package tool ${name} checks every required OAuth scope before its adapter`, async () => {
    for (const omitted of required) {
      let called = false
      const p = principal()
      p.scopes = p.scopes.filter((scope) => scope !== omitted)
      const h = await harness(
        {
          packages: {
            async call() {
              called = true
              throw new Error("must not reach native package operations")
            },
          },
        },
        p,
      )
      try {
        const result = await h.call(name, args(name))
        assert.equal(code(result), "SCOPE_REQUIRED")
        assert.equal(called, false)
        assert.match(JSON.stringify(result._meta), /insufficient_scope/u)
      } finally {
        await h.close()
      }
    }
  })
}

test("package strict inputs reject identity forgery, invalid archive names and oversized chunks before delegation", async () => {
  let calls = 0
  const h = await harness({
    packages: {
      async call() {
        calls++
        throw new Error("invalid inputs must not reach the package engine")
      },
    },
  })
  const invalid: [PackageToolName, Record<string, unknown>][] = [
    ["get_package_status", { accountId: newKey() }],
    ["get_package_status", { tenantId: newKey() }],
    ["begin_package_upload", { filename: "../bms.tadazz" }],
    ["begin_package_upload", { filename: "C:\\bms.tadazz" }],
    ["begin_package_upload", { totalBytes: 180_000_001 }],
    ["begin_package_upload", { totalBytes: 21 }],
    ["begin_package_upload", { sha256: "A".repeat(64) }],
    ["begin_package_upload", { idempotencyKey: "short" }],
    ["begin_package_upload", { downloadUrl: "https://example.invalid/a" }],
    ["write_package_upload_chunk", { offset: -1 }],
    ["write_package_upload_chunk", { offset: 180_000_000 }],
    [
      "write_package_upload_chunk",
      { offset: 179_999_999, bytesBase64: "AAAA" },
    ],
    ["write_package_upload_chunk", { bytesBase64: "AB==" }],
    ["write_package_upload_chunk", { bytesBase64: "AA=\n=" }],
    ["write_package_upload_chunk", { bytesBase64: "----" }],
    [
      "write_package_upload_chunk",
      { bytesBase64: Buffer.alloc(24_001).toString("base64") },
    ],
    ["install_package", { selectedContentIds: ["bms-game", "bms-game"] }],
    ["install_package", { reviewed: true }],
    ["install_package", { consent: true }],
    ["preview_package", { expectedRevision: 0 }],
    ["list_packages", { limit: 21 }],
  ]
  try {
    for (const [name, invalidFields] of invalid) {
      const result = await h.call(name, { ...args(name), ...invalidFields })
      assert.equal(
        code(result),
        "VALIDATION_FAILED",
        name + JSON.stringify(invalidFields),
      )
    }
    assert.equal(calls, 0)
    assert.equal(
      packageInputs.begin_package_upload.safeParse({
        contractVersion: "0.1.0",
        ...args("begin_package_upload"),
        filename: "ערכת-זיכרונות.tadazz",
      }).success,
      true,
    )
  } finally {
    await h.close()
  }
})

test("maximum valid chunk delegates exact bytes and idempotency once, without library mutations", async () => {
  const sent = {
    transferId: newKey(),
    offset: 24_000,
    bytesBase64: Buffer.alloc(24_000, 123).toString("base64"),
    sha256: "a".repeat(64),
    idempotencyKey: newKey(),
  }
  let calls = 0
  const h = await harness({
    packages: {
      async call(_p, name, input) {
        calls++
        assert.equal(name, "write_package_upload_chunk")
        assert.deepEqual(input, { contractVersion: "0.1.0", ...sent })
        return {
          data: {
            transferId: sent.transferId,
            receivedBytes: 48_000,
            complete: false,
          },
        }
      },
    },
  })
  try {
    assert.deepEqual(data(await h.call("write_package_upload_chunk", sent)), {
      transferId: sent.transferId,
      receivedBytes: 48_000,
      complete: false,
    })
    assert.equal(calls, 1)
    assert.equal(h.store.records.size, 0)
  } finally {
    await h.close()
  }
})

test("package status rejects extra source data and cross-upload results", async () => {
  const uploadId = newKey()
  for (const unsafe of [
    { ...status(uploadId), manifest: { privateSource: "do-not-expose" } },
    status(newKey()),
  ]) {
    const h = await harness({
      packages: {
        async call() {
          return { data: unsafe }
        },
      },
    })
    try {
      const result = await h.call("get_package_status", { uploadId })
      assert.equal(code(result), "INTERNAL")
      assert.equal(JSON.stringify(result).includes("do-not-expose"), false)
    } finally {
      await h.close()
    }
  }
})

test("package preview is exact-revision and validates its first-party destination", async () => {
  const uploadId = newKey()
  for (const override of [
    { revision: 3 },
    { gameId: "other-game" },
    { previewUrl: "https://attacker.example.invalid/preview" },
    { previewUrl: "https://studio.example.invalid/preview?token=not-allowed" },
  ]) {
    const h = await harness({
      packages: {
        async call() {
          return {
            data: {
              uploadId,
              revision: 2,
              gameId: "bms-game",
              previewUrl:
                "https://studio.example.invalid/studio/package-preview/" +
                uploadId,
              ...override,
            },
          }
        },
      },
    })
    try {
      assert.equal(
        code(
          await h.call("preview_package", {
            uploadId,
            expectedRevision: 2,
            gameId: "bms-game",
          }),
        ),
        "INTERNAL",
      )
    } finally {
      await h.close()
    }
  }
})

test("native build may advance revision while preview and installation retain the user's exact revision", async () => {
  const uploadId = newKey()
  const consentRequestId = newKey()
  const names: string[] = []
  const port: PackageAuthoringPort = {
    async call(_p, name) {
      names.push(name)
      if (name === "build_package") return { data: status(uploadId) }
      if (name === "preview_package")
        return {
          data: {
            uploadId,
            revision: 2,
            gameId: "bms-game",
            previewUrl:
              "https://studio.example.invalid/studio/package-preview/" +
              uploadId,
          },
        }
      if (name === "install_package")
        throw new ToolError("CONSENT_REQUIRED", {
          consentRequestId,
          consentUrl:
            config.firstPartyOrigins[0] +
            "/studio/package-save-consent/" +
            consentRequestId,
        })
      throw new Error("Unexpected package operation")
    },
  }
  const h = await harness({ packages: port })
  try {
    assert.equal(
      data(
        await h.call("build_package", {
          uploadId,
          expectedRevision: 1,
          idempotencyKey: newKey(),
        }),
      ).revision,
      2,
    )
    assert.equal(
      data(
        await h.call("preview_package", {
          uploadId,
          expectedRevision: 2,
          gameId: "bms-game",
        }),
      ).revision,
      2,
    )
    assert.deepEqual(names, ["build_package", "preview_package"])
    const install = await h.call("install_package", {
      uploadId,
      expectedRevision: 2,
      selectedContentIds: ["bms-theme", "bms-game"],
      idempotencyKey: newKey(),
    })
    assert.equal(code(install), "CONSENT_REQUIRED")
    const visible = install.content.find((item) => item.type === "text")
    assert(visible && visible.type === "text")
    assert.deepEqual(JSON.parse(visible.text), {
      ok: false,
      code: "CONSENT_REQUIRED",
      consentRequestId,
      consentUrl:
        config.firstPartyOrigins[0] +
        "/studio/package-save-consent/" +
        consentRequestId,
    })
    assert.equal(h.store.records.size, 0)
    assert.deepEqual(names, [
      "build_package",
      "preview_package",
      "install_package",
    ])
  } finally {
    await h.close()
  }
})

test("package consent text exposes only its exact package-save route", async () => {
  const consentRequestId = newKey()
  const h = await harness({
    packages: {
      async call() {
        throw new ToolError("CONSENT_REQUIRED", {
          consentRequestId,
          consentUrl:
            config.firstPartyOrigins[0] +
            "/studio/native-save-consent/" +
            consentRequestId,
        })
      },
    },
  })
  try {
    const result = await h.call("install_package", args("install_package"))
    const visible = result.content.find((item) => item.type === "text")
    assert(visible && visible.type === "text")
    assert.deepEqual(JSON.parse(visible.text), {
      ok: false,
      code: "CONSENT_REQUIRED",
    })
  } finally {
    await h.close()
  }
})
