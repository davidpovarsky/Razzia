# Private native preview: verified Rubik host binding

E closes D's concrete isolated-font-loader gap in the private QA host. The host
now admits the unchanged upstream `@fontsource-variable/rubik@5.3.0/wght.css`
(2,581 bytes) and its six existing normal WOFF2 files (124,064 bytes total)
through the existing realpath/O_NOFOLLOW, size, SHA256 and immutable-buffer
resource policy. Each font has its exact expected size, hash and MIME. Nothing
was downloaded, installed into the OS, registered as theme media or added to a
theme manifest. D's existing package/license/CAFS observations are reused in
`font23-provenance.json`.

Both QA browser harnesses accept the optional `fontCssIntegrity` response field.
They load the global upstream stylesheet with SRI, require its six Rubik faces
and await actual decoding before importing/mounting the renderer. The existing
fixture API is preserved. This is private host admission, not a production loader
or executable pin.

The opt-in host invocation ends with `v2 rubik`; `prepare-font23.mjs` prepares its
RAM-only fixture using the accepted native21 archive, existing six images and
existing cached Rubik package. The artifact index still contains only `js,css`.
The host command is:

```text
node /out/harness-server-build/qa-fixture-server.js /tmp/native-font-fixture <browser-sha256> /out/font-artifact-index.json v2 rubik
```

The V2 renderer is reused byte-for-byte, without a rebuild:

- JS: 1,068,185 bytes, SHA256 `10b39d3e1a16b279f2b587a51fa777d7f5875ce2b88f88092f45acec29783340`.
- CSS: 166,501 bytes, SHA256 `1aa026a06d84117e23d8a04ef038a5260691b982796e057c39906ff6d66259d9`.

The retained CSS still has no font-face rule. Fonts are now bound by the host's
separate upstream stylesheet; the old renderer graph is not relabeled as
containing them. The accepted 45 native checks were not rerun.

## Actual focused evidence

`font23-evidence` preserves the complete run and corrected follow-ups:

- Focused TypeScript, fresh QA host build, all 167 retained native21 checksum
  rows and fixture input verification passed. A same-size changed font causes
  startup hash rejection before listening.
- Four negative browser cases passed: stylesheet SRI substitution and invalid
  font decoding each close before renderer admission in Chromium and WebKit.
- Final follow-up26 passed the two positive browser cases. Each engine renders
  the actual native Razzia view in all eight locales, decodes all six faces,
  verifies all seven resource response bodies/sizes/hashes/MIME, and records no
  external request, CSP violation or page/console error.
- The actual native text's canvas raster equals a uniquely named FontFace alias
  decoded from those exact response bytes. Latin samples differ from a deliberate
  monospace control. Native digits also equal the byte-decoded alias. Same-clone
  DOM width differences are zero in both engines across all eight locales.
- Chromium CDP records actual custom Rubik glyphs on the native h2 node. The
  variable font's internal family name is reported as `Rubik Light`; the actual
  computed weight is 700. Japanese uses its existing WenQuanYi Zen Hei fallback
  for ten glyphs and custom Rubik for the trailing space/digit. Vietnamese has
  nineteen custom Rubik glyphs and one DejaVu Sans glyph.
- The unchanged upstream Unicode ranges exclude Japanese CJK/fullwidth question
  mark and Vietnamese `ạ` (U+1EA1). `font26/locale-coverage.json` joins exact CSS
  coverage to actual browser observations. Attribution of the one Vietnamese
  fallback glyph to `ạ` is explicitly an inference. Japanese fallback raster
  equals the generic sans fallback under both engines. WebKit's exact platform
  family was not observed; its decoded faces, metrics and composite pixel proof
  are retained. This is not a claim that Rubik covers every locale glyph.

The first run remains **exit 1**, with two positive cases failing at a mistaken
Studio-only wrapper selector; all four negative cases passed. Follow-up24 passed
Chromium and failed WebKit's overstrict cross-element 0.15px width comparison.
Follow-up25 preserved that failure after comparing ranges symmetrically. The
existing WebKit range is integer-enclosed while a dynamic clone is fractional
(observed deltas 0.3068–0.8243px). Final26 compares the two font families on the
same clone (<0.05px required, actual zero), retains the original-range difference
below one CSS pixel, and still requires exact raster equality. Its two cases and
focused TypeScript pass. No failed evidence was overwritten or relabeled green.

The final eight owned source files are formatting-equivalent by normalized AST,
including the corrected final spec. Their raw tested source and harness SRI
hashes remain distinct from final formatted source hashes; byte identity is not
claimed for formatting. Exact font/CSS/renderer bytes are unchanged.

## Custody, resources and remaining boundaries

Raw archive: 227,079 bytes, SHA256
`d0c6921319c15233304fd5d42ed82c5c7e66543798e45116c6bde27f52672117`.
All 44 original and 98 supplemental hash rows were verified locally before the
retrieval marker. Container exited with original failure code 1, PID 0, no OOM;
the corrected positive result is separately exit 0. No remote disk archive was
written. E's terminal cumulative charge is 94,126,080 bytes within the existing
90MiB ceiling; 245,760 bytes remain. Compute claim released; all old source,
failures, caches, containers and peer work are retained.

Root intake of this private host variant remains separate from full 15-scene,
audio/settings, public TLS, production pin, actual Native Save, physical iPad,
projector or PSTN acceptance. G development can continue. SB08/SB09/SB10 and the
handoff inbox parent remain open. Existing pending root integration topics are
recorded once in the inbox: Native Save UI `1220548038356495` and OAuth
pending-login/StrictMode `1220548010998730`. This correction belongs to D's
existing Rubik handoff `1220548100130126`.
