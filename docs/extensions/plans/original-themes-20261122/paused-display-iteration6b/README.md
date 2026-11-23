# Paused results late-display diagnostic — iteration 6b

This is a failed diagnostic on the isolated Oracle preflight candidate. It is
not a release or deployment acceptance receipt.

Sentinel job: job_9a836784487e. Duration: 68.43 seconds. Browser exit: 1.
Four of five checks passed. The failing check is paused final-results and
finite scene-time stability on a newly opened normal-motion Royal display.

The host accepted exactly one real player answer. Expected percentages were
100/0. At results commit the 100% answer still had hidden 0% text. After two
settling frames, finite result/card/winner animations continued running while
the live game remained paused. At the end of 47 observed frames over 803.8 ms,
the first result was visibly 97%. The later screenshot already shows 100%
because those effects continued advancing while paused.

Resume followed by question 2 passed with positive motion observed on the
new question heading/frame. No browser errors occurred.

The source tree's 2,676 entries, the SDK cache, and the probe all matched their
before/after hashes. The source and caches were mounted read-only, networking
was disabled, and the owned container was stopped in the controller finally.
No production or customer mount was used.

The copied evidence is restricted to the diagnostic module, raw browser and
controller receipts, execution/mount plans, source hashes, and screenshots.
No runtime account/config/auth temporary data is included.

Full source tree digest:
346f3091f08d6ccf1df18fbf3225234ee0566abd6cd7ee84473129c8a67d2baf

The strict same diagnostic must pass after the live-only repair, alongside
the existing preview pause/seek regression gate.
