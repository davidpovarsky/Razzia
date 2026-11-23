# Private Preview font binding: concrete scoped gap

The existing private V2 fixture is usable for its documented synthetic read-only development scope. This finding does not block G's development start or reopen the other accepted browser checks.

Static inspection of the retained `native21` output and current peer source shows:

- The exact 166,501-byte renderer-v2.css matches its peer build receipt and contains zero `@font-face` rules. Its four URL references are existing images, not fonts.
- The peer build receipt lists zero fontsource/WOFF/Rubik input IDs.
- The fixture server's integrity-buffered resource map contains no font entry; its HTML/source includes no `@font-face`. The CSP permits same-origin fonts, but permission alone does not load them.
- The native Razzia style uses `--show-theme-font`; the existing theme style maps `fontId: "rubik"` to `"Rubik Variable", sans-serif`. The main app normally imports `@fontsource-variable/rubik/wght.css`, which is outside this isolated fixture path.

This is an unestablished actual Rubik load in the private fixture. D did not run a browser and does not assert which fallback font rendered or whether a host OS happened to contain Rubik. It is not a general paint failure or a claim that the accepted switching/phase/disposal checks failed.

`observation.json` preserves the exact source bytes and their hashes, the CSS/resource observations, and six existing normal-weight WOFF2 input records with size/SHA256/SHA512/MIME. Those records join the prior full local Rubik CAFS observation to the original upstream `wght.css` references. They are expected input facts, not new registered resources or rights grants. No media ID, manifest or schema changed.

E owns the scoped correction: bring the existing upstream font-face CSS and exact local font bytes through the private host's existing buffered/hash-verified resource policy, and verify actual decoded font use under both engines and the intended locale/fallback behavior. G can continue against the stable private fixture API. The browser check should establish loaded font data, not merely a CSS family string. Reuse the existing source/package/license observations; do not add another font package, external font request, global font installation, new audio/clock owner or readiness bypass.

D changed no product/peer source and started no server/browser/job. No previously accepted test suite or membership audit was repeated. This is a concrete E loader/typography follow-up within existing ownership, not a new public-TLS/full-scene/release gate. Original SB-01/SB-05/SB-07 acceptance remains partial.
