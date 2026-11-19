# Phase continuity release plan — prepared for coordinator execution

Status: prepared only. No cache start/restore, qualification, staging, deployment, Git operation, or product edit was performed by the release reviewer. Helper outer Python and embedded remote Python have been syntax-compiled without execution.

## Scope and source identity

The preparation baseline is 34a9e0a59482fa035ab98338f7c977589e46287d on codex/tadazz-ux-unified-20261119. It includes the accepted prior source and the latest public Great Guess-Off change 6b973ecffac2d075268dad08627a59e680e8eb66. The phase-continuity product changes and native-renderer manifest must be frozen and committed before exact-source qualification.

Production was observed read-only at 2026-11-19T16:50:29Z. The sanitized receipt is production-baseline-20261119T165029Z.json in this directory. The prepared helpers pin app 090d26a2… / image 56de89dd…, gateway c29ea46f…, and runtime SHA 6524e1e0…. They abort if that baseline changes. A newer parallel release must be reconciled explicitly, never overwritten by adjusting assertions silently.

The previous package-worker repair is preserved: unit 7bfd2b44…, broker 7b591a69…, image 4ef04ef7…, timer active/enabled, latest service result success/0. Cache preparation, stage, each deployment action, and final observation check these same facts. A timer activation in progress is allowed; the worker does not need to be idle.

## Prepared helpers

All helpers are in work/phase-continuity-20261119/release-tools. helper-provenance.json records exact original and prepared SHA256 values.

- prepare_qa_cache.py: new bounded coordinator for the existing exact offline cache.
- qualify_current_candidate.py: archived same-source four-gate coordinator, new evidence namespace only.
- stage_current_candidate.py: same qualification checks, new evidence namespace, fresh app pins, worker checks and end-state checks.
- deploy_current_candidate.py: same-source deployment coordinator, new evidence namespace and worker checks.
- observe_current_candidate.py: same observer, new evidence namespace and worker checks.

The deploy helper retains its existing SIGTERM timeout and rollback grace. It never sends SIGKILL. The special prior deploy_current_candidate_with_tool.py is intentionally not used: the repaired deployment verifier is now included in the selected source, so a separate tool revision is unnecessary.

## Execution order

1. Complete the focused real AppBridge continuity regression and canonical current public GGO CTA smoke on current source. Verify both normal/reduced motion and paused/playing phase behavior in the MCP regression. Do not substitute cold per-phase screenshots for continuity evidence.
2. Commit product and focused QA changes. Restore the exact cache with prepare_qa_cache.py. This may also be prepared before the commit because it does not edit product source.
3. Run extensions/qa/editor-hebrew/generate-native-pins.py from clean committed product source. It builds native renderer artifacts offline and changes only application-preview-build.json. Commit that generated manifest. This preparation receipt is not release qualification.
4. Fill the real parent-directory current-release-source.json with the final 40-character source SHA. A template is supplied here; no source SHA has been invented.
5. Run qualify_current_candidate.py FINAL_SOURCE_SHA once. The existing sequence remains native-launch, native-consent, full-show, immutable proxy. Preserve all failures and their exact run IDs. Full-show remains 40 checks/44 fixtures on Chromium and WebKit; no gate count or resource limit was weakened.
6. On pass, run stage_current_candidate.py. It verifies exact receipts/committed tool hashes, stops only the known QA cache, requires a fresh SHA-named release directory, and checks unchanged production/gateway/runtime/worker afterward.
7. Run deploy_current_candidate.py preflight, then deploy_current_candidate.py qualify-backup. The latter includes the existing candidate-boot qualification. Obtain the exact qualification receipt path and SHA256 from that actual result.
8. Run deploy_current_candidate.py deploy RECEIPT_PATH RECEIPT_SHA256. Do not infer success from a timeout; inspect the guarded process and rollback state if indicated.
9. Run observe_current_candidate.py. It checks the installed image and stable health, retains the old container, verifies runtime and gateway identity and worker preservation, and records public-route probes.
10. Verify the deployed fresh MCP artifact in the actual connector/native host and close the existing Asana bug only after the result is demonstrated. Do not claim the read-only route observer is a visual production check.

## Cache precondition

The only accepted source is the existing c4125d58a746-8e0c29d3/mcp-deps snapshot under the known QA evidence directory. Canonical manifest includes 2,042 file/symlink entries, including 97 literal symlinks; regular-file bytes 63,587,810; manifest SHA 0d1e3e9c089b66a75ff0e6b284f58b94ddb4e4b47b55129d82865980f62d67de; SDK server/client/core 2.4.0. Directory entries are excluded. No installs or downloads occur.

The helper starts only the exact isolated QA container. The fixed /tmp/phase3-999ed90c/deps target must be absent, empty, or already byte-for-byte identical. A fresh task-owned staging directory is verified before atomic placement. Unexpected contents are preserved and fail the precondition. On a failure, inspect the recorded state; the helper does not delete unknown contents or stop a cache another QA run may use. On success, the cache remains running for pins/gates and staging restores its stopped state.

## Existing public GGO fixture

Use the current checkout's extensions/qa/billing-public.vite.config.ts, which composes the production site and allows the real dependency/Rubik paths. The previous launcher work/ux-followup-20261119/billing/run-public-browser.py documents the exact Node/Vite command and isolation. Reuse the site portion with a fresh owned loopback port, a synthetic CONFIG_PATH and TADAZZ_SITE_ENABLED=true; no production account/session or provider configuration is needed.

Node path: C:\Users\DAVID\.local\tools\node-v24.22.1-win-x64\node.exe.
Site command from packages/web: node --experimental-strip-types node_modules/vite/bin/vite.js --config ../../extensions/qa/billing-public.vite.config.ts --host 127.0.0.1 --port PORT --strictPort.
Run extensions/qa/phase2/great-guessoff-cta-balanced-results.smoke.mjs with GGO_PREVIEW_ORIGIN set to the owned port and GGO_CHROME_PATH set to the known installed browser. Choose a fresh evidence working directory: the smoke writes relative qa/phase2 screenshots.

The older visible-results-no-repeat smoke has stale layout expectations after 6b: it requires a visible winner-tag and label>=32px, while the current CTA smoke requires zero visible winner tags and 28–34px labels. If reused, update only those superseded assertions while retaining its transition checks. Do not misdiagnose that expected assertion conflict as a new product regression.

## Remaining gates and limits

The helpers are prepared, not executed or release-qualified. The production observation is time-stamped, not an assertion that live state can never change. Root owns final source freeze, cache execution, qualification, deployment, browser proof, and Asana updates. This release review did not access secrets, customer records, or provider configuration values.
