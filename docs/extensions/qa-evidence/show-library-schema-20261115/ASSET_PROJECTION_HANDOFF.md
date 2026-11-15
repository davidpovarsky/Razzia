# Port 3 / rule 2 — resource-free projection correction

Review candidate on `codex/tadazz-hq-show-library-20261115`, successor to
`29289933f9f71126d561507c9dd95a182737a2e8`. That commit, its 131-test/42-vector
proof, and the earlier e007/80-test proof remain unchanged. The review commit
SHA is supplied in the external handoff. Sole producer is independent chat
`01a1dd19-5220-70d3-8349-e9e135399b4d`; no subordinate agents were used.

## Changed behavior

The sole `projectShowBindings` now rejects any snapshot `question.image` or
`choice.asset` with `show-library:visual-assets-unavailable` before building
visual props or attempting resource resolution. This applies to both unbound
input and genuine validated-draft/bound-plan input, all roles and phases,
known declared assets, future-card assets, and even a matching current authored
choice declaration. The source-controlled compiled catalog still has zero
pins and no accepted authored-slot visual asset path. The output schema also
rejects resource refs, so parsing/branding cannot launder a forged reference.
Port 3/rule 2 and existing object shapes remain unchanged; this is a validation
bug fix, with no port 4, authored/native key migration or MCP wire change.

Strict denial is intentional. Input continues to use the producer's existing
asset-reference and actual authored validation. No competing resolver, schema,
asset library, manifest, director or resource owner was created. No metadata
flag, valid ID/digest, declaration membership, catalog kind, synthetic role,
or unavailable plan is treated as physical rights or server authorization.
No reference is accepted for rendering/fetching. A later media implementation
must derive the current authored question/choice/slot binding, verify the
accepted immutable compiled manifest and applicable asset policy/rights/kind/
budgets before resource resolution. Merely adding renderer pins must not lift
the gate. No fake accepted pin or successful resource-ready fixture was added.

Text-only projection, valid empty-media placeholders, role/phase/reveal
redaction, question identity/type/cardinality, clock/context checks, action
gating and all rule-2 vectors remain covered. Genuine plans and action
readiness remain unavailable. Actual media rendering, storage authorization,
physical rights, tenant authorization and original task acceptance remain
future integration work.

## Actual before/after evidence

`assets-before-review292899/` retains the independent actual-source script,
raw run log and source/release receipt. Its script SHA256 is
`cc5e4a7c11e04a3d963b84a833fa6d18d2eb3e74b57deabc31e0a095a46622f1`;
log SHA256 is `7a17a6ae0c2298d1913688bfa8c239ceb8a77e49971ce7daabe02e097bedbbef`.
The before log shows a genuine bound draft with `assets: []` projecting both
forged refs while `canAnswer` was false. These match the independent review;
the unchanged predecessor was not rerun solely to repeat its 131 tests.

New `projection-assets.test.ts` has 24 cases: unbound/genuine-bound empty-assets
witnesses at both slots, known undeclared/future-card refs, mismatched ID/hash,
real audio refs in image slots, caller rights/type/tenant/budget/private-URL
claims, all phases/roles, output-schema forgery, matching authored-choice
metadata without an accepted resource path, and the real empty placeholder.
The new file plus the four existing focused files ran against changed source.

Authoritative overlay
`755faf0f2e2719e20f9711231a0bf84da95b6b4a3a618e2a07827ffd78cf8aa9`:
**155/155 tests in five files PASS**, focused TypeScript PASS, scoped formatting
PASS, 42 independent Python vectors PASS, design/token/catalog PASS.
`assets-summary.json`, `assets-validated-source.json` and `server-assets-755f/`
record exact bytes and raw results. All 3297 baseline Git blobs plus 23 module
SHA256 hashes matched before/after and again after full ui:check.

Raw freeze and full `pnpm --dir extensions ui:check` remain **FAIL, exit 1**:
23 leased new module paths denied by the historical allowlist, protected
`mismatches: []`. No guard/baseline change, waiver or full CI pass is claimed.
Only two leased production files, one new focused test file and successor
evidence changed from 292899. No frozen editor/packages/root export/storage/
application/renderer/manifest/provider/customer-data changes, push, merge or
deployment. No Windows functional tests/install/build/browser/device run.

Server allocation: new private `sb3-assets-<overlaySHA>` namespace and container
`tadazz-hq-sb3-assets-20261115`, 0.25 CPU / 2 GiB, network none, offline frozen
cache, one test worker, no ports or production mounts. Margin before work:
10,939 MiB available RAM and 7,147 MiB disk. Container stopped and removed
2026-11-15T05:56:35.791944Z; source/cache/evidence retained.

Review provenance: the actual HQ review file SHA256 is
`99472348bab8a90998fe12f24e1fc37e5f0cf3eccbcb1ac2b2b7a0a31e76f03f`.
The manager message carried a 62-character abbreviation missing two characters;
its described finding and explicit bounded fix agree with the actual file.
Exact provenance and before-witness hashes are in `assets-correction-authority.json`.

Next: independent correction review and safe pure-API acceptance; historical
guard scope remains an integration gate. Source SB-05/06/07 and HQ milestone
remain OPEN. UI consumer creation and renderer bridge plan wait for acceptance.
