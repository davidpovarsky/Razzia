# Phase 3 Unit B — Widget Preview SDK Roundtrip QA Report

- **Date**: 2026-11-17
- **Base Commit**: `31d09945dc009f3e0ab139df7364572959aca7ae`
- **Branch / Worktree**: `cez/df544d57`
- **Write Scope**: `extensions/src/mcp-app/widget/**`, `extensions/qa/mcp-widget/**`
- **Frozen / Untouched**: `extensions/src/mcp-app/contracts/**`, `extensions/src/mcp-app/server/**`, `extensions/src/mcp-app/client/**`, `extensions/src/core/**`, `extensions/src/presentation/**`, `packages/**`, V1 `PREVIEW_UNAVAILABLE` (`isError: true`), V2 `executableAcceptance: false`, and resource URI `ui://tadazz/quiz-preview/v1.html`.

## 1. TDD Reproduction & Minimal Fixes

1. **Manager Stale-Generation Correction Verified (No Code Change Needed)**:
   - Confirmed in `extensions/qa/mcp-widget/bridge.nodecheck.ts` that `cancelPreview()` already increments `generation` on `controller` `"loading"` transitions (`refresh()` / `update()`) and `preview()` rejects stale responses (`generation !== request`).
2. **Reproduced Defect #1 — Candidate-First State Ordering (`bridge-core.ts`, `controller.ts`)**:
   - **RED failure observed before fix**:
     - `bridge.preview()` and `toolresult` emitted `["unavailable", "candidate"]` instead of `["candidate"]` (because `controller.receivePreview(result)` ran before `consumer.receive(ticket, result)`).
     - A V1 `rendererStatus: "ready"` response with an attached consumer was overwritten to `"unavailable"` because `consumer.receive` invoked `onUnavailable()` synchronously after `controller.receivePreview(result)`.
   - **Minimal fix**: Extracted `bridge-core.ts` (keeping `bridge.ts` as the production wrapper around `mountCompositionPreviewCandidateV2`) and added `applyPreviewResult()` with a synchronous `receivingCandidate` guard around `consumer.receive(ticket, result)` before falling back to `controller.receivePreview(result)`. `WidgetController.candidate()` also clears stale `preview: null` and `currentRevision: undefined`.
3. **Reproduced Defect #2 — Duplicate In-Flight Preview (`bridge-core.ts`, `Widget.tsx`)**:
   - **RED failure observed before fix**: Two concurrent `bridge.preview()` calls cancelled the first request and issued `2` `preview_game` tool calls instead of coalescing to `1`; `Widget.tsx` also left the Preview button enabled while `preview_game` was in flight.
   - **Minimal fix**: Added `inFlightPreview` coalescing keyed by `(draftId, expectedRevision, locale)` and `generation` in `bridge-core.ts` (cleared in `cancelPreview()` and `finally`), plus `previewPending` button disabling in `Widget.tsx` (reset automatically on `selectedDraftId`, `draft.revision`, `context.locale`, or `"loading"` / `"cancelled"` / `"closed"` transitions so concurrent refresh/edit remains responsive).
4. **Host `preview_game` Fixture & Browser Regression Coverage (`server.ts`, `host-entry.tsx`, `browser.mjs`, `inflight-edit.mjs`)**:
   - Added `/qa/retained-tool-packet` and working-tree fallback (when `.git` is absent in tmpfs) in `extensions/qa/mcp-widget/server.ts` serving exact retained `candidate-07` entries.
   - Added `preview_game` handling in `extensions/qa/mcp-widget/host-entry.tsx` using exact retained candidate selection (`?preview=retained`, `isError: true`, `PREVIEW_UNAVAILABLE`, `executableAcceptance: false`, no fabricated acceptance/rights), plus revision-updated candidate witnesses after `update_game_draft` (`expectedRevision === revision`), `holdPreviews`, and `previewMode` (`retained`, `tampered`, `stale`, `unavailable`).
   - Extended `extensions/qa/mcp-widget/browser.mjs` with 5 new real-SDK Preview roundtrip, duplicate-click, Preview-after-edit, concurrent refresh/edit, and adversarial tamper/stale/cancel cases, plus cross-platform Chromium launch (`channel: "msedge"` on `win32` only) and `TADAZZ_WIDGET_EVIDENCE` directory creation in `browser.mjs` and `inflight-edit.mjs`.

## 2. Local Verification (Lightweight Checks Only)

Executed with `C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64/node.exe` (`v24.22.1`) using gitignored worktree junctions to existing `.pnpm` packages (no package installs, no shared graph edits, no local Vite bundle build, no local browser launch):

- `node --import ./extensions/node_modules/tsx/dist/loader.mjs --test extensions/qa/mcp-widget/controller.nodecheck.ts extensions/qa/mcp-widget/bridge.nodecheck.ts` -> **PASS (`20/20`: `13/13` controller + `7/7` bridge)**
- `node node_modules/typescript/lib/tsc.js --noEmit -p extensions/qa/mcp-widget/tsconfig.json` -> **PASS (exit `0`)**
- `node node_modules/typescript/lib/tsc.js --noEmit -p extensions/src/mcp-app/widget/tsconfig.json` -> **PASS (exit `0`)**
- `node --check` on `extensions/qa/mcp-widget/browser.mjs`, `extensions/qa/mcp-widget/inflight-edit.mjs`, `extensions/qa/mcp-widget/packet.mjs`, and `extensions/src/mcp-app/widget/build.mjs` -> **PASS (exit `0`)**
- `node extensions/qa/tds-design-check.mjs` -> **PASS (exit `0`)**

## 3. Remote Build & Browser Verification Commands (Manager Execution Required)

Heavy Vite builds and Playwright Chromium/WebKit suites were **NOT_RUN** locally per remote-admission constraints and must be run by the manager inside `/tmp/phase3-999ed90c/source` on `tadazz-quiz-server` (with existing `/cleanup` dependency graphs and Playwright Chromium `1248` / WebKit `2370` caches, no installs).

### Clean Build Prerequisites

Inside `/tmp/phase3-999ed90c/source`, ensure the existing `/cleanup` dependency graphs are linked/available (read-only reuse, no `pnpm install`):
- `/cleanup/node_modules` -> `node_modules`
- `/cleanup/extensions/node_modules` -> `extensions/node_modules`
- `/cleanup/extensions/src/mcp-app/node_modules` -> `extensions/src/mcp-app/node_modules`
- `/cleanup/packages/web/node_modules` -> `packages/web/node_modules`
- `/cleanup/packages/common/node_modules` -> `packages/common/node_modules`
- Set writable temp evidence directory in tmpfs (e.g. `mkdir -p /tmp/phase3-widget-evidence && export TADAZZ_WIDGET_EVIDENCE=/tmp/phase3-widget-evidence`)

### Executable Commands on Committed Candidate

```bash
# 1. Node unit checks (controller + bridge)
node --import /cleanup/extensions/node_modules/tsx/dist/loader.mjs --test \
  extensions/qa/mcp-widget/controller.nodecheck.ts \
  extensions/qa/mcp-widget/bridge.nodecheck.ts

# 2. Typecheck
node node_modules/typescript/lib/tsc.js --noEmit -p extensions/qa/mcp-widget/tsconfig.json
node node_modules/typescript/lib/tsc.js --noEmit -p extensions/src/mcp-app/widget/tsconfig.json

# 3. Build widget, private fixture, and private host bundles (heavy Vite builds)
node extensions/src/mcp-app/widget/build.mjs
node extensions/src/mcp-app/widget/build.mjs --private-fixture
node extensions/src/mcp-app/widget/build.mjs --private-host

# 4. In-flight edit-loss regression (Chromium + WebKit)
TADAZZ_WIDGET_EVIDENCE=/tmp/phase3-widget-evidence/inflight-chromium \
  node extensions/qa/mcp-widget/inflight-edit.mjs
TADAZZ_WIDGET_BROWSER=webkit TADAZZ_WIDGET_EVIDENCE=/tmp/phase3-widget-evidence/inflight-webkit \
  node extensions/qa/mcp-widget/inflight-edit.mjs

# 5. Full browser regression suite (start loopback server, capture port, run Chromium + WebKit, stop PID)
node --import /cleanup/extensions/node_modules/tsx/dist/loader.mjs extensions/qa/mcp-widget/server.ts > /tmp/widget-srv.log 2>&1 &
SRV_PID=$!
# Read emitted JSON {"port":PORT,...} from /tmp/widget-srv.log, then:
TADAZZ_WIDGET_EVIDENCE=/tmp/phase3-widget-evidence/browser-chromium \
  node extensions/qa/mcp-widget/browser.mjs "http://127.0.0.1:${PORT}"
TADAZZ_WIDGET_BROWSER=webkit TADAZZ_WIDGET_EVIDENCE=/tmp/phase3-widget-evidence/browser-webkit \
  node extensions/qa/mcp-widget/browser.mjs "http://127.0.0.1:${PORT}"
kill "${SRV_PID}"
```
