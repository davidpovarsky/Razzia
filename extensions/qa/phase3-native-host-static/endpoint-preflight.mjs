import { pathToFileURL } from "node:url"

const MAX_DOCUMENT_BYTES = 65536

function exactHttps(value) {
  const url = new URL(value)

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Exact HTTPS URL required")
  }

  return url
}

function check(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function jsonDocument(response) {
  check(response.status === 200, "Discovery document must return 200")
  check(
    /^application\/json(?:\s*;|$)/iu.test(
      response.headers.get("content-type") ?? "",
    ),
    "Discovery must return JSON, not SPA HTML",
  )
  const reader = response.body?.getReader()
  check(reader, "Discovery body missing")
  const chunks = []
  let size = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      size += value.byteLength
      check(size <= MAX_DOCUMENT_BYTES, "Discovery document exceeds bound")
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }

  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  check(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "Discovery object required",
  )

  return value
}

// Read-only public routing probe. Never logs document bodies, tokens or keys.
// A pass is not an authenticated tool call or an installed-host acceptance.
//
export async function preflightEndpoints(config, fetchImpl = globalThis.fetch) {
  const issuer = exactHttps(config.issuer)
  exactHttps(config.resource)
  exactHttps(config.resourceMetadataUrl)
  const base = issuer.pathname.replace(/\/$/u, "")
  const endpoint = (suffix) => `${issuer.origin}${base}/${suffix}`
  const metadataUrl = `${issuer.origin}/.well-known/oauth-authorization-server${base}`
  const checks = []
  const probe = async (name, action) => {
    try {
      await action()
      checks.push({ name, status: "PASS" })
    } catch (error) {
      checks.push({
        name,
        status: "FAIL",
        reason: error instanceof Error ? error.message : "Probe failed",
      })
    }
  }
  const request = (url, method = "GET") =>
    fetchImpl(url, {
      method,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })
  await probe("authorization-discovery", async () => {
    const data = await jsonDocument(await request(metadataUrl))
    check(data.issuer === config.issuer, "Issuer mismatch")
    for (const [field, suffix] of [
      ["authorization_endpoint", "authorize"],
      ["token_endpoint", "token"],
      ["revocation_endpoint", "revoke"],
      ["jwks_uri", "jwks.json"],
    ]) {
      check(data[field] === endpoint(suffix), `Unexpected ${field}`)
    }
    check(
      Array.isArray(data.code_challenge_methods_supported) &&
        data.code_challenge_methods_supported.includes("S256"),
      "PKCE S256 required",
    )
    check(
      Array.isArray(data.response_types_supported) &&
        data.response_types_supported.includes("code"),
      "Authorization code required",
    )
    check(
      Array.isArray(data.token_endpoint_auth_methods_supported) &&
        data.token_endpoint_auth_methods_supported.includes("none"),
      "Public client method missing",
    )
  })
  await probe("protected-resource-discovery", async () => {
    const data = await jsonDocument(await request(config.resourceMetadataUrl))
    check(data.resource === config.resource, "Resource audience mismatch")
    check(
      Array.isArray(data.authorization_servers) &&
        data.authorization_servers.includes(config.issuer),
      "Trusted issuer missing",
    )
  })
  await probe("public-jwks", async () => {
    const data = await jsonDocument(await request(endpoint("jwks.json")))
    check(
      Array.isArray(data.keys) &&
        data.keys.length > 0 &&
        data.keys.length <= 16,
      "Bounded public JWKS required",
    )
    for (const key of data.keys) {
      check(
        key &&
          typeof key === "object" &&
          key.kty === "OKP" &&
          key.crv === "Ed25519" &&
          key.alg === "EdDSA" &&
          key.use === "sig" &&
          typeof key.kid === "string" &&
          key.kid.length > 0 &&
          typeof key.x === "string" &&
          /^[A-Za-z0-9_-]{43}$/u.test(key.x),
        "Expected public Ed25519 signing key",
      )
      check(
        !["d", "p", "q", "dp", "dq", "qi", "oth", "k"].some(
          (field) => field in key,
        ),
        "Private key material in JWKS",
      )
    }
  })
  await probe("mcp-unauthenticated-denial", async () => {
    const response = await request(config.resource)

    try {
      check(response.status === 401, "Unauthenticated MCP must return 401")
      const challenge = response.headers.get("www-authenticate") ?? ""
      check(
        /^Bearer\s/iu.test(challenge) &&
          challenge.includes(
            `resource_metadata="${config.resourceMetadataUrl}"`,
          ),
        "Bound discovery challenge required",
      )
      check(
        !/^text\/html/iu.test(response.headers.get("content-type") ?? ""),
        "MCP returned SPA HTML",
      )
    } finally {
      await response.body?.cancel().catch(() => undefined)
    }
  })

  return {
    publicPreflightOnly: true,
    authenticatedHostInstallation: "NOT_TESTED",
    ready: checks.every((item) => item.status === "PASS"),
    checks,
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [issuer, resource, resourceMetadataUrl] = process.argv.slice(2)

  if (!issuer || !resource || !resourceMetadataUrl) {
    console.error(
      "Usage: node endpoint-preflight.mjs <https-issuer> <https-mcp-resource> <https-resource-metadata>",
    )
    process.exitCode = 2
  } else {
    try {
      const receipt = await preflightEndpoints({
        issuer,
        resource,
        resourceMetadataUrl,
      })
      console.log(JSON.stringify(receipt, null, 2))
      process.exitCode = receipt.ready ? 0 : 1
    } catch {
      console.error("Invalid preflight configuration")
      process.exitCode = 2
    }
  }
}
