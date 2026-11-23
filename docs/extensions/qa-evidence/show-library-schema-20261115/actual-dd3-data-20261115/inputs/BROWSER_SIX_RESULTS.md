# Six-image private browser fixture — focused follow-up

The manager authorized the observed Git-tracked teaser image for this private
synthetic fixture only. It remains `rights.status: unknown` and customer export
is denied. The exact request is
`/tadazz-show/second-library/teaser-screen-source.jpg`; source Git blob
`60855bb50b758a6f9e994e5ed264840646c0db77`, JPEG 266,631 bytes, SHA-256
`eaef71e6f2b59595eca49a5fb72df70e45f47a80351ea4d35e03d91f28851c17`,
catalog `classic-adapter-7af6b5041525`. Chromium `createImageBitmap` decoded
the served bytes as 2048×1152 in the passing affected closure case. No image
was guessed, downloaded, rewritten or served outside the isolated fixture.

The renderer bytes are unchanged from the corrected build sourced at
`dd3cd1347981ac6fd934f90d870ff57bba82d470`: JS SHA-256
`9024a0bef2cfbe3d8868d9fc3c6657269abd84d45c00bee0c95b02934f9763b1`
(1,043,685 bytes); CSS SHA-256
`3b220b024863d1e4a58b86b0b14a74e94be7b3da0c07e9921c2fb17430b67064`
(148,376 bytes). The provisional two-file index SHA-256 remains
`38d36c62b57b0e90c00feebebe9c66256a55b60ab617b65632ae1e75f07d586e`;
it is not a complete ced0/3ceabe6d resource/artifact index or accepted pin.
The six-image diagnostic source inventory is
`private-fixture-resource-inventory.json` (SHA-256
`df7d3cbce19e3827d89eb433195adf6c9583e66cd462908bfe76187a193049fb`).
It records tracked source identities and unknown rights, not export approval.

## Actual runs

* Original d095 startup: eight failed, one interrupted, 14 not run; exit 130.
  Its undefined `process` error and original denied-request evidence remain in
  `BROWSER_D095_STARTUP.md` / `browser-dd3-raw-evidence.zip`.
* Corrected renderer with the original five-image fixture: one readiness smoke
  passed; the remaining run had 21 passed and one failed, exit 1. Thus 22 of
  the 23 cases passed in that fixture; the failure was the denied teaser.
* Six-image follow-up, harness source `818828b938ae347184405b74788c7484509b5c0e`:
  affected five-phase/request-closure case plus script/style integrity-negative
  and raw-path checks **3/3 passed**, exit 0. The other 20 authored cases were
  **not rerun** with six images. Their earlier five-image passes are retained;
  the split runs are not a single complete six-image matrix.
* Focused harness TypeScript 7.0.2 passed and the separate QA host SSR build
  passed. The renderer itself was not rebuilt for the fixture-only addition.
  Earlier 12/12 source unit tests apply to d095 before the later Vite-config
  correction; they were not repeated here.

The six-image server request log recorded 34 requests. All native asset
requests from the affected test returned 200; the three non-200 entries were
intentional raw/encoded/query path negatives. This is observed closure for the
particular synthetic cases and private fixture, not proof of all scenes or a
production immutable origin. No unexpected SFX request was served. The local
fixture's JS/CSS positive SRI path and negative mismatched-SRI cases ran in
Chromium; production loader binding, CSP-negative coverage, redirect/TOCTOU,
independent native-handle identity and broader lifecycle races remain open.
The list reporter did not persist its console/CSP attachment bodies, so those
are not claimed as complete evidence. Fixture text was English while UI labels
were exercised in eight locales in the prior run; no locale glyph certification.

The second follow-up used one network-disabled, 0.25-CPU/2-GiB runner with no
host port; its samples showed 2723 MiB free, up to 15,548 KiB counted fixture
and evidence and 387.8 MiB sampled memory. The runner was stopped. Baseline
458 source files, 42 candidate files, seven QA files and nine six-fixture file
hashes/modes matched after the run. The raw follow-up ZIP is
`browser-six-raw-evidence.zip`, SHA-256
`7f782d1077b655716ec38c2fec4a70e7c271c85e7f0327a0551891b5049ab14d`;
the original server evidence remains intact. No public deployment, renderer
pin, capability activation, audio/provider or customer-data action occurred.
