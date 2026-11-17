import assert from "node:assert/strict"
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { test } from "node:test"
import { readProductionMcpConfiguration } from "../../src/mcp-app/native-host/production-config.ts"
import { createEphemeralOAuthKeys } from "./harness.ts"

function fixture() {
  const parent = realpathSync(tmpdir())
  const root = realpathSync(mkdtempSync(join(parent, "tadazz-launch-config-")))
  const directory = join(root, "extensions", "mcp-service")
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(join(root, "extensions"), 0o700)
  const file = join(directory, "runtime.json")
  const keys = createEphemeralOAuthKeys()
  const data = {
    version: 1,
    origin: "https://tadazz.example.invalid",
    keyId: keys.keyId,
    signingPrivateKeyPem: keys.signingPrivateKeyPem,
    ticketEncryptionKey: Buffer.from(keys.ticketEncryptionKey).toString(
      "base64url",
    ),
    clients: [
      {
        clientId: "qa-preregistered",
        redirectUris: ["https://host.example.invalid/exact-callback"],
        scopes: ["tadazz.drafts.read"],
      },
    ],
  }
  const write = (value: unknown = data) =>
    writeFileSync(file, JSON.stringify(value), { mode: 0o600 })
  write()

  return {
    root,
    file,
    directory,
    data,
    write,
    env: { CONFIG_PATH: root, TADAZZ_MCP_SERVICE_ENABLED: "true" },
    cleanup() {
      assert.equal(resolve(root), root)
      assert.equal(dirname(root), parent)
      assert(basename(root).startsWith("tadazz-launch-config-"))
      rmSync(root, { recursive: true, force: true })
    },
  }
}
test("OFF reads no config and does not generate keys, change environment or start native runtime", () => {
  const env = {
    TADAZZ_MCP_SERVICE_ENABLED: "false",
    CONFIG_PATH: "this-path-does-not-exist",
  }
  assert.equal(readProductionMcpConfiguration(env), null)
  assert.equal(
    readProductionMcpConfiguration({
      ...env,
      TADAZZ_MCP_SERVICE_ENABLED: "TRUE",
    }),
    null,
  )
  assert.deepEqual(env, {
    TADAZZ_MCP_SERVICE_ENABLED: "false",
    CONFIG_PATH: "this-path-does-not-exist",
  })
})
test("private explicit persistent config yields actual protocol options without modifying its bytes", () => {
  const f = fixture()

  try {
    const before = readFileSync(f.file)
    const result = readProductionMcpConfiguration(f.env)
    assert(result)
    assert.equal(result.config.issuer, `${f.data.origin}/oauth`)
    assert.equal(result.config.resource, `${f.data.origin}/mcp`)
    assert.equal(
      result.config.resourceMetadataUrl,
      `${f.data.origin}/.well-known/oauth-protected-resource`,
    )
    assert.deepEqual(result.config.firstPartyOrigins, [f.data.origin])
    assert.deepEqual(result.clients, f.data.clients)
    result.ticketEncryptionKey.fill(0)
    assert.notDeepEqual(
      readProductionMcpConfiguration(f.env)?.ticketEncryptionKey,
      result.ticketEncryptionKey,
    )
    assert.deepEqual(readFileSync(f.file), before)
  } finally {
    f.cleanup()
  }
})
test("missing or malformed config never silently falls back and never includes private values in errors", () => {
  const f = fixture()

  try {
    const cases: unknown[] = [
      { ...f.data, origin: "https://*.example.invalid" },
      { ...f.data, origin: "https://tadazz.example.invalid/path" },
      { ...f.data, origin: "http://tadazz.example.invalid" },
      { ...f.data, signingPrivateKeyPem: "PRIVATE_SENTINEL_NOT_A_KEY" },
      { ...f.data, ticketEncryptionKey: "a".repeat(43) },
      { ...f.data, clients: [] },
      { ...f.data, clients: [f.data.clients[0], f.data.clients[0]] },
      { ...f.data, clients: [{ ...f.data.clients[0], scopes: ["not-real"] }] },
      { ...f.data, extra: "PRIVATE_UNKNOWN_FIELD" },
    ]
    for (const data of cases) {
      f.write(data)
      assert.throws(
        () => readProductionMcpConfiguration(f.env),
        (error) =>
          error instanceof Error &&
          error.message === "MCP production configuration rejected",
      )
    }
    rmSync(f.file)
    assert.throws(
      () => readProductionMcpConfiguration(f.env),
      /^Error: MCP production configuration rejected$/u,
    )
  } finally {
    f.cleanup()
  }
})
test("client registrations require exact HTTPS callbacks without wildcard, credentials or suffix parameters", () => {
  const f = fixture()

  try {
    for (const redirect of [
      "https://*.example.invalid/cb",
      "https://host.example.invalid/cb?x=y",
      "https://u:p@host.example.invalid/cb",
      "https://host.example.invalid/cb#h",
      "http://localhost/cb",
    ]) {
      f.write({
        ...f.data,
        clients: [{ ...f.data.clients[0], redirectUris: [redirect] }],
      })
      assert.throws(
        () => readProductionMcpConfiguration(f.env),
        /configuration rejected/u,
      )
    }
  } finally {
    f.cleanup()
  }
})
test("bounded parser refuses oversized or hardlinked key files and linked parent directories", () => {
  const f = fixture()

  try {
    writeFileSync(f.file, "x".repeat(65537), { mode: 0o600 })
    assert.throws(
      () => readProductionMcpConfiguration(f.env),
      /configuration rejected/u,
    )
    f.write()
    const second = join(f.root, "private-hardlink.json")
    linkSync(f.file, second)
    assert.throws(
      () => readProductionMcpConfiguration(f.env),
      /configuration rejected/u,
    )
    rmSync(second)
    const actual = join(f.root, "actual-service")
    renameSync(f.directory, actual)
    symlinkSync(
      actual,
      f.directory,
      process.platform === "win32" ? "junction" : "dir",
    )
    assert.throws(
      () => readProductionMcpConfiguration(f.env),
      /configuration rejected/u,
    )
  } finally {
    f.cleanup()
  }
})
test(
  "POSIX key mode and writable parent protections are enforced on real Linux",
  { skip: process.platform === "win32" },
  () => {
    const f = fixture()

    try {
      chmodSync(f.file, 0o644)
      assert.throws(
        () => readProductionMcpConfiguration(f.env),
        /configuration rejected/u,
      )
      chmodSync(f.file, 0o600)
      chmodSync(f.directory, 0o777)
      assert.throws(
        () => readProductionMcpConfiguration(f.env),
        /configuration rejected/u,
      )
    } finally {
      f.cleanup()
    }
  },
)
