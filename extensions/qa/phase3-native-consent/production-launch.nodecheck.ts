import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { setTimeout as delay } from "node:timers/promises"
import { test } from "node:test"
import { createEphemeralOAuthKeys, reserveLoopbackPort } from "./harness.ts"

const isolated =
  process.platform === "linux" && process.env.TADAZZ_ISOLATED_LAUNCH_QA === "1"
const origin = "https://launcher.example.invalid"
function fixture() {
  const parent = realpathSync(tmpdir())
  const root = realpathSync(mkdtempSync(join(parent, "tadazz-launch-qa-")))
  const directory = join(root, "extensions", "mcp-service")
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const file = join(directory, "runtime.json")
  const keys = createEphemeralOAuthKeys()
  const config = {
    version: 1,
    origin,
    keyId: keys.keyId,
    signingPrivateKeyPem: keys.signingPrivateKeyPem,
    ticketEncryptionKey: Buffer.from(keys.ticketEncryptionKey).toString(
      "base64url",
    ),
    clients: [
      {
        clientId: "launcher-fixture",
        redirectUris: ["https://host.example.invalid/callback"],
        scopes: ["tadazz.drafts.read", "tadazz.drafts.write"],
      },
    ],
  }
  writeFileSync(file, JSON.stringify(config), { mode: 0o600 })

  return {
    root,
    file,
    config,
    cleanup() {
      assert.equal(resolve(root), root)
      assert.equal(dirname(root), parent)
      assert(basename(root).startsWith("tadazz-launch-qa-"))
      rmSync(root, { recursive: true, force: true })
    },
  }
}
function child(root: string, port: number, enabled: boolean) {
  const artifact = process.env.TADAZZ_NATIVE_HOST_ARTIFACT
  assert(
    artifact && isAbsolute(artifact) && existsSync(artifact),
    "Exact prebuilt artifact required",
  )
  const secret = `synthetic-launcher-only-${"r".repeat(48)}`
  const processEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: root,
    TMPDIR: root,
    NODE_ENV: "production",
    CONFIG_PATH: root,
    TADAZZ_ACCOUNTS_ENABLED: "true",
    JWT_SECRET: secret,
    SOCKET_PORT: String(port),
    TADAZZ_MCP_SERVICE_ENABLED: enabled ? "true" : "false",
  }
  const processChild = spawn(process.execPath, [artifact], {
    env: processEnv,
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = "",
    stderr = ""
  processChild.stdout.on("data", (bytes: Buffer) => {
    stdout = (stdout + bytes.toString()).slice(-32768)
  })
  processChild.stderr.on("data", (bytes: Buffer) => {
    stderr = (stderr + bytes.toString()).slice(-32768)
  })
  const exit = new Promise<[number | null, NodeJS.Signals | null]>(
    (resolveExit, rejectExit) => {
      processChild.once("exit", (code, signal) => resolveExit([code, signal]))
      processChild.once("error", rejectExit)
    },
  )

  return {
    process: processChild,
    exit,
    stdout: () => stdout,
    stderr: () => stderr,
    secret,
  }
}
async function terminate(processChild: ChildProcess) {
  if (processChild.exitCode !== null || processChild.signalCode !== null) {
    return
  }

  const exited = once(processChild, "exit")
  processChild.kill("SIGTERM")
  const timer = setTimeout(() => processChild.kill("SIGKILL"), 5000)

  try {
    await exited
  } finally {
    clearTimeout(timer)
  }
}
async function ready(p: ReturnType<typeof child>, port: number) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    assert.equal(p.process.exitCode, null, `Launcher exited: ${p.stderr()}`)

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(200),
        headers: { host: new URL(origin).host },
      })

      if (response.status === 200) {
        return
      }
    } catch {
      /* Only this fixture's own listener is polled. */
    }

    await delay(50)
  }
  throw Error(`Launcher did not become healthy: ${p.stderr()}`)
}
const request = (port: number, path: string, method = "GET") =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { host: new URL(origin).host },
    signal: AbortSignal.timeout(3000),
  })
test(
  "actual production artifact starts protected loopback APIs and retains issuer keys across restart",
  { skip: !isolated, timeout: 40000 },
  async () => {
    const f = fixture()

    try {
      const bytes = readFileSync(f.file)
      const keysets: unknown[] = []
      for (let iteration = 0; iteration < 2; iteration += 1) {
        const port = await reserveLoopbackPort()
        const p = child(f.root, port, true)

        try {
          await ready(p, port)
          const metadata = await request(
            port,
            "/.well-known/oauth-authorization-server/oauth",
          )
          assert.equal(metadata.status, 200)
          const body: unknown = await metadata.json()
          assert(body && typeof body === "object" && "issuer" in body)
          assert.equal(body.issuer, `${origin}/oauth`)
          const jwks = await request(port, "/oauth/jwks.json")
          assert.equal(jwks.status, 200)
          keysets.push(await jwks.json())
          for (const method of ["GET", "HEAD"]) {
            const unauthorized = await request(port, "/mcp", method)
            assert.equal(unauthorized.status, 401)
            assert.match(
              unauthorized.headers.get("www-authenticate") ?? "",
              /resource_metadata=/u,
            )

            if (method === "HEAD") {
              assert.equal(await unauthorized.text(), "")
            }
          }
          const me = await request(port, "/api/accounts/me")
          assert.equal(me.status, 401)
          p.process.kill("SIGTERM")
          const [code, signal] = await p.exit
          assert.equal(code, 0)
          assert.equal(signal, null)
          assert.doesNotMatch(
            p.stdout() + p.stderr(),
            /PRIVATE KEY|ticketEncryptionKey/u,
          )
          assert.equal((p.stdout() + p.stderr()).includes(p.secret), false)
        } finally {
          await terminate(p.process)
        }
      }
      assert.deepEqual(keysets[0], keysets[1])
      assert.deepEqual(readFileSync(f.file), bytes)
    } finally {
      f.cleanup()
    }
  },
)
test(
  "OFF artifact starts the original native entry and ignores an invalid MCP config",
  { skip: !isolated, timeout: 20000 },
  async () => {
    const f = fixture()
    const port = await reserveLoopbackPort()
    writeFileSync(f.file, "invalid private configuration")
    const p = child(f.root, port, false)

    try {
      await ready(p, port)
      assert.equal(
        (await request(port, "/.well-known/oauth-authorization-server/oauth"))
          .status,
        404,
      )
      assert.equal((await request(port, "/mcp")).status, 404)
      p.process.kill("SIGTERM")
      const [code, signal] = await p.exit
      assert.equal(code, 0)
      assert.equal(signal, null)
      assert.equal(
        readFileSync(f.file, "utf8"),
        "invalid private configuration",
      )
    } finally {
      await terminate(p.process)
      f.cleanup()
    }
  },
)
test(
  "invalid production key permissions stop startup before native account/bootstrap writes",
  { skip: !isolated, timeout: 10000 },
  async () => {
    const f = fixture()
    chmodSync(f.file, 0o644)
    const p = child(f.root, await reserveLoopbackPort(), true)

    try {
      const [code, signal] = await p.exit
      assert.equal(code, 1)
      assert.equal(signal, null)
      assert.equal(p.stderr().trim(), "Tadazz production startup failed")
      assert.equal(existsSync(join(f.root, "tadazz-accounts.sqlite")), false)
      assert.equal(existsSync(join(f.root, "config.json")), false)
    } finally {
      await terminate(p.process)
      f.cleanup()
    }
  },
)
