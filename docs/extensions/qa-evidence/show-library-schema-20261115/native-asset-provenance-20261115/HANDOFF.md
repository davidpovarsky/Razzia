# Native media and font source observation

This continues SB-01/SB-05 provenance work. It verifies existing bytes and records outstanding evidence needs; it does not authorize assets, install trusted receipts, or change runtime behavior.

## Native media

Executed `py -3 .../audit_native_assets.py` in the D worktree, exit 0. `observation.json` records source commit `ed0efade3d1eaf972475d3f5544f4c3ae10aa6eb`, manifest references, Git object IDs/modes, and physical file observations. Both native manifests and all three existing notice files matched their Git bytes and remained unchanged during the observation.

All 67 manifest declarations resolve to 39 exact ID/hash references, 36 IDs, 35 URLs and 35 SHA256 values. The 35 physical public files total 22,384,330 bytes: 14 images, 19 audio files, 1 video and 1 Lottie file. Every file matched every applicable declared byte count/SHA256 and its exact Git blob. Hashes, sizes and mtime remained unchanged. The existing cross-family ID ambiguities and content aliases are preserved; no ID or manifest was rewritten.

`source-inputs.json` preserves both actual manifest bodies and the existing root/audio notices with bytes, SHA256 and base64. `git-tree.raw.base64.json` preserves the exact NUL-delimited Git tree result. Media bytes were read, not copied into evidence or executed.

The opening Lottie contains 71 asset entries: 5 embedded PNGs and 66 other entries. The five decoded PNGs have independent byte hashes and header dimensions matching their declarations. The 71 `refId` occurrences refer to existing asset IDs. No remote image path or string expression property `x` was observed. The sole HTTP string is `/meta/g = https://jitter.video`, generator metadata; it is not classified as a fetched image dependency. No Lottie engine ran, and this is not a general expression/security/rendering certification. Each embedded PNG retains `independentRights: "UNKNOWN"`.

The source notices are observations, not new grants. The audio-refresh notice identifies an exact transition adaptation SHA and claims five procedural originals. The separate soft-reveal notice concerns a different file not referenced by these two manifests; its license statement is not transferred to the current reveal by name similarity. External licenses, the referenced local generator, media-container contents/cover art, and asset-specific redistribution authority were not independently verified. The root MIT software notice is retained without treating it as a completed media-rights review.

## Existing Rubik inputs

Executed `py -3 .../audit_rubik_inputs.py` locally, exit 0. `rubik-observation.json` preserves the installed `@fontsource-variable/rubik@5.3.0` package metadata, exact LICENSE, `wght.css`, and font metadata. It records the declared `OFL-1.1` license and exact existing notice. The CSS references six local WOFF2 files totaling 124,064 bytes; all six signatures and hashes were observed, with source files/mtime unchanged. Existing app font imports, CSS family selection and lockfile match their Git commit. No fonts or localization behavior changed.

The package's declared lock integrity is recorded, but this local font observation does **not** verify tarball integrity or CAFS membership, emitted renderer/build hashes, installed-loader binding, glyph/locale coverage, or browser appearance. It does not extend the earlier five-package/106-module CAFS proof to this font package. No network request, install or remote job occurred.

## Acceptance boundary

All product source remains unchanged. No accepted test suite was rerun for this evidence-only audit. Prior renderer/SDK/TypeScript results remain attached to their original source and graph. Media/font authorization, actual emitted-resource binding, runtime/export/deletion policy and complete SB-01/SB-05 acceptance remain OPEN. No pin, renderer reference, active-room mutation, provider/customer/production action or readiness change is made.
