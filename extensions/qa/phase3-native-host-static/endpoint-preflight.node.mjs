import assert from "node:assert/strict"
import test from "node:test"
import { preflightEndpoints } from "./endpoint-preflight.mjs"

const config = {
  issuer: "https://synthetic.invalid/oauth",
  resource: "https://synthetic.invalid/mcp",
  resourceMetadataUrl:
    "https://synthetic.invalid/.well-known/oauth-protected-resource/mcp",
}
const authPath = "/.well-known/oauth-authorization-server/oauth"
const documents = () => ({
  [authPath]: {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/authorize`,
    token_endpoint: `${config.issuer}/token`,
    revocation_endpoint: `${config.issuer}/revoke`,
    jwks_uri: `${config.issuer}/jwks.json`,
    code_challenge_methods_supported: ["S256"],
    response_types_supported: ["code"],
    token_endpoint_auth_methods_supported: ["none"],
  },
  [new URL(config.resourceMetadataUrl).pathname]: {
    resource: config.resource,
    authorization_servers: [config.issuer],
  },
  "/oauth/jwks.json": {
    keys: [
      {
        kid: "synthetic",
        kty: "OKP",
        crv: "Ed25519",
        x: "a".repeat(43),
        alg: "EdDSA",
        use: "sig",
      },
    ],
  },
})
function fixture(source, override) {
  return (url, options) => {
    assert.equal(options.redirect, "error")
    assert.equal(options.credentials, "omit")
    assert.equal(options.headers.Authorization, undefined)
    const path = new URL(url).pathname
    const response = override?.(path)

    if (response) {
      return response
    }

    if (path === "/mcp") {
      return new Response(null, {
        status: 401,
        headers: {
          "www-authenticate": `Bearer resource_metadata="${config.resourceMetadataUrl}"`,
        },
      })
    }

    return Response.json(source[path])
  }
}

test("valid public metadata passes without claiming host installation", async () => {
  const receipt = await preflightEndpoints(config, fixture(documents()))
  assert.equal(receipt.ready, true)
  assert.equal(receipt.authenticatedHostInstallation, "NOT_TESTED")
  assert.equal(receipt.checks.length, 4)
  assert.ok(!JSON.stringify(receipt).includes('"x"'))
})

test("SPA HTML on every route fails every public gate", async () => {
  const receipt = await preflightEndpoints(
    config,
    fixture(
      {},
      () =>
        new Response("<html>Studio</html>", {
          headers: { "content-type": "text/html" },
        }),
    ),
  )
  assert.equal(receipt.ready, false)
  assert.equal(
    receipt.checks.filter((item) => item.status === "FAIL").length,
    4,
  )
})

for (const [label, mutate, failedGate] of [
  [
    "wrong issuer",
    (data) => {
      data[authPath].issuer = "https://foreign.invalid/oauth"
    },
    "authorization-discovery",
  ],
  [
    "foreign token endpoint",
    (data) => {
      data[authPath].token_endpoint = "https://foreign.invalid/token"
    },
    "authorization-discovery",
  ],
  [
    "PKCE plain only",
    (data) => {
      data[authPath].code_challenge_methods_supported = ["plain"]
    },
    "authorization-discovery",
  ],
  [
    "malformed PKCE type",
    (data) => {
      data[authPath].code_challenge_methods_supported = "S256"
    },
    "authorization-discovery",
  ],
  [
    "wrong audience",
    (data) => {
      data[new URL(config.resourceMetadataUrl).pathname].resource =
        "https://foreign.invalid/mcp"
    },
    "protected-resource-discovery",
  ],
  [
    "private signing key",
    (data) => {
      data["/oauth/jwks.json"].keys[0].d = "synthetic-private-material"
    },
    "public-jwks",
  ],
]) {
  test(`rejects ${label}`, async () => {
    const data = documents()
    mutate(data)
    const receipt = await preflightEndpoints(config, fixture(data))
    assert.equal(receipt.ready, false)
    assert.equal(
      receipt.checks.find((item) => item.name === failedGate).status,
      "FAIL",
    )
    assert.ok(!JSON.stringify(receipt).includes("synthetic-private-material"))
  })
}

test("oversized and redirected documents fail without following locations", async () => {
  for (const response of [
    () =>
      new Response(" ".repeat(65537), {
        headers: { "content-type": "application/json" },
      }),
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://foreign.invalid" },
      }),
  ]) {
    const receipt = await preflightEndpoints(
      config,
      fixture(documents(), (path) => (path === authPath ? response() : null)),
    )
    assert.equal(receipt.checks[0].status, "FAIL")
  }
})

test("invalid configuration cannot issue network requests", async () => {
  let calls = 0
  await assert.rejects(
    preflightEndpoints(
      { ...config, issuer: "http://synthetic.invalid" },
      () => {
        calls += 1
        throw new Error("unexpected network")
      },
    ),
  )
  assert.equal(calls, 0)
})
