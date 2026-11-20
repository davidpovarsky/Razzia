import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { Hono } from "hono"
import { packPackage, packageSha } from "../../src/server/packages/archive.ts"
import { packageManifestSchema } from "../../src/core/packages/manifest.ts"
import {
  packageDataSchemas,
  packageInputs,
  type PackageToolData,
  type PackageToolInput,
  type PackageToolName,
} from "../../src/mcp-app/contracts/package-authoring.ts"
import type { VerifiedPrincipal } from "../../src/mcp-app/server/dependencies.ts"
import type { createFirstPartyOAuth } from "../../src/mcp-app/first-party/oauth.ts"
import {
  fixture,
  key,
  show,
  type Session,
} from "../../src/mcp-app/tests/first-party/fixtures.ts"
import {
  ALL_MCP_SCOPES,
  createEphemeralOAuthKeys,
  createLoopbackTlsCertificate,
  createPinnedCaFetch,
  createPkcePair,
} from "./harness.ts"

type Issuer = Awaited<ReturnType<typeof createFirstPartyOAuth>>
const clientId = "synthetic-native-package-client"
const callback = "https://client.example.invalid/package-callback"

/** Real synthetic account consent and PKCE exchange, never a forged principal. */
async function authorize(issuer: Issuer, origin: string, session: Session) {
  const api = (path: string, body?: Record<string, string>) => {
    const firstParty = path === "/oauth/inspect" || path === "/oauth/approve"
    return issuer.fetch(
      new Request(origin + path, {
        method: body ? "POST" : "GET",
        headers: {
          host: new URL(origin).host,
          ...(firstParty
            ? {
                authorization: `Bearer ${session.token}`,
                origin,
                "content-type": "application/json",
              }
            : { "content-type": "application/x-www-form-urlencoded" }),
        },
        ...(body
          ? {
              body: firstParty
                ? JSON.stringify(body)
                : new URLSearchParams(body),
            }
          : {}),
      }),
    )
  }
  const pkce = createPkcePair()
  const started = await api(
    "/oauth/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: callback,
        resource: origin + "/mcp",
        scope: ALL_MCP_SCOPES.join(" "),
        state: key(),
        code_challenge: pkce.challenge,
        code_challenge_method: "S256",
      }),
  )
  assert.equal(started.status, 302)
  const location = started.headers.get("location")
  assert(location)
  const ticket = new URL(location).searchParams.get("oauth_request")
  assert(ticket)
  const inspected = await api("/oauth/inspect", { ticket })
  assert.equal(inspected.status, 200)
  const inspection = await inspected.json()
  const approved = await api("/oauth/approve", {
    ticket,
    decision: "allow",
    proof: inspection.proof,
  })
  assert.equal(approved.status, 200)
  const approval = await approved.json()
  const code = new URL(approval.redirectUrl).searchParams.get("code")
  assert(code)
  const exchanged = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callback,
    resource: origin + "/mcp",
    code,
    code_verifier: pkce.verifier,
  })
  assert.equal(exchanged.status, 200)
  const tokens = await exchanged.json()
  return issuer.verifyAccessToken(tokens.access_token)
}

function syntheticArchive() {
  const path = "games/synthetic.json"
  const document = Buffer.from(JSON.stringify(show("Synthetic native package")))
  const manifest = packageManifestSchema.parse({
    format: "tadazz-package",
    formatVersion: 1,
    id: "synthetic-native-package",
    version: "1.0.0",
    displayName: "Synthetic native package",
    author: "Automated QA fixture",
    requires: { packageApi: 1, runtimeApi: 1 },
    contents: [{ kind: "game", id: "synthetic-game", path }],
    files: [
      {
        path,
        kind: "descriptor",
        bytes: document.length,
        sha256: packageSha(document),
        rights: "owner-authorized",
        provenance: "Synthetic authored QA questions; no customer content",
        exportable: true,
      },
    ],
  })
  return packPackage(manifest, new Map([[path, document]]))
}

test(
  "real native MCP package staging and signed HTTP delivery stay account-bound without build or install",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture()
    const previous = {
      TADAZZ_PACKAGE_INSTALLER_ENABLED:
        process.env.TADAZZ_PACKAGE_INSTALLER_ENABLED,
      TADAZZ_PACKAGE_RUNTIME_ENABLED:
        process.env.TADAZZ_PACKAGE_RUNTIME_ENABLED,
      TADAZZ_THEME_WORKSPACE_GRANTS: process.env.TADAZZ_THEME_WORKSPACE_GRANTS,
    }
    process.env.TADAZZ_PACKAGE_INSTALLER_ENABLED = "true"
    process.env.TADAZZ_PACKAGE_RUNTIME_ENABLED = "false"
    process.env.TADAZZ_THEME_WORKSPACE_GRANTS = "{}"
    let closeListener: (() => Promise<void>) | undefined
    let closeStores: (() => void) | undefined
    const sentinels = [
      f.root,
      ...f.sessions.map((s) => join(f.root, "tenants", s.owner)),
    ]
      .map((root) => join(root, "native-sentinels/quiz.json"))
      .map((path) => ({ path, bytes: readFileSync(path) }))
    try {
      // Actual env/auth/store modules load only after the isolated fixture is active.
      const { createFirstPartyOAuth: createIssuer } =
        await import("../../src/mcp-app/first-party/oauth.ts")
      const { createNativePackageAuthoring } =
        await import("../../src/mcp-app/native-host/package-authoring.ts")
      const { packageRoutes } =
        await import("../../../packages/socket/src/api/extensions/package-routes.ts")
      const { packageStore, closePackageStore, packageRuntimeSecret } =
        await import("../../../packages/socket/src/services/package-installation.ts")
      const { packageTransfers } =
        await import("../../../packages/socket/src/services/package-transfers.ts")
      const { readRuntimeAccess } =
        await import("../../src/server/packages/runtime-access.ts")
      const { createNativeConsentHost, listenNativeConsentHost } =
        await import("../../src/mcp-app/native-host/index.ts")
      const store = packageStore()
      const transfers = packageTransfers()
      closeStores = () => {
        transfers.close()
        closePackageStore()
      }
      const app = new Hono().route("/api/packages", packageRoutes)
      const tls = createLoopbackTlsCertificate()
      const host = await createNativeConsentHost({
        enabled: false,
        nativeAppFetch: (request) => app.fetch(request),
      })
      const listener = await listenNativeConsentHost(host, { port: 0, tls })
      closeListener = () => listener.close()
      const origin = listener.origin
      const request = createPinnedCaFetch(tls.cert)
      const issuer = await createIssuer({
        config: {
          issuer: origin + "/oauth",
          resource: origin + "/mcp",
          resourceMetadataUrl:
            origin + "/.well-known/oauth-protected-resource/mcp",
          firstPartyOrigins: [origin],
        },
        configRoot: f.root,
        ...createEphemeralOAuthKeys(),
        consentPageUrl: origin + "/studio/oauth-consent",
        clients: [
          { clientId, redirectUris: [callback], scopes: [...ALL_MCP_SCOPES] },
        ],
      })
      const a = await authorize(issuer, origin, f.sessions[0])
      const b = await authorize(issuer, origin, f.sessions[1])
      const port = issuer.packages(createNativePackageAuthoring(origin))
      const call = async <N extends PackageToolName>(
        principal: VerifiedPrincipal,
        name: N,
        input: Omit<PackageToolInput<N>, "contractVersion">,
      ): Promise<PackageToolData<N>> => {
        const args = packageInputs[name].parse({
          contractVersion: "0.1.0",
          ...input,
        })
        const result = await port.call(principal, name, args)
        return packageDataSchemas[name].parse(result.data) as PackageToolData<N>
      }
      const bytes = syntheticArchive()
      const beginInput = {
        totalBytes: bytes.length,
        sha256: packageSha(bytes),
        filename: "synthetic-native.tadazz",
        idempotencyKey: key(),
      }
      const capabilities = await call(a, "get_authoring_capabilities", {})
      assert.equal(capabilities.upload, true)
      assert.equal(capabilities.runtime, false)
      assert.equal(capabilities.preview, false)
      assert(capabilities.reasons.includes("PACKAGE_RUNTIME_DISABLED"))
      const begun = await call(a, "begin_package_upload", beginInput)
      assert(begun.uploadUrl)
      const uploadUrl = new URL(begun.uploadUrl)
      assert.equal(uploadUrl.origin, origin)
      assert.match(uploadUrl.pathname, /^\/api\/packages\/mcp-transfer\//u)
      const uploadTicket = uploadUrl.pathname.split("/").at(-1)!
      assert.equal(
        (await call(a, "begin_package_upload", beginInput)).transferId,
        begun.transferId,
      )
      assert.equal((await call(a, "list_packages", {})).items.length, 0)
      assert.equal(
        store.db.prepare("SELECT COUNT(*) AS n FROM packages").get()?.n,
        0,
      )
      const completeInput = {
        transferId: begun.transferId,
        idempotencyKey: key(),
      }

      await t.test(
        "signed binary upload rejects changed bytes and stages only the declared archive",
        async () => {
          const corrupted = Buffer.from(bytes)
          corrupted[0] ^= 1
          const rejected = await request(uploadUrl, {
            method: "POST",
            headers: {
              "content-type": "application/octet-stream",
              "content-length": String(bytes.length),
            },
            body: Uint8Array.from(corrupted),
          })
          assert.equal(rejected.status, 409)
          assert.deepEqual(await rejected.json(), {
            error: "PACKAGE_DIGEST_CHANGED",
          })
          for (let retry = 0; retry < 2; retry++) {
            const received = await request(uploadUrl, {
              method: "POST",
              headers: {
                "content-type": "application/octet-stream",
                "content-length": String(bytes.length),
              },
              body: Uint8Array.from(bytes),
            })
            assert.equal(received.status, 200)
            assert.match(
              received.headers.get("cache-control") ?? "",
              /no-store/u,
            )
            assert.deepEqual(await received.json(), {
              receivedBytes: bytes.length,
              complete: true,
            })
          }
          assert.equal((await call(a, "list_packages", {})).items.length, 0)
          await assert.rejects(
            call(b, "complete_package_upload", {
              ...completeInput,
              idempotencyKey: key(),
            }),
            /NOT_FOUND/u,
          )
        },
      )

      const completed = await call(a, "complete_package_upload", completeInput)
      await t.test(
        "completion uses native preflight, preserves exact replay and exposes bounded private status",
        async () => {
          assert.equal(completed.phase, "validated")
          assert.equal(completed.revision, 1)
          assert.equal(completed.sourceDigest, packageSha(bytes))
          assert.equal(completed.buildDigest, null)
          assert.equal(completed.reviewed, false)
          assert.deepEqual(completed.installedGameIds, [])
          assert.deepEqual(completed.contents, [
            { id: "synthetic-game", kind: "game" },
          ])
          assert.deepEqual(
            await call(a, "complete_package_upload", completeInput),
            completed,
          )
          assert.deepEqual(
            await call(a, "get_package_status", {
              uploadId: completed.uploadId,
            }),
            completed,
          )
          assert.equal(
            (await call(a, "list_packages", {})).items[0].uploadId,
            completed.uploadId,
          )
          assert.equal(
            existsSync(join(transfers.root, `${begun.transferId}.part`)),
            false,
          )
          assert.equal(
            existsSync(join(store.tenantRoot(a.accountId), "jobs")),
            false,
          )
        },
      )

      await t.test(
        "another real OAuth account cannot list, read, export or delete the draft",
        async () => {
          assert.deepEqual((await call(b, "list_packages", {})).items, [])
          await assert.rejects(
            call(b, "get_package_status", { uploadId: completed.uploadId }),
            /NOT_FOUND/u,
          )
          await assert.rejects(
            call(b, "export_package", {
              uploadId: completed.uploadId,
              expectedRevision: completed.revision,
              idempotencyKey: key(),
            }),
            /NOT_FOUND/u,
          )
          await assert.rejects(
            call(b, "delete_package_draft", {
              uploadId: completed.uploadId,
              expectedRevision: completed.revision,
              idempotencyKey: key(),
            }),
            /NOT_FOUND/u,
          )
        },
      )

      const exportInput = {
        uploadId: completed.uploadId,
        expectedRevision: completed.revision,
        idempotencyKey: key(),
      }
      const exported = await call(a, "export_package", exportInput)
      assert(exported.downloadUrl)
      const downloadUrl = new URL(exported.downloadUrl)
      const exportTicket = downloadUrl.pathname.split("/").at(-1)!
      await t.test(
        "native export round-trips the archive and rejects upload/runtime capability confusion",
        async () => {
          assert.equal(downloadUrl.origin, origin)
          assert.equal(exported.bytes, bytes.length)
          assert.equal(exported.sha256, packageSha(bytes))
          assert.deepEqual(
            await call(a, "export_package", exportInput),
            exported,
          )
          const download = await request(downloadUrl)
          assert.equal(download.status, 200)
          assert.equal(download.headers.get("content-type"), "application/zip")
          assert.match(download.headers.get("cache-control") ?? "", /no-store/u)
          assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes)
          const confusedRead = await request(
            `${origin}/api/packages/mcp-export/${uploadTicket}`,
          )
          assert.equal(confusedRead.status, 404)
          const confusedWrite = await request(
            `${origin}/api/packages/mcp-transfer/${exportTicket}`,
            {
              method: "POST",
              headers: {
                "content-type": "application/octet-stream",
                "content-length": String(bytes.length),
              },
              body: Uint8Array.from(bytes),
            },
          )
          assert.equal(confusedWrite.status, 404)
          assert.throws(
            () =>
              readRuntimeAccess(store, exportTicket, packageRuntimeSecret()),
            /PACKAGE_CAPABILITY/u,
          )
          assert.throws(
            () =>
              readRuntimeAccess(store, uploadTicket, packageRuntimeSecret()),
            /PACKAGE_CAPABILITY/u,
          )
        },
      )

      await t.test(
        "exact-revision draft deletion replays once and invalidates the issued export",
        async () => {
          const remove = {
            uploadId: completed.uploadId,
            expectedRevision: completed.revision,
            idempotencyKey: key(),
          }
          await assert.rejects(
            call(a, "delete_package_draft", {
              ...remove,
              expectedRevision: completed.revision + 1,
            }),
            /REVISION_CONFLICT/u,
          )
          const deleted = await call(a, "delete_package_draft", remove)
          assert.deepEqual(deleted, {
            uploadId: completed.uploadId,
            revision: completed.revision,
            deleted: true,
          })
          assert.deepEqual(
            await call(a, "delete_package_draft", remove),
            deleted,
          )
          await assert.rejects(
            call(a, "delete_package_draft", {
              ...remove,
              expectedRevision: completed.revision + 1,
            }),
            /REQUEST_KEY_REUSED/u,
          )
          await assert.rejects(
            call(a, "get_package_status", { uploadId: completed.uploadId }),
            /NOT_FOUND/u,
          )
          assert.deepEqual((await call(a, "list_packages", {})).items, [])
          assert.equal((await request(downloadUrl)).status, 404)
          assert.equal(
            store.db
              .prepare(
                "SELECT COUNT(*) AS n FROM package_audit WHERE action='delete-draft'",
              )
              .get()?.n,
            1,
          )
          assert.equal(
            store.db
              .prepare(
                "SELECT COUNT(*) AS n FROM package_audit WHERE action NOT IN ('upload','export','delete-draft')",
              )
              .get()?.n,
            0,
          )
          assert.equal(
            transfers.db
              .prepare("SELECT COUNT(*) AS n FROM package_install_consents")
              .get()?.n,
            0,
          )
          for (const sentinel of sentinels)
            assert.deepEqual(readFileSync(sentinel.path), sentinel.bytes)
        },
      )
    } finally {
      await closeListener?.()
      closeStores?.()
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      f.close()
    }
  },
)
