# Private browser feasibility — dd3 renderer candidate

**Result: 22 of 23 authored cases passed; one failed. Resource closure is not
established, and no renderer pin or capability is accepted.** The failed case
found a sixth native image request outside the five-image QA authorization.

## Renderer startup correction

The d095 Chromium attempt is retained in `BROWSER_D095_STARTUP.md` and the raw
evidence ZIP. It failed because the emitted library referenced undefined
`process.env.NODE_ENV`: eight cases failed at startup, one was interrupted and
14 did not run; exit 130 after the instructed stop. An independent Chromium
diagnostic observed `ReferenceError: process is not defined` at emitted lines
1329 and 22384. The old d095 bytes and index remain preserved on the server.

Source `de08a8012894e877d762485dd877c40a3ca8df25` adds the normal explicit
production environment definition to the owned downstream Vite library config;
no browser `process` shim or protected renderer source edit was made. The build
used source/graph recipe commit `dd3cd1347981ac6fd934f90d870ff57bba82d470`,
Vite 8.3.4 and Node 24.22.2; the renderer was rebuilt once, exit 0. Its actual
files are renderer.js 1,043,685 bytes, SHA-256
`9024a0bef2cfbe3d8868d9fc3c6657269abd84d45c00bee0c95b02934f9763b1`, and
renderer.css 148,376 bytes, SHA-256
`3b220b024863d1e4a58b86b0b14a74e94be7b3da0c07e9921c2fb17430b67064`.
The provisional two-file index SHA-256 is
`38d36c62b57b0e90c00feebebe9c66256a55b60ab617b65632ae1e75f07d586e`;
it is not the ced0/3ceabe6d canonical complete index and is not a pin.

The old bundle contained 12 `process.env.NODE_ENV` uses. The locked source
wrappers inspected were React 19.3.0 `index.js` and `jsx-runtime.js`, React DOM
19.3.0 `index.js` and `client.js`, and Scheduler 0.28.0 `index.js`, all under
the server's existing pnpm graph. The new emitted JS contains zero such uses.
Its other `process` tokens are two `typeof process`-guarded React error-reporting
branches and one unrelated object method name. The actual 162-module build
graph is retained in the ZIP (SHA-256
`bbca71f4a14564980e5f91504a5eaad706995d9e1b4b64c5da13886427fce072`);
its core/show-library runtime paths contain no producer, digest or manifest
module beyond the permitted `stage-metadata-schema` leaf. This is graph evidence,
not an independent complete runtime resource or rights audit.

## Browser result and exact blocker

Using the corrected bytes, the single manager/en readiness smoke passed; the
remaining 22 cases produced 21 passes and one failure, Playwright exit 1. The
passing cases include paused question/results across both roles and eight UI
locales, paused voting stability/resume and DOM-node continuity to q2, paused
cards/lock, one pause/lock supersession scenario, negative script/style SRI and
raw path denials. These observations are bounded to Chromium and an English
synthetic authored fixture. DOM identity is not direct proof of private native
handle identity; race coverage is not an immediate-cancellation guarantee.

The five-phase case reached its final request check and failed because the
server correctly returned 404 for the unallowlisted native URL
`/tadazz-show/second-library/teaser-screen-source.jpg` (21 such requests in
the aggregate request log). The native stage creates this teaser image for
the relevant scenes. The source file is Git blob
`60855bb50b758a6f9e994e5ed264840646c0db77`, JPEG 2048×1152, 266,631 bytes,
SHA-256 `eaef71e6f2b59595eca49a5fb72df70e45f47a80351ea4d35e03d91f28851c17`,
and catalog asset `classic-adapter-7af6b5041525`. `file` inspected its server
metadata; this is not a browser decode of that sixth image. The existing
catalog says `repository-existing` and calls for redistribution rights review.
Only five image paths were authorized for this private fixture, so this sixth
file was **not** copied, served or silently substituted. A bounded private-QA
scope decision is required before adding it; customer export and rights remain
unknown. The three other non-200 request-log entries were intentional raw-path
negative cases, not additional missing assets.

An independent browser `createImageBitmap` diagnostic decoded the five permitted
images on the server: the four WebPs were 1920×1080 and the PNG 1983×793, with
the expected MIME and byte lengths. The five-phase test's own decode assertions
also completed before its later request-list failure. The fixture server served
verified private buffers with SRI for the tested JS/CSS and denied unexpected
paths. This controlled fixture does not establish production immutability,
complete resource closure, exact system-font/glyph reproducibility or rights.
The list reporter did not persist the test attachment bodies for console/CSP
events; the aggregate server request log and raw result logs are retained, but
complete console/CSP event evidence is missing. Do not claim it passed.

## Evidence and limits

The run used one network-disabled runner, no host port, 0.25 CPU and 2 GiB;
the two sequential owned containers were stopped. Sampled monitoring reported
minimum 2721 MiB free, maximum 17,808 KiB counted fixture/evidence data and
maximum sampled 514.4 MiB container memory. These are sampled observations,
not a peak-memory guarantee. Before/after checks matched 458 selected baseline
files, 42 candidate source files, seven final QA files and 16 files/modes across
the two fixtures. One initial final-audit comparison incorrectly used the older
graph-config commit as its expected source; the mismatch was isolated and the
check repeated successfully against the actual type-only graph-config revision.

`browser-dd3-raw-evidence.zip` contains raw logs, index, graph, resource scan,
request log and a synthetic failure screenshot (SHA-256
`69bef5430977ecc3dbe52e5ceb3cdb82488c02a17e113d6c6afcb26de60118cf`). The
original server files remain under the owned evidence directory. Image rights,
complete asset/font closure, production loader/SRI/CSP, independent handle and
late-disposal witnesses, broader phase/cardinality coverage and release remain
open. No production/provider/customer-data operation occurred.
