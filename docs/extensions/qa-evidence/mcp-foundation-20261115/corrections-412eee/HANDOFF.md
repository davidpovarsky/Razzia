# Corrected MCP foundation — 15 November 2026

Three independent review findings against frozen `412eee44255e159e6bdb1fb5d31f3fef0c1fdc6f`
are addressed for re-review. The commit containing this handoff is the correction
commit; it is not an integration/release acceptance. Original412eee source and all
its successful/failed receipts remain in Git unchanged. The independent report is
copied byte-for-byte under `independent-review`, SHA256
`b61f134a7bd59050646c5028b51d90d1023faf245fe14983bba86cde232cb1d8`.

## Corrections

1. Save/export now pass draft selection, expected revision and mutation identity
   directly to the authoritative injected replay-or-new adapter. There is no
   fresh-draft read in front of that adapter. Its documented atomic contract
   rechecks owner/principal/grant/tool/key/digest and resolves an authorized prior
   result first; a NEW operation still validates exact current revision, canonical
   content and save consent. Returned result IDs/revisions/format are checked
   against the request. No production cache/store or fake durable guarantee added.
2. Factory now exposes only guarded `connect/close`, with no bare server escape.
   The pinned SDK's public `Transport` interface intercepts decoded `tools/call`
   messages before protocol/tool schema work. A required trusted-context ingress
   limiter runs before token verification, including malformed/unauthenticated
   tool calls. Valid principals get one tool-budget charge, then bounded element/
   depth/byte checks and strict schema validation. Invalid names/arguments return
   safe MCP0.1 errors without reflected arbitrary keys, values or SDK issues.
   Valid calls continue through actual registered SDK schemas and dispatch.
   Authorization is request-local, bounded to32 in-flight calls, cleared on
   response/close; duplicate active IDs close the connection. No SDK method,
   node_modules file, private API or published schema was patched/weakened.
3. Read/create/replace adapter results are independently schema/canonical-content
   checked and their stored summaries compared with a recomputation. A mismatched
   summary fails closed; create/replace also check the expected returned content,
   identity and revision. Replays retain their original validated record.

Unconsumed injected API changes are intentional: authorizer receives public
`MessageExtraInfo` from the transport; `prevalidationLimit` is now required for
tool use; save/export receive `DraftSelection` instead of a prematurely fetched
record. The bare McpServer return changed to a guarded connection handle.
Real trusted adapters must bind request metadata; model arguments supply no auth.
Static schema/guide/empty UI resources remain public and contain no account data.
HTTP parsing/body/TLS/Origin, real OAuth, durable storage and host UI remain absent.

## Actual final validation

Final input manifest SHA256:
`ce3799535b27538f86cea7f5ad9040856bfcb9976f5311c3a214584fe189ca05`.
125 exact inputs, including28 isolated module files. All125 matched after final
tests and local formatted restore. `corrected-inputs.tar.gz` is a later export of
these same verified local inputs, SHA256
`7a699fafe65d43e1472867b3c673019b45b6cff999610802f0e5d4d4ee3afe6c`.
Original isolated lock remains
`dc7d7a9c51674163dd26326a9d7f6b58e5978a8eaeb24ed293aad72a5dc6befe`;
no root/shared dependency edit or new registry access.

Final server namespace `mcp-corrected-<manifest SHA above>`, owned container
`tadazz-hq-mcp-corrected-20261115`, UID1001,0.25CPU/2GiB, networkNONE,
read-only image, no ports/production mounts/credentials. The reviewer was stopped
before this allocation. Exact branch source supplies application imports.
Image tooling only; own prior public-registry store/cache; scripts disabled.

Actual commands and exits are in `final/final-validation.sh` and `final/*.exit`:
frozen offline install0, TypeScript noEmit0, real SDK linked-transport tests0,
scoped Prettier0. **27 passed,0 failed,0 skipped,0 cancelled**; original18 preserved.
Added witnesses cover save/export success→edit→retry and deletion replay, changed
payload/key, another account/grant, revoked principal, genuinely new stale request,
save consent versus ordinary export, malformed/unknown-tool/oversized/array/element
inputs, auth/ingress/tool counters without double charge, rejection after schema
discovery, missing/denied ingress budget, and corrupt summaries on read/create/replace.
Synthetic replay/consent fixtures do not prove real persistence or authorization.

Preparation failures are retained. The first run exposed two ID-narrowing compiler
errors and an intercepted-error codec mismatch: projecting the full success union
on a direct transport response caused a legacy `{result:...}` wrap. The corrected
public codec call projects the already validated object failure branch without a
non-object success-schema wrapper; real SDK witnesses pass both before and after
tool discovery. No SDK internals were altered. Public API/package file hashes and
exact installed declaration/runtime excerpts are in
`preparation/sdk-public-api-provenance.json`.

## Preservation and remaining gates

Static preservation audit:602 protected files,593 unchanged hashes,9 preexisting
approved seams,0 unexpected protected mismatches,0 unleased edits,root lock unchanged.
The unmodified historical TDS guard remains **FAIL exit1**, rejecting28 newly leased
module paths with `mismatches=[]`. No waiver/guard change. Raw whitespace warnings
in retained logs/scripts are evidence; scoped source whitespace passes. Full
ui:check/build/lint/CI/HTTP/Inspector/OAuth/real-host/device checks were not run.

Owned preparation and final containers are stopped. Final readback
`Running=false,OOMKilled=false`; exit137 is explicit idle-container termination
after checks, not test/OOM failure. The0.25CPU/2GiB allocation is released; remote
source/fixtures/evidence remain preserved. No other allocation was changed.

Latest SB boundary is HQ `SB_IDENTITY_RULE2_PORT3_20261115.md`: pending port3 /
identityRule2 supersedes historical port2/rule1. Existing research/old README rule1
wording records the earlier design; it does not authorize a consumer. No accepted
producer is imported or hardcoded, no SB mapping/schema/engine copied, and no global
key normalization or persisted migration performed. MCP0.1/UI metadata1/native UUID
contracts remain unchanged. A corrected SB producer needs separate interface review.

The bounded `../REAL_ADAPTER_PLAN.md` records exact current auth/account/storage
seams, read migrations/non-exclusive publication/recovery gaps, first-party confirmation,
authoritative operation persistence, minimal possible future protected hooks and
acceptance negatives. It grants no source/release permission or task completion.

Documentation precision: `normalizeFilename` appends a fresh random8 suffix;
native ID and basename are independent. No same-title collision, overwrite or
customer failure was proved. The remaining source observations are lack of an
exclusive-create flag/pre-write durable intent and absent tenant startup traversal.
See `DOCUMENTATION_PRECISION_20261115.md`; no reviewed module/test receipt changed.

Next: independent exact correction-commit review, then manager disposition.
MCP02/03/04/05 and HQ remain OPEN. MCP01 research remains DONE. No push, merge,
deployment, provider/billing or customer-data action.
