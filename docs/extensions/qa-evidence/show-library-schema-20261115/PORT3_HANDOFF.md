# SB pure foundation correction — port 3 / identity rule 2

Producer `show_engine`, independent top-level chat `01a1dd19-5220-70d3-8349-e9e135399b4d`.
Worktree `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115`,
branch `codex/tadazz-hq-show-library-20261115`. Predecessor commit
`e007daab58f748e2361b9717a9a129db29bb8c9d` and its 80-test evidence remain intact.
This successor implements manager decision `SB_IDENTITY_RULE2_PORT3_20261115.md`
(SHA256 `79a8282b9b5554eff69148e83660cc8674bd8303342834aa5fec4c96cee1480e`),
addressing independent review `SB2_FOUNDATION_REVIEW_e007_20261115.md`.
The review commit SHA is supplied in the external manager/Asana handoff.

## Corrected contract

The sole producer barrel remains `extensions/src/core/show-library/preview-port.ts`.
`SHOW_PREVIEW_PORT_VERSION = 3` and `SHOW_PREVIEW_IDENTITY_RULE_VERSION = 2`
are exported. Draft, plan, compiled pin, manifest, presentation snapshot,
projection, fixture and digest contracts consistently carry these versions.
Identity maps additionally require rule 2. Older ports 1/2 and rule 1 are
rejected explicitly, including mixed-version objects. Authored format 1,
MCP 0.1.0, UI metadata 1, saved keys and native UUID validators are unchanged.
The four frozen SB1/M1 research artifacts were not rewritten; their hashes
and the explicit successor decision are recorded in `port3-authority.json`.

Each authored JS string key is encoded by `charCodeAt(i)` as exactly four
lowercase ASCII hex digits per UTF-16 code unit. No code-point iteration,
raw-key TextEncoder, normalization, case folding or locale ordering is used.
Arrays order lexically by that ASCII encoding, including prefix order.
The SHA256 preimage is ASCII `kind + NUL + utf16-hex-v2 + NUL + hexKey`.
Card/question/scene ID prefixes remain `preview-card-`, `preview-question-`,
`preview-scene-`. This preserves distinct source-valid lone surrogates before
hashing and uses the normal SHA256 collision-resistance assumption; it does
not claim a mathematically injective hash. Fixed vectors include D800/D801,
DC00/DC01, FFFD, the paired units D83D DE00, ASCII case/prefixes, composed and
decomposed accents, and constructor/prototype/__proto__ as key values.
Forty-two independently fixed byte/digest vectors are checked with Node crypto,
the actual normalizer/identity map, and server Python utf-16-be/surrogatepass
plus hashlib. A source-valid show containing both D800 and D801 normalizes.
Structural prototype keys and forged identities remain rejected.

The actual authored media validator defaults missing `mediaUrl` to `""`.
Normalization now preserves that exact absence value without an asset,
fetch, rights grant or ready state. Whitespace and nonempty undeclared/private/
unsafe URLs remain denied. The regression uses the real authored validator.

`projectShowBindings(snapshot, context, binding?)` remains the sole projector.
Without binding evidence it returns `canAnswer: false` with `missing-binding`.
Optional `PreviewProjectionBinding` contains the genuine WeakSet-validated
`draft`, its genuine WeakMap-bound `plan`, `currentQuestionId`, `phase` and
`clock`; it is trusted controller content and must never reach visual props.
Cloned, forged or foreign plans/drafts are rejected. Context, current question
identity/text/type/playMode, ordered choice identity/labels/cardinality, phase
and exact clock snapshot must match. Choice IDs are the current preview
question ID plus `.choice.` and the one-based authored answer index.
Player/voting/requested/unpaused/unexpired state, per-question support,
localSelection, supportedRoles and a pin in the source-controlled compiled
catalog are additionally required for readiness. Role here is a demo selector,
not authentication; the controller owns authoritative clock progression.
Numeric estimation has explicit validated public input bounds and zero choice
cards, checked against the actual draft options and null capability count.
It does not become a choice question or bypass the authored placeholder rules.

There are still **zero compiled pins**. Every genuine plan and its action
readiness remain unavailable; no fake ready fixture or renderer was added.
The original no-question/player/voting witness now returns false. Reasoned
negative tests cover forged/foreign plans, current identity/type/count/choice,
context, phase, clock, pause and expiration. Existing phase/role redaction,
no-room/demo-only behavior and eight-locale diagnostic checks remain covered.

## Actual verification and scope

Authoritative corrected overlay:
`6ccf88854cd972e3cf575064fa4361a8edcc38ff87ebeffeafd3f4cd2fb7093d`.
`port3-summary.json` and `port3-validated-source.json` identify the exact bytes;
raw final receipts are in `server-port3-final-6ccf/`. The preliminary corrected
run remains in `server-port3-initial-e3b5/` (130 tests); final has 131 tests plus
stronger normalizer golden-vector and all-boundary version checks.

Final server: **131/131 tests in four focused files PASS**, focused TypeScript
PASS, scoped formatting PASS, 42 Python vectors PASS, design/token/catalog PASS.
The unchanged frozen lockfile and offline cache ran on arm64 Node24.22.2,
pnpm12.18.0, TypeScript7.0.2 and Vitest5.0.3. No Windows functional tests,
install, app build, browser, device, provider or live-room check was run.

**Raw freeze and full `pnpm --dir extensions ui:check` both FAIL (exit 1).**
Only the 22 newly leased module paths are denied by the old incremental
allowlist; protected `mismatches: []`. Guard and baseline were not changed,
waived or represented as passing. Manager scope resolution remains an
integration gate. Source audit independently matched all 3297 baseline Git
blobs plus all 22 overlay SHA256 values before/after validation and again
after full ui:check. Raw logs and their receipt hashes are preserved exactly.

Validation used only the new private `sb3-rule2-<SHA>` source/fixtures/evidence
namespaces and `tadazz-hq-sb3-validation-20261115`, capped at 0.25 CPU / 2 GiB,
network none, no published ports. The container was stopped and removed at
2026-11-15T05:28:39.151872Z; immutable source/cache/evidence are retained.
All source edits are confined to the leased new show-library module, with
successor evidence in its leased directory. No editor, packages/**, root
exports, application route, renderer/director/audio owner, persistent storage,
provider, credentials, customer data, push, merge or deployment was changed.

Independent correction review and pure-API acceptance are pending. Original
SB-05/06/07 and HQ milestones remain OPEN. The renderer bridge plan remains
lower priority until the corrected foundation is accepted; no renderer or full
original-task acceptance is asserted by these focused results.
