# Foreground continuity diagnostic — iteration 10

Diagnostic overlay result only; this is not a canonical final-source release receipt.

Source checkpoint: 6a858c0256ae1f5fc98d67585b7d17ab3513eda0.
Sentinel execution: job_4cb4bc2c89c4.
Frozen full source: 2678 entries, SHA256 ed5e68935b348086a4929bd8a1735f1777217341886dcbf885b45f6beef934ab.
Original helper SHA256: 646c32a11e3c9f820c4464de6391b54757f5a51c5c0d4275569d183758e19afd.
Candidate foreground helper SHA256: 81ed57f7368c301b61f8e4b06e603f2290a6f97b90e9beb275d873a537a43114.
Separately formatted passive telemetry overlay SHA256: 9420f3d09d12fa158b4193e2f6b1a971aaf0adea6a9364c953656cf8ea8e03ee.

All four existing Chromium/WebKit by normal/reduced motion cases passed in 107.61 seconds. Every case reached all 13 checkpoints, retaining the original assertions, three matching RAF polls, clocks and timeouts. The candidate helper differs from the original by exactly nine page.bringToFront calls before navigation and existing phase actions. There are no extra iframe clicks or synthetic gestures. The read-only telemetry overlay records bounded top/child focus/visibility and child RAF readiness/animation observations separately from the source helper.

Causal limit: WebKit normal still recorded a 4641 ms initial RAF gap with the top document visible and focused. Its initial polls occurred at 2284 ms (entrance running), then 6925, 7458 and 7691 ms (three ready observations before voting). This passed run does not establish that foreground handling restored normal RAF cadence or fully explains the prior miss. The prior sparse-poll failures remain preserved independently. No product playback change or weakened assertion is justified by these observations.

The original source/build tree, SDK and both input modules remained unchanged. The runtime and formatter containers stopped without OOM. Evidence and formatter inputs were created outside preflight, so later source relocation does not affect this diagnostic. Only bounded receipts, plans, logs, inventories, QA modules, observation JSON and screenshots are retained. Configuration/authentication/runtime temporary data, traces and videos are excluded.
