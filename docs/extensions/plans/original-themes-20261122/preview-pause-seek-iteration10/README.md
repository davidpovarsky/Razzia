# Preview pause and seek diagnostic — iteration 10

Diagnostic only; this is not a release receipt.

Source checkpoint: 6a858c0256ae1f5fc98d67585b7d17ab3513eda0.
Sentinel execution: job_46613a7de977.
Frozen full source: 2678 entries, SHA256 ed5e68935b348086a4929bd8a1735f1777217341886dcbf885b45f6beef934ab.
Observer SHA256: 646c32a11e3c9f820c4464de6391b54757f5a51c5c0d4275569d183758e19afd.

The existing four-case Chromium/WebKit × normal/reduced phase-continuity diagnostic ran without changing cases, assertions or timeouts. Chromium normal and reduced passed. WebKit normal timed out waiting for its initial question snapshot; WebKit reduced preserved question/card identity through voting, selection and genuine zero-vote results, then timed out waiting for its explicit replay question snapshot. Both failure captures show the expected question had progressed to voting. Neither WebKit case reached the paused-path assertions. The raw evidence does not measure document visibility, focus or RAF-ready counts, so no product pause regression or browser-throttling cause is claimed from this run alone.

Source and SDK hashes remained unchanged. The owned container stopped without OOM. Only bounded receipts, plans, logs, source inventories, observation JSON and screenshots are retained; configuration/authentication/runtime temporary data, traces and videos are excluded.
