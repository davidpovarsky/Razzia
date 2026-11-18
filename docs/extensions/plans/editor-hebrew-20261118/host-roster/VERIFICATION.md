# Host roster localization follow-up

## Result

The actual HostPlayersModal now uses the existing nine-language roster dictionaries for import headings, valid/error statuses, counts, fatal parser errors and form/API validation. Errors are stored as keys and resolved at render time, so an already visible error changes when the language changes. Unknown backend detail falls back to a localized safe message.

The modal binds its existing platform theme to the active language direction. This preserves the inherited appearance and token overrides while correcting the bare legacy host-shell portal, whose default platform context previously forced LTR. Tables and action/search/close alignment use logical spacing; full phone values retain LTR. At narrow widths the modal scrolls vertically and keeps a usable table height, so the participant rows remain reachable.

This is a follow-up to foundation af1d879431d3461c7f937a6c5f580eee97b073e2 in the isolated `codex/tadazz-host-roster-hebrew-20261118-ready` worktree. No locale dictionaries, parser, server authorization, roster API contract or saved customer data changed.

## Evidence

- `receipt.json`: 13 actual Edge browser checks PASS, zero page errors, ten screenshots. Actual component, React/Radix, application CSS/i18n and CSV parser were used. Synthetic presence and intercepted HTTP are explicit; this is not a live-room/backend privacy test.
- Actual empty-name and invalid-phone errors; runtime language changes across all nine languages; no-match search; invalid CSV row headings/status/counts; missing-header fatal error; valid preview; zero updates before approval and one explicit intercepted PUT after approval.
- Hebrew RTL and LTR phone isolation; desktop1440 and mobile390/320. Mobile rows have218px table height and remain reachable inside the modal. Horizontal table scrolling remains intentional for the private detailed roster.
- `../host-roster-tests.log`:10/10 tests use actual parser errors and all nine real locale resource sets, including fallback and language-change behavior.
- `../host-roster-gates.json`: actual web tsconfig.app.json no-emit typecheck, typed lint, formatting and focused tests all exit0 on final source. `source-hashes.json` binds the three production/test files.

The desktop, invalid-import and mobile320 screenshots were visually inspected. That inspection caught a vertical overflow missed by the initial horizontal-only check; final verification adds actual row reachability. `before-direction.json/png` and `before-mobile-scroll.json/png` preserve the intermediate failures/partial observation. The initial wrong Vite binary path, fixture module outside the web workspace and load-event timeout were harness setup issues, retained separately. The final harness waits for DOM content and actual component assertions.

## Reproduce

Use the normal repository Node24/pnpm installation. Copy this directory's `fixture.tsx` to `packages/web/host-roster-proof.tsx`, and `fixture.html` to `packages/web/host-roster-proof.html` in an isolated checkout. From packages/web start its installed Vite executable with `--host127.0.0.1 --port3186 --strictPort` (use normal separated CLI arguments). Run `node docs/extensions/plans/editor-hebrew-20261118/host-roster/browser.mjs`; it uses installed Microsoft Edge through the existing Playwright package. The two copied web entry files are temporary QA files and are not part of the application delivery.

Only synthetic names and reserved example phone numbers are in these fixtures/receipts. The coordinator owns integration, release pins and deployment. A narrow UI change is not a claim that historical physical-phone, projector or parser-policy gates are complete.
