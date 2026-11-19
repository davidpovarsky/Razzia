# MCP question phase continuity â€” 2026-11-19

**Verified: 8/8 focused browser cases and 1/1 targeted projection regression.** Chromium/Edge and WebKit each passed Tadazz Classic and Razzia Original with normal and reduced motion.

## What changed

- Removed the native child keys tied to chapter/phase-clock epoch. The existing parent boundary still resets for draft revision, a new question, or explicit Replay.
- Passed verified native `source.defaults.stageAnimations` into the existing canonical resolver. This fixes the missing inheritance discovered by the normal-motion prerequisite. Raw per-card appearance remains forbidden by the existing authoring policy.
- Added the scoped `phase-continuity` diagnostic and a projection regression in `selection.nodecheck.ts`. Shared stage changes are documented by the shared-stage worker.

## What the browser proves

A single widget document follows real automatic question â†’ voting, local keyboard choice, and real `preview_show` results. Both normal-motion themes record one initial question entrance and five first answer entrances. The question and existing answer DOM nodes remain unchanged through choice/reveal, with no additional entrance calls/events. A second flow pauses before choice/reveal and proves the same continuity. Replay, Next and Previous create a fresh question; phase clocks continue to reset independently. All five result counts stay zero and draft content/revision remain unchanged.

The probe forwards native WAAPI calls unchanged and listens to genuine CSS `animationstart` inside the shadow root. It neither changes timing nor finishes animations. Screenshots were captured; Classic answers and Original results were visually reviewed.

Direct browser tool chapters are question, voting and results. The actual native answer entrance is measured inside the timed question-to-voting transition. The separate node regression projects all five chapters (question, answerCards, voting, voteLocked, results) and verifies inherited presets. This diagnostic does not claim repeated host tool-input support or live ChatGPT installation qualification. The one-input AppBridge lifecycle stays unchanged.

## Evidence

| Run | Cases | Result | Source integrity |
| --- | ---: | --- | --- |
| chromium-final | 4 | PASS | unchanged |
| webkit-final | 4 | PASS | unchanged |

- `chromium-final/receipt.json` and `webkit-final/receipt.json`: actual SDK/AppBridge receipts, browser versions, CSP/network events and host lifecycle drains.
- `*-phase-continuity.json`: 13 per-case snapshots with actual DOM IDs, phase epochs and entrance counters.
- `trusted-animation-inheritance-test.json` / `.log`: actual issuer/repository projection test; 1 passed.
- `widget-build.json` / `widget-inputs.json`: 2,694 physical modules; no product modules resolved outside this worktree.
- `handoff.json`: complete source hashes, audit hashes, summaries and cleanup evidence.
- `pre-fix-static-evidence.json`: exact original phase-dependent child keys and shared inner epoch; no pre-fix browser run is claimed.

## Preserved failed attempts

`chromium-1` stopped at fixture creation because raw per-card animation fields were correctly denied. The fixture moved appearance into existing host-owned trusted defaults without changing the policy. `chromium-2` passed 3 cases and exposed an actual missing-defaults projection bug: Original normal motion had zero initial entrances. The narrow server fix restored inheritance, then the final 8 cases passed with genuine normal-motion entrances.

## Frozen artifact

- Widget SHA-256: `b291d6202ec7cc237f30e3c6b9acf887646f426b9718a90fe634324c72aeb573`
- Renderer build ID: `fe84b1cab9c3d480c68fe93cec23c241475c55e8d14191b76d5b77804cfde27e`
- Physical input receipt SHA-256: `953dae09ca8c4743826e3dc8a675fc5c999d14c0523ba6215abfab4521cc2289`

## Owned source/QA hashes

| File | SHA-256 |
| --- | --- |
| `extensions/src/mcp-app/widget/full-show-demo-question.tsx` | `03b0c4794bf9c2f12581177fdbb91d5355a76655068535264717aa9b9cf933d9` |
| `extensions/src/mcp-app/server/full-show-frame.ts` | `4328c6e82c21d515107acd6131134387114bd19ee6260c66290ed00f53915b49` |
| `extensions/qa/phase3-full-show/phase-continuity.mjs` | `de4511fbea48cf02cd43052889634d00a8f47d2a20192504b8a20ca7041400d2` |
| `extensions/qa/phase3-full-show/browser-verify.mjs` | `4dcb60dde9db58dd19db2e039875f77f75e886fa7475142a581739b4f791f090` |
| `extensions/qa/phase3-full-show/selection.nodecheck.ts` | `6746137fa0a6653967767c541f1204d1605661e5fc510892bf114325937ebcee` |

Both browser runners exited successfully after awaited browser/context closure, host lifecycle drain and loopback HTTP shutdown. No customer data, live votes, production service, or deployment was changed by this worker.

Reproduce with Node 24 and the existing installed dependencies: set `TADAZZ_FULL_SHOW_DIAGNOSTIC=phase-continuity`, `TADAZZ_FULL_SHOW_BROWSERS=chromium,webkit`, and an evidence directory, then run `node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/phase3-full-show/browser-verify.mjs`.

The full browser qualification and deployment remain parent-owned release gates.

The focused runs were executed from baseline HEAD `34a9e0a59482fa035ab98338f7c977589e46287d` with the recorded working source bytes. Root subsequently bound the identical reviewed source freeze to commit `33b35be347c46ec012a28a800ed1b7504096b294` in its source-commit receipt. Historical run/artifact hashes remain unchanged; later native pin generation is a separate parent-owned release step.
