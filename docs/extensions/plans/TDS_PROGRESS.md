# Tadazz design system — sequential checkpoint

Canonical mandate: [full specification](TADAZZ_DESIGN_SYSTEM_UI_UNIFICATION_AGENT_PROMPT_2026-11-10.md).
Asana parent: `1220402777392717` (OPEN). Account verified: requested owner account.
Single primary coding session. No subagents, push, merge, deployment or production writes.

Worktree: `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110`.
Branch: `codex/tadazz-design-system-20261110`.
BASE_HEAD: `fb6c7631999f33c8fb47638a99920e450f326fbf`.

| Phase  | Task             | Status      | Evidence / next action                                                                                          |
| ------ | ---------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| TDS-00 | 1220402430946120 | VERIFIED    | [Baseline](TDS_BASELINE.md); 1 browser scenario passed, 20 captures, 602 hashes                                 |
| TDS-01 | 1220402455305251 | VERIFIED    | [Policy](TDS_POLICY.md); 55 existing compatibility tests passed                                                 |
| TDS-02 | 1220402647256448 | VERIFIED    | [327-file inventory and architecture](TDS_ARCHITECTURE.md), [proposed seams](TDS_UPSTREAM_SEAMS.md)             |
| TDS-03 | 1220402777623967 | VERIFIED    | [Tokens/scopes](TDS_TOKENS.md); 6 units, 6 browser checks, 4 editor visual comparisons passed                   |
| TDS-04 | 1220402719463680 | VERIFIED    | [Canonical components](TDS_COMPONENTS.md); 14 units, 18 interactions + 6 token checks, full API/editor scenario |
| TDS-05 | 1220402777822480 | VERIFIED    | [Internal catalog](TDS_CATALOG.md); 14 catalog + 18 component + 6 token cases, original editor PNG parity       |
| TDS-06 | 1220402777861386 | VERIFIED    | [Site/Studio](TDS_SITE.md); 82 units, 12 site + 22 component + 4 follow-up checks, editor regression            |
| TDS-07 | 1220402729693747 | VERIFIED    | [Viewport / room join](TDS_STAGE.md); 62 units, 16 catalog + 10 stage + 3 actual room + 1 seating checks, editor regression |
| TDS-08 | 1220402719392041 | VERIFIED    | [Host controls / modals](TDS_HOST.md); 53 units, 5 actual host + 22 component + 16 catalog cases, final editor regression |
| TDS-09 | 1220402539686302 | VERIFIED    | [Roster / package administration](TDS_ROSTER.md); 40 units, 2 roster + 4 package + 22 component + 1 integration; editor zero-pixel regression |
| TDS-10 | 1220402539658409 | VERIFIED | [Motion](TDS_MOTION.md); 22 units, 59 browser cases; all 16 gate labels pass; editor/stage PNG byte parity |
| TDS-11 | 1220402430879047 | NOT_STARTED | Naming compatibility                                                                                            |
| TDS-12 | 1220402539686110 | NOT_STARTED | Full QA / handoff / release gate                                                                                |

Run `node extensions/qa/tds-boundary.mjs` at every checkpoint. The guard rejects
all `packages/**` and editor modifications and paths outside the locked allowlist.
It audits 602 original files, including all graphical site assets. Only the
exact nine subsequently owner-approved host seams have bounded exceptions.
An untouched source tree alone is insufficient: editor production-bundle visual
and behavior checks are separately required.

Dependencies installed with frozen lockfile; TDS-04 adds only three importer lines for an already-locked optional peer, with no upgrades.
TDS-00 verified in isolated remote container `tadazz-design-system-qa-20261110`
(2 CPUs / 4 GiB / 768 PIDs / no published ports or production storage).
TDS-08 host controls/modals verified. TDS-09 roster and package surfaces are next.

TDS-07 commit: `2dd112613ffbace71420242f4e302afe13d2067b`; Asana VERIFIED.
TDS-08 starts from that SHA. Parent remains OPEN; no release/deployment authorized.

TDS-00 evidence commit: `10c41075b67c129222e0fd13e231482091ec14ae`.
Checkpoint follow-up removes trailing whitespace from copied QA logs (their
messages/results are unchanged), records the local guard output and Asana sync.
Initial staged whitespace check flagged only those copied log spaces; the
follow-up check passes. The raw server logs remain in the isolated QA directory.

TDS-01 BASE_HEAD: `1209626d651e6858a17c339a05ae86462c257738`.
Changed AGENTS.md, GEMINI.md and WORKING_RULES.md with current scoped precedence;
added TDS_POLICY.md (brand/locales, naming, compatibility classes and freeze).
PASS: 55 existing authored JSON/XLSX/preflight/theme round-trip/branding tests
across 5 files in the isolated remote container; report
`qa-evidence/design-system-20261110/phase-01-contracts.json`.
PASS: 602-file boundary guard / `git diff --check`.
Only guidance/evidence changes in this phase; production rendering code remains
byte-identical, including every editor dependency. No new visual comparison
claimed for this documentation-only phase. Next: source inventory/dependency map.

TDS-01 commit: `d20a71a8c11d78226eba7f30cb1dcd89c2c550e1`; Asana VERIFIED.
TDS-02 BASE_HEAD: that same commit. Added generated 327-file source inventory,
six-class disposition/owner/migration map, exact imports/variables/motion anchors,
both real manifests (31/36 assets), screen/component/token graphs, duplicate and
ShadowRoot/fullscreen analysis. Concrete proposed nine-file host seam ledger
is **NOT AUTHORIZED / NOT APPLIED**. No editor/upstream/product source changes.
PASS: inventory generation / 602-file boundary audit / whitespace check.
No new runtime tests needed for this documentation/source-inventory phase;
runtime acceptance and host patches remain later gates. Next: downstream tokens.

TDS-02 commit: `851a7878c68c7e237ebec4554f1a9bc463693fe3`; Asana VERIFIED.
Owner then explicitly approved the nine listed host seams: "מאשר את השינויים
הממוקדים שברשימה". Exact scope/line limits recorded in `tds-approved-seams.json`.
No protected source has been edited yet; editor exceptions remain forbidden.

TDS-03 BASE_HEAD: `851a7878c68c7e237ebec4554f1a9bc463693fe3`.
Production tokens/scopes, generated registry, bounded site bridge, negative-scope
fixtures and additive CI checks implemented. No dependency upgrade. Verification
via `bash extensions/qa/tds-phase03.sh` in the isolated container: unit=0 (6 pass),
types=0, browser=0 (6 pass across Chromium/WebKit), editor=0 (focused production
bundle scenario; four editor captures threshold 0 / maxDiffPixels 0), freeze=0,
design=0, registry=0. All 602 original protected/artwork hashes still match.
Visual comparator settings remain threshold 0 / maxDiffPixels 0; raw-RGBA
diagnostics disclose 9/2 antialias edge pixels in question/media and byte identity
for scene/timeline/settings. No claim of all-PNG byte identity. See the retained
candidate/control/repeat images and proof JSON for exact coordinates/hashes.
Initial selection-state snapshot mismatch and its independently source-verified
control recapture are explained in TDS_TOKENS.md; original images/logs retained.
Full runtime/role/device matrix remains TDS-12. Next exact action: TDS-04 canonical
React components, with representative site/host integration and keyboard tests.

TDS-03 commit: `b007fc50380c92faf3ac0f0ffa958d1939fdfca3`; Asana VERIFIED.
TDS-04 BASE_HEAD: that same commit. Canonical components, scoped fullscreen/
ShadowRoot portals, site adapters, explicit account-form submit and approved
toolbar imports/scope implemented; original handlers and editor remain intact.
Added optional existing Radix peer (three lock importer lines), exact native
button registry and additive original-primitive CI audit. No dependency upgrades.
PASS: remote `tds-phase04.sh` final run: frozen install; 14 unit contracts;
extensions/web types; 18 Chromium/WebKit interactions including actual fullscreen;
6 token browser contracts; 1 full actual API/production bundle scenario (35.4s);
registry/design/freeze. Guard: 601 unchanged protected hashes, only authorized
ManagerControlToolbar modified (12/140 cumulative changed lines).
PASS: all four editor PNGs byte-identical to verified TDS-03; original control
comparison retains disclosed 9/2 AA-edge pixels (question/media), scene/settings
byte-identical. No comparator relaxation. Initial ShadowRoot traversal/WebKit
Tab boundary, implicit-submit and long fullscreen fixture issues fixed and
their failed attempts retained. See TDS_COMPONENTS.md and phase-04 evidence.
NOT RUN: final exhaustive matrix, physical devices, release (later gates).
No remaining TDS-04 blocker. Next exact action: TDS-05 live internal catalog.

TDS-04 commit: `c27a337efc452fd8bd828661a436a482a24eb6ae`; Asana VERIFIED.
TDS-05 BASE_HEAD: that same commit. Added isolated localhost-only Vite catalog,
38 typed production exports / nine story families, actual token palette and
interactive controls, eight existing locale resources, RTL/light/state/layout
examples, source/governance checks and linked agent guidance. No new dependency.
Visual review caught and fixed scoped native WebKit select color-scheme and
shared dialog body spacing; original pre-correction evidence retained.
PASS remote tds-phase05.sh: extension/web types; 14 units; 14 catalog + 18 canonical

- 6 token browser cases across Chromium/WebKit (no skips); separate catalog build;
  both dev and preview reject public-bind overrides; 577-source import separation;
  full actual API/site/Studio/host/editor regression 1 passed 35.6s; freeze/design/
  registry. All four final editor PNGs BYTE-IDENTICAL to independently built original
  control, zero raw-RGBA differences; historical 9/2 AA observations remain retained.
  Only existing approved toolbar source exception, 12/140 lines, 601 unchanged hashes.
  Evidence: TDS_CATALOG.md and phase-05*, including phase-05-editor-proof.json.
  NOT RUN: physical devices / native browser zoom / final performance/lifecycle
  matrix / GitHub CI execution / release. No new upstream/lock changes or blocker.
  Next exact action: TDS-06 My Games thumbnails/actions, advanced package disclosure,
  marketing demo state controls and compact real account layout, all eight locales.

TDS-05 commit: `aae7a0298543b19ab787dd9b3653c8ba971eee0d`; Asana VERIFIED.
TDS-06 BASE_HEAD: that same commit. Real MyGames retains original API/import/
export handlers through pure GameCard; explicit fallback cover/16:9, one secondary
menu with all four exports and confirmed/error-aware deletion, empty-only create
tile, lazy progressive package tools preserving jobs, compact authoritative account
status, clearer demo choose/reveal/replay/reset-scroll, complete eight-locale copy
and ordinary Tadazz branding. Fixed initial pointer-to-shadow menu focus; no editor,
server, data/wire changes. Existing mixed E2E selectors maintained, not falsely
claimed run when they write editor content.
PASS remote main phase06-r3: types; 82 units; 12 site browser + 22 canonical cases;
full actual API/editor scenario; guards. Final replay-only follow-up: fresh types,
4 Chromium/WebKit demo/account-state cases, repeated final production bundle full
API/editor scenario 1 passed 36.0s, freeze/design/catalog-source/registry. No skips.
Source hashes: 601 unchanged; only prior approved toolbar exception 12/140 lines.
Editor comparator unchanged zero thresholds; raw proof has exactly prior TDS-03/04
9/2 AA-edge variant in question/media and byte-identical scene/settings; TDS-05
all-byte-identical result preserved as its own observation. No new mismatch pattern
or source/baseline/tolerance edits. See TDS_SITE.md and phase-06 evidence.
Reviewed gallery/list, account, phone demo and corrected replay/top-of-page capture.
Initial pointer failure reports and scrolled sticky-header capture retained.
NOT RUN: physical devices, final host/roster/lifecycle/performance/CI/release gates.
No phase blocker, new upstream seam or lock change. Next exact action: TDS-07 actual
theme viewport underlay and shared live PIN/URL/lock/configured-phone data contract;
preserve original theme fallback, user media and Creating Worlds seating layout.

TDS-09 BASE_HEAD: `4519a01fa82e4d0d12c654f211175c2a7bf0760a`.
Participant-specific single-flight removal, hostPresence-authoritative Phone
Invite Only synchronization, compact 40/400-row roster, complete eight-locale
copy and canonical token skin around the unchanged lazy PackageManager are
implemented. Definitive Oracle `tds-phase09.sh`: all 14 labels PASS: extension/
web types; 17 suites / 40 tests; format; 2 roster + 2 lazy-package + 2 current
package-admin + 22 component browser cases across Chromium/WebKit; catalog build;
full production/API/editor integration; freeze/design/token/catalog governance.
Full boundary: 602 protected files, GameSettingsModal 18/18 and HostPlayersModal
87/110. Editor threshold 0 / maxDiffPixels 0 passed all four captures. The wider
historical package-runtime suite separately reports 6/10 PASS; its four disclosed
failures are two 4-GiB load crashes and two stale `/manager/config` route
assumptions, while current Studio build/install/export passes both engines. See
[TDS_ROSTER.md](TDS_ROSTER.md) and `qa-evidence/design-system-20261110/phase-09*`.
No production, push, merge, provider or data operation. TDS-09 implementation
commit: `ad0152866e0f84fbead6c2a32dca6ec7d0fa0c07`. Next exact action: begin
TDS-10 platform motion only.

TDS-10 implementation commit: `537ccb8fd2762e02d0659a11e0ce61686ac2ddc9`.
BASE_HEAD: `e756f619c015893462ae72f77f810889d2e32e70`.
All 16 isolated gate labels PASS: 22 units, 59 distinct browser cases, and
10 capture-only motion cases rerun after QA screenshot improvements. All four
editor and all four accepted stage/QR captures are byte-identical to their
independent controls. Full 602-file boundary, host AST and cinematic owners PASS;
1,189 local/container build inputs match. No new upstream/editor source edit.
See [TDS_MOTION.md](TDS_MOTION.md). The first staged whitespace check exposed
CRLF in locally generated evidence; an evidence-only follow-up normalizes it to
LF and passes the check without changing results or application source.
Asana was not updated: [pending synchronization](ASANA_SYNC_PENDING.md).
Next exact action: TDS-11 stable semantic aliases and compatibility verification.
