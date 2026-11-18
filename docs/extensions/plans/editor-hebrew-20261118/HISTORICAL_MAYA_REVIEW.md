# Historical Maya integration review — 18 November 2026

Asana review leaf: 1219846276842840. This is a code-review completion, not retrospective certification that every behavior of the old commit was correct.

## Actual deliverable and ownership

The requested commit 1f761205c76885a5a5de9eaf6b8bc19bf19636c0 changes one line in the handoff. It identifies implementation commit 7b004b5e1544fd4eb96fb1f2ec4562ce39d05aa8. Both are ancestors of the current editor branch.

The implementation changes 41 paths. Every path is under packages/web/src, extensions/src/editor, media, presentation, locales, or the Maya handoff directory. There are zero backend/socket paths and zero dependency/lockfile changes in that commit. No current or historical backend files were overwritten by this review.

## Reviewed boundaries and findings

- Reviewed the handoff, exact changed-path inventory, web hooks, composite client and header/provider diff, editor identity helpers, reveal media, rich answer cards, interlude state and team scoring.
- The original composite client supported an optional bearer provider, but the header/provider instantiated it without one. Current editor requests supply the existing session token; actual unauthorized denial and authenticated save/reopen are part of the 19-case functional receipt.
- Original conflict Reload changed sidecar state without replacing the form. Current use-composite-quizz-save resets the actual server form and persisted extras baseline. The durable-draft follow-up additionally tests explicit recovery after 409; it is recorded separately when integrated.
- The original provider's independently maintained UUID arrays and asynchronous extras loading required integration scrutiny. The current provider loads stored identity and sidecar state before editing. The retained stable-ID witness records 8/8 current passes against 1/8 for the verbatim later historical provider from 5d94754; it is not misrepresented as a build of 7b004b5.
- Media validation retains safe URL/schema checks and accessible underlying text. Reveal timing and interlude helpers use authoritative timestamps; current visual/browser checks and native renderer fixtures provide their own evidence, rather than relying on handoff assertions.
- Team scoring is a pure projection keyed by stable client identity, including disconnected earned points, deterministic tie ordering and round-robin assignments. This source review does not assert a new live team-game browser test.
- Historical hard-coded English conflict notifications are replaced by current translated notifications and the nine-locale integration.

## Dependencies and current verification

The historical and current web manifests both declare React/ReactDOM ^19.3.0, react-i18next ^17.0.16, i18next through the workspace catalog, and @razzia/extensions as workspace:*. This historical commit does not change Node or React requirements. Current Windows checks explicitly run Node24.22.1; isolated Linux qualification uses Node24.22.2.

Current foundation evidence includes the full web application type check, 384 root tests, 1,428 extension tests, 19 real editor flows, native preview and Hebrew/RTL screenshots. These are current-source receipts, not a rerun of the historical 293-test handoff claim.

## Separate acceptance boundaries

The sibling combined-UI leaf 1219846135684872 asks for save/version conflict, image reveal, audio/interludes, teams/leaderboard and accessibility/locales with server compatibility. It remains separate until each current integrated criterion is reconciled. Completing this review does not close hardware/provider, full-game Preview entry point, or final release/deployment work.

## Evidence

- Original handoff: docs/extensions/orchestration/handoffs/maya/UI.md at 1f76120.
- Current audit: AUDIT_REPORT.md; functional/result.json.
- Current full gates: frozen-source-reconciliation.json and frozen-source-final.json.
- Identity witness: stable-id-witness/result.json.
- Current implementation: use-composite-quizz-save.ts; studio-editor-context.tsx; quizz-editor-context.tsx and use-quizz-extras.ts.
