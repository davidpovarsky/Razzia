# d095 private browser startup failure

The approved network-disabled server run tested d095 renderer bytes with QA
harness `0a1760e33b366069228daefb1d9dd326ea9677ed`. The first Playwright launch
failed before discovery because the QA harness used named exports from a
CommonJS entry; the harness was corrected and its scoped TypeScript check passed.
The next run discovered 23 cases. Eight manager-locale cases failed waiting
for `data-qa-ready`, one spectator case was interrupted, and 14 did not run.
It was stopped on the manager's instruction; raw Playwright exit was 130.

An independent Chromium diagnostic saw HTTP 200 for the exact checked page,
harness, CSS and renderer bytes, then `ReferenceError: process is not defined`
at `renderer.js:1329:14` and `renderer.js:22384:10`. The page never reached
ready. The emitted library contains 12 `process.env.NODE_ENV` references; this
is a renderer build defect, not a proven native stage behavior or an SRI pass.
No fake browser `process` global was supplied. The renderer Vite configuration
now explicitly sets the production environment expression for the separate
downstream library build; this is a new candidate requiring new emitted bytes,
hashes and tests. It does not edit protected source or register a pin.

In the same isolated Chromium, an independent decode fetched the five allowed
private-fixture images and `createImageBitmap` reported four WebP 1920×1080
images and one PNG 1983×793. The source/baseline, 42 d095 overlay hashes, six
final QA source hashes and eight fixture file hashes/modes matched afterward.
The prior browser run is not a pass; native rendering, lifecycle and loader
acceptance remain unproven. Image redistribution rights remain unknown.
