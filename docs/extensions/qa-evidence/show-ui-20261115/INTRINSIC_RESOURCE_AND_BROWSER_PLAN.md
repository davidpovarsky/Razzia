# Native intrinsic resource inventory and browser plan

Source-only checkpoint for tested payload source `d09529dc5c26bc71972d5e0809bc2dddd2849c60` and the proposed `ced0b3e` compiled-artifact contract. This is an inventory and proposed harness, not a closed artifact, license approval, browser result or executable pin.

## Observed source resources

The five files below are Git-tracked; their working-file Git blobs match d095. Byte SHA-256 and sizes match the existing Classic catalog. Image format, dimensions and full decode were inspected locally with the available Pillow installation during this source inventory; that inspection is not server or browser evidence and must be repeated in the authorized server QA. No image bytes were changed.

| Exact request path | Catalog asset ID | Format; dimensions; bytes | SHA-256 |
| --- | --- | --- | --- |
| `/tadazz-show/motion/backdrop.webp` | `classic-backdrop` | WebP RGB; 1920×1080; 94,502 | `a76a50432f43313d29e78f625302a256e7e7b71db322612c4b66ee3aef0cf37e` |
| `/tadazz-show/v4/question-bg.webp` | `classic-adapter-a27be4883ee9` | WebP RGB; 1920×1080; 87,904 | `2f6912d851d8600e08d9a47d58e73dd40144fe30a908b82d10b3ba4036554321` |
| `/tadazz-show/v4/show-stage.webp` | `classic-poster` | WebP RGB; 1920×1080; 261,066 | `9f3d1fe8d4458e98441303e728bba996b9a314295bbf5108f581c229f6db2d20` |
| `/tadazz-show/story/84acdb923677d591.webp` | `classic-adapter-5ebee0b89664` | WebP RGB; 1920×1080; 134,540 | `84acdb923677d591d7641d8452eb185aad360b4b990d6e0879905ad0494dbdc6` |
| `/tadazz-show/v4/tadazz-brand-logo.png` | `classic-logo` | PNG RGBA; 1983×793; 1,976,726 | `e50aaf5f62f60a83b5a84ea1d55a8068c2e754df5c917681da553771756ebabd` |

Exact source paths are `packages/web/public` followed by each request path. Each WebP decodes to 2,073,600 pixels; the logo is 1,572,519 pixels. The first four are the unresolved CSS URLs observed by Vite. The fixed product logo is also referenced by native markup and `core/product-branding.ts`; V4 backdrop markup chooses the existing question/show assets. `reference-stages.css` refers to the story image, even though its actual request in the bounded five phases remains unobserved. CSS selectors and theme data may determine which resources a browser actually requests. These five are a conservative known set, **not** a proof that every transitive request is accounted for.

`extensions/src/presentation/tadazz-show/motion-assets.provenance.json` (SHA-256 `c9ca6c05d84618f58e9e19bbf8f44b77082b7d0a9d2e9a9c97fa6f1d6c0594e1`) records the backdrop as extracted from the named canonical reference HTML. The Classic manifest (SHA-256 `b7158ed1aaaee800972ec66bd6bcd9cbbe6de48a48912aa53d56a4af1ba8c061`) records `repository-existing` and expressly calls for rights review before redistribution. Repository `LICENSE` is MIT, SHA-256 `b851eb2bffdb9cf640bb16ce0e7c520143a6b862a803c032d5a8f8e3241534b9`; it is not by itself proof of independent rights to each image or product logo. No per-image redistribution grant was found in the inspected catalog/provenance. Owner/rights review is an explicit unresolved gate; do not claim the images are cleared for customer-package redistribution.

## Font bytes and remaining scope

Read-only inspection of the existing server dependency tree identified `@fontsource-variable/rubik` **5.3.0**, package license `OFL-1.1`. Its actual `LICENSE` is 4,486 bytes, SHA-256 `46a250495a963b0b84f2736c0185d0e3af8df9d23427bd425b92a8ece020283c`; `wght.css` is 2,581 bytes, SHA-256 `5c5ce7a83a10034b877db7b8f1080abbbf84329beb192163dbbf02419c442f8b`. Its six referenced normal-weight-variable WOFF2 files are:

| Subset | Bytes | SHA-256 |
| --- | ---: | --- |
| arabic | 32,468 | `f5052e4870bf211fc22df5b85e791a292a77b9baef8cef1dc5a8e62a783ea1e0` |
| cyrillic-ext | 12,388 | `35e30483bb79be6fd8de0fec4e038fda9e637fc7337f6ff61418c7d08077878b` |
| cyrillic | 15,112 | `bdb2b33ab916e9e7b42edb61f8aea5f5dd83ad773d6ee4e9b55665daf8954ce8` |
| hebrew | 9,348 | `197b6dbe5c6bec7276c59b02d70a16ee6acd44322fc2f8d0226c07f8d57976c2` |
| latin-ext | 19,400 | `09472f217ad1ebb61a7669cf532f9f2f80685e07652ee862fde9a79665aef479` |
| latin | 35,348 | `691cd1d9b4c0cdf31a1dcf04259c86f92c85e69f6622abab7964d81e36890691` |

Each path is `files/rubik-<subset>-wght-normal.woff2` inside that package and had the WOFF2 `wOF2` signature. The dependency package is present in the server's locked node_modules, not a Git-tracked source path. The lockfile SHA-256 is `f2e3f2183bc308e7e113a23f2ae901d98aade9a173c6b16019d014072684b9a0`. Under ced0, resolve with core/integrator how a third-party package file is represented and independently attested as a `SourceFile`; do not invent a tracked source path. Include the actual OFL text and required attribution in any approved export. `wght.css` has no Japanese subset; Japanese fallback/glyph behavior requires browser verification and a reviewed fallback resource policy. These six files and CSS were **not emitted** in the d095 library build.

Do not impose Rubik on the show stage: Classic's source manifest identifies `goldy-canonical`, `showThemeStyle` selects its Inter/system stack, and native CSS also specifies Inter/system/Arial. Rubik is the governed platform chrome font. Preserve selected-theme typography and verify actual computed fonts separately inside the ShadowRoot and outside in the platform scope. Subset selection, actual font-face loading and all eight languages need measured browser evidence.

## Artifact and loader design gaps

The d095 build produced JS/CSS only. Its provisional static scan includes sounds, media and full-show source/data strings; their presence is not proof of a fetch or of audio playback. The request log must establish the observed five-phase closure, while build dependency metadata must identify every actual payload module and prove that `preview-port`, host `stage-metadata`, digest and compiled-manifest modules are absent. The candidate stage currently uses the allowed `stage-metadata-schema` leaf. Producer/host code and final pin/bootstrap remain outside the payload graph.

Before producing ced0 records, export actual approved source image/font/license bytes into a fresh immutable artifact directory without modifying the files or native URL strings. Establish an exact request-path-to-artifact mapping and provide `NativeResourceIndexV1` entries containing measured bytes, MIME, SHA-256, source, matching existing catalog ref where applicable, license refs and reviewed rights basis. Then construct canonical resource and artifact indexes in ced0's exact byte/order format; the resource index is a metadata file in the artifact index, and neither index contains its own digest. The current two-file d095 feasibility index does **not** meet that schema and must not be promoted.

An SRI-checked module script alone does not prove that a separately imported module or image is bound to the same checked bytes. Likewise, prefetch-and-hash followed by an ordinary mutable URL fetch has a TOCTOU gap. A loader must show a reviewed immutable serving contract or another verified-byte binding, exact JS/CSS integrity, content type, CSP and no redirects; resource mappings must preserve the native rooted request URLs. How the host obtains the actual `mountPreviewCandidate` export under that binding is unresolved and needs an implementation/review proposal. Do not introduce a global alias, string rewrite, hidden DOM mutation, arbitrary URL or unsupported registry entry to bypass it.

## Proposed bounded server harness, not yet run

1. With a fresh explicit resource grant and disk preflight, reuse the existing d095 42-file verified source view and root/ext/common/web/socket/e2e read-only dependency mounts. Add only new QA-owned fixture/harness files, exact five source image files, the verified font CSS/WOFF2/license bytes if approved, and a dedicated writable evidence/output mount. Verify source/image/package hashes before and after. No `.git`, unrelated documents, production mounts, credentials, clone, install, public listener or host port.
2. Run a single capped container with network disabled and a loopback-only test HTTP server **inside that container**; serve the preserved native request paths from the owned fixture. Use an explicit server-side allowlist and fail/record every unexpected request or redirect. Do not silently return a fallback image. Capture response MIME, byte SHA-256 and request initiator; this fixture is a test server, not proof of production immutability.
3. Load the exact candidate renderer output in a test-owned ShadowRoot with an independent React root and actual emitted CSS. Create frames via a real normalized five-question producer draft, `resolvePreviewPlan`, genuine `projectShowBindings` and `derivePreviewStageMetadata`/`assertBoundPreviewStageMetadata`; these remain host-only. Zero-pin `unavailable` is expected: a special test harness may exercise candidate bytes but must not construct a fake accepted pin or advertise readiness. All choices/results are synthetic and zero audience/votes. English-only fixture text is disclosed; other locale tests need localized, validated fixtures.
4. On the real renderer, capture each of question → answerCards → voting → voteLocked → results for manager and spectator; quiz/survey, single/multi and 2–5 options. Test paused initial question/cards/voting/locked/results, ring/number stability, delayed resume and one timebase, q1→q2 on the same stage handle and guarded wipe, pause before voting entry, lock/wipe overlap with newer question, repeated supersession, disposal and late callbacks. Verify no global SFX, player action, future card, hidden answer or asset-reference leakage. A test-only stage identity probe must observe the existing handle without adding a protected native hook; if impossible, report exact limitation.
5. Capture computed styles/font family and requests at 16:9, 4:3 and narrow containers, reduced motion, all eight locales, and compare editor source/visual baseline via a separately approved safe fixture. Verify focus, resize and teardown. A narrow scaled stage is not player usability evidence.
6. Exercise one-byte altered JS/CSS/image/font, wrong MIME, missing files, redirect, bad index, untrusted catalog and forged metadata, with CSP violation/report checks and actual browser script/style integrity enforcement. Test the loader's verified-byte and immutable-serving guarantees independently; no successful asset preflight alone establishes SRI or TOCTOU safety. Record command, exact source/toolchain, baseline/overlay hashes, resource/exit budgets, stdout, request logs, screenshots, computed styles, artifact and canonical indexes, and failures before any registry proposal.

No test, build, browser, serving, artifact export, native hook, registry mutation or pin activation was run for this checkpoint. The only image decoding above was the local static Pillow inspection explicitly disclosed; server reproduction remains required.
