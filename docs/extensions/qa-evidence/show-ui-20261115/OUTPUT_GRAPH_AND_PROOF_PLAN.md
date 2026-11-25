# Frozen preview bytes, build graph and remaining proof plan

This is a source/evidence handoff for the private dd3 renderer. It does not
create a complete artifact package, approve a production loader or activate a
pin. Root accepted the prior browser milestone only at its split-run scope.

## Exact output and private fixture

The existing server directory
`/home/ubuntu/tadazz-hq-qa-20261115/evidence/show-ui-dc76-browser-c2/artifact-dd3`
has been write-protected after both owned browser containers were confirmed
exited: directories mode 0555, files mode 0444. Its bytes were rehashed before
the mode change. This is ordinary discretionary permission protection, **not**
an immutable filesystem or protection from a privileged writer. Hash again
before any later use. The separate six-image fixture at
`/home/ubuntu/tadazz-hq-qa-20261115/fixtures/show-ui-dc76-browser-six` was
likewise write-protected: nine verified files and six directories. Its original
before-run modes remain in the earlier receipt; the later mode change was
intentional. Neither directory is a production origin.

| File / exact request | MIME | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `renderer.js` | `text/javascript` | 1,043,685 | `9024a0bef2cfbe3d8868d9fc3c6657269abd84d45c00bee0c95b02934f9763b1` |
| `renderer.css` | `text/css` | 148,376 | `3b220b024863d1e4a58b86b0b14a74e94be7b3da0c07e9921c2fb17430b67064` |
| `/tadazz-show/motion/backdrop.webp` | `image/webp` | 94,502 | `a76a50432f43313d29e78f625302a256e7e7b71db322612c4b66ee3aef0cf37e` |
| `/tadazz-show/second-library/teaser-screen-source.jpg` | `image/jpeg` | 266,631 | `eaef71e6f2b59595eca49a5fb72df70e45f47a80351ea4d35e03d91f28851c17` |
| `/tadazz-show/story/84acdb923677d591.webp` | `image/webp` | 134,540 | `84acdb923677d591d7641d8452eb185aad360b4b990d6e0879905ad0494dbdc6` |
| `/tadazz-show/v4/question-bg.webp` | `image/webp` | 87,904 | `2f6912d851d8600e08d9a47d58e73dd40144fe30a908b82d10b3ba4036554321` |
| `/tadazz-show/v4/show-stage.webp` | `image/webp` | 261,066 | `9f3d1fe8d4458e98441303e728bba996b9a314295bbf5108f581c229f6db2d20` |
| `/tadazz-show/v4/tadazz-brand-logo.png` | `image/png` | 1,976,726 | `e50aaf5f62f60a83b5a84ea1d55a8068c2e754df5c917681da553771756ebabd` |

The six images are separate fixture copies, **not files emitted in the Vite
output directory**. Their tracked Git source paths, exact blob IDs, catalog
refs and unknown-rights assessments are in `private-fixture-resource-inventory.json`
(SHA-256 `df7d3cbce19e3827d89eb433195adf6c9583e66cd462908bfe76187a193049fb`).
The retained fixture also has QA-only `browser.mjs` (2,216 bytes; SHA-256
`8d84a5f2b4bc38d6f4df5143afde9373c7eadd2b1b79d1e43f152281575f6505`).
The Vite diagnostic `.vite/manifest.json` is 292 bytes, SHA-256
`e148449e88c617200fdb1af32d6689761c4c805bc91db4e1955313970f67250f`;
it is not claimed as a runtime dependency. No Rubik font was emitted. The
provisional two-file index SHA is
`38d36c62b57b0e90c00feebebe9c66256a55b60ab617b65632ae1e75f07d586e`;
it is not a ced0/3ceabe6d resource/artifact index and is not a renderer pin.
The 3ceabe6d tagged source-record and trusted rights boundaries were approved
for future core diagnostics; no private-QA grant becomes a rights receipt.

## Reproducible build and actual graph

The exact build source/recipe commit is
`dd3cd1347981ac6fd934f90d870ff57bba82d470`. The renderer entry Git blob is
`248220db357c5c2eb2cfdf1559fdd51921fa8a19`; the actual downstream Vite config
blob is `81ca9f0fe7e6772ff113e73fbd3f80daacd9a0b2` (raw SHA-256
`adcc377795651bda7b5efa286e0c9deedd5215cb050b00312281397cbf8aa355`). The
observation-only graph recipe was `qa-renderer-graph.vite.config.ts` at that
commit, blob `f5c8b64a6ae702c9c96b70279ba586125f5c4b92`, raw SHA-256
`1d1ad37286afb4b5d8194122bef666c02cec1e707559c91c54b96b8dfb2b008d`. A later
type-only correction to that QA recipe was not the recipe used for this build.
The lockfile blob is `b75087466384ce2e404bbd794d985622b51f0ad8`, raw SHA-256
`f2e3f2183bc308e7e113a23f2ae901d98aade9a173c6b16019d014072684b9a0`.
Node 24.22.2, Vite 8.3.4 and the cached ARM64 image identified in
`BROWSER_DD3_RESULTS.md` performed the build. That file records the exact
build and the earlier d095 failure; there was no rebuild in this checkpoint.

The graph was captured from the actual build's `getModuleIds` / `getModuleInfo`
hooks, not inferred from output strings. It has 162 recorded module IDs, zero
dynamic-import edges and raw SHA-256
`bbca71f4a14564980e5f91504a5eaad706995d9e1b4b64c5da13886427fce072`.
The original graph is in `browser-dd3-raw-evidence.zip` and copied unchanged to
`renderer-module-graph-dd3.json`. Among
`core/show-library/**`, its only recorded runtime module is the permitted
`stage-metadata-schema.ts` leaf: `preview-port`, producer `stage-metadata`,
`digest`, compiled preview `manifest` and projector are absent. This is an
actual bundler module graph; it is not proof that every listed module survives
tree shaking or that it is a complete resource-request graph.

The graph also records **different** modules
`core/packages/protocol.ts` and `core/packages/manifest.ts`, reached through
`NativePreviewStage → show-themes/context → core/show-themes/index → definition`.
Those names must not be conflated with the absent Show Library compiled-preview
manifest. `protocol.ts` imports the package digest schema from that separate
manifest. Their presence is an additional core-schema dependency for core/root
review under ced0, not proof of compiled-preview authority and not silently
excluded from the source closure. The graph also includes the Classic and Razzia
theme JSON manifests. The eight runtime file hashes above, full graph, source
identities and real toolchain belong in the proposed revision-2 handoff; package
source and independently trusted rights/dependency receipts remain core-owned.

## Smallest next harness, pending a separate resource grant

1. **Native identity and interruption.** Keep the current real producer,
   stage and private fixture. First add a QA-only wrapper around the existing
   adapter and owner to capture the actual `TadazzStageHandle` returned by its
   React ref and associate it with one mounted owner; exercise q1→q2, delayed
   wipe cover, lock/120-ms supersession, pause before first paint and after
   voting, repeated latest-frame admission, then unmount while pending. Compare
   actual object identity, stage state and late mutations/cues. This separate
   wrapper witnesses the native adapter/owner contract but does not by itself
   prove the private ref inside the shipped `NativePreviewStage` was identical.
   If direct identity within that component is required, propose the smallest
   test-observation seam in owned preview code with a fresh payload/hash; do not
   claim the current DOM-node comparison proves it or add a protected hook.
2. **Paused state and clocks.** Record screenshot, timer text/ring geometry and
   elapsed timestamps over a real pause longer than the voting remainder, then
   resume with a freshly bound clock. Capture phase/card, visible state and
   callback generation at each boundary; fail on blank first paint, old card
   repaint, stale deadline, wrong result visibility or late activity after
   disposal. Retain failed witnesses; an adapter seam is considered only after
   a real native overlap failure proves the downstream composition insufficient.
3. **Console, CSP and resource observation.** Correct the QA reporter to write
   bounded attachment bytes to unique files instead of in-memory bodies discarded
   by the list reporter; include `pageerror`, console, request initiator/resource
   type, response status/MIME/hash, CSP violations and no-audio observation.
   Preserve the earlier denied teaser and intentional-negative logs. Exercise
   independent one-byte script/style/image mutation in separate owned negative
   fixtures; ensure SRI/CSP deny them without changing the baseline. The existing
   verified-memory loopback server proves only its own private test binding.
4. **Locale and font.** Replace only the synthetic authored text with validated
   eight-locale fixture records and retain real producer projection. Record
   browser/OS version, viewport/scale, computed style, font availability and
   actual glyph/rendered-font evidence where supported, especially Japanese;
   preserve Classic's Inter/system stack and platform Rubik separately. Current
   English fixture plus eight UI languages is not localized-content or glyph
   certification, and system fonts remain environmental dependencies.
5. **Production loader.** In a separately reviewed host-only proposal, bind the
   exact entry export and every JS/CSS/resource response to an immutable origin
   or a reviewed verified-byte mechanism. Test independent-byte tamper, wrong
   MIME, redirects, cache/service-worker interference, CSP and TOCTOU. JS/CSS
   SRI and private in-memory fixture success do not establish mutable production
   URL safety. Only after actual resource/index/rights/dependency review may core
   consider an executable registry entry; the UI cannot register it.

No new server job, browser, build, font download, registry change, application
mount, protected native hook, customer export or active pin was performed in
this checkpoint. The original five-image failure, split browser results and
the six-image follow-up remain exactly as documented in `BROWSER_SIX_RESULTS.md`.
