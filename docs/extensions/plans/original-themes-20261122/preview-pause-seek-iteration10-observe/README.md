# WebKit phase continuity observation — iteration 10

Observation-only diagnostic; this does not replace the original four-case gate and is not a release receipt.

Source checkpoint: 6a858c0256ae1f5fc98d67585b7d17ab3513eda0.
Sentinel execution: job_b7f59edc1fc5.
Frozen full source: 2678 entries, SHA256 ed5e68935b348086a4929bd8a1735f1777217341886dcbf885b45f6beef934ab.
Original observer SHA256: 646c32a11e3c9f820c4464de6391b54757f5a51c5c0d4275569d183758e19afd.
Observation overlay SHA256: 5f9b725164984e90a76fa21ef06a4e50d46a66ef32b3f2ad36e860a9d7e8de73.

The two existing WebKit normal/reduced cases ran with their original actions, clocks, assertions, three matching RAF polls and timeouts. The source tree was unchanged; a separately pinned read-only module overlay added only bounded passive observations. It did not focus the page, finish animations, change playback, add retries, or alter readiness.

WebKit normal failed its initial question snapshot. It received only five RAF predicate polls at 1573, 2082, 7005, 7651 and 10922 ms. The first two observed the real entrance still running. At 7005 ms the question entrance was finished and all conditions matched, producing one ready observation. The next poll followed the genuine transition to voting, so the three-poll readiness reset. The question and renderer identity stayed stable. This establishes a missed transient due to sparse RAF polling, not a permanently unsettled animation or a pause-path failure. The child iframe reported visible and hasFocus=false throughout; top-level focus was not measured, so a browser background/focus cause is not proven.

WebKit reduced passed all 13 checkpoints, including paused answer selection, paused result reveal, paused next question and resume. Its genuine zero-vote and node/entrance continuity assertions remained intact. The separate original four-case run remains Chromium2 PASS/WebKit2 FAIL and is retained in its own evidence directory.

Source, SDK and observation overlay hashes remained unchanged. The owned container stopped without OOM. Only bounded receipts, plans, logs, source inventories, observation module/JSON and screenshots are retained; configuration/authentication/runtime temporary data, traces and videos are excluded.
