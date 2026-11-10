# TDS-07 viewport and room join implementation ledger

BASE_HEAD: `d31a2e184602701f1ff9e89edb41605252575ab7`. Status: VERIFIED.
Owner already authorized the exact nine bounded host seams in TDS_UPSTREAM_SEAMS.
This phase uses only NativeGameLayout (40 lines), GameWrapper (35), Room (35)
and TadazzScreens lobby (35), preserving room/control/engine callbacks.

Before editing: inspected actual native frame/surface, legacy backdrop and media
precedence hook, theme resolver/slots, both lobby implementations, raw/public
status, audience sanitization, current room-check route, media grant behavior,
manager lock store/event, public directory and immutable Creating Worlds seating.

## Smallest seam design

NativeGameLayout replaces its section with a downstream semantic viewport frame
and makes the bounded content surface transparent. GameWrapper mounts original
GameBackground only for selected Razzia original and wraps the existing backdrop
composition in a downstream viewport layer. A real React portal moves only
decorative backdrops into the frame's full-size layer; existing data, onError,
animation and custom background handlers stay original. It is not a source alias,
DOM rewrite, duplicated video renderer or new timeline. Razzia original returns
the old backdrop composition in place. This saves upstream diff and keeps room
to apply the separately planned bottom control surface within the approved cap.
Theme colors/assets/slot fit load synchronously at the frame; loading/failure
falls back to the selected theme color, with no classroom underlay for Tadazz.
Explicit custom/card/video rendering remains authoritative and single-owned.

Room and TadazzLobby use a shared typed downstream join contract for current PIN,
base/full join URL, QR payload, lock availability and explicitly configured public
dial number. Existing QR library 4.2.0 is reused through an optional peer; a small
wrapper provides its documented quiet zone and accessible label. Existing arrays
and props to Creating Worlds SeatingPlan are preserved; no seating CSS/timing edit.
Never derive a dial-in number from roster participant contacts.

## Public lock transport constraint

Installed server sends manager:lockUpdated only to the manager. Public SHOW_ROOM
and extension envelope contain no lock field; treating spectator's default false
manager store as authoritative would be incorrect. Do not add an unapproved
server/common protocol seam. While a public lobby is visible, the downstream hook
uses the existing public POST /api/games/check with the actual six-character PIN,
checking only its status/error. It never joins a player or sends manager commands.
Use credentials:omit so the existing endpoint's optional media-cookie response is
not accepted or used to modify the viewer's credentials. No provider or billing
call, customer-data mutation or new endpoint is involved.

Manager lock stays immediate from its real store. Public polling is bounded to
the visible lobby, aborts/reset on PIN changes/unmount, pauses when hidden and
rechecks on visibility return. Unknown/error is explicit checking/unavailable,
with no joinable QR or stale previous PIN. A short polling delay is a documented
transport tradeoff; the existing server still authorizes every actual join.
Validate real lock/unlock/reconnect and no pending-request leaks in isolated QA.

## Required acceptance

Entire viewport/behind-controls/theme fallback/custom image fit and error/first
paint/resize/fullscreen/one media owner; live host/public PIN + decoded QR URL;
manager vs public lock, configured/no phone and no private contacts; Creating
Worlds seating/representative placement retained; no editor source/style changes.
Keep this phase open until fresh unit/browser/visual/compatibility/freeze evidence.

## Additional live diagnostic and preserved opening sequence

The actual Creating Worlds audience QR failed optical decoding in r2/r3. Its
geometry, names, PIN and visibility attributes were present but its screenshot
contained only the opaque stage artwork. `phase-07-seating-before-decode.png`
initially suggested a paint-order defect, rather than a QR encoder failure. Current
V4 custom-root is z=6 while the retained stage teaser is z=9 and HUD art z=13;
the custom screen's own z=15 cannot escape its parent's stacking context.

The temporary root-level CSS hypothesis was tested in r4 and did NOT fix optical
decoding. The full r5 painted-asset diagnostic identified the actual covering
element: TadazzOpening's intentional MP4/brand/event-artwork sequence, not the
V4 teaser. This one-question synthetic show uses the retained legacy opening;
the test had attempted scanning the underlying lobby before that sequence ended.
Removed the temporary stylesheet/import completely. Preserve the original
choreography, advance no production state, and wait for the opening component to
unmount before optical decoding and lobby screenshots. Keep all original stacking
and FX/wipe behavior. Failed reports/captures remain as diagnostic history, not
release claims. Verify decoded public QR and same table positions after lock.

## Verified checkpoint

Worktree/branch remain `tadazz-design-system-20261110` /
`codex/tadazz-design-system-20261110`. Four approved upstream seams changed this
phase: GameWrapper 8/35 cumulative changed lines, NativeGameLayout 20/40,
Room 24/35, TadazzScreens 27/35. Prior toolbar 12/140 remains unchanged this phase.
All other 597 protected hashes match, including editor and graphical artwork.
No stage source CSS, choreography, media engine, server or transport contract edits.

Changed downstream production files: `presentation/room-join/{contract.ts,
use-room-join.ts,view.tsx,index.ts}`, `presentation/show-themes/viewport.tsx`,
presentation barrel; optional existing QR peer/export/lock importer; actual
catalog lobby composition and isolated game locale reads. Tooling: focused
contract/viewport tests, remote stage fixture/config/specs/scripts, existing
catalog spec, narrow boundary rules, CI and QA Dockerfile decoder dependency.
No new QR encoder or public catalog route. Decoder is QA-only zbar-tools.

Fresh remote evidence under `qa-evidence/design-system-20261110/`:

- `phase-07-unit.json`: **62/62** existing compatibility/public-directory and new
  join/viewport units, no skips; both extension/web TypeScript checks PASS.
- `phase-07-catalog-browser.json`: **16/16** Chromium/WebKit production catalog
  cases; real QR optical decode, no API transport, all eight locales, RTL, zoom,
  scopes and interactions. Catalog production build PASS.
- `phase-07-stage.json`: **10/10** Chromium/WebKit cases. URL/PIN/QR, real HTTP
  cookie omission, lock/error, stale request, hang timeout/recovery, unmount,
  manager no public probe, original-theme independence, viewport resize and one
  decorative owner. Fixtures include 1920/1366/1024/390 widths.
- `phase-07-stage-integration-r6.json`: **3/3** actual API/multiplayer cases after
  opening settles. Host 1920/1366/1280/1024, no classroom request/scroll/gaps,
  real browser fullscreen, current decoded QR, lock/unlock/reload, player join,
  configured/no phone, privacy, Creating Worlds retained positions, explicit
  card contain/top/full-viewport and missing-image fallback; no duplicate video.
- `phase-07-stage-integration-r7.json`: **1/1** focused seating follow-up with
  forty short synthetic display names for readable visual QA, decoded QR and
  explicit locked PIN mask. No production change after r6.
- `phase-07-final-status.txt` and `phase-07-final-integration.json`: final source
  TypeScript / full real API-editor baseline **1/1** / freeze / design / registry /
  catalog guards PASS after removal of the temporary CSS hypothesis. The full
  r4 script had one failed pre-opening QR assertion; its status is retained and
  is superseded only by these explicitly named final/focused passing runs.
- `phase-07-editor-proof.json`: Playwright threshold=0/maxDiffPixels=0 comparisons
  PASS. Raw diagnostic is exactly the historical question 9/media 2 AA edge-pixel
  variant from TDS-03/04/06 (same PNG hashes), scene/settings byte-identical.
  Do not claim all four are byte-identical to the independent original control.

Inspected screenshots: host at 1366, fullscreen and custom card; final Creating
Worlds public seating, configured dial-in, QR and PIN. Opening footage remains
authoritative before the lobby. Diagnostic failures and the rejected CSS
hypothesis are retained in `phase07-diagnostics/`; no such CSS is shipped.

Transport tradeoff: visible public lobby checks existing room status every 3 s,
5 s after error, aborts after 8 s, never accepts/sends cookies, resets on current
PIN/origin and stops network polling while hidden/unmounted. Manager state is
immediate; server still authorizes every join. No physical device test claimed.
No release/push/merge/deploy or production operation. Next: TDS-08 host controls,
fullscreen-aware scoped legacy portals and QR accessibility within approved caps.
