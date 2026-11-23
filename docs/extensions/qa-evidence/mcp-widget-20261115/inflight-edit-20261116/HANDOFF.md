# G — preserve edits made during a pending draft update

Source fix: `f2b90e73ec61879c607b28b4c79274b1370f22c4`.
Branch/worktree: `codex/tadazz-hq-mcp-widget-20261115` at
`C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-mcp-widget-20261115`.
This follows G source2bf5d22; root had not merged that initial packet when the
review found this regression. F/server/renderer/source contracts are unchanged.

## Fix

Keep the title field editable during a pending write. Each local edit, explicit
Reset, draft selection and submission advances an editor version. Apply captures
that version, draft ID, base revision and exact submitted document. Its completion
clears dirty state only when all still match the acknowledged revision/content.
The ACK for A cannot clear B entered later. B retains its original CAS base and
stays blocked from applying over a newer revision; Refresh preserves it, and
explicit Reset selects the latest server draft before a new intentional edit.
The existing controller's CAS, cancellation, refresh and acknowledged undo remain
unchanged. No F or engine implementation was edited.

## Actual focused evidence

- Old exact HTML `f0ab3172...` reproduced the bug with the new deterministic
  synthetic host gate: revisionBeforeAck1, then afterAck `ACK title A` instead of
  `UNSENT title B` — **FAIL**, retained in before-results.json / before-inflight.png.
- New HTML: **6 PASS / 0 FAIL**, after-results.json and inflight-after-20261116.log.
  Actual Edge157.0.4341.46, real AppSDK in an opaque iframe. Cases cover B during
  Apply, an unchanged submitted edit, Reset then a new edit during Apply, editing
  during Undo, cancellation/refresh without rebasing, and no page errors/external
  requests. The first case also exercises explicit Reset, a new CAS update and
  acknowledged Undo after preserving B.
- The host gate holds update responses until the later edit has actually been
  entered. It is QA-only and defaults OFF. Both before/after use identical host
  JS SHA `a21acf24cfcc868d8fc06f5e4d743b2dff9b0cf478bd1f947c04b7ee2d87cba9`.
  This avoids assuming an800ms automation window under local load. The earlier
  ungated local attempt did not establish that B preceded ACK and is preserved
  as before-initial-timing-results.json; it is not counted as bug reproduction.
- The manager's separate exact800ms failing review is copied read-only into
  manager-review.json / manager-failure.png; the originals were not overwritten.
- Current scoped TypeScript exit0, type-aware root-config lint exit0, formatting
  check exit0, main-resource and QA-host builds exit0. Named inflight-* logs are
  adjacent. No historical unit/browser suite was blindly rerun or relabeled.
- New resource HTML SHA256:
  `d276cc4ec3f75103fea467fb45a315a9783e0562fd6f5d625f7d6d8692e69514`.
  2,040,068 UTF-8 bytes /2,049,787 serialized response bytes, within F's4MiB bound.
  Exact artifact and build receipt are in this directory. Of2272 resource build
  inputs, only Widget.tsx differs from the original input manifest; no inputs
  were deleted. The267-input QA-host build contains the explicit gate.
- Before/after screenshots were inspected. Both test browsers and loopback
  servers closed in their finally paths. No permanent watcher was created.

## Review boundary

Resume the existing inbox request1220548330603807; no duplicate handoff or direct
manager message. Review G2bf5d22 plus this fix, then its evidence successor.
Original MCP06/07/10/11 receive the relevant source/evidence update; MCP08/09
media/install work is unaffected. All original product tasks remain OPEN.

These are synthetic draft-response fixture tests, not ChatGPT/Claude installation
or an authenticated backend-browser edit. Actual installed-host, release, rights,
media/audio, full15-scene and native Save gates remain open. No canServe/CSP or
account permissions were widened; no deploy/push/Oracle claim/install/customer
mutation or peer-source change occurred.
