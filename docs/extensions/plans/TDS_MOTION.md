# TDS-10 — scoped platform motion

PHASE: TDS-10 `VERIFIED`

Asana parent: `1220402777392717`; subtask: `1220402539658409`.
Worktree: `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110`.
Branch: `codex/tadazz-design-system-20261110`.
BASE_HEAD: `e756f619c015893462ae72f77f810889d2e32e70`.

## Pre-edit scope

Platform-only motion may change `extensions/src/platform-ui/**`, owned Studio
components and dedicated QA. Dialog/menu/popover/tab/feedback CSS uses generated
motion tokens; Studio game sorting/filtering/layout may use installed
`motion/react` with a reduced-motion zero-duration path. Motion must not delay
host commands.

The following remain byte-frozen for this phase:

- `extensions/src/presentation/tadazz-v4/motion.ts`
- show directors, cinematic WAAPI/Lottie/audio/cue/timer owners and assets
- `packages/web/src/features/quizz/**` and `extensions/src/editor/**`
- all protected `packages/**` sources, including the nine already completed seams

No dependency, server, wire, persisted data or show-theme change is planned.

## Planned verification

- Deterministic Chromium/WebKit dialog/menu/popover entry/exit and rapid
  interruption checks in the real component fixture.
- Studio sort/filter/gallery-list layout mutation and final-order checks.
- Reduced-motion media emulation, keyboard/touch/focus behavior and screenshots.
- Existing component/catalog/site checks, types, production builds and governance.
- Accepted stage-frame regression and full production-bundle frozen-editor
  comparison at threshold 0 / maxDiffPixels 0.
- Full boundary and host AST guards; exact cinematic source hashes before/after.

## Resume audit and implementation

The 11–12 November resume starts at the exact BASE_HEAD above. All eighteen
original uncommitted files were backed up before editing. The old source archive
is preserved, but is not used as proof of the corrected source. Asana is unavailable;
see [pending synchronization](ASANA_SYNC_PENDING.md).

The first fresh isolated run confirms Kiro's subsequent import fixes: extension
types, web types, focused units and the cinematic guard pass. Formatting still
fails in nine files; scoped Prettier fixes preserve their behavior. The original
failed logs and all later failed attempts remain retained.

CSS durations/easing and React Motion durations/easing/spring now come from the
same primitive token source. Only `.tds-scope` receives menu/popover, dialog,
selection, status and interactive-card motion. Studio cards use keyed presence
and layout positions; reduced motion disables layout projection entirely.

Browser QA exposed an original portal limitation: its unanimated scope wrapper
was removed before child exit animations. The solution preserves the original
kind-specific Radix portals and exposes their actual animated content to Radix
Presence through a React ref. A rejected generic-portal experiment caused hidden
nested menus in host dialogs; its failed evidence is retained and that approach
is removed. No body styles, upstream handlers or editor imports are changed.

Native Studio dialogs retain the browser's modal/focus owner during their short
exit, become inert immediately on dismissal, and close on their own exit event
with a bounded token-duration fallback. The fallback is canceled on reopening;
reduced motion closes immediately. Only the correct exit event may close the
modal. Host commands still invoke their original handlers immediately.

New deterministic checks exercise normal/reduced motion, repeated dismissal,
reopening during exit, actual CSSAnimation objects in inert native dialogs,
ShadowRoot observation, Studio sort/filter/layout interruption, final ordering
and absence of duplicate cards. Numeric CSS values are compared numerically
instead of depending on a browser's scientific/decimal string serialization.

The isolated container is the existing `tadazz-design-system-qa-20261110` on
`tadazz-quiz-server`: 2 CPUs, 4 GiB, 768 PIDs, no published ports. Node 24.22.2,
pnpm 12.18.0; every suite runs under `/usr/bin/tini -s --`. A local SHA-256
manifest audits all 1,189 build inputs against the container. Initial drift was
limited to two omitted QA utilities and formatting in one old QA spec; the old
remote spec was preserved and the authoritative worktree copies synchronized.
All production inputs already matched. Final identity must show zero mismatches.

Local `pnpm --dir extensions ui:check` and the host action AST guard pass using
the installed Node 24.22.1 toolchain. The first local attempt used the machine's
default Node 22.17.0 and failed loading TypeScript; it is not counted as a pass.
No lockfile/dependency source upgrade was made.

## Final verification

PASS: `bash extensions/qa/tds-phase10.sh` (verified-r7), all **16 labels exit 0**:
extension/web types; **22 unit tests**; cinematic hash guard; targeted formatting;
6 motion + 4 Studio motion + 22 canonical interaction + 16 catalog + 10 stage
browser checks across Chromium/WebKit; catalog production build; one full real
API/production-bundle/editor integration; freeze/design/registry/catalog guards.
This is **59 distinct browser cases**, with no skips. A final capture-only rerun
passes the 6 + 4 motion cases again after QA-only screenshot improvements and
passes their formatting check. No application source changed after verified-r7.

PASS: all four editor PNGs are **byte-identical** to the independently built
original control, zero raw-RGBA changed pixels. Comparator remains threshold 0,
maxDiffPixels 0. All four QR/viewport PNGs across both engines are byte-identical
to the accepted TDS-07 frames. No baseline or tolerance changed. Cinematic engine,
stage and audio-owner hashes remain unchanged. Boundary: 602 protected files,
593 unchanged hashes, only the original nine authorized host seams with unchanged
line counts; zero new upstream/editor source edits.

Evidence in `qa-evidence/design-system-20261110/`:

- `phase-10-status.txt`, `phase-10-verified-r7-job.log`, per-label logs/reports;
- `phase-10-{capture-motion,capture-motion-site,capture-format}.log`;
- `phase-10-{source-manifest,source-identity,boundary,host-seams}.json`;
- `phase-10-editor-proof.json`, `phase-10-stage-proof.json`;
- `phase-10/` real site/Studio/host/audience/package/editor captures;
- `phase-10-motion-*.png`, including paused 50%-entry dialog frames and fully
  settled three-card Studio layouts, visually reviewed;
- `phase10-kiro-r1`, `phase10-resume-r1/r2/r5` preserve failed attempts. Raw
  traces remain private in the container; copied logs only lose trailing spaces.

NOT RUN in this phase: physical devices, actual browser zoom UI, exhaustive
route/lifecycle/performance matrix and external CI. Those are TDS-12 gates.
No outstanding TDS-10 blocker. Asana sync remains pending, parent OPEN.
Next exact action: record the implementation SHA and begin TDS-11 naming and
legacy JSON/XLSX/bundle/theme compatibility. No owner approval is needed for
the local phase commits; release operations remain separately unauthorized.
