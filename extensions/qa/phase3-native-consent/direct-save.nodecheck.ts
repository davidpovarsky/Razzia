import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { test } from "node:test"
import { z } from "zod"
import {
  ALL_MCP_SCOPES,
  buildCreateDraftInput,
  buildMcpOptions,
  createEphemeralOAuthKeys,
  createLoopbackTlsCertificate,
  createPinnedCaFetch,
  installResendVerificationTrap,
  reserveLoopbackPort,
} from "./harness.ts"

import type { NativeAccountSession } from "./oauth-flow.ts"
import type { NativeCreationOperationPort } from "../../src/server/storage/creation-operation-types.ts"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import { ToolError } from "../../src/mcp-app/server/errors.ts"

type Outcome = {
  ok: boolean
  data?: Record<string, unknown>
  error?: { code: string; consentUrl?: string }
}
const key = () => randomBytes(18).toString("base64url")

test(
  "default native saves are direct, account-bound and recover one committed game without browser approval",
  { timeout: 60000 },
  async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "tadazz-direct-save-")),
    )
    const previous = {
      CONFIG_PATH: process.env.CONFIG_PATH,
      TADAZZ_ACCOUNTS_ENABLED: process.env.TADAZZ_ACCOUNTS_ENABLED,
      JWT_SECRET: process.env.JWT_SECRET,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      TADAZZ_AUTH_EMAIL_FROM: process.env.TADAZZ_AUTH_EMAIL_FROM,
    }
    process.env.CONFIG_PATH = root
    process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
    process.env.JWT_SECRET = "synthetic-direct-save-test-key-" + "s".repeat(48)
    process.env.RESEND_API_KEY = "test-not-a-real-api-key"
    process.env.TADAZZ_AUTH_EMAIL_FROM = "Tadazz Test <auth@example.invalid>"
    const mailTrap = installResendVerificationTrap()
    let close: (() => Promise<void>) | undefined = undefined
    const clients: Array<{ close(): Promise<void> }> = []
    try {
      const [nativeHost, service, sdk, flow] = await Promise.all([
        import("../../src/mcp-app/native-host/index.ts"),
        import("../../src/mcp-app/first-party/service.ts"),
        import("../phase3-mcp-service/mcp-client.ts"),
        import("./oauth-flow.ts"),
      ])
      const tls = createLoopbackTlsCertificate()
      const fetchImpl = createPinnedCaFetch(tls.cert)
      const port = await reserveLoopbackPort()
      const origin = `https://127.0.0.1:${port}`
      const nativeOperations =
        await service.createFirstPartyNativeSaveOperations(root)
      const keys = createEphemeralOAuthKeys()
      let interruptAfterCommit = false
      let interruptBeforeCommit = false
      let creates = 0
      const operations: NativeCreationOperationPort = {
        lookup: (binding) => nativeOperations.lookup(binding),
        create: (binding, input, extras) => {
          if (interruptBeforeCommit) {
            interruptBeforeCommit = false
            throw new Error("Synthetic interruption before native commit")
          }
          creates++
          const result = nativeOperations.create(binding, input, extras)
          if (interruptAfterCommit) {
            interruptAfterCommit = false
            throw new Error(
              "Synthetic interruption after the real native commit",
            )
          }
          return result
        },
      }
      const host = await nativeHost.createNativeConsentHost({
        enabled: true,
        configRoot: root,
        initializeNativeRuntime: true,
        mcp: buildMcpOptions({ origin, keys, operations }),
        webFallback: () =>
          new Response("<!doctype html><title>Synthetic QA</title>", {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      })
      const listener = await nativeHost.listenNativeConsentHost(host, {
        host: "127.0.0.1",
        port,
        tls,
      })
      close = () => listener.close()
      const accounts: NativeAccountSession[] = []
      for (const name of ["alice", "bob"]) {
        accounts.push(
          await flow.registerAndLoginAccount({
            origin,
            fetchImpl,
            email: `${name}-direct@example.invalid`,
            password: `Direct-${name}-Passphrase-1234`,
            codes: mailTrap.codes,
          }),
        )
      }
      async function connected(
        account: NativeAccountSession,
        scopes: readonly string[] = ALL_MCP_SCOPES,
      ) {
        const grant = await flow.authorizePkceGrant({
          origin,
          fetchImpl,
          nativeToken: account.token,
          scopes,
        })
        const client = new sdk.Client({
          name: "direct-save-native-qa",
          version: "1",
        })
        const transport = new sdk.StreamableHTTPClientTransport(
          new URL(`${origin}/mcp`),
          {
            authProvider: { token: () => Promise.resolve(grant.accessToken) },
            fetch: fetchImpl,
          },
        )
        await client.connect(transport)
        clients.push(client)
        return {
          grant,
          call: async (name: string, args: Record<string, unknown>) =>
            (await client.callTool({ name, arguments: args }))
              .structuredContent as Outcome,
        }
      }
      const a = await connected(accounts[0])
      const b = await connected(accounts[1])
      const limited = await connected(accounts[0], [
        "tadazz.drafts.read",
        "tadazz.drafts.write",
      ])
      const draft = await a.call(
        "create_game_draft",
        buildCreateDraftInput("Direct native save"),
      )
      assert.equal(draft.ok, true)
      const selection = {
        contractVersion: "0.1.0",
        draftId: draft.data?.draftId,
        expectedRevision: 1,
        intent: "createNew",
        idempotencyKey: key(),
      }
      assert.equal(
        (await limited.call("save_game", selection)).error?.code,
        "SCOPE_REQUIRED",
      )
      assert.equal(
        (await b.call("save_game", selection)).error?.code,
        "NOT_FOUND",
      )
      assert.equal(
        (await a.call("save_game", { ...selection, expectedRevision: 2 })).error
          ?.code,
        "REVISION_CONFLICT",
      )
      assert.equal(creates, 0)
      const saved = await a.call("save_game", selection)
      assert.equal(saved.ok, true)
      assert.match(String(saved.data?.quizId), /^[A-Za-z0-9_-]{21}$/u)
      assert.equal(saved.data?.revision, 1)
      assert.equal(saved.data?.savedRevision, 1)
      assert.equal(saved.error, undefined)
      assert.equal(creates, 1)
      assert.deepEqual((await a.call("save_game", selection)).data, saved.data)
      assert.equal(creates, 1)
      const updated = await a.call("update_game_title", {
        contractVersion: "0.1.0",
        draftId: selection.draftId,
        expectedRevision: 1,
        title: "Direct native revision two",
        idempotencyKey: key(),
      })
      assert.equal(updated.ok, true)
      assert.equal(updated.data?.revision, 2)
      // Historical completion must replay before looking up the newly edited draft.
      assert.deepEqual((await a.call("save_game", selection)).data, saved.data)
      assert.equal(
        (await a.call("save_game", { ...selection, expectedRevision: 2 })).error
          ?.code,
        "REQUEST_KEY_REUSED",
      )
      assert.equal(
        (await a.call("save_game", { ...selection, idempotencyKey: key() }))
          .error?.code,
        "REVISION_CONFLICT",
      )
      interruptAfterCommit = true
      const interruptedSelection = {
        ...selection,
        expectedRevision: 2,
        idempotencyKey: key(),
      }
      assert.equal(
        (await a.call("save_game", interruptedSelection)).error?.code,
        "DEPENDENCY_UNAVAILABLE",
      )
      assert.equal(creates, 2)
      assert.equal(
        (
          await a.call("update_game_title", {
            contractVersion: "0.1.0",
            draftId: selection.draftId,
            expectedRevision: 2,
            title: "Changed after commit",
            idempotencyKey: key(),
          })
        ).ok,
        true,
      )
      const recovered = await a.call("save_game", interruptedSelection)
      assert.equal(recovered.ok, true)
      assert.equal(recovered.data?.revision, 2)
      assert.notEqual(recovered.data?.quizId, saved.data?.quizId)
      assert.equal(creates, 2)
      assert.deepEqual(
        (await a.call("save_game", interruptedSelection)).data,
        recovered.data,
      )
      const list = async (token: string) => {
        const response = await fetchImpl(`${origin}/api/quizz`, {
          headers: { authorization: `Bearer ${token}` },
        })
        assert.equal(response.status, 200)
        return (await response.json()) as { quizz: Array<{ id: string }> }
      }
      assert.deepEqual(
        new Set((await list(accounts[0].token)).quizz.map((quiz) => quiz.id)),
        new Set([saved.data?.quizId, recovered.data?.quizId]),
      )
      assert.equal((await list(accounts[1].token)).quizz.length, 0)
      const ledger = new DatabaseSync(
        join(
          root,
          "tenants",
          accounts[0].accountId,
          "extensions",
          "mcp-oauth",
          "grants.sqlite",
        ),
        { readOnly: true },
      )
      try {
        assert.equal(
          ledger
            .prepare(
              "SELECT COUNT(*) AS n FROM operations WHERE kind='save-consent'",
            )
            .get()?.n,
          0,
        )
        const rows = ledger
          .prepare("SELECT outcome FROM operations WHERE kind='save'")
          .all()
        assert.equal(rows.length, 2)
        for (const row of rows) {
          const record = z
            .object({
              state: z.string(),
              approved: z.null(),
              delegatedAuthorization: z.object({
                kind: z.literal("delegated-tool"),
              }),
            })
            .parse(JSON.parse(String(row.outcome)))
          assert.equal(record.state, "saved")
          assert.equal(record.approved, null)
          assert.equal(record.delegatedAuthorization.kind, "delegated-tool")
        }
      } finally {
        ledger.close()
      }
      // Exercise an actual policy upgrade with the same OAuth keys/account ledger.
      // Only the synthetic clock is advanced relative to request creation; no
      // approval, native journal, or authorization receipt is forged in storage.
      const { createFirstPartyOAuth } =
        await import("../../src/mcp-app/first-party/oauth.ts")
      const issuerOptions = buildMcpOptions({ origin, keys, operations })
      const makeIssuer = (requireFirstPartyConsent: boolean) =>
        createFirstPartyOAuth({
          ...keys,
          config: issuerOptions.config,
          configRoot: root,
          clients: issuerOptions.clients,
          consentPageUrl: issuerOptions.consentPageUrl,
          nativeSave: {
            operations,
            authoring: issuerOptions.authoring,
            consentPageUrl: `${origin}/studio/native-save-consent`,
            requireFirstPartyConsent,
          },
        })
      const legacyIssuer = await makeIssuer(true)
      const directIssuer = await makeIssuer(false)
      const legacyPrincipal = await legacyIssuer.verifyAccessToken(
        a.grant.accessToken,
      )
      const directPrincipal = await directIssuer.verifyAccessToken(
        a.grant.accessToken,
      )
      assert(legacyIssuer.storage)
      assert(directIssuer.storage)
      const legacyStorage = legacyIssuer.storage
      const directStorage = directIssuer.storage
      for (const mode of ["pending", "approved", "direct-expired"] as const) {
        const created = await a.call(
          "create_game_draft",
          buildCreateDraftInput(`Expired ${mode} request`),
        )
        assert.equal(created.ok, true)
        assert.equal(typeof created.data?.draftId, "string")
        const args = {
          contractVersion: "0.1.0" as const,
          draftId: String(created.data?.draftId),
          expectedRevision: 1,
          intent: "createNew" as const,
          idempotencyKey: key(),
        }
        const mutation = {
          idempotencyKey: args.idempotencyKey,
          inputDigest: hashJson(args),
          correlationId: key(),
        }
        const realNow = Date.now
        let oldRequestId: string | undefined = undefined
        Date.now = () => realNow() - 600_000
        try {
          if (mode === "direct-expired") {
            interruptBeforeCommit = true
            await assert.rejects(
              directStorage.createNewWithConsent(
                directPrincipal,
                args,
                mutation,
              ),
              /DEPENDENCY_UNAVAILABLE/u,
            )
          } else {
            try {
              await legacyStorage.createNewWithConsent(
                legacyPrincipal,
                args,
                mutation,
              )
              assert.fail(
                "Legacy compatibility mode must request browser consent",
              )
            } catch (error) {
              assert(error instanceof ToolError)
              assert.equal(error.code, "CONSENT_REQUIRED")
              oldRequestId = error.details.consentRequestId
              assert(oldRequestId)
            }
            if (mode === "approved") {
              const login = await fetchImpl(`${origin}/api/accounts/login`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  email: accounts[0].email,
                  password: "Direct-alice-Passphrase-1234",
                }),
              })
              assert.equal(login.status, 200)
              const oldSession = z
                .object({ token: z.string() })
                .parse(await login.json())
              const post = (path: string, body: unknown) =>
                legacyIssuer.fetch(
                  new Request(origin + path, {
                    method: "POST",
                    headers: {
                      host: new URL(origin).host,
                      origin,
                      authorization: `Bearer ${oldSession.token}`,
                      "content-type": "application/json",
                    },
                    body: JSON.stringify(body),
                  }),
                )
              const inspected = await post("/oauth/native-save/inspect", {
                consentRequestId: oldRequestId,
              })
              assert.equal(inspected.status, 200)
              const inspection = z
                .object({ data: z.object({ proof: z.string() }) })
                .parse(await inspected.json())
              const approved = await post("/oauth/native-save/approve", {
                consentRequestId: oldRequestId,
                decision: "allow",
                proof: inspection.data.proof,
              })
              assert.equal(approved.status, 200)
            }
          }
        } finally {
          Date.now = realNow
        }
        const before = creates
        const migrated = await a.call("save_game", args)
        assert.equal(
          migrated.ok,
          true,
          `Direct retry must renew expired ${mode} intent`,
        )
        assert.equal(creates, before + 1)
        assert.deepEqual((await a.call("save_game", args)).data, migrated.data)
        assert.equal(creates, before + 1)
        const journal = new DatabaseSync(
          join(
            root,
            "tenants",
            accounts[0].accountId,
            "extensions",
            "mcp-oauth",
            "grants.sqlite",
          ),
          { readOnly: true },
        )
        try {
          const row = journal
            .prepare(
              "SELECT outcome FROM operations WHERE grant_id=? AND kind='save' AND request_key=?",
            )
            .get(a.grant.grantId, args.idempotencyKey)
          assert(row)
          const record = z
            .object({
              approved: z.null(),
              state: z.literal("saved"),
              delegatedAuthorization: z.object({
                kind: z.literal("delegated-tool"),
                expiresAt: z.number(),
              }),
            })
            .parse(JSON.parse(String(row.outcome)))
          assert.equal(record.approved, null)
          assert(record.delegatedAuthorization.expiresAt > Date.now())
        } finally {
          journal.close()
        }
      }
      assert.equal(creates, 5)
      const revoked = await fetchImpl(`${origin}/oauth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "tadazz-chatgpt-client",
          token: a.grant.refreshToken,
          token_type_hint: "refresh_token",
        }),
      })
      assert.equal(revoked.status, 200)
      await assert.rejects(a.call("save_game", selection))
      assert.equal(creates, 5)
    } finally {
      for (const client of clients) {
        await client.close()
      }
      await close?.()
      mailTrap.restore()
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[name]
        } else {
          process.env[name] = value
        }
      }
      rmSync(root, { recursive: true, force: true })
    }
  },
)
