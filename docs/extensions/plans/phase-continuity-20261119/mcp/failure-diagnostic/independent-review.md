# Independent review of failed Linux WebKit qualification

This is a bounded diagnosis and evidence record, not a release qualification. Product source is `33b35be347c46ec012a28a800ed1b7504096b294`; its pinned release candidate is `730cb4579d22589e1a7fc96a6873df9cb273e479`. Earlier focused continuity and GGO passes remain separate evidence. The complete Linux full-show gate failed, and the subsequent six-check failure-state diagnostic had five failures and one pass. The diagnostic coordinator completed and verified its integrity; its zero coordinator exit does not mean the browser checks passed. No product was deployed by this diagnostic.

## Preserved runs

- Full qualification failure: `tadazz-codex-fullshow-730cb4579d22-1587d04d`. The separately collected browser receipt, browser logs and resource evidence are under `../../qualification-failure-730cb4579d22/`. Its original controller logs remain in the phase3 takeover directory.
- Focused failure-state diagnostic: `tadazz-phase-continuity-diagnostic-730cb4579d22-12eccf07`. Its directory preserves the exact executed QA overlay, input metadata, coordinator receipt, native browser receipt, five failure-state JSON/PNG pairs, a separate intermediate picture screenshot, browser logs and resource evidence. `collection.json` binds copied remote bytes by SHA-256.
- `source-provenance.json` distinguishes committed product files, mutable current QA source, and the exact executed overlay. `../../release-tools/diagnostic-copy-provenance.json` binds the helper and helper-provenance copies by source-before/copy/source-after hashes. No helper was executed during curation.

## Findings supported by the existing captures

The original Razzia first-check failure was an exact results-chapter visibility wait. The initial response completed at 17:51:28.569 UTC; the only later tool call before failure was optional summary discovery, lasting 10.552 seconds. No phase-advance request preceded the failure. Results chapters are manual. Therefore this failure must not be described as an autoplay phase race. The optional summary request only discovers the undo operation and does not gate the native stage.

The instrumented Razzia failure reproduced with a summary response below one second and no requests in flight. Its initial acknowledgment was at 18:08:23.889 UTC and its widget capture at 18:08:34.820 UTC. The expected results chapter, question and five answers were present, nonempty and visible. Host and stage were 824 by 643.5 pixels. The host still carried a 1144-pixel inline width measured before the edit panel docked, playback showed elapsed zero while unpaused, and native fitting remained false with its inner canvas still at percentage dimensions. The document reported visible.

The native ShadowRoot already contained the correct complete composition. Thus missing frame data, an API wait or a missing passive root mount does not explain that snapshot. Playback sampling, native fitting and outer resize observation are independent scheduling paths with no shared cancellation or lock. Delayed browser rendering callbacks and delayed React commits remain alternatives; the captures do not distinguish them. The 100 ms whole-editor reconciliation followed by a second React-root update is only a possible contention point, not a proven cause.

Classic also timed out during Playwright actionability checks although its captured pause button was visible, enabled and 40 by 40 pixels. Its later paused snapshot does **not** prove that a timed-out pause click applied late: the subsequent title-edit check focuses the title field, and the widget intentionally pauses playback on title/question focus. The demo clock uses monotonic time; stale DOM elapsed values are sampled presentation state, not proof that its clock owner stopped.

The earlier Classic full-gate timeline separately showed a question advancing while an exact question-readiness wait remained active. That evidence must not be generalized to the manual Razzia results failure. External WebKit issue similarities also do not establish that this project has the same browser defect.

## Limits and next decision

No motion, phase identity, clock, timeout or actionability bypass was changed for this review. The diagnostic used the unchanged built widget, the same 10-second assertion waits, one CPU and a 3 GiB memory limit. Its receipt records unchanged source/widget/dependency hashes, unchanged production, no customer-mount access, no OOM, and cleanup of only the owned diagnostic container.

The next approved heartbeat investigation must distinguish native animation-frame callback progress from timer/React-commit progress before selecting a product or QA-environment correction. This report intentionally does not incorporate unfinished heartbeat results.

## Curation and privacy scope

Original evidence remains unchanged. Only scoped reports, source overlays/helpers, receipts, logs and synthetic screenshots are proposed for the evidence commit. No customer configuration, private-key contents, archives, dependencies or raw provider credentials were copied. Incremental text screening found no unexpected credential/customer patterns; the only email matches were in two already excluded synthetic GGO runner originals. PNG metadata screening found no text/EXIF chunks. Screenshot pixels were not OCR/visually reviewed during curation; their synthetic provenance is recorded, and this is not a blanket privacy guarantee.
