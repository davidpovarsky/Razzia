# Server feasibility: dc76 candidate

Candidate: `dc76cc65cf010291bba933ed408d1494dc091ffc`. The server run used one
network-disabled, read-only-root container capped at 0.25 CPU and 2 GiB, image
`sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647`.
The source view overlaid 42 candidate files atomically; the 458-file selected
baseline and all 42 overlay hashes were identical before and after the checks.
Free disk was 2540 MiB before preparation and 2527 MiB afterward.

* Node 24.22.2, Vitest 5.0.3: focused `preview-candidate.test.ts`, 11/11 pass,
  exit 0. These are source-level tests, not native browser evidence.
* TypeScript 7.0.2: focused check using the parent extension options and the
  actual native CSS declaration failed on two uses of `initImmediate`, which
  the installed i18next 26.4.3 types do not recognize. An initial harness run
  also lacked the node type root; a second omitted the native CSS declaration.
  Both harness omissions were corrected before the two candidate errors were
  isolated. No TypeScript pass is claimed for dc76.
* Vite 8.3.4 library build: exit 0, 168 modules, emitted renderer.js 1,604,794
  bytes and renderer.css 148,376 bytes. Four root-relative native image URLs
  remained unresolved by the build. No font-face resource was emitted.

The remote candidate index is
`/home/ubuntu/tadazz-hq-qa-20261115/evidence/show-ui-dc76-run/artifact-index.json`
(SHA-256 `ad38c77b88a65957cf88055db50a1a96e9ecb36e7b35083581211bff3f47e4b2`).
It excludes the Vite manifest, index and external loader/manifest from its
preimage. It is a feasibility record, not a registry pin or closure proof.
The companion `resource-scan.json` is a static string inventory, including
non-requested full-show/audio strings, not a list of actual network requests.
No SRI/CSP, native browser, rights, asset closure, or activation proof exists.
The host remains unavailable and producer pins remain zero.
