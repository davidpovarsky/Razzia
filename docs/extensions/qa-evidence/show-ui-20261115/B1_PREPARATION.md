# B1 source preparation — in progress

Initial base: `81d5b8f7c0bd3931982c2b0d5a3a13b86e523a8c` on the assigned
`codex/tadazz-hq-show-ui-20261115` tree. This is not an acceptance report.
Manager fast-forwarded the tree to accepted metadata companion commit
`19a2e83060e78fa4505647b88eca762113cb1ca8`, preserving the untracked UI files.

Source preparation now includes an unconnected isolated-root renderer entry,
native stage/scene adapter, demo clock and per-mounted-stage transition owner,
a deterministic five-question/20-second authored fixture using the existing
producer normalizer, an unavailable platform shell, disabled controls and
eight-locale resources. The owner captures the mounted handle and generation,
guards deferred wipe callbacks, and avoids native `nextQuestion`'s internal
unguarded callback. It does not claim immediate animation cancellation.
No application route, host loader, executable artifact or capability is enabled.

The host mapping now calls the genuine producer projector and verifies the
companion's draft/plan/current-question association before copying ordinal and
total. The current producer still resolves unavailable and has zero executable
pins. The informational metadata does not grant renderer capability.

The renderer entry accepts a current-card-only frame for a future isolated QA
harness. Its structural checks are not genuine producer authorization. A
trusted host must enforce an accepted pin before this port can be connected. The current
unavailable host does not import or mount that candidate entry. The fixture is
based on the existing English synthetic producer fixture and has not been
localized for display. Mapping the fixture to current projected cards remains
unfinished; no duplicate choice-ID allocator was added. The unconnected
`projected-frame.ts` now asserts the producer's actual bound metadata association.

Renderer instance identity excludes card and phase; the same handle is intended
to receive guarded native wipes across questions. Paused reconstruction uses the
actual `collapseForResume`, the native reduced-motion prop, and explicit native
answer-card/locked steps. A timed-vote reconstruction starts the native countdown,
waits for its render, re-anchors it and pauses it. Those scheduling assumptions
and visible output require real browser evidence; no instant-paint or exact
pause-time claim is established by source inspection.

Invalidation precedes our calls to `finishAnimations` and disposal, and our
deferred wipe callbacks check the captured generation. This cannot cancel code
already executing inside native methods: `lockVoting` can finish animations and
resume after its own 120ms timeout, and a native play/wipe may already have
emitted local cues. The forwarding wrapper cannot interpose inside those native
closures. No global-cue or immediate-cancellation guarantee is claimed; require
browser race evidence and, if it fails, an independently approved native seam.

Static closure inspection found adapter imports of native motion and adaptation
CSS, V4 full-show, source-layout and stage CSS, plus reference-story components.
These contain root-relative image references, including `/tadazz-show/motion/`
and `/tadazz-show/v4/`; native markup also references the product logo and other
show assets. Rubik/font delivery and all transitive CSS/JS/assets require an
actual emitted dependency index, byte hashes, licensing and runtime request
proof. The candidate Vite config disables `publicDir` and does not silently copy
or rewrite those resources. It is unrun and cannot establish closure or SRI.
The bridge-plan SHA-256 was independently read as
`283f7f3c1be2925354533d87d516fc08992d2b5c5f135358c235a092dc7afa2b`.

Local `node extensions/qa/tds-boundary.mjs` failed: it reported 23 existing
show-library paths from the accepted base and both new preview paths as denied;
its `mismatches` array was empty. This is not a passing freeze guard. No
typecheck, build, browser, `ui:check`, server run, or behavioral test was run.
Seven focused candidate tests were authored for clock continuity, wall deadline,
early/visual input denial, stale wipe callbacks, same-owner question transitions,
paused non-voting plans and copied metadata rejection; none has been executed.
Static inspection confirmed that all 23 native V4 label keys used from the
existing extension translations occur in each of the eight locale files; this
is not rendered-language or translation-quality verification.
All candidate code, ShadowRoot/CSS, lifecycle, timebase, fixture localization,
producer integration, locale behavior and artifact closure remain subject to
implementation review and independent server verification. Paused first-mount
voting/results and q1→q2 must be demonstrated in an actual browser, not inferred
from the authored tests or code.
