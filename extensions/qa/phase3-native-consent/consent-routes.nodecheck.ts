import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { request as httpsRequest } from "node:https"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import {
  CONSENT_SECURITY_HEADERS,
  createConsentRouteMatcher,
  createMachineRouteMatcher,
  createNativeConsentHost,
  listenNativeConsentHost,
  mergeContentSecurityPolicyFrameAncestors,
} from "../../src/mcp-app/native-host/index.ts"
import {
  buildMcpOptions,
  createEphemeralOAuthKeys,
  createLoopbackTlsCertificate,
  createPinnedCaFetch,
} from "./harness.ts"

const VALID_ID_54 = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdEfGhIjKlMnOp"

describe("native-host consent routes and security headers", () => {
  it("merges frame-ancestors 'none' safely into existing CSP headers", () => {
    assert.equal(
      mergeContentSecurityPolicyFrameAncestors(undefined),
      "frame-ancestors 'none'",
    )
    assert.equal(
      mergeContentSecurityPolicyFrameAncestors("default-src 'self'"),
      "default-src 'self'; frame-ancestors 'none'",
    )
    assert.equal(
      mergeContentSecurityPolicyFrameAncestors(
        "default-src 'self'; frame-ancestors https://evil.example; script-src 'self'",
      ),
      "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
    )
    assert.equal(
      mergeContentSecurityPolicyFrameAncestors(
        "default-src 'self', FRAME-ANCESTORS *; img-src https:",
      ),
      "default-src 'self'; frame-ancestors 'none', img-src https:; frame-ancestors 'none'",
    )
  })

  it("matches exact OAuth consent and exact 54-char native-save consent paths only", () => {
    const matcher = createConsentRouteMatcher({
      consentPageUrl: "https://localhost:8443/studio/oauth-consent",
      nativeSaveConsentPageUrl:
        "https://localhost:8443/studio/native-save-consent",
    })

    assert.equal(matcher("/studio/oauth-consent"), true)
    assert.equal(matcher(`/studio/native-save-consent/${VALID_ID_54}`), true)
    assert.equal(matcher("/studio/oauth-consent/extra"), false)
    assert.equal(matcher("/studio/native-save-consent"), false)
    assert.equal(matcher("/studio/native-save-consent/"), false)
    assert.equal(matcher("/studio/native-save-consent/too-short"), false)
    assert.equal(
      matcher(`/studio/native-save-consent/${VALID_ID_54}/nested`),
      false,
    )
    assert.equal(
      matcher(`/studio/native-save-consent/${"a".repeat(55)}`),
      false,
    )
    assert.equal(
      matcher(`/studio/native-save-consent/${"a".repeat(53)}!`),
      false,
    )
    assert.equal(matcher("/studio/games"), false)
    assert.equal(matcher("/manager/quizz/quiz123"), false)
    assert.equal(matcher("/"), false)
  })

  it("identifies protected OAuth and MCP machine routes strictly", () => {
    const isMachine = createMachineRouteMatcher({
      issuer: "https://localhost:8443/oauth",
      resource: "https://localhost:8443/mcp",
      resourceMetadataUrl:
        "https://localhost:8443/.well-known/oauth-protected-resource",
    })

    assert.equal(isMachine("/mcp"), true)
    assert.equal(isMachine("/.well-known/oauth-protected-resource"), true)
    assert.equal(
      isMachine("/.well-known/oauth-authorization-server/oauth"),
      true,
    )
    assert.equal(isMachine("/oauth/jwks.json"), true)
    assert.equal(isMachine("/oauth/authorize"), true)
    assert.equal(isMachine("/oauth/inspect"), true)
    assert.equal(isMachine("/oauth/approve"), true)
    assert.equal(isMachine("/oauth/native-save/inspect"), true)
    assert.equal(isMachine("/oauth/native-save/approve"), true)
    assert.equal(isMachine("/oauth/token"), true)
    assert.equal(isMachine("/oauth/revoke"), true)
    assert.equal(isMachine("/oauth/downloads/bundle-123"), true)
    assert.equal(isMachine("/studio/oauth-consent"), false)
    assert.equal(isMachine(`/studio/native-save-consent/${VALID_ID_54}`), false)
    assert.equal(isMachine("/api/quizz"), false)
  })

  it("stays byte-equivalent pass-through with zero OAuth/storage side effects when disabled", async () => {
    const prevConfig = process.env.CONFIG_PATH

    delete process.env.CONFIG_PATH

    try {
      const sentinelHtml =
        "<!doctype html><html><body>Studio Pass</body></html>"
      const host = await createNativeConsentHost({
        enabled: false,
        nativeAppFetch: (request) =>
          new Response(JSON.stringify({ ok: true, url: request.url }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Native": "raw",
            },
          }),
        webFallback: (request) =>
          new Response(sentinelHtml, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": "default-src 'self'",
              "X-Sentinel": request.method,
            },
          }),
      })

      assert.equal(host.enabled, false)
      assert.equal(host.service, null)
      assert.equal(host.consentRouteMatcher, null)
      assert.equal(host.machineRouteMatcher, null)

      try {
        const consentRes = await host.fetch(
          new Request(
            `https://127.0.0.1/studio/native-save-consent/${VALID_ID_54}`,
          ),
        )

        assert.equal(consentRes.status, 200)
        assert.equal(await consentRes.text(), sentinelHtml)
        assert.equal(
          consentRes.headers.get("content-security-policy"),
          "default-src 'self'",
        )
        assert.equal(consentRes.headers.get("x-frame-options"), null)
        assert.equal(consentRes.headers.get("referrer-policy"), null)
        assert.equal(consentRes.headers.get("cache-control"), null)

        const apiRes = await host.fetch(
          new Request("https://127.0.0.1/api/health"),
        )

        assert.equal(apiRes.status, 200)
        assert.equal(apiRes.headers.get("x-native"), "raw")
        assert.equal(apiRes.headers.get("x-frame-options"), null)
      } finally {
        await host.close()
      }
    } finally {
      if (prevConfig === undefined) {
        delete process.env.CONFIG_PATH
      } else {
        process.env.CONFIG_PATH = prevConfig
      }
    }
  })

  it("fails closed on missing or invalid enabled configuration", async () => {
    const keys = createEphemeralOAuthKeys()
    const tempDir = mkdtempSync(join(tmpdir(), "tadazz-host-cfg-"))
    const prevConfig = process.env.CONFIG_PATH

    try {
      await assert.rejects(
        () => createNativeConsentHost({ enabled: true, configRoot: tempDir }),
        /explicit mcp configuration/iu,
      )

      process.env.CONFIG_PATH = join(tmpdir(), "different-config-root")

      await assert.rejects(
        () =>
          createNativeConsentHost({
            enabled: true,
            configRoot: tempDir,
            mcp: buildMcpOptions({
              origin: "https://127.0.0.1:8443",
              keys,
            }),
          }),
        /CONFIG_PATH/iu,
      )

      process.env.CONFIG_PATH = tempDir

      await assert.rejects(
        () =>
          createNativeConsentHost({
            enabled: true,
            configRoot: tempDir,
            mcp: {
              ...buildMcpOptions({
                origin: "https://127.0.0.1:8443",
                keys,
              }),
              consentPageUrl: "https://evil.example/studio/oauth-consent",
            },
          }),
        /share an origin/iu,
      )
    } finally {
      if (prevConfig === undefined) {
        delete process.env.CONFIG_PATH
      } else {
        process.env.CONFIG_PATH = prevConfig
      }

      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("applies merged consent headers on GET/HEAD consent routes only and preserves raw machine listener", async () => {
    const root = mkdtempSync(join(tmpdir(), "tadazz-host-headers-"))
    const prevConfig = process.env.CONFIG_PATH
    const prevAccounts = process.env.TADAZZ_ACCOUNTS_ENABLED
    const prevJwt = process.env.JWT_SECRET

    process.env.CONFIG_PATH = root
    process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
    process.env.JWT_SECRET = `test-jwt-${"k".repeat(48)}`

    const accountDb = await import("@razzia/socket/services/account-db")
    accountDb.getAccountDb()
    const tls = createLoopbackTlsCertificate()
    const keys = createEphemeralOAuthKeys()
    let serverOrigin = "https://127.0.0.1:1"
    const host = await createNativeConsentHost({
      enabled: true,
      configRoot: root,
      mcp: buildMcpOptions({
        origin: "https://127.0.0.1:8443",
        keys,
      }),
      nativeAppFetch: () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      webFallback: (request) => {
        const { pathname } = new URL(request.url)

        if (pathname.endsWith(".js")) {
          return new Response("console.log('ok')", {
            status: 200,
            headers: { "Content-Type": "text/javascript; charset=utf-8" },
          })
        }

        if (pathname === "/studio/json-consent-probe") {
          return new Response("{}", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }

        const body = `<!doctype html><html><body>${pathname}</body></html>`

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy":
              "default-src 'self'; frame-ancestors https://stale.example",
          },
        })
      },
    })
    const httpServer = await listenNativeConsentHost(host, {
      host: "127.0.0.1",
      port: 0,
      tls,
    })

    try {
      serverOrigin = httpServer.origin
      await httpServer.close()
      await host.close()

      const alignedHost = await createNativeConsentHost({
        enabled: true,
        configRoot: root,
        mcp: buildMcpOptions({
          origin: serverOrigin,
          keys,
        }),
        nativeAppFetch: () =>
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        webFallback: (request) => {
          const { pathname } = new URL(request.url)

          if (pathname.endsWith(".js")) {
            return new Response("console.log('ok')", {
              status: 200,
              headers: { "Content-Type": "text/javascript; charset=utf-8" },
            })
          }

          const body = `<!doctype html><html><body>${pathname}</body></html>`

          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy":
                "default-src 'self'; frame-ancestors https://stale.example",
            },
          })
        },
      })
      const alignedPort = Number(new URL(serverOrigin).port)
      const alignedServer = await listenNativeConsentHost(alignedHost, {
        host: "127.0.0.1",
        port: alignedPort,
        tls,
      })
      const tlsFetch = createPinnedCaFetch(tls.cert)

      try {
        for (const consentPath of [
          "/studio/oauth-consent?oauth_request=test-ticket",
          `/studio/native-save-consent/${VALID_ID_54}`,
        ]) {
          const getRes = await tlsFetch(`${alignedServer.origin}${consentPath}`)

          assert.equal(getRes.status, 200)
          assert.equal(
            getRes.headers.get("content-security-policy"),
            "default-src 'self'; frame-ancestors 'none'",
          )
          assert.equal(
            getRes.headers.get("x-frame-options"),
            CONSENT_SECURITY_HEADERS["X-Frame-Options"],
          )
          assert.equal(
            getRes.headers.get("referrer-policy"),
            CONSENT_SECURITY_HEADERS["Referrer-Policy"],
          )
          assert.equal(
            getRes.headers.get("cache-control"),
            CONSENT_SECURITY_HEADERS["Cache-Control"],
          )

          const headRes = await tlsFetch(
            `${alignedServer.origin}${consentPath}`,
            {
              method: "HEAD",
            },
          )

          assert.equal(headRes.status, 200)
          assert.equal(await headRes.text(), "")
          assert.equal(
            headRes.headers.get("content-security-policy"),
            "default-src 'self'; frame-ancestors 'none'",
          )
          assert.equal(headRes.headers.get("x-frame-options"), "DENY")
          assert.equal(headRes.headers.get("referrer-policy"), "no-referrer")
          assert.equal(headRes.headers.get("cache-control"), "no-store")
        }

        const postConsent = await tlsFetch(
          `${alignedServer.origin}/studio/oauth-consent`,
          { method: "POST" },
        )

        assert.equal(postConsent.headers.get("x-frame-options"), null)

        for (const nonConsent of [
          "/",
          "/studio/games",
          "/manager/quizz/quiz123",
          "/studio/native-save-consent",
          "/studio/native-save-consent/too-short",
          "/assets/app.js",
          "/api/health",
        ]) {
          const res = await tlsFetch(`${alignedServer.origin}${nonConsent}`)

          assert.equal(res.status, 200)
          assert.equal(
            res.headers.get("x-frame-options"),
            null,
            `Unexpected X-Frame-Options on ${nonConsent}`,
          )
          assert.equal(
            res.headers.get("referrer-policy"),
            null,
            `Unexpected Referrer-Policy on ${nonConsent}`,
          )
          assert.equal(
            res.headers.get("cache-control"),
            null,
            `Unexpected Cache-Control on ${nonConsent}`,
          )
        }

        const forwardedStatus = await new Promise<number>(
          (resolveStatus, reject) => {
            const req = httpsRequest(
              {
                hostname: "127.0.0.1",
                port: alignedServer.port,
                path: "/.well-known/oauth-protected-resource",
                method: "GET",
                ca: tls.cert,
                rejectUnauthorized: true,
                headers: {
                  "X-Forwarded-For": "203.0.113.9",
                },
              },
              (res) => {
                res.resume()
                res.on("end", () => {
                  resolveStatus(res.statusCode ?? 0)
                })
              },
            )

            req.on("error", reject)
            req.end()
          },
        )

        assert.equal(forwardedStatus, 400)
      } finally {
        await alignedServer.close()
      }
    } finally {
      if (prevConfig === undefined) {
        delete process.env.CONFIG_PATH
      } else {
        process.env.CONFIG_PATH = prevConfig
      }

      if (prevAccounts === undefined) {
        delete process.env.TADAZZ_ACCOUNTS_ENABLED
      } else {
        process.env.TADAZZ_ACCOUNTS_ENABLED = prevAccounts
      }

      if (prevJwt === undefined) {
        delete process.env.JWT_SECRET
      } else {
        process.env.JWT_SECRET = prevJwt
      }

      accountDb.closeAccountDb()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("wires NativeSaveConsentPage lazily inside Studio.tsx", () => {
    const studioPath = resolve(
      import.meta.dirname,
      "../../src/site/web/studio/Studio.tsx",
    )
    const source = readFileSync(studioPath, "utf8")

    assert.match(
      source,
      /components\/native-save-consent\/NativeSaveConsentPage/u,
    )
    assert.match(source, /\/studio\/native-save-consent/u)
    assert.match(source, /pathname=\{path\}/u)
    assert.match(source, /search=\{search\}/u)
    assert.match(source, /hash=\{hash\}/u)
    assert.match(source, /issuerBasePath=/u)
  })
})
