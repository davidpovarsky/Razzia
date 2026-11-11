# TDS-08 host controls and modal integration ledger

BASE_HEAD: `2dd112613ffbace71420242f4e302afe13d2067b`. Status: VERIFIED.
Single primary session; owner approval for nine seams remains the only protected
source exception. No new server/editor/common/game-controller paths.

Before editing inspected current ManagerControlToolbar action closures, original
double-press/focus rules and authoritative Previous predicate, native GameWrapper
footer/legacy toolbar, current RoomLockButton, host settings/history/shortcuts,
both QR alert dialogs, platform portals/scopes/button styles and original Button.
The current lobby/non-lobby lock condition already yields one lock; preserve it
and prove it rather than changing the command. First Previous is disabled with
the existing reason. Keep pending timers, request IDs, scoring/history and audio
vs gameplay pause semantics untouched.

Planned exact protected seams, before modification:

- ManagerControlToolbar: replace only the display/copy/local-present JSX with a
  downstream reusable production composition; pass the SAME existing callbacks,
  gameId and copied state. One coherent labelled group, distinct icons/labels.
  Keep test IDs and independent modes. Give existing primary phase actions their
  canonical variant. All callback/effect/shortcut code stays byte-identical.
- GameWrapper native footer: downstream HostControlBar scope plus canonical
  labelled fullscreen icon; all original presence/settings/room lock handlers
  stay in place. Leave the separate cinematic stage/controller untouched.
- GameWrapper existing LegacyStageAudio call: pass the same component/props to a
  downstream host-only UI scope adapter. Retain exactly one original player and
  all cues/timing/volume/pause handlers; apply the shared button style and native
  range accent to its host controls. Public/player/local-presentation roles add
  no audio control scope. No audio engine or cue file is changed.
- GameSettingsModal/index, HistoryDialog, HostShortcutsDialog and HostPlayersModal: scoped legacy
  DialogPortal; local production Button/AlertDialog imports where compatible;
  accessible close label for settings/roster. Roster gets only its portal/close
  label now so it remains visible in native fullscreen; its header/table/delete
  work stays sequentially in TDS-09. No settings save/history/roster callback edits.
- Room/TadazzScreens: downstream fullscreen-aware QR AlertPortal, hidden Radix
  title/description and explicit focus on the existing visible close action.
  Preserve installed AlertDialog semantics and original close/lock/QR handlers.

New canonical host compositions reuse actual tokens/primitives and eight existing
translation resources. A bounded footer legacy style uses the same canonical
button declaration source, not a second control implementation or DOM rewrite.
Only explicit marked host scopes and portals receive the platform theme.

All cumulative caps remain binding: toolbar 140, GameWrapper 35, native frame 40,
settings/history/shortcuts 18 each, Room/TadazzScreens 35 each. Roster's remaining
work stays TDS-09 under its separately approved 110-line seam. Fresh fullscreen,
focus/Escape/keyboard/no-double-fire and actual lifecycle tests required before
marking verified. QA only in the existing isolated remote container.

Initial live QA: roster's controlled Radix Root has no Radix Trigger, so the
original default close-focus target is absent. Add explicit optional return-focus
selector to the downstream portal for roster/history only. Its mounted child
restores the existing real launcher after unmount only when focus otherwise
falls to body/disconnected content; preserve Radix's own valid focus restore.
No global keyboard/DOM rewrite or game callback edit. The initial vote test also
incorrectly expected a separate Confirm action; the existing single-answer mode
already submits on selection. Await the real host 1/1 answer aggregate instead.

Visual QA after the functional pass found two additional presentation issues:
the legacy switch thumb inherited the generic white-surface projection, and a
blanket icon hit-target rule also enlarged switch tracks. Reuse canonical switch
declarations for marked legacy Radix switches, reset their old translate utility,
exclude switch tracks from the close-icon size rule, and retain a transparent
44-pixel switch hit area. No original Switch source/provider/editor change.

The 640x400 host screenshot also exposed the pre-existing tall native lobby being
cropped below the header. Before the bounded fix: add a native-room class (2
cumulative lines, within Room's 35 cap) and a downstream short-height-only compact
layout for non-original native show frames. Preserve the normal viewport and
Creating Worlds stage. Compact display labels keep their full accessible names
and distinct icons/tooltips; hide only the already-disabled initial Previous.
Keep all PIN/QR/dial/roster handlers and raw state unchanged. Verify QR decoding,
full bounds, real settings save and editor pixels on the final source.

Late QA infrastructure finding: after many browser suites the original container
(PID 1 was sleep) accumulated 613 zombie processes. pids.current=616,
pids.events max=656 (768 limit); memory showed no OOM event. The r5 full baseline
crashed while creating a fresh browser page, after its editor captures; this is
not counted as a passing integration. Evidence and original failed report kept.

Restart only the verified isolated QA container (id prefix 501244784d54), retain
its writable candidate and mounted evidence, install QA-only Tini, and execute
subsequent docker exec test suites through `/usr/bin/tini -s -- bash ...`.
The Dockerfile now supplies a proper Tini entrypoint for future recreations.
Use the [upstream Tini subreaper instructions](https://github.com/krallin/tini#subreaping).
Production container identity/start time were read-only checked unchanged. Same
2 CPU / 4 GiB / 768 PID profile; no host/container limits raised. Re-run current
types, host cases and full editor/API integration on a clean QA process tree.

## Final verified checkpoint

Worktree `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110`,
branch `codex/tadazz-design-system-20261110`. No push, merge, deployment or release.
All nine owner-approved paths now have bounded presentation changes; **593**
other protected hashes remain identical. Cumulative changed-line counts vs BASE:

| Seam | Lines / maximum |
| --- | --- |
| ManagerControlToolbar | 72 / 140 |
| GameWrapper | 26 / 35 |
| HostPlayersModal (portal/close only; content remains TDS-09) | 9 / 110 |
| GameSettingsModal/index | 11 / 18 |
| HistoryDialog | 11 / 18 |
| HostShortcutsDialog | 6 / 18 |
| Room | 33 / 35 |
| TadazzScreens lobby | 34 / 35 |
| NativeGameLayout (unchanged this phase) | 20 / 40 |

Production additions: canonical `platform-ui/host-controls.tsx` (display group,
footer scope and original-audio scope adapter), shared canonical button/switch
style declarations and portal focus return, actual catalog compositions/isolated
eight existing locale resources; `room-join/view.tsx` QR portal/labels/focus and
short-native-window CSS. No second control primitive or new audio engine. The
catalog now lists **41 runtime exports / 9 families**. No production catalog
import and no public catalog route. No new translation strings were needed:
existing supported en/fr/de/es/it/ja/tr/vi labels are reused, including the live
URL and PIN in the QR dialog's accessible description.

Fresh isolated evidence at `qa-evidence/design-system-20261110/`:

- `phase-08-final-unit.json`: **32/32** extension UI/join/viewport/primitive
  contracts; `phase-08-final-host-unit.json`: **21/21** existing web host shortcut
  and permission units. Both TypeScript checks PASS.
- `phase-08-seams.json`: **8 existing components' hooks/state/action closures
  have identical normalized AST hashes** to this phase's starting SHA. Only
  final UI returns/imports changed; original manager commands/request IDs,
  validators, pending state, clock/score/history and audio callbacks retained.
- `phase-08-final-host.json`: **5/5** real Chromium/API/multiplayer cases PASS.
  Real clipboard URL, clean audience popup and local presenter, all fullscreen
  QR/settings/shortcuts/roster/history portals, focus trap/Escape/launcher focus,
  decoded host/public QR + accessible current PIN, audio pause vs game pause,
  single vs double 500 ms chords, genuine submitted vote retained by End Timer,
  history replay/restart/skip cancel/confirm and one original outgoing command,
  touch 1024x768 and 640x400 with full decoded QR, actual PATCH/save/reopen of a
  styled switch. Original audio UI scope exists once for host and is absent for
  player/audience/local-presentation roles.
- `phase-08-components.json`: **22/22** Chromium/WebKit interaction checks PASS;
  `phase-08-catalog-browser.json`: **16/16** catalog checks PASS, including eight
  locales, RTL, native/fullscreen and 200% CSS-zoom fixture checks. Catalog
  production build PASS. These r5 reports cover final styles/components; r6
  subsequently adds only the QR accessible URL/PIN description and validates it
  in the five current host cases plus the complete final regression.
- `phase-08-final-status.txt` / `phase-08-final-integration.json`: final r6 types,
  units, host and **1/1 full real API/Studio/package/editor scenario**, plus freeze,
  design, token-registry and catalog guards all PASS under Tini subreaping.
- `phase-08-editor-proof.json`: strict Playwright comparisons PASS; original
  control raw diagnostic remains exactly question 9 / media 2 AA edge pixels,
  same PNG hashes as TDS-03/04/06/07; scene/settings byte-identical. No source,
  resource, provider, font or style changes to the editor. Do not claim four
  byte-identical original PNGs.
- `phase-08-qa-resources-{before,restarted,after}.txt`: 613 zombies cleared only
  in isolated QA; final idle **3 PIDs, zero zombie states and zero PID-limit
  events**. No OOM. `phase-08-production-after.txt` confirms production id/image/
  start time unchanged. Current container uses tested `tini -s`; the updated QA
  Dockerfile's future entrypoint was not rebuilt/deployed.

Inspected final 640x400 join/control layout and saved settings screenshot: PIN,
URL, QR, waiting state and controls are visible; the compact QR decodes; switch
track/thumb and checked state are distinct. Existing Creating Worlds stage and
normal-height native geometry remain independent. Prior r1 focus/fixture failures,
r2 pre-visual screenshots, r4 compile error and r5 process-exhaustion report are
preserved in `phase08-diagnostics/`, never counted as current passing runs.

Physical hardware / OS browser zoom are NOT RUN; emulated touch, WebKit engine,
CSS zoom and real Chromium native fullscreen are explicitly the tested surfaces.
Next: TDS-09 roster metrics/settings/table/delete confirmation and package skin,
preserving current backend presence/invite/CRUD/import/tenant semantics.
