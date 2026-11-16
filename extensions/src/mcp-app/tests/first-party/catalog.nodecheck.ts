import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import fs from "node:fs"
import path from "node:path"
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto"
import i18next from "i18next"
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import en from "../../../locales/en/extensions.json"
import fr from "../../../locales/fr/extensions.json"
import de from "../../../locales/de/extensions.json"
import es from "../../../locales/es/extensions.json"
import it from "../../../locales/it/extensions.json"
import ja from "../../../locales/ja/extensions.json"
import tr from "../../../locales/tr/extensions.json"
import vi from "../../../locales/vi/extensions.json"
import { getNativeShowLibrary } from "../../../core/show-library/native-library"
import { showThemeText } from "../../../core/show-themes/definition"
import { createFirstPartyOAuth } from "../../first-party/oauth.ts"
import { fixture, origin, key, snapshot, type Session } from "./fixtures.ts"
import type { FirstPartyCatalogOptions } from "../../first-party/oauth-catalog.ts"

let f: Awaited<ReturnType<typeof fixture>>,
  issuer: Awaited<ReturnType<typeof createFirstPartyOAuth>>,
  remote: ReturnType<typeof issuer.remote>
const translator = i18next.createInstance()
const resources = { en, fr, de, es, it, ja, tr, vi }
let language: ReturnType<FirstPartyCatalogOptions["locale"]> = "en"
let translationEffect: (() => void) | undefined
const config = {
  issuer: `${origin}/oauth`,
  resource: `${origin}/mcp`,
  resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
  firstPartyOrigins: [origin],
}
const clientId = "synthetic-real-native-catalog",
  callback = "https://host.example.invalid/catalog/callback"
const refreshTokens = new Map<string, string>()
let options: Parameters<typeof createFirstPartyOAuth>[0]
let catalog: ReturnType<typeof issuer.catalog>
const receipts: unknown[] = []
before(async () => {
  f = await fixture()
  await translator.init({
    resources: Object.fromEntries(
      Object.entries(resources).map(([lang, extensions]) => [
        lang,
        { extensions },
      ]),
    ),
    lng: "en",
    fallbackLng: "en",
    defaultNS: "extensions",
    initAsync: false,
    interpolation: { escapeValue: false },
  })
  const pair = generateKeyPairSync("ed25519")
  options = {
    config,
    configRoot: f.root,
    keyId: "synthetic-catalog-key",
    signingPrivateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    ticketEncryptionKey: randomBytes(32),
    consentPageUrl: `${origin}/studio/oauth-consent`,
    clients: [
      {
        clientId,
        redirectUris: [callback],
        scopes: ["tadazz.catalog.read", "tadazz.drafts.read"],
      },
    ],
  }
  issuer = await createFirstPartyOAuth(options)
  catalog = issuer.catalog({
    locale: () => language,
    translate: (name, lang) => {
      translationEffect?.()

      return String(translator.t(name, { lng: lang }))
    },
  })
  remote = issuer.remote({
    allowedOrigins: [],
    dependencies: { catalog, rateLimit: async () => true },
  })
})
after(async () => {
  await remote?.close()
  f?.db.close()

  if (f) {
    console.log(
      JSON.stringify({
        retainedSyntheticRoot: f.root,
        newCatalogReceipts: receipts.length,
      }),
    )
  }
  if (process.env.TADAZZ_CATALOG_QA_OUTPUT) {
    fs.writeFileSync(
      process.env.TADAZZ_CATALOG_QA_OUTPUT,
      JSON.stringify(
        {
          runtime: process.version,
          platform: process.platform,
          fixtureRoot: f.root,
          receipts,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    )
  }
})
async function api(
  route: string,
  body?: Record<string, string>,
  session?: Session,
) {
  const json = route === "/oauth/inspect" || route === "/oauth/approve"

  return issuer.fetch(
    new Request(origin + route, {
      method: body ? "POST" : "GET",
      headers: {
        host: new URL(origin).host,
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
        ...(body
          ? {
              "content-type": json
                ? "application/json"
                : "application/x-www-form-urlencoded",
            }
          : {}),
        ...(json ? { origin } : {}),
      },
      ...(body
        ? { body: json ? JSON.stringify(body) : new URLSearchParams(body) }
        : {}),
    }),
  )
}
async function linked(
  session = f.sessions[0],
  scopes = ["tadazz.catalog.read"],
) {
  const verifier = randomBytes(32).toString("base64url"),
    started = await api(
      `/oauth/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: callback,
        resource: config.resource,
        scope: scopes.join(" "),
        state: key(),
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      })}`,
    )
  assert.equal(started.status, 302)
  const ticket = new URL(started.headers.get("location")!).searchParams.get(
    "oauth_request",
  )!
  const inspection = await (
    await api("/oauth/inspect", { ticket }, session)
  ).json()
  const approval = await (
    await api(
      "/oauth/approve",
      { ticket, decision: "allow", proof: inspection.proof },
      session,
    )
  ).json()
  const response = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callback,
    resource: config.resource,
    code: new URL(approval.redirectUrl).searchParams.get("code")!,
    code_verifier: verifier,
  })
  assert.equal(response.status, 200)
  const tokens = await response.json()
  refreshTokens.set(tokens.access_token, tokens.refresh_token)

  return tokens.access_token as string
}
async function connect(token: string) {
  const client = new Client({
    name: "actual-native-catalog-client",
    version: "1",
  })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(config.resource), {
      authProvider: { token: async () => token },
      fetch: async (input, init) => {
        const request = new Request(input, init)
        request.headers.set("host", new URL(config.resource).host)

        return remote.fetch(request)
      },
    }),
  )

  return client
}
async function call(
  client: Client,
  page: Record<string, unknown> = {},
  tool = "list_themes",
) {
  return client.callTool({
    name: tool,
    arguments: { contractVersion: "0.1.0", ...page },
  })
}
function body(result: Awaited<ReturnType<typeof call>>) {
  return result.structuredContent as {
    ok: boolean
    data: {
      items: Array<{
        themeId: string
        version: string
        title: string
        previewAvailable: boolean
        exportPermitted: boolean
      }>
      nextCursor?: string
    }
    error: { code: string }
  }
}

test("real issuer/SDK catalog returns only exact D metadata and signed two-page continuation without private writes", async () => {
  language = "en"
  const c = await connect(await linked())

  try {
    const before = snapshot(f.root),
      first = body(await call(c, { limit: 1 }))
    assert.equal(first.ok, true)
    assert.equal(first.data.items.length, 1)
    assert.ok(first.data.nextCursor)
    assert.ok(first.data.nextCursor.length <= 128)
    const second = body(
      await call(c, { limit: 1, cursor: first.data.nextCursor }),
    )
    assert.equal(second.ok, true)
    assert.equal(second.data.nextCursor, undefined)
    const all = [...first.data.items, ...second.data.items],
      source = getNativeShowLibrary().families
    assert.deepEqual(
      all.map((i) => [i.themeId, i.version]),
      source.map((i) => [i.ref.id, i.ref.version]),
    )
    for (const item of all) {
      assert.equal(item.previewAvailable, false)
      assert.equal(item.exportPermitted, false)
      assert.deepEqual(
        Object.keys(item).sort(),
        [
          "themeId",
          "version",
          "title",
          "previewAvailable",
          "exportPermitted",
        ].sort(),
      )
    }
    assert.equal(JSON.stringify(all).includes("data:image"), false)
    assert.equal(JSON.stringify(all).includes("https://"), false)
    assert.deepEqual(snapshot(f.root), before)
    receipts.push({
      case: "real metadata/read-only pages",
      items: all,
      cursorLength: first.data.nextCursor.length,
      privateSnapshotUnchanged: true,
    })
  } finally {
    await c.close()
  }
})
test("all eight existing i18next/D locales resolve real family names; locale change invalidates prior cursor", async () => {
  const c = await connect(await linked())

  try {
    language = "en"
    const initial = body(await call(c, { limit: 1 }))
    for (const lang of Object.keys(resources) as Array<typeof language>) {
      language = lang
      const result = body(await call(c))
      assert.equal(result.ok, true)
      assert.deepEqual(
        result.data.items.map((i) => i.title),
        getNativeShowLibrary().families.map((family) =>
          showThemeText(
            family.definition,
            family.definition.nameKey,
            lang,
            (name) => String(translator.t(name, { lng: lang })),
          ),
        ),
      )
      receipts.push({
        case: "actual locale",
        locale: lang,
        titles: result.data.items.map((i) => i.title),
      })
    }
    language = "ja"
    assert.equal(
      body(await call(c, { cursor: initial.data.nextCursor })).error.code,
      "VALIDATION_FAILED",
    )
  } finally {
    language = "en"
    await c.close()
  }
})
test("cursor proof cannot be altered or transplanted to another real grant or account", async () => {
  const a = await connect(await linked()),
    sameOwner = await connect(await linked()),
    other = await connect(await linked(f.sessions[1]))

  try {
    const first = body(await call(a, { limit: 1 })),
      cursor = first.data.nextCursor!
    for (const c of [sameOwner, other]) {
      assert.equal(
        body(await call(c, { cursor })).error.code,
        "VALIDATION_FAILED",
      )
    }
    const changed =
      cursor.slice(0, -2) + (cursor.at(-2) === "a" ? "b" : "a") + cursor.at(-1)
    assert.equal(
      body(await call(a, { cursor: changed })).error.code,
      "VALIDATION_FAILED",
    )
    assert.equal(
      body(await call(a, { cursor: "1" })).error.code,
      "VALIDATION_FAILED",
    )
    assert.equal(
      body(await call(a, { cursor: cursor.replace("nc1.1.", "nc1.9.") })).error
        .code,
      "VALIDATION_FAILED",
    )
    receipts.push({
      case: "grant/account/proof/offset cursor denials",
      allDenied: true,
    })
  } finally {
    await a.close()
    await sameOwner.close()
    await other.close()
  }
})
test("forged principal and missing catalog scope cannot call the actual catalog port", async () => {
  const token = await linked(),
    p = await issuer.verifyAccessToken(token)
  await assert.rejects(
    catalog.listThemes({ ...p }, { limit: 1 }),
    /SCOPE_REQUIRED/,
  )
  const noScope = await issuer.verifyAccessToken(
    await linked(f.sessions[0], ["tadazz.drafts.read"]),
  )
  await assert.rejects(catalog.listThemes(noScope, {}), /SCOPE_REQUIRED/)
  const c = await connect(await linked(f.sessions[0], ["tadazz.drafts.read"]))

  try {
    assert.equal(body(await call(c)).error.code, "SCOPE_REQUIRED")
  } finally {
    await c.close()
  }
})
test("actual revoked grant denies cached principal and its cursor; stable issuer keys permit genuine cursor reuse on reopen", async () => {
  const token = await linked(),
    p = await issuer.verifyAccessToken(token),
    first = (await catalog.listThemes(p, { limit: 1 })) as {
      nextCursor: string
    }
  const reopened = await createFirstPartyOAuth(options),
    again = reopened.catalog({
      locale: () => "en",
      translate: (name, lang) => String(translator.t(name, { lng: lang })),
    }),
    fresh = await reopened.verifyAccessToken(token)
  assert.equal(
    (
      (await again.listThemes(fresh, { cursor: first.nextCursor })) as {
        items: unknown[]
      }
    ).items.length,
    1,
  )
  assert.equal(
    (
      await api("/oauth/revoke", {
        client_id: clientId,
        token: refreshTokens.get(token)!,
      })
    ).status,
    200,
  )
  await assert.rejects(
    catalog.listThemes(p, { cursor: first.nextCursor }),
    /SCOPE_REQUIRED/,
  )
  await assert.rejects(reopened.verifyAccessToken(token))
  receipts.push({
    case: "genuine stable-key reopen/cached revoked authority denied",
    pass: true,
  })
})
test("native session revoked by the host translator is rechecked before metadata disclosure", async () => {
  const minted = await f.tokens.mintToken(f.sessions[0].owner, "manager"),
    claims = await f.tokens.verifyToken(minted.token),
    token = await linked({
      token: minted.token,
      owner: f.sessions[0].owner,
      sid: claims.sid!,
    }),
    c = await connect(token)

  try {
    translationEffect = () => f.accounts.revokeAccountSession(claims.sid!)
    const result = body(await call(c))
    assert.equal(result.ok, false)
    assert.equal(result.error.code, "SCOPE_REQUIRED")
  } finally {
    translationEffect = undefined
    await c.close()
  }
})
test("templates stay honestly unavailable and malformed host translations disclose no private exception", async () => {
  const c = await connect(await linked())

  try {
    const before = snapshot(f.root)
    assert.equal(
      body(await call(c, {}, "list_game_templates")).error.code,
      "DEPENDENCY_UNAVAILABLE",
    )
    translationEffect = () => {
      throw new Error("PRIVATE_TRANSLATION_DETAIL")
    }
    const result = await call(c)
    assert.equal(body(result).error.code, "DEPENDENCY_UNAVAILABLE")
    assert.equal(
      JSON.stringify(result).includes("PRIVATE_TRANSLATION_DETAIL"),
      false,
    )
    assert.deepEqual(snapshot(f.root), before)
    receipts.push({
      case: "no invented templates/private callback sanitized",
      privateSnapshotUnchanged: true,
    })
  } finally {
    translationEffect = undefined
    await c.close()
  }
})

test("an actual unconfigured i18next translator cannot expose a stripped translation key as a theme title", async () => {
  const empty = i18next.createInstance()
  await empty.init({
    lng: "en",
    defaultNS: "extensions",
    resources: {},
    initAsync: false,
  })
  assert.equal(
    String(empty.t("extensions:themes.classicName")),
    "themes.classicName",
  )
  const missing = issuer.catalog({
    locale: () => "en",
    translate: (name) => String(empty.t(name)),
  })
  const p = await issuer.verifyAccessToken(await linked())
  const before = snapshot(f.root)
  await assert.rejects(missing.listThemes(p, {}), /DEPENDENCY_UNAVAILABLE/)
  assert.deepEqual(snapshot(f.root), before)
  receipts.push({
    case: "real i18next missing title is unavailable",
    privateSnapshotUnchanged: true,
  })
})
