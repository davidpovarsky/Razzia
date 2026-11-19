# WebKit qualification scheduling diagnosis

Date: 2026-11-19 (UTC)

## Decision

Keep the product source and built widget unchanged. The instrumented failures demonstrate that native browser animation-frame callbacks stopped in both the plain host document and the widget iframe during Playwright's stability wait. The native scene had already committed. Changing the React renderer, forcing clicks, replacing animation callbacks, or increasing assertion timeouts is not supported by this evidence.

The independent resource audit identified all owned Node/WebKit processes pinned to CPU 0 with nice 19 while CPU 0 was saturated and CPU 1 was mostly idle. The proposed next action is a same-source full qualification with only the external CPU-affinity pin removed. This diagnosis does not itself qualify a release.

## Fixed input and retained history

- Product commit: `730cb4579d22589e1a7fc96a6873df9cb273e479`.
- Widget SHA-256: `b104367d1f9742e3e8b6f12d24391648b8bf92a72dee4f6d1c074a193c6397f6`.
- Renderer build: `0c47e5ee4b577fb127e31e89662c6bbe6b2be95c999a6e7698cd4e7cf9060a80`.
- Original failed qualification: `tadazz-codex-fullshow-730cb4579d22-1587d04d`; 28 checks passed, 12 reported failures comprised three primary timeouts and nine dependent setup failures.
- First failure-state diagnostic: `tadazz-phase-continuity-diagnostic-730cb4579d22-12eccf07`; one pass, five failures. The Original semantic workflow reached revision 8 after reconnect undo and both text/picture selection/reveal/reset passed; its failure moved to screenshot/image scrolling stability.
- Discriminating scheduling diagnostic: `tadazz-phase-continuity-scheduling-730cb4579d22-56930064`; both theme cases timed out waiting for an ordinary pause-button click to become stable. Runtime was approximately 64 seconds.

The diagnostics used the real issuer, MCP client, AppBridge, widget and native renderers. All original 10-second action/assertion waits remained unchanged. No forced input, clock advance, animation stub, geometry mutation, alternate renderer or production account was used.

## Observed scheduling distinction

| Observation | Tadazz Classic | Razzia Original |
| --- | --- | --- |
| Last native RAF in both host and widget | 18:22:46.187Z | 18:23:12.021Z |
| Native RAF age at failure snapshot | Widget 9,998 ms; host 10,103 ms | Widget 9,784 ms; host 9,875 ms |
| Native RAF age at completion snapshot | Widget 12,183 ms; host 12,238 ms | Widget 11,476 ms; host 11,563 ms |
| Native timer behavior during failure interval | Timers continued; latest callbacks 85/76 ms old at capture | Both documents also recorded a roughly 9.7-second timer gap, then resumed |
| Native scene commit evidence | Committed at 18:22:46.260Z, 73 ms after the final RAF | Initial scene committed before the stall; a queued update committed at 18:23:21.646Z after timers resumed |
| Visibility | Both documents visible; no visibility changes | Both documents visible; no visibility changes |
| Input delivery | No pause pointerdown/up/click events reached the button | No pause pointerdown/up/click events reached the button |

Both cases had the expected manual results chapter and native question/answer content. The Classic stage was ready and visible. The Original viewport's fit work remained unfinished as frame delivery stalled. The plain host document has no native React scene, yet its RAF stream stopped at the identical wall-clock instant as the widget. A React-only remount or delayed initial native-root commit therefore cannot explain the observed pause failures.

The first diagnostic also captured Original's expected, visible results scene with elapsed time 0, fit-ready false, and stale inline dimensions after the workspace dock changed. Its optional summary request completed in under one second in that run. This excludes a consistently slow summary response as the direct gate for the initial native scene.

## Resource correlation and limits

The independently curated scheduling sidecar records CPU 0 at 100% busy while CPU 1 remained approximately 89–100% idle during the Classic stall. Owned QA used approximately half a CPU with substantial CPU pressure. Cgroup quota-throttling and OOM counters stayed zero. All owned browser and Node affinity masks were CPU 0, with nice 19. Browser stderr showed normal exit and no reported GPU-process death.

These facts support removing the unnecessary external affinity constraint while preserving the one-CPU quota, memory/PID limits, nice level, isolation, pinned input, assertions and timeouts. They do not prove a specific upstream WebKit bug, and they do not authorize skipping WebKit or treating diagnostic failures as passes.

Evidence is retained in [the scheduling run directory](tadazz-phase-continuity-scheduling-730cb4579d22-56930064/), including `browser-resource-evidence.json`, `scheduling-host-samples.jsonl`, `browser.stderr.log`, `collection.json`, and the four JSON/PNG capture pairs in `full-show/`.

## Source restoration

The only temporary source modification was QA instrumentation in `extensions/qa/phase3-full-show/browser-verify.mjs`. Its final diagnostic bytes are preserved as [scheduling-browser-verify.mjs](scheduling-browser-verify.mjs), SHA-256 `16e47f76b66b0275a85e0d6d3515ddb07272b60e8df1ade1144ccfe6a0912579`.

The file was restored byte-for-byte from commit 730cb457 to SHA-256 `4dcb60dde9db58dd19db2e039875f77f75e886fa7475142a581739b4f791f090`. Tracked staged and unstaged diffs were empty afterward. [source-restoration.json](source-restoration.json) records that verification. Earlier overlay diffs, hashes, captured results and failed gate history remain preserved.

No product source or built widget changed during this diagnosis.
