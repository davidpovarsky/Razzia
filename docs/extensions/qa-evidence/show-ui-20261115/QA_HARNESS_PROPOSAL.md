# Private browser harness and fixture scope

This QA-only candidate now targets the exact dd3 renderer JS/CSS, six existing
native image files and the genuine producer host APIs. The user authorized
the original five images and the discovered teaser for **private isolated synthetic QA only**. Redistribution
rights remain unknown and export is denied; this is not an accepted registry
entry, customer-package grant, production loader or pin.

Root has approved the revision-2 tagged Git/package source records and exact
five-image private mapping in core refinement `3ceabe6d`; the earlier inventory's
open source-record-format question is resolved for this proposal. Package-store
membership and rights authority remain separate attestations outside the payload.
No platform-only Rubik file is added to the native renderer fixture.

## Reviewable source bytes

| File in this directory | Bytes | SHA-256 |
| --- | ---: | --- |
| `qa-fixture-host.ts` | 2,760 | `4bc9f57da87d6186584a313facd166a86d7d63a45c5e94cf392da752ee5bf90d` |
| `qa-fixture-server.ts` | 6,489 | `ab03337bb877ae51c19b250e8d485c7545144cf9e605d8a2086c6f52c51abd38` |
| `qa-browser.mjs` | 2,216 | `8d84a5f2b4bc38d6f4df5143afde9373c7eadd2b1b79d1e43f152281575f6505` |
| `qa-preview.spec.ts` | 13,363 | `c47079aa0b191c636c5a4011603d79ddc999b6196732e2e72c16f1cc313e1a44` |
| `qa-preview.config.ts` | 812 | `ce23bf3d4303ed7c4512beda8337501549f239944d29c5823041d6d590d5374e` |
| `qa-server.vite.config.ts` | 549 | `665904d21b063a7e5eb228403ecbc8a74eb05242fe3bd8822fba1d7568c96233` |

The server verifies every allowlisted file SHA-256 before listening, rejects
symlinks/path escapes, bounds each file to 4 MiB, reads via an opened file
descriptor and serves only its private checked byte buffers. It binds only
`127.0.0.1` on an OS-selected port; a future runner must still have network
disabled and no host port. Unknown paths, redirects and fallbacks are not
provided. Its test page supplies browser JS/CSS SRI and a restrictive CSP;
two fixed decoy routes make negative script/style SRI checks possible. The
renderer module is subsequently imported for its export: this QA setup relies
on verified immutable in-memory bytes and records requests, not on an unproven
claim that the second import itself has SRI. This says nothing about a mutable
production server. The one QA global is a test-control surface on the isolated
test page, not an application or renderer ABI.

The QA host uses `normalizePreviewDraft`, `resolvePreviewPlan`, the existing
`projectedFrame` host path and genuine stage metadata. It fails unless the
real producer plan remains unavailable, and it creates no pin or native UUID.
The choice strings follow the producer's existing synthetic test-vector
protocol; they are fixture input, not a persisted or replacement allocator.
Its content is English synthetic five-question, single-choice quiz with five
choices and zero audience/votes. The selected UI locale varies across all eight
supported locales, but the authored fixture itself is **not localized**.

The original 23 Playwright cases cover first-paused question/results for both
roles and eight locales; first-paused answer cards, voting and vote lock;
five phases; pause during entry; lock supersession; q1→q2 DOM-stage continuity;
browser rejection of mismatched script/style integrity, and raw-path denial. They also record
unexpected request statuses in the five-phase case and watch for global SFX.
The DOM node comparison is only a proxy: it does **not** independently expose
or prove the private native handle identity. Live race timing, wipe-covered
timing, late disposal, request closure, computed fonts, responsive layouts,
quiz/survey and 2–5 option coverage, actual CSP rejection cases, resource
tampering/rights, negative metadata, editor comparison and additional browser
engines still require further harness work and browser evidence. The five-image
run is recorded in `BROWSER_DD3_RESULTS.md`; this six-image revision has not
been run as one unified matrix. Three new diagnostic cases add disposal, CSP
denial and native font observation; they are not yet executed. The reporter now
persists browser event attachments to files. Test descriptions alone are not passes.

## Proposed exact fixture overlay and budget

On the verified source/dependency baseline plus the dd3 renderer config, add only these six
QA files at their exact `docs/extensions/qa-evidence/show-ui-20261115/` paths.
In a new owned output root, place dd3 `renderer.js` and `renderer.css`, copy
`qa-browser.mjs` to `browser.mjs`, and copy the six inventoried image bytes
under their unchanged `tadazz-show/...` paths. The renderer and images total
4,013,430 bytes; the six QA source files total 26,189 bytes. Existing source
and dependency mounts stay read-only; no full docs, `.git`, install, clone,
production mount or host port. The six optional Rubik WOFF2 files are **not**
needed for this stage-only harness, which does not mount platform chrome.
Keep exact per-file hashes/modes and baseline checks before/after.

Request a single 0.25-CPU/2-GiB runner, at most 64 MiB new physical disk for the
fixture, logs and failure screenshots, and bounded tmpfs for browser scratch;
confirm current free-space gate and reserve 2 GiB before starting and throughout.
Use the existing cached toolchain and a fresh owned output directory. Stop if
the disk cap or reserve would be crossed. This is a requested budget, not a
resource grant or a claim that browser binaries are present.

The first direct Node/tsx server attempt failed on a native CSS import reached
through the real host mapping. The scoped QA-only Vite SSR config builds the
host separately using the parent tsconfig paths and normal CSS handling; it
does not alter or rebuild the renderer payload. After approval, launch that
host bundle with the owned fixture root and exact `qa-browser.mjs` SHA above.
Capture the emitted `QA_PORT`; run the existing Playwright CLI with
`qa-preview.config.ts` and `TADAZZ_QA_BASE=http://127.0.0.1:<QA_PORT>`. Capture
exit codes, server request log, browser console/CSP events, source/baseline
hashes, screenshots and real resource/elapsed usage. These proposed commands
and test fixtures still need review and actual server execution for this new
six-image revision.
