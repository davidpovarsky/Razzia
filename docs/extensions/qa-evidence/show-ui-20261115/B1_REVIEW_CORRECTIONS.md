# Review corrections — source candidate, not acceptance

The independent review of `21ba62b854d3e54733c746c8b9e4874a97b385e8`
(`SHOW_UI_21ba_REVIEW_20261115.md`, SHA-256
`6e5d26eda54547bc45f2ab7f750cba80293fc45c04b152e0a02adae698fad11f`)
requested four corrections. This follow-up changes only owned preview source
and its focused tests; the earlier B1 receipt describes `21ba`, not this diff.

* Results use the already verified binding clock after the genuine projector
  and WeakMap metadata association succeed. The public projection is unchanged.
* The guarded wipe captures and awaits the actual covered entrance separately;
  current failures propagate. A missing current cover fails closed.
* Semantic or pause changes invalidate prior work before native finish. The
  voting deadline is recomputed from the latest clock at native invocation.
* Native lock and wipe/covered entrance operations are tracked. New requests
  drain those operations and only the latest request proceeds; the surface is
  hidden while superseded unsafe work drains or a paused state reconstructs.
  A countdown is not queued as an unsafe operation. Only this bridge's six
  supported stage operations are admitted.

These are source-level changes, not proof of native interruption safety. Native
methods can mutate after an internal await; our wrapper cannot revoke those
closures. A pending native animation started after finish could delay draining,
and the two-frame paused-countdown reconstruction is not a native commit ACK.
Browser witnesses must check lock and wipe overlap, rapid supersession, pause
before first paint, already-visible pause, resume deadline, q1→q2 handle identity,
and late disposal. If composition fails, capture the actual race before seeking
the review's narrowly proposed adapter seam; none is authorized or edited here.

Focused tests were authored for genuine paused results and invalid bindings,
non-awaiting covered wipes and rejection, voting re-anchor, and lock/latest-frame
serialization. They have **not** been run. No server build, browser, artifact
index, pin, activation or typecheck was run. The available `torah-social` device
was not established as the assigned Tadazz server; its Docker socket denied
read-only access. The server target, fixture paths and permitted capped runner
remain necessary for B2. No fallback or privilege bypass was attempted.
