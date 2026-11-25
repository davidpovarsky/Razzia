# TDS-06 site and Studio checkpoint

BASE_HEAD: `aae7a0298543b19ab787dd9b3653c8ba971eee0d`. Status: VERIFIED.
All changes are downstream site/platform code, local translations and owned QA.
No new protected seam, schema, endpoint or persisted identifier is changed.

## Product behavior and ownership

My Games receives only existing `{id, subject}` metadata, with no cover field.
Use the existing licensed default artwork with an explicit localized fallback
badge; invent no metadata/cover endpoint. The media frame and actual image retain
16:9 in gallery/list/phone, with cover fit rather than distortion. The obsolete
list aspect-ratio:auto / mobile-hidden image declarations are corrected in the
owned Studio theme; new refinements are scoped and token-based.

The top creation action remains. A creation tile appears only in a true empty
library, not beside populated games or search misses. Empty search has distinct
translated guidance. Dashboard's duplicate mobile creation link is removed.
Edit game is the primary card link; Prepare show retains its original route.
Duplicate, all four exports and Delete share one named accessible overflow.
The pure GameCard delegates to original MyGames composite/file handlers; it owns
no API/transport/game state. Existing duplicate import still remaps IDs/extras.

Delete now uses the shared async confirmation, with identity/consequences,
localized cancel/error and single-flight guards. Cancel sends no mutation;
failure remains open for retry, rather than closing on a swallowed exception.
Return focus is explicit for a surviving action trigger; after successful removal
the owned list can receive focus. Original composite endpoint/ownership behavior
is retained. Legacy JSON, enhanced bundle, XLSX and authored JSON exports keep
their historic format IDs and filenames, including tada-show / .tada.json.

Advanced packages are initially collapsed and lazy. Importing an actual .tadazz
file through the existing game input expands the section automatically. After
first expansion the original PackageManager stays mounted across collapse to
preserve preflight/job state; installer/build/export permissions stay upstream.
No private build worker/telephone/provider operation is added.

Demo choices are clearer keyboard-accessible cards with selected state. Reveal
appears after selection; replay appears only after reveal. Existing illustrative
results and explicit not-a-live-vote disclosure remain before and after reveal.
Routing/scroll/reset behavior is unchanged.

Account identity/security and licences/capacity are compact shared cards with a
native canonical language selector and real verified status. Existing config and
capacity queries remain authoritative; disabled billing hides stale configured
capacity/management data. Human copy explains availability without fake checkout
or illustrative quotas. Duplicate sidebar account link becomes a noninteractive
identity summary; the account navigation entry remains, with avatar access on
small viewports. No account/session/security/payment logic is replaced.

All five new site keys and existing revised availability copy have en/fr/de/es/
it/ja/tr/vi values and preserved placeholders. Ordinary site translation values
and image alternative text use Tadazz; old locale keys remain compatible. Logo,
source artwork and frozen editor resources are untouched.

## Interaction correction found during integration

First full site run passed layout/locale/demo/packages but found a fresh pointer
entry into a ShadowRoot menu dismissing before action selection. Earlier keyboard
tests and already-focused interactions did not expose it. Radix suppresses default
trigger focus; a first body-to-shadow focus transition can appear outside the menu.
The canonical Menu now focuses only its own enabled shadow trigger on primary
pointer down before the original Radix handler. No global event/DOM override,
dependency patch or editor change. New fresh-pointer cases cover both document
and ShadowRoot surfaces; actual duplicate/delete/export tests cover real consumers.
Retain initial failures in phase06-r2 and report final evidence after verification.

## Verification in progress

Run `bash extensions/qa/tds-phase06.sh` only in the isolated remote container.
Initial 82 unit/locale/ownership/authored-format contracts and extension/web types
PASS. Current browser run checks real API duplicate/import/delete, all four
download formats through the existing preflight validator, genuine server error
and retry, package disclosure/state, 16:9 dimensions and overflow across five
widths, eight locale labels, account availability, and demo choose/reveal/replay.
Read-only editor enter/exit after actual import does not modify editor content.
The full production-bundle baseline separately compares four frozen editor images.
Do not mark TDS-06 complete until final browser/visual/freeze checks are verified.

## Verified checkpoint

Final relevant checks all PASS, in the isolated container:

| Command / evidence                                   | Result                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main `tds-phase06.sh` run, phase06-r3                | Extensions/web types, **82 units** (site/client/locales/delete ownership, canonical primitives, historic JSON/XLSX/themes), **12 actual site browser cases**, **22 canonical interaction cases**, full API/editor baseline, freeze/design/registry PASS |
| `tds-phase06-followup.sh` on final production source | Types, **4 Chromium/WebKit follow-up cases** (authoritative config over cached capacity and replay/scroll), repeated full API/editor baseline **1 passed 36.0s**, freeze/design/catalog-source/registry PASS                                            |
| Local guards / formatting                            | ui:check, exact cumulative seam limit, Prettier and diff whitespace PASS                                                                                                                                                                                |

The main run precedes the one-line replay scroll reset. Targeted demo follow-up
and final full production-bundle baseline validate that final source; no need to
repeat unrelated format mutations after a scroll-only change. New account status
coverage uses explicitly mocked read-only config/snapshot/error responses, not a
claim of real provider/checkout validation. The reproducible main script now also
includes the account slice for future complete runs. All reported cases passed
on Chromium and WebKit with no skips.

Actual tests prove unique duplicate IDs and preserved private synthetic roster,
all four downloaded formats accepted by existing preflight and two-question
round-trip, enhanced import and read-only editor exit, delete cancel/no request,
500/error/retry and eventual removal, package auto-expansion/state preservation,
16:9 dimensions across gallery/list and five widths, eight locale menu/account
labels, unavailable capacity and stale-cache gating, and choose/reveal/replay.

All four editor comparisons pass unchanged threshold 0 / maxDiffPixels 0. Raw
diagnostics retain the **same 9/2 antialias-edge pixels and identical PNG hashes
seen in TDS-03/04** for question/media; scene/timeline/settings are byte-identical
to the independent original-source control. TDS-05's all-byte-identical observation
is retained separately, not retroactively changed. See `phase-06-editor-proof.json`;
do not claim every capture in this run is byte-identical to original control.
No editor source, baseline image, comparison tolerance or artwork was modified.
Guard: 601 protected/artwork hashes unchanged; only the prior approved toolbar
seam is modified, still 12/140 cumulative lines. No new upstream/lock changes.

Reviewed actual gallery/list, compact account and phone demo captures. An initial
full-page screenshot after scrolled replay placed the sticky header mid-document;
final capture explicitly starts at page top and replay itself resets scroll.
The earlier capture is retained in phase06-r3. Initial pointer-menu failure reports
are retained in phase06-r2. Fresh canonical screenshots are under
phase-06-components/ with stable reused harness basenames; phase-06/ contains the
full final site/Studio/host/editor baseline. Reports/logs are phase-06*.

Full legacy mixed editor-write E2E scenario is not claimed here; this initiative
uses the editor read-only. Its owned selectors were maintained for new menus,
dialog role, lazy packages and actual token color without removing assertions.
Physical devices, remaining host lifecycle/roster/performance matrix and CI
execution remain TDS-12. No phase blocker. Next: TDS-07 viewport themed backdrop
and actual role-safe room join contract, within the owner's approved seam bounds.
