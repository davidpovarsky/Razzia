# Full-show implementation ledger

Before editing,17 November2026: the accepted V1 projector deliberately refuses
visual assets; V2 is current-question-only, candidate-only and refuses media.
The first-party ApplicationPreviewStage consumes a full authored show and is
not a portable redacted MCP DTO. Do not feed that raw show into the iframe or
weaken V1/V2. The full-show path requires its own versioned current-frame
projection, exact built renderer, real asset delivery and strict SDK consumer.

Initial code scope: server/full-show-assets.ts plus focused QA under
qa/phase3-full-show. Reuse the actual native asset library's exact ID/hash,
family, size and provenance. Read only declared bundled files beneath an
explicit public root after live-principal and rights checks; reject links,
changed bytes, unknown assets, quotas and expired/revoked capabilities. The
capability stays process-local and is not an OAuth token or a renderer pin.
Do not enable arbitrary/customer Lottie or JavaScript through this reader.
Rights metadata alone is insufficient; trusted live and license callbacks are
mandatory and checked again after IO and during streaming. No default rights
grant, new route, production mount, upstream source edit or Widget acceptance.

This groundwork does not finish full-show. Subsequent scope must retain the
existing authoring schemas/identity rule and native Stage/ScenePresenter views,
project only the selected chapter, withhold pre-reveal answers and all future
card/private fields, prove media/CSP and lifecycle in browsers, and register
an explicitly versioned tool/resource without loosening the old contracts.

Initial local result:15/15 Windows unit checks PASS, with real catalog WebP
bytes from both bundled families; focused types/lint/format PASS. These unit
tests deliberately control issuer/rights callbacks; they are not a production
authorization or renderer proof. They cover no pre-authorization filesystem
access, unknown assets/family/hash, metadata lookalikes, foreign account/grant,
hardlinks/symbolic roots, same-size tampering, immutable byte snapshots, live
revocation after IO and midstream, expiry/close, backpressure, per-account quota,
owner-only release and retained canceled authorization work. Actual issuer and
HTTP delivery binding remain to be implemented and tested together.

Limits are explicit:64 total leases/256 MiB,16 leases/128 MiB per account,
four streams,16 pending authorization checks,60-second leases. Repeated exact
admission reuses the same private capability after fresh checks. Expiry/close
errors active streams and removes the canonical buffer from retained leases;
pending authorization work keeps its slot until its actual promise settles.
No execution/export grant, resource URL, raw path or principal enters the DTO.

The Linux runner adds a focused asset suite. Its admission requires actual
archive bytes plus128 MiB reserve; the prior512 MiB threshold stays for the
larger recovery/browser packets. This scoped suite performs no Site build or
image installation. Linux qualification still requires the next exact commit.

77d211873e1329f783459334ad758d1678c976af now passes the same15 checks on real
isolated Linux/ext4, plus focused types/lint/format, with all1678 source hashes
unchanged. This remains bundled-reader unit evidence with controlled authority
callbacks, not actual asset delivery or a full-show renderer acceptance.

Before next edit: add contracts/full-show-selection.ts and server/full-show-
selection.ts with focused QA. Use the actual native timeline compiler, existing
authoring validator/converter and the existing D identity rule. Read via the
real issuer-owned DraftRepository and checkedDraft path; recheck revision and
canonical content after async work. Public inventory must contain only generic
chapter kinds/order/durations and hashed card identities, never future question
text, authored private keys, notes or solutions. Host-only selected source stays
behind a process-local capability. It grants no renderer/media/write authority
and cannot be reconstructed by JSON or a cloned principal. V1/V2 stay unchanged.

Pre-edit discovery: real issuer repository revalidation rejects valid opening/
closing cards because Zod materializes their omitted optional volume default;
the second normalizeDraft sees the generated forbidden field. Fix only
server/authoring.ts canonical serialization to omit parser-generated forbidden
fields absent from the already policy-checked input, preserving explicit field
denials and trusted defaults. Validate round-trip, actual issuer selection,
and existing authoring/security regressions. No contract or permission expansion.

Selection local qualification:11/11 PASS with actual account/session SQLite,
PKCE consent protocol and issuer-owned repository. Controlled QA account rows and
consent POSTs are not a user click or ChatGPT installation. All28 chapters of a
five-question/opening/transition/closing show select the actual converter's
current question/scene. Inventory withholds future content, notes and authored
keys; clones, foreign accounts/grants, missing scope, stale revision, abort and
real session revocation are denied. assertCurrent returns void, never the private
source. getHostSource remains host-only and unregistered/unrenderable until a
strict frame projector, native renderer, pin and media delivery are qualified.
Types/lint/format pass locally. Earlier QA setup used service-only nativeSave
options against the raw issuer and failed; corrected fixture supplies no save
adapter. Real repository tests then exposed the canonical bookend defect above.
Windows focused regression was26/28 before fixing the trusted-default fixture:
one new fixture comparison error now fixed; the unchanged OAuth Unix mode check
expected0600 but Windows reported0666. Actual Linux gate remains required.

65bf41f7c47bfa58bbf5c313e0f6b3e72c51224e Linux/ext4 qualification now PASS:
11/11 selection +15/15 asset reader +24/24 original authoring/OAuth/preview
regressions, focused types/lint/format. All1681 archived source hashes unchanged.
The unchanged0600 OAuth test passes on Linux. No skipped tests. Receipt:
tadazz-codex-65bf41f7c47b-f2258c12/receipt.json. No full-show rendering or live
host connection is claimed. Original Asana parent/MCP02..11 checkpoint appended
with11/11 exact readbacks, all OPEN (ASANA_FULL_SHOW_SELECTION_READBACK.json).

Pre-edit next scope: server/preview-resource.ts accepts optional standard MCP
Apps baseUriDomains with the existing exact HTTPS-origin validation, preserving
the old three-field default CSP. Fix wildcard host admission in the shared origin
validator; no wildcard, credentials, path, query or fragment. A reviewed static
full-show artifact may later declare a fixed public base for original relative
native asset URLs, without changing source renderers/providers or injecting
customer HTML/JS. CSP metadata alone grants no asset/renderer acceptance. Prove
optional metadata retention, legacy shape, unsafe origins, immutable descriptor
checks and official SDK resource delivery with focused QA before wiring a build.

CSP local proof:3/3 resource checks +12/12 actual issuer selection/SDK checks
PASS, focused types/lint/format PASS. Official MCP client reads exact static
HTML and baseUriDomains from content._meta.ui.csp over the actual OAuth-backed
remote service; no browser full-show/production install proof. Legacy resources
retain their original three-field CSP. Wildcards now fail all four lists and a
runtime callback returning a truthy non-boolean is denied (literal true required).
No inline script permission, wasm-unsafe-eval, blob origin or customer JS added.
