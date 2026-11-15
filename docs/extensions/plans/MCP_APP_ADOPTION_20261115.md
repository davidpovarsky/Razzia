# Tadazz MCP research adoption and implementation boundary

15 November 2026. **ADOPTED DESIGN / NOT SHIPPED.** This addendum is the binding
interpretation of [MCP_APP_ADR.md](MCP_APP_ADR.md) and the preserved machine-readable
[M1 security snapshot](M1_SECURITY_ACCEPTANCE_20261115.json). The snapshot remains
byte-identical to the frozen HQ research, including historical candidate labels
and NOT_RUN runtime rows. This file records design adoption, not runtime acceptance.

## Authority and immutable provenance

Manager: `01a1dd10-2ef0-73c2-9c65-569a843f44da`.
Decision: HQ `docs/tadazz/decisions/SB_MCP_ADOPTION_20261115.md`.
Reviewer/source conversations are recorded in that decision. Original research
task: MCP-01 `1220539611687955`; original MCP parent stays open.

| Frozen HQ artifact                   | SHA-256                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| M1_CONTRACT_20261115.md              | 6a9ceb8d867422fa07386b70a55b55a2344bdd841be476feece29f86ceefc399 |
| M1_SECURITY_ACCEPTANCE_20261115.json | 811a2febcfb74d0025c1a0d1848d1a439dd72d5d96451158249fa832623a23ff |
| SB1_CONTRACT_20261115.md             | a7fca68e07168a08a2199403a4c4f06add59dfcc84614acc0216d18a9ff2ddf0 |
| SB1_REGISTRY_20261115.json           | b770575318e20b3263830447d8135e736df911d58dc4c318ff49cbcf390ffb63 |
| SB_MCP_PORT_REVIEW_20261115.md       | 1fdba75f575a174d8de6c8270920c08053b34d8b0987e8e9e10d1bc0390d87e8 |
| MCP_SB_DEPENDENCY_REVIEW_20261115.md | ee8454285cb271ededc8b0a19acc662ea7bb6c883c03220c099bcf0df7bc3535 |

These immutable documents remain in the HQ evidence tree. Canonical ADR delivery
changes presentation/relative links and adds this explicit precedence; it never
rewrites frozen HQ bytes. Contract versions and artifact hashes are distinct
from a subsequently compiled renderer/registry/build pin.

Current reviewed source reference is branch
`codex/tadazz-design-system-20261110` at
`8a43c99c65d8923bd23d8c57ac3607e9a09b5764`.
Read-only `git ls-remote --heads origin main codex/tadazz-design-system-20261110`
on 15 November independently returned that TDS SHA and main
`5161eb7022144ee26d46a5f94cdbc714ec8b560d`. No remote writes or ref updates.
M2 uses separate clean-created worktree `tadazz-hq-mcp-20261115` and the matching
codex branch from the approved TDS base; unvalidated new module code is isolated.

Manager independently inspected production with existing strict-host-key SSH.
Retained HQ receipt:
`preservation/fresh-manager-20261115-044120/production-image-readonly-20261115.json`.
Actual container image:
`sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346`;
OCI revision label:
`bff12a63ec3f69a58123c0299eea991901680b94`.
Loopback /api/health returned status ok. Worker read back that receipt.
No environment, credentials, account/customer data or production mutations were
used. This identifies the live image; health is not authenticated/event/UI proof.

## Manager resolutions (supersede candidate ambiguity)

1. **One SB export: projectShowBindings.** createShowProjection is descriptive/
   internal, not a second implementation/export. M2/M3 import producer-owned SB
   portVersion 1 types/schemas/fixtures; no copied game/projection/clock/audio engine.
2. **Explicit demo context.** No roomId/PIN/join URL/phone/live handles;
   join unavailable-demo, synthetic-only intents, preview-local identities never
   routable. Live context stays outside MCP.
3. **Author vs view role.** Complete authored data belongs to the authorized
   trusted controller; visual props remain current-phase/role-redacted.
   Selections/personal results are synthetic-player-only.
4. **Fixture outcomes.** Live never fabricates results/recap. Demo may use labelled
   deterministic trusted fixtures and the same reveal rules. Unsupported
   results/leaderboard/seek controls stay unavailable; no event-specific roster seeding.
5. **Executable pin.** Immutable CompiledPreviewManifest and exact supported
   renderer required for ready, with nonnull registry version. Source inventory
   or document hashes alone cannot establish readiness. No hidden wire fields.
6. **Identity/digest.** SB owns identity-rule 1 and normalization. M2 owns one
   canonical envelope serializer binding draft/revision/normalized authored
   content/identity map/compiled pin/sorted asset digests; M3 imports it.
   Object keys sorted, arrays/content preserved, finite UTF-8 JSON, negative zero
   normalized. Existing native timeline IDs require UUIDs; prefixed preview IDs
   remain preview-local, never silently cast into native storage. A source-schema
   counterexample test is included with M2 and awaits server execution.
7. **Fallback.** Exact supported plan → ready. Complete tested fallback →
   unsupportedTheme with requested→effective diagnostic. Missing port/pin →
   unavailable. No answer truncation or fake estimation choices.
8. **MVP scope.** Content edits with empty settings and trusted inherited defaults.
   Conversational theme/audio edits in the original host scenario are a future
   versioned scope; they are not smuggled through arbitrary properties.
9. **Assets.** Rights/kind/bytes/decoded-budget validation precedes the public
   manifest; stricter M1 limits apply. Preserve logos; no private URLs/customer code.
10. **Private integrations.** Real OAuth/active account/grants, save consent,
    durable CAS/idempotency/collision/recovery and download/rights delivery remain
    gates. No synthetic store/principal becomes a production fallback.
    Ordinary authorized read/export receives no new per-action consent.

## SDK provenance correction for implementation

### Internal preview port successor (same-day manager decision)

HQ decision `SB_PORT_V2_IDENTITY_20261115.md` supersedes the unshipped internal
portVersion 1 with **portVersion 2** before executable interface freeze. Identity
maps are bounded strict arrays of {authoredKey,previewId}, with exact byte-derived
IDs, unique correspondence and deterministic UTF8 byte-order sorting. Valid
prototype-sensitive authored key values remain data; never reconstruct ordinary
dynamic-key dictionaries. Reject old internal port1 payloads; no silent migration.
Identity-rule1, authored tada-show1, MCP0.1.0 and UI metadata1 remain unchanged;
the complete port2 compiled pin participates in the existing identity digest.
M2/M3 import accepted SB exports, without copied mapping/schema code. Existing
authored MAX_ANSWERS5 stays authoritative; invalid6/64 are rejected, never truncated.
Executable SB schema/fixture validation and real renderer acceptance remain gates.

### Patched MCP SDK pins

The frozen M1 source example used ext-apps 2.1.0 with MCP 2.0.0 peers. During
implementation signature verification, official advisories established that
MCP server 2.0.0–2.2.0 had shared-connection routing and input-validation
resource risks, patched in 2.3.0. Therefore the isolated M2 manifest selects
**server/client/core 2.4.0 and ext-apps 2.1.0**, compatible with the declared 2.x
peer range. No root/shared dependency or frozen research file changes.

Use a fresh SDK server per session/request, maxToolInputElements 100 and a
future transport body ceiling <=64 KiB. No HTTP mount exists in this foundation.
Package resolution/lock integrity/compile are server validation gates, not
assumed passes. Primary opened sources:

- [Official shared-transport advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-jm63-cq47-j5jp).
- [Official validation-resource advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453).
- [Pinned server 2.4.0 API](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/%40modelcontextprotocol%2Fserver%402.4.0/packages/server/src/server/mcp.ts).
- [Pinned client package](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/%40modelcontextprotocol%2Fserver%402.4.0/packages/client/package.json).
- [Pinned core package](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/%40modelcontextprotocol%2Fserver%402.4.0/packages/core/package.json).
- [Pinned Apps SDK helpers](https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/v2.1.0/src/server/index.ts).

## Exact MCP-01 research acceptance mapping

| Original research requirement                             | Delivered evidence / remaining uncertainty                                                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current official ChatGPT/Claude/MCP UI/auth/SDK contracts | ADR official references opened 15 November; host matrix labels documented/unknown/test-required; current SDK correction above                                                |
| One shared service/widget, no duplicate engine            | ADR diagram, eight strict tool contracts, resources, authoring/preview separation and adopted SB port ownership                                                              |
| Actual paths/APIs/validators/auth                         | ADR source table at approved SHA, existing account-session/requireManager and composite API review, generated-source-schema requirement; fail-closed global-fallback finding |
| Existing authoring skill/package/runtime/stage audit      | ADR observations and original source hashes, portable sandbox/installer-off rules, no editor migration or false skill-as-plugin claim                                        |
| Host surface compatibility/capabilities/install           | Matrix for ChatGPT web/iPad, Claude web/desktop, tools-only; actual account/device/capability tests explicitly unknown/unrun                                                 |
| Security/privacy/license/data prerequisites               | Strict scopes/account isolation, PKCE/redirect/revoke, asset rights, CSP, save consent, 39 runtime acceptance rows; no test PASS fabricated                                  |
| Current source/branch/live provenance                     | Current remote refs and manager's actual image/revision/health receipt above; health does not imply authenticated acceptance                                                 |
| Canonical ADR, diagram, API/path specs, risks/handoff     | This canonical three-document package plus frozen peer reviews and manager adoption                                                                                          |
| No production changes / no false Claude API UI assertion  | No production mutation; tool-only API is explicitly not an MCP UI proof; runtime/host tasks remain open                                                                      |

MCP-01 is research acceptance, not server/identity/preview implementation. After
canonical documents and their readback/links/hash evidence are committed,
MCP-01 alone can be marked complete with that SHA and manager-reviewed design.
MCP-02/03/04/05, host/security/device/persistence/release acceptance remain OPEN.
The complete original future product scope remains intact despite the bounded
MVP implementation slice. No research criterion is postponed merely because its
separate runtime acceptance has not run.
