import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import { tadaShowV1Schema } from "../../src/core/show-authoring-schema.ts"
import { canonicalJson } from "../../src/mcp-app/contracts/canonical.ts"
import { normalizeDraft } from "../../src/mcp-app/server/authoring.ts"
import {
  createProductionMcpCapabilities,
  createTextDraftExportPolicy,
} from "../../src/mcp-app/native-host/production-capabilities.ts"
import { show } from "../../src/mcp-app/tests/first-party/fixtures.ts"

const clients = new Set(["tadazz-private-chatgpt"])
const authoring = { allowedPublicAssetUrls: new Set<string>() }
const context = {
  accountId: randomUUID(),
  grantId: "issuer-owned-test-grant",
  clientId: "tadazz-private-chatgpt",
}
const normalized = normalizeDraft(JSON.stringify(show()), authoring)
const draft = { ...normalized, draftId: "private-test-draft", revision: 1 }

test("production catalog is the existing approved public example and real localized native metadata", async () => {
  const result = await createProductionMcpCapabilities({ clientIds: clients })
  const { template } = result.catalog
  assert.ok(template)
  assert.equal(template.templateId, "tadazz-approved-public-quiz")
  assert.equal(template.questionCount, 4)
  for (const language of [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "ja",
    "tr",
    "vi",
  ] as const) {
    const title = result.catalog.translate(
      "extensions:themes.classicName",
      language,
    )
    assert.ok(title.length > 0 && title !== "themes.classicName")
  }
  assert.equal(result.authoring.allowedPublicAssetUrls.size, 0)
})

test("exact canonical author-owned text draft may export both native JSON formats", () => {
  const policy = createTextDraftExportPolicy(authoring, clients)
  assert.equal(policy.canExport(context, draft, "tada-json"), true)
  assert.equal(policy.canExport(context, draft, "enhanced-bundle"), true)
})

test("export policy refuses unknown clients, account identities and altered summary", () => {
  const policy = createTextDraftExportPolicy(authoring, clients)
  assert.equal(
    policy.canExport({ ...context, clientId: "foreign" }, draft, "tada-json"),
    false,
  )
  assert.equal(
    policy.canExport({ ...context, accountId: "../other" }, draft, "tada-json"),
    false,
  )
  assert.equal(
    policy.canExport({ ...context, grantId: "" }, draft, "tada-json"),
    false,
  )
  assert.equal(
    policy.canExport(
      context,
      { ...draft, summary: { ...draft.summary, title: "Mismatch" } },
      "tada-json",
    ),
    false,
  )
})

test("export policy refuses arbitrary media, noncanonical wire and theme overrides", () => {
  const policy = createTextDraftExportPolicy(authoring, clients)
  const input = tadaShowV1Schema.parse(JSON.parse(draft.authoredShowJson))
  const media = {
    ...input,
    cards: [{ ...input.cards[0], image: "https://unapproved.example/a.png" }],
  }
  const override = {
    ...input,
    defaults: { showTheme: { id: "unknown", version: "1.0.0" } },
  }
  for (const authoredShowJson of [
    JSON.stringify(input, null, 2),
    canonicalJson(media),
    canonicalJson(override),
  ]) {
    assert.equal(
      policy.canExport(context, { ...draft, authoredShowJson }, "tada-json"),
      false,
    )
  }
})

test("export rights cannot drift when the caller changes its original media allowlist", () => {
  const mutableUrls = new Set<string>()
  const externalAuthoring = { allowedPublicAssetUrls: mutableUrls }
  const policy = createTextDraftExportPolicy(externalAuthoring, clients)
  const url = "https://unapproved.example/added-after-review.png"
  mutableUrls.add(url)
  assert.equal(policy.authoring.allowedPublicAssetUrls.has(url), false)
  assert.equal("add" in policy.authoring.allowedPublicAssetUrls, false)
  assert.equal(policy.canExport(context, draft, "tada-json"), true)
  const input = tadaShowV1Schema.parse(JSON.parse(draft.authoredShowJson))
  const [first] = input.cards
  assert.ok(first.kind === "quiz")
  first.answers[0] = {
    text: "A",
    display: "both",
    imageUrl: url,
    alt: "A",
  }
  const later = normalizeDraft(JSON.stringify(input), externalAuthoring)
  assert.equal(
    policy.canExport(context, { ...draft, ...later }, "tada-json"),
    false,
  )
})
