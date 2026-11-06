# TADAZZ Next correction audit — 6 November 2026

The user explicitly authorized fixing the implementation and deploying it to the existing server. This supersedes the earlier no-deployment constraint for this release.

## Corrections

- Fixed missing CSS class separators hiding the lobby, PIN, waiting screen, intro/finale, connected-table state, focused directory, recap and locked status.
- Removed the generic scene-title overlay from native full-show scenes.
- Ported round-banner geometry and Z wings from the primary HTML and its round-launch WAAPI sequence. Authentic logo replaces the always-visible duplicate text logo.
- Answer captions live outside the square photo mask. Removed legacy fixed-height clipping from the outer card: bottom numbering and progress tracks remain visible. Winner tag no longer covers the photo number.
- Preserved actual percentages/counts when selecting a previously revealed answer. Fixed malformed separator characters.
- CSS animations now participate in pause/finish; replay remounts only on an explicit play revision. Host-held story scenes do not complete on the cue timer; advancing cancels the hold.
- Connected native animation snapshots to actual roster and completed-question recap data. Each round starts at its own five-question boundary.
- Added manager-authorized tied-option selection, epoch checking, request deduplication and game-session storage. It is shared with spectators and retained through browser refresh. Like the upstream active game, it is not a durable restartable game session.
- Replaced nonexistent harness card filenames with the authentic SVG names. Capture harness now uses HTTP and rejects broken image loads; structural harness output is not certified visual parity.
- Withdrew the old 1:1/PASS claims. Authentic source hashes are in SOURCE_ASSET_AUDIT.json; the historical implementation asset table is not authoritative.

## Upstream hooks

`packages/socket/src/services/game/index.ts`: delegate public roster status, provide round-specific recap to animation scenes, include recap counters and import its existing result type. No phone numbers are put on the public stage.

`packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`: suppress the generic full-show overlay and patch live data without replaying the whole scene on a roster/choice change.

`packages/web/src/features/game/components/ManagerControlToolbar.tsx`: existing shared Button controls submit tied answer indices through the authenticated extension command path.

## Verification

- 472/472 existing extension tests rerun after implementation changes.
- Added and passed a focused tie authorization/snapshot/retry test.
- Web TypeScript check and Web/socket production builds pass.
- A real-server Chromium run passed all ten votes, both rounds, two story assemblies, held story scenes, spectator refresh and curtain finale (3.8 minutes). It recorded real host and spectator video, not a static harness.
- Expanded run additionally covers 75/25 distributions and a 50/50 tie resolved by the host, with spectator refresh. Its final outcome is recorded below after execution.
- Candidate server: exact Web index and 13 public assets fetched with SHA-256 equality; health endpoint returns 200.
- Exact per-scene pixel/motion equivalence, real PSTN calls and physical iPad hardware are not certified by these checks.

## Deployment

Candidate image: `tadazz:next-20261106`, derived from the currently deployed runtime image with tested Web/socket build artifacts copied in. Environment variables and config mount are preserved without printing credentials.

Previous container and a config backup are retained under `/opt/tadazz-releases/next-20261106/`; activation rolls back automatically if the health check fails. The existing show is preserved; a separate Next show can be created from its ten questions and original media.

Final expanded acceptance and production activation: PENDING.
