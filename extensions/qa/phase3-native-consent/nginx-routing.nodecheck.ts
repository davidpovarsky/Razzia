import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { test } from "node:test"
import {
  createNativeConsentHost,
  listenNativeConsentHost,
} from "../../src/mcp-app/native-host/index.ts"
import {
  buildMcpOptions,
  createEphemeralOAuthKeys,
  createLoopbackTlsCertificate,
  createPinnedCaFetch,
  reserveLoopbackPort,
} from "./harness.ts"

test(
  "real TLS Nginx preserves protected routes and excludes capability URLs from access and error logs",
  { skip: process.platform !== "linux", timeout: 20000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "tadazz-proxy-qa-"))
    const configRoot = join(root, "config")
    const publicRoot = join(root, "public")
    mkdirSync(configRoot)
    mkdirSync(publicRoot)
    writeFileSync(
      join(publicRoot, "index.html"),
      "<!doctype html><title>static fallback only</title>",
    )
    const previous = {
      CONFIG_PATH: process.env.CONFIG_PATH,
      TADAZZ_ACCOUNTS_ENABLED: process.env.TADAZZ_ACCOUNTS_ENABLED,
      JWT_SECRET: process.env.JWT_SECRET,
    }
    process.env.CONFIG_PATH = configRoot
    process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
    process.env.JWT_SECRET = `synthetic-proxy-${"r".repeat(48)}`
    const db = await import("@razzia/socket/services/account-db")
    db.getAccountDb()
    const tls = createLoopbackTlsCertificate()
    writeFileSync(join(root, "tls.pem"), tls.cert, { mode: 0o600 })
    writeFileSync(join(root, "tls.key"), tls.key, { mode: 0o600 })
    const port = await reserveLoopbackPort()
    const origin = `https://127.0.0.1:${port}`
    const host = await createNativeConsentHost({
      enabled: true,
      configRoot,
      mcp: buildMcpOptions({ origin, keys: createEphemeralOAuthKeys() }),
      nativeAppFetch: () => new Response(null, { status: 401 }),
      webFallback: () =>
        new Response("<!doctype html><title>native consent QA</title>", {
          headers: { "Content-Type": "text/html" },
        }),
    })
    const backend = await listenNativeConsentHost(host, { port: 0 })
    const routes = resolve(
      import.meta.dirname,
      "../../deployment/nginx-mcp-routes.conf",
    )
    // The exact reviewed include is used without text substitution. Only the
    // fixture's named upstream/loopback TLS listener live in this temporary file.
    assert(
      readFileSync(routes, "utf8").includes(
        "proxy_pass http://tadazz_native_mcp;",
      ),
    )
    writeFileSync(
      join(root, "nginx.conf"),
      `user root;
worker_processes 1;
pid ${root}/nginx.pid;
error_log ${root}/error.log notice;
events { worker_connections 64; }
http {
 access_log ${root}/access.log combined;
 client_body_temp_path ${root}/body;
 proxy_temp_path ${root}/proxy;
 fastcgi_temp_path ${root}/fastcgi;
 uwsgi_temp_path ${root}/uwsgi;
 scgi_temp_path ${root}/scgi;
 upstream tadazz_native_mcp { server 127.0.0.1:${backend.port}; }
 server {
  listen 127.0.0.1:${port} ssl;
  server_name 127.0.0.1;
  ssl_certificate ${root}/tls.pem;
  ssl_certificate_key ${root}/tls.key;
  root ${publicRoot};
  include ${routes};
  location /qa-log-control/ { proxy_pass http://tadazz_native_mcp; }
  location / { try_files $uri /index.html; }
 }
}
`,
    )
    let nginx: ChildProcess | null = null
    let nginxLog = ""
    let backendStopped = false

    try {
      const child = spawn(
        process.env.TADAZZ_QA_NGINX_BIN ?? "nginx",
        [
          "-p",
          root,
          "-e",
          "stderr",
          "-c",
          join(root, "nginx.conf"),
          "-g",
          "daemon off;",
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      )
      nginx = child
      child.stderr.on("data", (bytes: Buffer) => {
        nginxLog = (nginxLog + bytes.toString()).slice(-16384)
      })
      const failed = new Promise<never>((_resolve, reject) => {
        child.once("error", reject)
      })
      const request = createPinnedCaFetch(tls.cert)
      await Promise.race([
        failed,
        (async () => {
          for (let attempt = 0; attempt < 60; attempt += 1) {
            assert.equal(child.exitCode, null, nginxLog)

            try {
              if ((await request(origin)).status === 200) {
                return
              }
            } catch {
              /* Wait for this fixture's own listener. */
            }

            await delay(25)
          }
          throw new Error(`Nginx startup timeout: ${nginxLog}`)
        })(),
      ])
      for (const [path, property, expected] of [
        [
          "/.well-known/oauth-authorization-server/oauth",
          "issuer",
          `${origin}/oauth`,
        ],
        ["/.well-known/oauth-protected-resource", "resource", `${origin}/mcp`],
      ] as const) {
        const response = await request(origin + path)
        assert.equal(response.status, 200)
        assert.match(
          response.headers.get("content-type") ?? "",
          /^application\/json/u,
        )
        const body: unknown = await response.json()
        assert(body && typeof body === "object" && property in body)
        assert.equal(Reflect.get(body, property), expected)
      }
      const jwks = await request(`${origin}/oauth/jwks.json`)
      assert.equal(jwks.status, 200)
      const keys: unknown = await jwks.json()
      assert(
        keys &&
          typeof keys === "object" &&
          "keys" in keys &&
          Array.isArray(keys.keys),
      )
      assert.equal(keys.keys.length, 1)
      for (const method of ["GET", "HEAD"]) {
        const response = await request(`${origin}/mcp`, {
          method,
          headers: {
            "X-Forwarded-Proto": "https",
            "X-Forwarded-For": "203.0.113.1",
          },
        })
        assert.equal(response.status, 401)
        assert.match(
          response.headers.get("www-authenticate") ?? "",
          /resource_metadata=/u,
        )

        if (method === "HEAD") {
          assert.equal(await response.text(), "")
        }
      }
      for (const path of [
        "/oauth/unknown",
        "/mcp/unknown",
        "/.well-known/unknown",
      ]) {
        const response = await request(origin + path)
        assert.equal(response.status, 404)
        assert.match(
          response.headers.get("content-type") ?? "",
          /^application\/json/u,
        )
        assert.doesNotMatch(await response.text(), /static fallback/u)
      }
      const token = await request(`${origin}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=unsupported",
      })
      assert.equal(token.status, 400)
      assert.match(
        token.headers.get("content-type") ?? "",
        /^application\/json/u,
      )
      for (const path of [
        "/studio/oauth-consent?oauth_request=synthetic",
        `/studio/native-save-consent/${"a".repeat(54)}`,
      ]) {
        for (const method of ["GET", "HEAD"]) {
          const response = await request(origin + path, { method })
          assert.equal(response.status, 200)
          assert.equal(response.headers.get("cache-control"), "no-store")
          assert.equal(response.headers.get("x-frame-options"), "DENY")
          assert.equal(response.headers.get("referrer-policy"), "no-referrer")
          assert.match(
            response.headers.get("content-security-policy") ?? "",
            /frame-ancestors 'none'/u,
          )
          assert.equal(
            (await response.text()).includes("native consent QA"),
            method === "GET",
          )
        }
      }
      const editor = await request(`${origin}/manager/quizz/synthetic`)
      assert.equal(editor.headers.get("x-frame-options"), null)
      assert.equal(editor.headers.get("cache-control"), null)
      assert.match(await editor.text(), /static fallback only/u)

      // These markers are deliberately synthetic, never a production token or
      // customer URL. The unprotected controls prove that logging is active;
      // a missing marker alone must not pass when the fixture logger is broken.
      const protectedMarker = "qa-private-capability-marker"
      const accessControl = "qa-visible-access-control"
      const errorControl = "qa-visible-upstream-error-control"
      const ordinary = await request(`${origin}/manager/${accessControl}`)
      assert.equal(ordinary.status, 200)
      await ordinary.text()
      const protectedTargets = [
        `/oauth/downloads/${protectedMarker}`,
        `/studio/oauth-consent?oauth_request=${protectedMarker}`,
        `/studio/native-save-consent/${protectedMarker.padEnd(54, "a")}`,
      ]
      for (const path of protectedTargets) {
        const response = await request(origin + path, {
          headers: { Referer: `${origin}/${protectedMarker}` },
        })
        assert.equal(
          response.status,
          path.startsWith("/oauth/downloads/") ? 404 : 200,
        )
        await response.text()
      }
      await backend.close()
      backendStopped = true
      for (const path of protectedTargets) {
        const response = await request(origin + path, {
          headers: { Referer: `${origin}/${protectedMarker}` },
        })
        assert.equal(response.status, 502)
        await response.text()
      }
      const refused = await request(`${origin}/qa-log-control/${errorControl}`)
      assert.equal(refused.status, 502)
      await refused.text()
      const accessLog = readFileSync(join(root, "access.log"), "utf8")
      const errorLog = readFileSync(join(root, "error.log"), "utf8")
      assert(
        accessLog.includes(accessControl),
        "ordinary access log control missing",
      )
      assert(
        errorLog.includes(errorControl),
        "upstream error log control missing",
      )
      for (const text of [accessLog, errorLog, nginxLog]) {
        assert(
          !text.includes(protectedMarker),
          "protected request target leaked to a proxy log",
        )
      }
      process.stdout.write(
        `TADAZZ_PROXY_PRIVACY_PROOF ${JSON.stringify({
          version: 1,
          passed: true,
          ordinaryAccessControl: true,
          ordinaryUpstreamErrorControl: true,
          sensitiveAccessLogAbsent: true,
          sensitiveErrorLogAbsent: true,
          protectedSuccess: true,
          protectedDenial: true,
          protectedUpstreamFailure: true,
        })}\n`,
      )
    } finally {
      if (nginx?.pid && nginx.exitCode === null) {
        const child = nginx
        const stopped = new Promise<void>((resolveDone) => {
          child.once("exit", () => resolveDone())
        })
        nginx.kill("SIGQUIT")
        await Promise.race([stopped, delay(2000)])

        // oxlint-disable-next-line typescript/no-unnecessary-condition -- ChildProcess exitCode changes asynchronously while awaiting exit.
        if (nginx.exitCode === null) {
          nginx.kill("SIGKILL")
          await stopped
        }
      }

      if (!backendStopped) {
        await backend.close()
      }

      db.closeAccountDb()
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, key)
        } else {
          process.env[key] = value
        }
      }
      rmSync(root, { recursive: true, force: true })
    }
  },
)
